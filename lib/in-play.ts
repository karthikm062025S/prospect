// D23: the fit score is deleted, but the EXCLUSION it enforced is load-bearing —
// it is the rule that kept already-applied and expired roles off the Home
// inbox. Copied verbatim from the deleted lib/fit.ts scoreFit() guard clauses
// (lifecycle "applied" / deadline before today, UTC date-only compare) plus
// the application_id NULL condition the Home query already applied alongside
// it. Task 3 K2: citizen_required is NO LONGER excluded here — the row stays
// in play and shows a flag instead (lib/gate-rules.ts writes it, L5 renders
// it); nothing in this phase hides a role by visa_class.
//
// Pure, no I/O: the caller passes nowMs so this stays deterministic.
export function isInPlay(
  role: {
    visa_class: string | null;
    deadline: string | null;
    lifecycle: string;
  },
  nowMs: number,
): boolean {
  if (role.lifecycle !== "open") return false; // "not in play" (lifecycle "applied")
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (role.deadline !== null && role.deadline < today) return false; // "deadline passed"
  return true;
}
