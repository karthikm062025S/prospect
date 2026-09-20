import { ClockCountdownIcon } from "@/components/icons";
import { STALE_DAYS } from "@/lib/stale";

// RB-026 quiet stale marker: information, not an alarm — muted, never red
// (doc 4 §6). Rendered only when lib/stale.ts isStale() says so; the
// derivation is never stored. Muted text-dim on the hairline border: the
// brief's "tan" has no token (S3 wired none), text-dim is the muted tier.
export function StaleBadge() {
  // D10: the house status-chip size (~26px) so this reads the same as every
  // other chip on a role row (Home's status/repost chips, labels-bar.tsx).
  return (
    <span className="inline-flex h-[26px] items-center gap-1 rounded-pill border border-hairline px-2.5 font-label text-[11px] tracking-label uppercase text-text-dim">
      <ClockCountdownIcon />
      quiet for <span className="font-sans tabular-nums">{STALE_DAYS}d</span>
    </span>
  );
}
