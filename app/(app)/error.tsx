"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowCounterClockwiseIcon } from "@/components/icons";

// List-level error state for the (app) routes (doc 3 §2/§3: inline, one
// recovery action). Without this, a failed server fetch fell through to
// Next's default crash page. D15 pre-deployment checklist: no error message
// or stack text is rendered — error.digest (an opaque correlation id, not the
// message) is the only thing logged, and only to the console for now (a real
// server-side log sink is future work).
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
