// Server-rendered: page.tsx already resolved the nudges read (one direct
// query() select scoped by user_id -- L4 owns lib/nudges.ts and the table
// itself, this component only displays what page.tsx handed it).
import { Rise } from "@/components/motion/rise";

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
    // mock journey.html .nudges: a horizontal strip (its OWN scroller, never
    // the page's -- D10 no horizontal scroll at 390) of fixed-width cards.
    <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1" aria-label="Nudges">
      {nudges.map((nudge, index) => (
        <Rise
          as="li"
          key={nudge.id}
          index={index}
          className="flex w-[320px] shrink-0 items-center gap-3 rounded-card border border-hairline bg-raised p-4"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-medium leading-snug text-text">{nudge.title}</span>
            <span className="text-[13px] leading-snug text-text-dim">{nudge.body}</span>
          </span>
        </Rise>
      ))}
    </ul>
  );
}
