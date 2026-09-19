"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowCounterClockwiseIcon } from "@/components/icons";

// List-level error state for the (app) routes (doc 3 §2/§3: inline, one
// recovery action). Without this, a failed server fetch fell through to
// Next's default crash page. "Failures are loud and named" (CONTEXT.md):
// error.message (server text like "DB_QUERY_FAILED (roles): ...", never a
// stack trace) renders under the heading, and error.digest (an opaque
// correlation id) is logged to the console for now (a real server-side log
// sink is future work).
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error.digest) console.error("app error", error.digest);
  }, [error.digest]);

  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <span className="text-text-dim">
        <ArrowCounterClockwiseIcon />
      </span>
      <p className="text-sm text-text" role="alert">
        Something went wrong loading this view.
      </p>
      {error.message ? (
        <p className="font-mono text-[11px] text-text-dim">{error.message}</p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center border border-hairline px-3 font-sans text-sm font-medium text-sage hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center border border-hairline px-3 font-sans text-sm font-medium text-text-dim hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
