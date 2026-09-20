// v5 counts strip (was the RB-007 velocity strip): roles added today alongside
// the signed-in user's application counts. Numbers only, muted
// (doc 4 §6); no chart. Static text: loading is covered by
// app/(app)/loading.tsx's skeleton, and it can neither be empty nor error.
//
// v7 S4 D25: this is a STAT surface, so its numerals are Satoshi + tabular-nums,
// never IBM Plex Mono -- Plex's dotted zero was printing four dotted zeros in the
// first line of the signed-in app (the same complaint the landing chip counts got
// in tests/landing-numerals.test.ts). Plex stays for data VALUES in tables/rows.
// tests/app-numerals.test.ts pins it.
//
// v8 D11: four labelled figures instead of one muted sentence. The month
// figure reads "N of T" once the user sets a `monthly_target` (lib/profile.ts,
// threaded in by the caller); until then it is just "N" with a "Set a target"
// link. `target` stays optional/nullable so this stays mountable exactly as
// before (added/today/week/month only) wherever a caller has not wired one in
// yet.
//
// `added` is computed CLIENT-side (lib/velocity.ts addedToday) over every role
// Scout created in the last two days — hidden and already-applied ones
// included — so the number is the reader's real local-day count, not just what
// the current filter happens to show.
import type { ReactNode } from "react";
import Link from "next/link";
import { SlidingNumber } from "@/components/motion/sliding-number";

function Figure({ label, number, footer }: { label: string; number: ReactNode; footer?: ReactNode }) {
  return (
    // A figure and its label are ONE unit, so they sit at the 8px grid step,
    // not the 12px stack gap that separates DIFFERENT items (ui_laws.md #4,
    // Law of Proximity). The 24px block gap between figures is what groups
    // them into the strip.
    <div className="flex flex-col gap-2">
      <p className="font-sans text-step-2 leading-none tabular-nums text-text">{number}</p>
      <p className="font-label text-[11px] uppercase tracking-label text-text-dim">{label}</p>
      {footer}
    </div>
  );
}

// SYSTEM.md Motion grammar: the stat numbers slide (odometer). SlidingNumber
// paints all ten digits per column, so the READABLE value is this sr-only
// span; the odometer itself is aria-hidden decoration. Under
// prefers-reduced-motion / the Settled setting SlidingNumber renders the plain
// final value instead (components/motion/sliding-number.tsx).
function Stat({ value }: { value: number }) {
  return (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        <SlidingNumber value={value} />
      </span>
    </>
  );
}

export function VelocityStrip({
  added,
  today,
  week,
  month,
  target = null,
}: {
  added: number;
  today: number;
  week: number;
  month: number;
  target?: number | null;
}) {
  return (
    // D10 (Karthik): stat tiles are equal columns, in a raised card matching
    // the mock's `.card.velocity` (get-started.tsx's own card recipe, so the
    // two cards on this page read as one system).
    <div className="grid grid-cols-2 gap-6 rounded-card bg-raised p-6 shadow-sm ring-1 ring-hairline sm:grid-cols-4">
      <Figure label="Added today" number={<Stat value={added} />} />
      <Figure label="Applied today" number={<Stat value={today} />} />
      <Figure label="Applied this week" number={<Stat value={week} />} />
      <Figure
        label="This month"
        number={
          target === null ? (
            <Stat value={month} />
          ) : (
            <>
              <Stat value={month} /> <span className="text-text-dim">of</span> <Stat value={target} />
            </>
          )
        }
        footer={
          target === null && (
            <Link href="/settings#account" className="font-sans text-xs text-text-dim">
              Set a target
            </Link>
          )
        }
      />
    </div>
  );
}
