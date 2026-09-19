# Databricks notebook source
# MAGIC %md
# MAGIC # Sync: the app database (Lakebase) -> Delta bronze/silver
# MAGIC
# MAGIC L4 lane. Serverless notebook, no classic compute (Free Edition rule).
# MAGIC Reads `roles`, `companies`, `applications` (non-PII columns only) from the
# MAGIC app database and mirrors them into Delta bronze (full snapshot) and silver
# MAGIC (upserted by `id`, idempotent). Fails the job run loudly — never truncates
# MAGIC or skips silently — on a missing secret, a failed connection, a missing
# MAGIC source table, or a source that went from non-empty to empty.
# MAGIC
# MAGIC Docs relied on: Lakebase connection strings
# MAGIC (https://docs.databricks.com/aws/en/oltp/projects/connection-strings),
# MAGIC secret scopes + dbutils.secrets.get
# MAGIC (https://docs.databricks.com/aws/en/security/secrets/),
# MAGIC Delta MERGE INTO
# MAGIC (https://docs.databricks.com/aws/en/sql/language-manual/delta-merge-into).

# COMMAND ----------

# MAGIC %pip install psycopg2-binary
dbutils.library.restartPython()

# COMMAND ----------

dbutils.widgets.text("catalog", "scout")
dbutils.widgets.text("schema", "core")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

# COMMAND ----------

import decimal
import uuid
from datetime import datetime, timezone

import psycopg2
import psycopg2.errors

# Non-PII column allowlist per table. roles and companies are synced in full
# (their base columns hold no PII); applications is restricted on purpose.
SOURCE_TABLES = {
    "roles": "select *",
    "companies": "select *",
    "applications": "select id, company_id, role_id, status, date_applied, user_id",
}

# roles keeps its own created_at and source_posted_at on every re-sync — the
# board's first-seen and its own published timestamp are never overwritten by
# a later snapshot.
PRESERVE_ON_MERGE = {"roles": ("created_at", "source_posted_at")}


def _get_lakebase_url() -> str:
    # Secret scope created once, before the job's first run:
    #   databricks secrets create-scope scout
    #   databricks secrets put-secret scout lakebase_url --string-value "$LAKEBASE_URL"
    # (see databricks/README.md step 1 — Free Edition support for secret
    # scopes is UNVERIFIED this session; the alternative is documented there.)
    try:
        return dbutils.secrets.get(scope="scout", key="lakebase_url")
    except Exception as e:  # noqa: BLE001 - re-raised named, never swallowed
        raise RuntimeError(
            "SYNC_SECRET_MISSING: could not read secret scout/lakebase_url. "
            "Create it first (see databricks/README.md step 1)."
        ) from e


def _connect(lakebase_url: str):
    try:
        return psycopg2.connect(lakebase_url, connect_timeout=15)
    except psycopg2.OperationalError as e:
        raise RuntimeError(f"SYNC_LAKEBASE_CONNECTION_FAILED: could not connect to Lakebase: {e}") from e


def _normalize(value):
    # psycopg2's uuid/decimal adaptation is not guaranteed registered on every
    # connection; normalize both to Spark-friendly types explicitly rather
    # than depend on that registration.
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, decimal.Decimal):
        return float(value)
    return value


def fetch_table(lakebase_url: str, table_name: str, select_clause: str):
    conn = _connect(lakebase_url)
    try:
        with conn.cursor() as cur:
            try:
                cur.execute(f"{select_clause} from {table_name}")
            except psycopg2.errors.UndefinedTable as e:
                raise RuntimeError(
                    f"SYNC_SOURCE_TABLE_MISSING: Lakebase table '{table_name}' does not exist"
                ) from e
            colnames = [d[0] for d in cur.description]
            rows = [{k: _normalize(v) for k, v in zip(colnames, row)} for row in cur.fetchall()]
        return colnames, rows
    finally:
        conn.close()


def existing_row_count(full_table_name: str) -> int:
    if not spark.catalog.tableExists(full_table_name):
        return 0
    return spark.table(full_table_name).count()


def upsert_silver(sdf, silver_name: str, key_col: str = "id", preserve_columns=()) -> int:
    if not spark.catalog.tableExists(silver_name):
        sdf.write.format("delta").saveAsTable(silver_name)
        return sdf.count()

    all_cols = sdf.columns
    update_cols = [c for c in all_cols if c != key_col and c not in preserve_columns]
    set_clause = ", ".join(f"target.{c} = source.{c}" for c in update_cols)
    insert_cols = ", ".join(all_cols)
    insert_vals = ", ".join(f"source.{c}" for c in all_cols)

    sdf.createOrReplaceTempView("_bronze_batch")
    spark.sql(f"""
        MERGE INTO {silver_name} AS target
        USING _bronze_batch AS source
        ON target.{key_col} = source.{key_col}
        WHEN MATCHED THEN UPDATE SET {set_clause}
        WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals})
    """)
    return spark.table(silver_name).count()


# COMMAND ----------

lakebase_url = _get_lakebase_url()
synced_at = datetime.now(timezone.utc)
summary = {}

for table_name, select_clause in SOURCE_TABLES.items():
    bronze_name = f"{catalog}.{schema}.bronze_{table_name}"
    silver_name = f"{catalog}.{schema}.silver_{table_name}"

    _, rows = fetch_table(lakebase_url, table_name, select_clause)
    prior_silver_count = existing_row_count(silver_name)

    if len(rows) == 0:
        # Fail-loud (CONTEXT 13:25): an empty app table at sync time is a misconfiguration
        # (the baseline import or the watcher did not run), never a normal state.
        raise RuntimeError(
            f"SYNC_EMPTY_SOURCE: Lakebase table '{table_name}' returned 0 rows "
            f"({silver_name} holds {prior_silver_count}). Refusing to sync an empty snapshot."
        )

    for row in rows:
        row["_synced_at"] = synced_at
    sdf = spark.createDataFrame(rows)

    sdf.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(bronze_name)
    bronze_count = sdf.count()

    silver_count = upsert_silver(sdf, silver_name, preserve_columns=PRESERVE_ON_MERGE.get(table_name, ()))

    print(f"{table_name}: bronze={bronze_count} silver={silver_count} (was {prior_silver_count})")
    summary[table_name] = {"bronze": bronze_count, "silver": silver_count}

print("sync_lakebase_to_delta summary:", summary)
