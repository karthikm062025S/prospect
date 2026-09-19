"use client";

import Link from "next/link";

// D15 pre-deployment checklist: a custom error page for a crash ABOVE the root
// layout (root layout errors, or one it doesn't catch). Next requires this file
// to render its own <html>/<body> — it fully REPLACES app/layout.tsx when it
// fires, so it cannot assume the theme tokens (app/globals.css custom
// properties, set by the root layout's inline theme script) are in effect.
// Inline styles only, deliberately minimal. "Failures are loud and named"
// (CONTEXT.md): error.message renders as server text, never a stack trace.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`button:focus-visible, a:focus-visible { outline: 2px solid #2d5a43; outline-offset: 2px; }`}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f9f6ee",
          color: "#18181b",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: "0.875rem", color: "#6b6b74", margin: 0, maxWidth: "32ch" }}>
          Prospect hit an unexpected error. Reloading usually fixes it.
        </p>
        {error.message ? (
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.75rem",
              color: "#6b6b74",
              margin: 0,
              maxWidth: "40ch",
              wordBreak: "break-word",
            }}
          >
            {error.message}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: 44,
              padding: "0 1rem",
              border: "1px solid rgb(24 24 27 / 0.12)",
              background: "transparent",
              color: "#2d5a43",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            style={{
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 1rem",
              border: "1px solid rgb(24 24 27 / 0.12)",
              color: "#18181b",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              textDecoration: "none",
            }}
          >
            Go home
          </Link>
        </div>
      </body>
    </html>
  );
}
