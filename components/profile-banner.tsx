"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

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
    <div className="flex items-center justify-between gap-3 border border-hairline bg-raised px-4 py-2 text-sm text-text">
      <p>
        Update your profile. Add your name so Scout can greet you.{" "}
        <Link href="/settings#profile" className="underline underline-offset-2 hover:text-sage">
          Go to profile
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(uid)}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        ×
      </button>
    </div>
  );
}
