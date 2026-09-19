# Databricks notebook source
# MAGIC %md
# MAGIC # Orchestrator: re-score every profile via the app's live Match endpoint
# MAGIC
# MAGIC L4b lane. Serverless notebook, no classic compute (Free Edition rule).
# MAGIC D17 (one implementation of Match/Orchestrator logic): this notebook does
# MAGIC NOT re-implement ranking in Python. It calls the deployed app's own
# MAGIC `/api/match?all=1` (the L2c lane's Match agent), logs the response counts
# MAGIC to MLflow, and writes one row to `scout.core.orchestrator_runs` per run --
# MAGIC success or failure. A non-200 response (404 until L2c deploys the route)
# MAGIC fails the run LOUD with the status code and body; it is never swallowed
# MAGIC or treated as zero work done.
# MAGIC
# MAGIC Docs relied on: MLflow tracking (start_run/log_metrics/log_param)
# MAGIC (https://docs.databricks.com/aws/en/mlflow/tracking), secret scopes +
# MAGIC dbutils.secrets.get (https://docs.databricks.com/aws/en/security/secrets/),
# MAGIC Delta CREATE TABLE / append writes
# MAGIC (https://docs.databricks.com/aws/en/delta/tutorial).

# COMMAND ----------

dbutils.widgets.text("catalog", "scout")
dbutils.widgets.text("schema", "core")
dbutils.widgets.text("match_url", "https://scout-vthacks.vercel.app/api/match?all=1")
dbutils.widgets.text("user_email", "karthikmandli6@gmail.com")
# Fallback only (rule 5): the secret scope IS supported on this Free Edition
# workspace (proved live 2026-09-19, see databricks/sync/README.md) and is the
# primary path below. This widget stays empty unless a future job run passes
# it as a base_parameter.
dbutils.widgets.text("watcher_secret", "")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
match_url = dbutils.widgets.get("match_url")
user_email = dbutils.widgets.get("user_email")

# COMMAND ----------

from datetime import datetime, timezone

import mlflow
import requests


def _get_watcher_secret() -> str:
    try:
        return dbutils.secrets.get(scope="scout", key="watcher_secret")
    except Exception:  # noqa: BLE001 - fall through to the documented fallback
        fallback = dbutils.widgets.get("watcher_secret")
        if fallback:
            return fallback
        raise RuntimeError(
            "ORCHESTRATOR_SECRET_MISSING: secret scout/watcher_secret not found "
            "and no watcher_secret base_parameter given"
        )


# COMMAND ----------

mlflow.set_experiment(f"/Users/{user_email}/scout/orchestrator")

run_ts = datetime.now(timezone.utc)
status = "failed"
profiles = rescored = nudges = 0
error_text = None

spark.sql(
    f"""
    create table if not exists {catalog}.{schema}.orchestrator_runs (
        run_ts timestamp,
        profiles long,
        rescored long,
        nudges long,
        status string,
        error string
    ) using delta
    """
)

with mlflow.start_run(run_name=f"orchestrator-{run_ts.isoformat()}"):
    try:
        secret = _get_watcher_secret()
        resp = requests.get(match_url, headers={"X-Watcher-Secret": secret}, timeout=120)
        if resp.status_code != 200:
            raise RuntimeError(
                f"ORCHESTRATOR_MATCH_FAILED: {resp.status_code} {resp.text[:500]}"
            )
        body = resp.json()
        profiles = int(body.get("profiles", 0))
        rescored = int(body.get("rescored", 0))
        nudges = int(body.get("nudges", 0))
        status = "success"
        mlflow.log_metrics({"profiles": profiles, "rescored": rescored, "nudges": nudges})
    except Exception as e:  # noqa: BLE001 - re-raised named, never swallowed
        status = "failed"
        error_text = str(e)
        mlflow.log_param("error", error_text[:250])
        mlflow.log_metric("failed", 1)
        raise
    finally:
        spark.createDataFrame(
            [(run_ts, profiles, rescored, nudges, status, error_text)],
            schema="run_ts timestamp, profiles long, rescored long, nudges long, status string, error string",
        ).write.format("delta").mode("append").saveAsTable(f"{catalog}.{schema}.orchestrator_runs")
        print(f"orchestrator_runs row written: status={status} profiles={profiles} rescored={rescored} nudges={nudges}")
