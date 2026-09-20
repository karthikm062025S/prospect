"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FAMILY_LABEL } from "@/lib/family";
import { SEASON_LABEL } from "@/lib/season";
import type { FeedRow } from "@/lib/public-feed-format";
import { LABELS, LABEL_SOURCE } from "@/components/landing/label-legend";

// Section 6: the before / after band.
// Spec: build/research/wishlabs/components/06-before-after.md.
//
// INTERACTION MODEL, decided before the code was written: pointer-driven AND
// keyboard-driven, never scroll-driven. Rung 1 of the km-ui ladder is a native
// <input type="range"> — it is focusable, arrow-key and Home/End operable, has
// a real label, announces its value, and needs no drag handlers of our own. Its
// value drives a clip-path on the overlaid pane, so there is one code path for
// mouse, touch, keyboard and assistive tech (ui_laws 2, 3, 15).
//
// The posting is REAL: the first row of the public feed (CONTEXT 13:25 — no
// mock data, ever). When the feed read fails the band says so by name instead
// of inventing a posting.
//
// Honest bound: per-task Human-led / AI-assisted / Automatable labels are
// computed against a profile and are not public, so the parsed side shows the
// record Prospect actually extracts plus the legend, and says where the task
// labels come from. Fabricating task rows for a real posting would be mock data.

const PANE = "px-6 py-6 sm:px-8";
const FIELD_LABEL = "font-label text-step-2xs uppercase tracking-label text-text-dim";

function hostOf(href: string | null): string {
  if (!href) return "no link on the board";
  try {
    return new URL(href).host;
  } catch {
    return "no link on the board";
  }
}

export function BeforeAfter({ row }: { row: FeedRow | null }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // 0 shows the raw posting whole, 100 shows the parsed record whole.
  const [split, setSplit] = useState(52);

  const measure = useCallback(() => {
    setWidth(frameRef.current?.offsetWidth ?? 0);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
  }, [measure]);

  if (!row) {
    return (
      <div className="mx-auto w-full max-w-page rounded-card border border-dashed border-hairline bg-raised px-6 py-12 text-center">
        <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
          Live feed unavailable
        </p>
        <p className="mx-auto mt-3 max-w-[44ch] text-pretty text-step-0 text-text-dim">
          This panel shows a posting that is open right now, so it stays empty rather than showing
          an invented one.
        </p>
      </div>
    );
  }

  // The clip is in px against the measured frame, so nothing here has to do
  // percentage arithmetic and the two panes always split on the same pixel.
  const offset = Math.round((width * split) / 100);

  return (
    <div className="mx-auto w-full max-w-page">
      <div
        ref={frameRef}
        className="relative isolate overflow-hidden rounded-card border border-hairline bg-raised"
      >
        {/* BEFORE: the posting as the board publishes it. */}
        <div className={PANE}>
          <p className={FIELD_LABEL}>As the board publishes it</p>
          <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-step-xs leading-body text-text">
{`${row.title}
${row.company}
${row.location ?? "location not stated"}
${hostOf(row.href)}
found ${row.added}`}
          </pre>
        </div>

        {/* AFTER: the same posting as the record Prospect extracts. Clipped from
            the left, so the handle wipes between the two. */}
        <div
          className="absolute inset-0 bg-bg"
          // Deliberately NOT aria-hidden: clip-path is a visual crop, and a
          // screen-reader user gets both the raw posting and the parsed record
          // in full, which is the whole point the band is making.
          style={{ clipPath: `inset(0 0 0 ${offset}px)` }}
        >
          <div className={PANE}>
            <p className={FIELD_LABEL}>What Prospect reads out of it</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                { term: "Role", value: row.title },
                { term: "Employer", value: row.company },
                { term: "Role family", value: FAMILY_LABEL[row.family] },
                { term: "Term", value: SEASON_LABEL[row.season] },
                { term: "Location", value: row.location ?? "Not stated" },
                { term: "Found", value: row.added },
              ].map((field) => (
                <div key={field.term}>
                  <dt className={FIELD_LABEL}>{field.term}</dt>
                  <dd className="mt-1 text-step-0 leading-body text-text">{field.value}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-6 flex flex-wrap gap-2">
              {LABELS.map((label) => (
                <li
                  key={label.name}
                  className={`inline-flex items-center rounded-pill px-3 py-1 font-label text-step-2xs uppercase tracking-label ${label.chip}`}
                >
                  {label.name}
                </li>
              ))}
            </ul>
            <p className="mt-3 max-w-[54ch] text-pretty text-step-xs leading-body text-text-dim">
              Once your profile is in, every task on this posting carries one of those three labels.
              {" "}
              {LABEL_SOURCE}
            </p>
          </div>
        </div>

        {/* The seam. Decorative: the range input below is the control. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-sage"
          style={{ left: `${offset}px` }}
        />
      </div>

      <label className="mt-6 flex flex-col gap-2">
        <span className="font-label text-step-2xs uppercase tracking-label text-text-dim">
          Drag, or use the arrow keys, to see what Prospect reads
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
          className="h-11 w-full cursor-ew-resize accent-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        />
      </label>
    </div>
  );
}
