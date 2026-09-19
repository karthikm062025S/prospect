// Server-rendered: page.tsx already resolved the nudges read (one direct
// query() select scoped by user_id -- L4 owns lib/nudges.ts and the table
// itself, this component only displays what page.tsx handed it).
export interface NudgeRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export function NudgesStrip({ nudges }: { nudges: NudgeRow[] | null }) {
  if (nudges === null) {
    return <p className="text-[13px] text-text-dim">Nudges arrive when the Orchestrator agent runs.</p>;
  }
  if (nudges.length === 0) {
    return <p className="text-[13px] text-text-dim">No nudges yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Nudges">
      {nudges.map((nudge) => (
        <li
          key={nudge.id}
          className="flex flex-col gap-1 border border-hairline bg-raised p-3"
          style={{ borderRadius: "var(--radius-card, 16px)" }}
        >
          <span className="font-label text-[11px] uppercase tracking-label text-text-dim">{nudge.kind}</span>
          <span className="text-[15px] font-medium text-text">{nudge.title}</span>
          <span className="text-[13px] text-text-dim">{nudge.body}</span>
        </li>
      ))}
    </ul>
  );
}
