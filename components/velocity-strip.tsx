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

function Figure({ label, number, footer }: { label: string; number: ReactNode; footer?: ReactNode }) {
  return (
    <div>
      <p className="font-sans text-step-2 tabular-nums text-text leading-none">{number}</p>
      <p className="font-label text-[11px] uppercase tracking-label text-text-dim mt-1">{label}</p>
      {footer}
    </div>
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
    <div className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <Figure label="Added today" number={added} />
      <Figure label="Applied today" number={today} />
      <Figure label="Applied this week" number={week} />
      <Figure
        label="This month"
        number={
          target === null ? (
            month
          ) : (
            <>
              {month} <span className="text-text-dim">of</span> {target}
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
