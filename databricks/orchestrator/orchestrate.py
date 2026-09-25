# Databricks notebook source
# MAGIC %md
# MAGIC # Orchestrator: watch new drops, re-score every profile via the app's live Match
# MAGIC
# MAGIC L4c lane. Serverless notebook task, no classic compute (Free Edition rule).
# MAGIC D17 (one implementation of ranking): this notebook never re-implements
# MAGIC Match in Python. Per run it
# MAGIC   1. SECRETS        reads scope `scout` (lakebase_url, watcher_secret)
# MAGIC   2. LAKEBASE_COUNT counts Lakebase `roles` inserted since the last
# MAGIC                     successful watermark (pg8000; psycopg2's C extension
# MAGIC                     aborts the serverless kernel, proved by the sync lane)
# MAGIC   3. MATCH_POST     if there are new drops, POSTs the deployed app's
# MAGIC                     `/api/match?all=1` with `X-Watcher-Secret` (the L2c
# MAGIC                     Match agent re-scores every profile and writes
# MAGIC                     `new_drop` nudges) and collects the JSON/NDJSON summary
# MAGIC   4. RUNS_WRITE     appends one real row to `scout.core.orchestrator_runs`
# MAGIC Any failure raises with the step named; nothing is swallowed (CONTEXT 13:25).
# MAGIC
# MAGIC Patterns followed (databricks/databricks-agent-skills, the AI Dev Kit's
# MAGIC skill repo): `databricks-jobs` SKILL.md ("Serverless Compute: omit cluster
# MAGIC configuration", job parameters via `dbutils.widgets.get`, dynamic value
# MAGIC references such as `{{job.run_id}}`), `databricks-unity-catalog`
# MAGIC references/3-securables-ddl.md (CREATE TABLE IF NOT EXISTS ... USING DELTA
# MAGIC in `catalog.schema`). Secrets: the kit has no secrets doc, so this keeps
# MAGIC the sync lane's proven `dbutils.secrets.get(scope="scout", ...)` path
# MAGIC (https://docs.databricks.com/aws/en/security/secrets/).

# COMMAND ----------

# MAGIC %pip install pg8000 -q
dbutils.library.restartPython()
# Same dependency path as databricks/sync/sync_lakebase_to_delta.py (proved
# live on this workspace, sync run 398285688594045). note: the kit's
# `environments` block on the job is the declarative alternative; kept the
# proven %pip path tonight, upgrade path = move pg8000 into job.json
# `environments[].spec.dependencies` and drop this cell.

# COMMAND ----------

dbutils.widgets.text("catalog", "scout")
dbutils.widgets.text("schema", "core")
dbutils.widgets.text("match_url", "https://scout-vthacks.vercel.app/api/match?all=1")
# Filled by the job through dynamic value references (job.json base_parameters);
# empty on a manual notebook run.
dbutils.widgets.text("job_run_id", "")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
match_url = dbutils.widgets.get("match_url")
job_run_id = dbutils.widgets.get("job_run_id") or None

RUNS_TABLE = f"{catalog}.{schema}.orchestrator_runs"
# Timestamps collected from Delta come back naive in the session zone; pin it
# to UTC so the watermark compares correctly against Lakebase's timestamptz.
spark.conf.set("spark.sql.session.timeZone", "UTC")

# COMMAND ----------

import json
import ssl
from datetime import datetime, timezone
from urllib.parse import urlparse

import pg8000.dbapi
import requests

# /api/match re-scores every profile inside one Vercel invocation whose
# maxDuration is 300 s (app/api/match/route.ts); wait a little past that so the
# route's own timeout, not ours, is the one that surfaces.
MATCH_READ_TIMEOUT_S = 330


def read_secret(key: str) -> str:
    try:
        return dbutils.secrets.get(scope="scout", key=key)
    except Exception as e:  # noqa: BLE001 - re-raised named, never swallowed
        raise RuntimeError(
            f"ORCHESTRATOR_SECRETS: could not read secret scout/{key} "
            "(create it: databricks secrets put-secret scout <key>)"
        ) from e


def count_new_drops(lakebase_url: str, since):
    """Returns (new_drops, max_created_at) from Lakebase `roles` after `since` (all rows when None)."""
    p = urlparse(lakebase_url)
    try:
        conn = pg8000.dbapi.connect(
            user=p.username,
            password=p.password,
            host=p.hostname,
            port=p.port or 5432,
            database=p.path.lstrip("/"),
            timeout=15,
            ssl_context=ssl.create_default_context(),
        )
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"ORCHESTRATOR_LAKEBASE_COUNT: could not connect to Lakebase: {e}") from e
    try:
        cur = conn.cursor()
        if since is None:
            cur.execute("select count(*), max(created_at) from roles")
        else:
            if since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
            cur.execute("select count(*), max(created_at) from roles where created_at > %s", (since,))
        count, max_created = cur.fetchone()
        cur.close()
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"ORCHESTRATOR_LAKEBASE_COUNT: count query failed: {e}") from e
    finally:
        conn.close()
    return int(count), max_created


