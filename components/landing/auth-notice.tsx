"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// D27.5: /welcome?error=auth means signInWithGoogleAction (app/auth/actions.ts)
// or the /auth/callback exchange failed and bounced the visitor back here.
// useSearchParams needs a Suspense boundary; it lives INSIDE this default
// export so the orchestrator's mount under the hero CTA stays one line.
function AuthNoticeInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  if (searchParams.get("error") !== "auth") return null;

  return (
    <p
      role="status"
      className="mt-4 inline-flex min-h-11 items-center gap-3 rounded-pill border border-ink-text/40 bg-ink/40 px-4 text-step-xs text-ink-text"
    >
      Google sign-in did not finish. Try again.
      <button
        type="button"
        onClick={() => router.replace("/welcome", { scroll: false })}
        className="min-h-11 underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Dismiss
      </button>
    </p>
  );
}

export default function AuthNotice() {
  return (
    <Suspense fallback={null}>
      <AuthNoticeInner />
    </Suspense>
  );
}
