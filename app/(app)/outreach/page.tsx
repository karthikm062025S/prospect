import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import type { Outreach } from "@/lib/types";
import { addOutreachAction } from "./actions";
import { OutreachList, type OutreachGroup } from "@/components/outreach-list";

export const dynamic = "force-dynamic";

const dimLine = "py-1.5 text-text-dim";
const inputClass =
  "min-h-11 border border-hairline bg-raised px-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";
const addBtn =
  "inline-flex min-h-11 items-center border border-hairline bg-raised px-3 font-sans text-sm font-medium text-text hover:bg-bg hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

const STATUS_ORDER: Record<string, number> = { drafted: 0, replied: 1, call: 2, sent: 3, dead: 4 };
// drafted/replied/call need the user's attention outright; a "sent" row whose
// follow-up date has passed also counts (matches the per-card overdue badge).
const ATTENTION_STATUSES = new Set(["drafted", "replied", "call"]);

function needsAttention(row: Outreach, today: string): boolean {
  if (ATTENTION_STATUSES.has(row.status)) return true;
  return !!row.follow_up_at && row.status === "sent" && row.follow_up_at < today;
}

// One section per company (a company can have several contacts). Companies
// needing attention float to the top, then alphabetical; contacts within a
// company keep the existing status-order sort.
function groupByCompany(rows: Outreach[], today: string): OutreachGroup[] {
  const byCompany = new Map<string, Outreach[]>();
  for (const row of rows) {
    const list = byCompany.get(row.company_name) ?? [];
    list.push(row);
    byCompany.set(row.company_name, list);
  }

  return Array.from(byCompany.entries())
    .map(([companyName, companyRows]) => ({
      companyName,
      attention: companyRows.some((r) => needsAttention(r, today)),
      rows: companyRows.sort(
        (a, b) =>
          (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
          (a.follow_up_at ?? "9999").localeCompare(b.follow_up_at ?? "9999"),
      ),
    }))
    .sort(
      (a, b) => Number(b.attention) - Number(a.attention) || a.companyName.localeCompare(b.companyName),
    )
    .map(({ companyName, rows: companyRows }) => ({ companyName, rows: companyRows }));
}

export default async function OutreachPage() {
  const uid = await requireUser();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.from("outreach").select("*").eq("user_id", uid);
  if (error) throw new Error(error.message);

  const groups = groupByCompany((data ?? []) as Outreach[], today);

  return (
    <div className="flex flex-col gap-6 py-4">
      <header className="border-b border-hairline pb-3">
        {/* v6 L3 G: the active tab IS the title (same call Home and
            Applications made) — the subtitle is the first visible line. */}
        <h1 className="sr-only">Outreach</h1>
        <p className="font-sans text-xs text-text-dim">
          Who you contacted, what you sent, and when to follow up · lead with THEIR work, keep it short, one ask
        </p>
      </header>

      <form action={addOutreachAction} className="flex flex-col gap-2 border border-hairline bg-raised p-3">
        <div className="flex flex-wrap gap-2">
          <input name="company_name" aria-label="Company" placeholder="Company" className={inputClass} />
          <input name="role_label" aria-label="Role" placeholder="Role" className={`${inputClass} flex-1`} />
          <select name="channel" aria-label="Channel" className={inputClass} defaultValue="linkedin">
            <option value="linkedin">linkedin</option>
            <option value="email">email</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <input name="contact_name" aria-label="Contact name" placeholder="Contact name" className={inputClass} />
          <input name="contact_title" aria-label="Contact title" placeholder="Title" className={`${inputClass} flex-1`} />
          <input name="contact_handle" aria-label="Profile URL or email" placeholder="Profile URL / email" className={`${inputClass} flex-1`} />
          <input type="date" name="follow_up_at" aria-label="Follow-up date" className={inputClass} />
        </div>
        <textarea name="message" aria-label="Message" placeholder="Message to send (them-first, short)" rows={3} className={inputClass} />
        <button className={`${addBtn} self-start`}>Add</button>
      </form>

      {groups.length === 0 ? (
        <p className={dimLine}>No outreach logged yet.</p>
      ) : (
        <OutreachList groups={groups} today={today} />
      )}
    </div>
  );
}