def parse_match_body(text: str, content_type: str) -> dict:
    """The watcher branch answers one JSON object today; a streamed NDJSON body
    (one object per line, the summary last) is accepted too. Anything else is
    a named failure, never a zero."""
    if "ndjson" in content_type:
        lines = [json.loads(line) for line in text.splitlines() if line.strip()]
        summary = next((obj for obj in reversed(lines) if "profiles" in obj), None)
        if summary is None:
            raise RuntimeError("ORCHESTRATOR_MATCH_POST: NDJSON body carried no summary line with `profiles`")
        return summary
    try:
        body = json.loads(text)
    except ValueError as e:
        raise RuntimeError(f"ORCHESTRATOR_MATCH_POST: non-JSON body: {text[:300]}") from e
    if "profiles" not in body:
        raise RuntimeError(f"ORCHESTRATOR_MATCH_POST: body has no `profiles` count: {text[:300]}")
    return body


def post_match(url: str, watcher_secret: str) -> dict:
    try:
        resp = requests.post(url, headers={"X-Watcher-Secret": watcher_secret}, timeout=(15, MATCH_READ_TIMEOUT_S))
    except requests.RequestException as e:
        raise RuntimeError(f"ORCHESTRATOR_MATCH_POST: request to {url} failed: {e}") from e
    if resp.status_code != 200:
        raise RuntimeError(f"ORCHESTRATOR_MATCH_POST: {resp.status_code} from {url}: {resp.text[:500]}")
    return parse_match_body(resp.text, resp.headers.get("Content-Type", ""))


# COMMAND ----------

spark.sql(
    f"""
    create table if not exists {RUNS_TABLE} (
        started_at timestamp,
        finished_at timestamp,
        job_run_id string,
        watermark timestamp,
        new_drops bigint,
        profiles bigint,
        profiles_rescored bigint,
        nudges_written bigint,
        status string,
        error string
    ) using delta
    """
)

# The watermark is the newest Lakebase roles.created_at a run has accounted
# for. A failed run stores the previous watermark unchanged, so its drops are
# counted again next hour instead of being lost.
prev_row = spark.sql(f"select max(watermark) as w from {RUNS_TABLE}").collect()[0]
prev_watermark = prev_row["w"]

started_at = datetime.now(timezone.utc)
status = "failed"
error_text = None
new_drops = profiles = profiles_rescored = nudges_written = 0
watermark = prev_watermark
partial_errors = []

try:
    lakebase_url = read_secret("lakebase_url")
    watcher_secret = read_secret("watcher_secret")

    new_drops, max_created = count_new_drops(lakebase_url, prev_watermark)
    print(f"LAKEBASE_COUNT: new_drops={new_drops} since={prev_watermark}")

    if new_drops == 0:
        status = "skipped"
        print("MATCH_POST: skipped, no new drops since the last run")
    else:
        summary = post_match(match_url, watcher_secret)
        profiles = int(summary.get("profiles", 0))
        profiles_rescored = int(summary.get("rescored", 0))
        nudges_written = int(summary.get("nudges", 0))
        partial_errors = list(summary.get("errors") or [])
        watermark = max_created
        status = "partial" if partial_errors else "success"
        if partial_errors:
            error_text = "ORCHESTRATOR_MATCH_POST: per-profile errors: " + "; ".join(partial_errors)[:2000]
        print(f"MATCH_POST: profiles={profiles} rescored={profiles_rescored} nudges={nudges_written} errors={len(partial_errors)}")
except Exception as e:  # noqa: BLE001 - recorded, then re-raised
    status = "failed"
    error_text = str(e)[:2000]
    raise
finally:
    finished_at = datetime.now(timezone.utc)
    spark.createDataFrame(
        [(started_at, finished_at, job_run_id, watermark, new_drops, profiles, profiles_rescored, nudges_written, status, error_text)],
        schema=(
            "started_at timestamp, finished_at timestamp, job_run_id string, watermark timestamp, "
            "new_drops bigint, profiles bigint, profiles_rescored bigint, nudges_written bigint, "
            "status string, error string"
        ),
    ).write.format("delta").mode("append").saveAsTable(RUNS_TABLE)
    print(f"RUNS_WRITE: {RUNS_TABLE} status={status} new_drops={new_drops} rescored={profiles_rescored} nudges={nudges_written}")

if partial_errors:
    # The drops were processed for every other profile (watermark advanced),
    # but a red run is the only honest signal for the ones that failed.
    raise RuntimeError(error_text)
