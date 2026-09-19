# Imports the sync notebook into the workspace and creates the scheduled job.
# Requires: $env:DATABRICKS_HOST (e.g. https://<workspace>.databricks.com) and
# $env:DATABRICKS_TOKEN (a PAT, RUNBOOK-databricks.md section 1.3). Fails loudly,
# does not silently skip, if either is unset.
#
# Usage (from the repo root, in the wt-l4 worktree):
#   .\databricks\sync\create-job.ps1 -NotebookPath "/Workspace/Users/<you>/scout/sync/sync_lakebase_to_delta"

param(
  [string]$NotebookPath = "/Workspace/Users/<user>/scout/sync/sync_lakebase_to_delta"
)

if (-not $env:DATABRICKS_HOST) { throw "DATABRICKS_HOST is not set" }
if (-not $env:DATABRICKS_TOKEN) { throw "DATABRICKS_TOKEN is not set" }

$headers = @{ Authorization = "Bearer $env:DATABRICKS_TOKEN" }
$notebookBody = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot "sync_lakebase_to_delta.py")
$encodedContent = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($notebookBody))

# Workspace API import (docs.databricks.com/api/workspace/workspace/import):
# SOURCE format + PYTHON language is the correct pair for a .py notebook source file.
Invoke-RestMethod -Method Post -Uri "$env:DATABRICKS_HOST/api/2.0/workspace/import" -Headers $headers -ContentType "application/json" -Body (@{
  path      = $NotebookPath
  format    = "SOURCE"
  language  = "PYTHON"
  content   = $encodedContent
  overwrite = $true
} | ConvertTo-Json)
Write-Host "Imported notebook to $NotebookPath"

$jobPayload = Get-Content -Raw (Join-Path $PSScriptRoot "job.json") | ConvertFrom-Json
$jobPayload.tasks[0].notebook_task.notebook_path = $NotebookPath
$jobResponse = Invoke-RestMethod -Method Post -Uri "$env:DATABRICKS_HOST/api/2.2/jobs/create" -Headers $headers -ContentType "application/json" -Body ($jobPayload | ConvertTo-Json -Depth 10)

Write-Host "Created job scout-sync-lakebase-to-delta, job_id = $($jobResponse.job_id)"
