# Databricks sync — Karthik's steps

The app database (Lakebase) mirrors into Delta bronze/silver every hour. Do these in order.

1. **Secret (primary path).** From a machine with the Databricks CLI configured
   (`DATABRICKS_HOST` + `DATABRICKS_TOKEN`):
   ```
   databricks secrets create-scope scout
   databricks secrets put-secret scout lakebase_url --string-value "postgresql://role:pass@ep-...databricks.com/databricks_postgres?sslmode=require"
   ```
   RISK (unverified this session): Free Edition's secret-scope support was not
   independently confirmed or denied in the docs fetched. If `create-scope`
   errors on Free Edition, fallback: pass the Lakebase URL as a job
   `base_parameter` in `job.json` instead of a secret, and change
   `_get_lakebase_url()` in the notebook to `dbutils.widgets.get("lakebase_url")`
   — less secure (visible in job run history), documented tradeoff only.
2. **Import the notebook + create the job.** From the `wt-l4` worktree, in PowerShell:
   ```
   $env:DATABRICKS_HOST = "https://<workspace>.databricks.com"
   $env:DATABRICKS_TOKEN = "dapi..."
   .\databricks\sync\create-job.ps1 -NotebookPath "/Workspace/Users/<you>/scout/sync/sync_lakebase_to_delta"
   ```
   Prints the imported path and the new `job_id`.
3. **Run it once by hand** (Jobs & Pipelines tab → the job → Run now, or
   `databricks jobs run-now <job_id>`). Expected output lines, one per table:
   `roles: bronze=1295 silver=1295 (was 0)` (first run) then
   `roles: bronze=1295 silver=1295 (was 1295)` (second run, idempotent).
4. **Check it landed.** In a SQL editor or Genie:
   ```sql
   select count(*) from scout.core.silver_roles;
   ```
   Expect it to match the Lakebase `roles` row count.

The job is scheduled hourly (`0 0 * * * ?`, Quartz syntax, `America/New_York`) —
see [Run jobs on a schedule](https://docs.databricks.com/aws/en/jobs/scheduled).
Never re-run `databricks secrets put-secret` in a shared terminal history; the
connection string contains the Lakebase password.
