"use client";

// View Transition helper — the exact pattern proven in spike 2
// (02-trd.md §13 verdict): document.startViewTransition() wraps the
// navigation; the transition's own promise is resolved from an
// always-mounted component's effect keyed on usePathname(), i.e. AFTER Next
// commits the new route, never synchronously. Feature-detected; falls back
// to a plain router.push where startViewTransition doesn't exist.

import { startTransition, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

let pendingResolve: (() => void) | null = null;

function registerResolve(resolve: () => void) {
  // A second navigation before the first commits: settle the first promise so
  // its (auto-skipped) transition can never hang on an orphaned callback.
  pendingResolve?.();
  pendingResolve = resolve;
}

export function useViewTransitionNav() {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (href: string) => {
      // Re-clicking the current tab: pathname never changes, so the resolver
      // effect would never fire — skip the transition entirely.
      if (href === pathname) return;
      if (typeof document.startViewTransition === "function") {
        const vt = document.startViewTransition(
          () =>
            new Promise<void>((resolve) => {
              registerResolve(resolve);
              startTransition(() => router.push(href));
            }),
        );
        // A skipped/aborted transition (hidden tab, a newer navigation) rejects
        // these promises; nothing awaits them, so swallow the rejection instead
        // of logging "InvalidStateError: Transition was aborted" (seen in prod).
        vt.ready.catch(() => {});
        vt.finished.catch(() => {});
      } else {
        router.push(href);
      }
    },
    [router, pathname],
  );
}

// Mounted once in app/(app)/layout.tsx. Resolves the pending transition
// promise the render after the pathname actually changes, so
// startViewTransition's snapshot is taken against the new committed DOM.
export function ViewTransitionResolver() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    pendingResolve?.();
    pendingResolve = null;
  }, [pathname]);

  return null;
}
