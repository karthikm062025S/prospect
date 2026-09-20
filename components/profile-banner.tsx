"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { XIcon } from "@/components/icons";

// D10: shown on Home while user_metadata.full_name is empty. Dismissal is
// per-device (localStorage), namespaced by user id (see get-started.tsx's
// same pattern), and expires after 7 days so a returning, still-nameless
// user is reminded again instead of the banner staying hidden forever.
// useSyncExternalStore (not useEffect+setState) avoids the SSR/hydration
// mismatch AND the cascading-render lint the effect version triggers — same
// approach as components/theme-toggle.tsx. The listener set is how a click
// on "Dismiss" re-renders synchronously (localStorage writes alone don't).
const DISMISS_KEY_PREFIX = "scout_profile_banner_dismissed:";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isDismissed(uid: string): boolean {
  try {
    const raw = localStorage.getItem(`${DISMISS_KEY_PREFIX}${uid}`);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return true; // never render the banner during SSR/hydration
}

function dismiss(uid: string): void {
  try {
    localStorage.setItem(`${DISMISS_KEY_PREFIX}${uid}`, String(Date.now()));
  } catch {
    // Persistence is best-effort; the banner still hides for this render.
  }
  listeners.forEach((cb) => cb());
}

export function ProfileBanner({ uid }: { uid: string }) {
  const dismissed = useSyncExternalStore(subscribe, () => isDismissed(uid), getServerSnapshot);

  if (dismissed) return null;

  return (
    // Baseline defect 4: this used to be a full-width raised banner ABOVE the
    // stat strip, so the first thing a new user saw was a chore. It is now one
    // quiet dim line at the top of the page ground with a 44px dismiss target
    // (ui_laws.md #7 Von Restorff: a secondary affordance must not carry the
    // strongest emphasis on the screen; #12 Prägnanz: less visual noise).
    <div className="flex items-center justify-between gap-3 pt-4 text-[13px] text-text-dim">
      <p>
        Add your name so Prospect can greet you.{" "}
        <Link href="/settings#profile" className="text-sage underline underline-offset-2 hover:no-underline">
          Go to profile
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => dismiss(uid)}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <XIcon />
      </button>
    </div>
  );
}
