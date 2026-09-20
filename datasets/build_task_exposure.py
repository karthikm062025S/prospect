"""Build task_exposure.csv from O*NET task statements + Anthropic Economic Index (AEI) v2 per-task shares.

Sources (both public, downloaded verbatim next to this script):
  onet_task_statements_raw.csv            O*NET 31.0, CC-BY 4.0
  aei_automation_vs_augmentation_by_task.csv   AEI release_2025_03_27

AEI split (its own definition): automation = directive + feedback_loop,
augmentation = task_iteration + validation + learning. `filtered` is excluded
and the two shares are renormalised over the remaining mass. A task whose
non-filtered mass is 0 carries no evidence and is dropped, never zero-filled.
"""
import csv

SOURCE = "anthropic_economic_index_2025_03_27"
AUTO = ("directive", "feedback_loop")
AUG = ("task_iteration", "validation", "learning")

aei = {}
with open("aei_automation_vs_augmentation_by_task.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        a = sum(float(r[k]) for k in AUTO)
        g = sum(float(r[k]) for k in AUG)
        if a + g == 0:
            continue
        aei[r["task_name"].strip().lower()] = (a / (a + g), g / (a + g))

rows, unmatched = [], 0
with open("onet_task_statements_raw.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        hit = aei.get(r["Task"].strip().lower())
        if hit is None:
            unmatched += 1
            continue
        rows.append((r["Task ID"], r["O*NET-SOC Code"], f"{hit[0]:.6f}", f"{hit[1]:.6f}", SOURCE))

with open("task_exposure.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["task_id", "onet_soc_code", "automation_share", "augmentation_share", "source"])
    w.writerows(rows)

with open("onet_task_statements_raw.csv", newline="", encoding="utf-8") as f, \
     open("onet_tasks.csv", "w", newline="", encoding="utf-8") as out:
    w = csv.writer(out)
    w.writerow(["onet_soc_code", "task_id", "task_statement"])
    w.writerows((r["O*NET-SOC Code"], r["Task ID"], r["Task"]) for r in csv.DictReader(f))

print(f"aei tasks with evidence: {len(aei)}")
print(f"task_exposure.csv rows: {len(rows)}  |  onet tasks with no AEI row: {unmatched}")
assert rows and all(0 <= float(a) <= 1 for _, _, a, _, _ in rows), "shares out of range"
