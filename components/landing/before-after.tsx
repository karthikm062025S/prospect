"use client";

import { useRef } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import { FAMILY_LABEL } from "@/lib/family";
import { SEASON_LABEL } from "@/lib/season";
import type { FeedRow } from "@/lib/public-feed-format";
import { LABELS, LABEL_SOURCE } from "@/components/landing/label-legend";
import { useSettled } from "@/components/motion/settled";
import { usePinProgress, useWideViewport } from "@/components/motion/pin-scene";

// Section 7: the before / after band.
// Spec: build/research/wishlabs/components/06-before-after.md.
//
// Redesign 2026-09-20 (lane L3, item 1): this band became a PINNED SCENE. The
// section holds one viewport-tall frame for two viewports of scroll; the raw
// posting on the left stays exactly where it is while the structured record on
// the right assembles field by field, each field crossing its own threshold of
// the pin's scroll progress, with the accent rule drawing across the record's
// header and a reading sweep travelling down the raw posting as the fields are
// read out of it.
//
// It replaced a pointer-dragged clip-path wipe. The wipe could only ever show
// ONE side at a time, which is the opposite of the point the band makes, and
// its range input was a control invented for the animation rather than for the
// content. Scroll position is now the only input, so there is one code path
// and nothing to drag, and the settled state below is the complete record.
//
// The posting is REAL: the first row of the public feed (CONTEXT 13:25 — no
// mock data, ever). When the feed read fails the band says so by name instead
// of inventing a posting.
//
// Honest bound: per-task Human-led / AI-assisted / Automatable labels are
// computed against a profile and are not public, so the parsed side shows the
// record Prospect actually extracts plus the legend, and says where the task
// labels come from. Fabricating task rows for a real posting would be mock data.

const PANE =
  "flex h-full flex-col rounded-card border border-hairline bg-raised px-6 py-6 sm:px-8";
const FIELD_LABEL = "font-label text-step-2xs uppercase tracking-label text-text-dim";

// Two panes side by side need both columns, so the scene pins only once there
// is room for them. Below that it renders its settled state: complete and
// un-pinned, never a viewport-tall frame with content clipped out of it
// (components/motion/pin-scene.tsx).
const PIN_FROM = "(min-width: 640px)";

// The choreography, all inside [0, 1] and ascending: Motion hands a
// scroll-derived value to the compositor through the Web Animations API, which
// rejects an out-of-range or non-monotonic offset outright.
const FIELD_FROM = 0.16;
const FIELD_STEP = 0.1;
const FIELD_SPAN = 0.12;
const CHIPS: [number, number] = [0.82, 0.94];
const RULE: [number, number] = [0.06, 0.46];
const READ_LINE: [number, number] = [0.12, 0.78];

function hostOf(href: string | null): string {
  if (!href) return "no link on the board";
  try {
    return new URL(href).host;
  } catch {
    return "no link on the board";
  }
}

function fieldsOf(row: FeedRow): { term: string; value: string }[] {
  return [
    { term: "Role", value: row.title },
    { term: "Employer", value: row.company },
    { term: "Role family", value: FAMILY_LABEL[row.family] },
    { term: "Term", value: SEASON_LABEL[row.season] },
    { term: "Location", value: row.location ?? "Not stated" },
    { term: "Found", value: row.added },
  ];
}

/** One extracted field, arriving as the pin's progress crosses its threshold. */
function Field({
  term,
  value,
  index,
  progress,
  animate,
}: {
  term: string;
  value: string;
  index: number;
  progress: MotionValue<number>;
  animate: boolean;
}) {
  const start = FIELD_FROM + index * FIELD_STEP;
  const end = start + FIELD_SPAN;
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const y = useTransform(progress, [start, end], [14, 0]);
  // Inward, from the raw posting's side, and never further than the pane's own
  // padding, so no transform can push the scene past the container.
  const x = useTransform(progress, [start, end], [-10, 0]);

  return (
    <motion.div style={animate ? { opacity, y, x } : undefined}>
      <dt className={FIELD_LABEL}>{term}</dt>
      <dd className="mt-1 text-step-0 leading-body text-text">{value}</dd>
    </motion.div>
  );
}

/** Left: the posting exactly as its board publishes it. It never moves. */
function RawPane({
  row,
  progress,
  animate,
}: {
  row: FeedRow;
  progress: MotionValue<number>;
  animate: boolean;
}) {
  const readY = useTransform(progress, READ_LINE, ["0%", "100%"]);

  return (
    <div className={PANE}>
      <p className={FIELD_LABEL}>As the board publishes it</p>
      {/* Centred in the pane: the posting is five short lines and the pane is
          as tall as the record beside it, so the block sits in the middle of
          its own space instead of leaving one large void under it (D10). */}
      <div className="mt-6 flex grow items-center">
        <div className="relative w-full">
          {animate ? (
            // The reading sweep: which part of the posting is being read out,
            // right now. A soft band UNDER the text, not a rule across it
            // (that read as a strikethrough), and first in the DOM so the
            // posting paints over it — a negative z-index would put it behind
            // the pane's own background and make it invisible.
            <motion.div
              aria-hidden="true"
              style={{ top: readY }}
              className="pointer-events-none absolute inset-x-0 h-8 -translate-y-1/2 rounded-pill bg-accent/15"
            />
          ) : null}
          <pre className="relative whitespace-pre-wrap break-words font-mono text-step-xs leading-body text-text">
            {`${row.title}
${row.company}
${row.location ?? "location not stated"}
${hostOf(row.href)}
found ${row.added}`}
          </pre>
        </div>
      </div>
    </div>
  );
}

/** Right: the record Prospect extracts, assembled field by field. */
function RecordPane({
  row,
  progress,
  animate,
}: {
  row: FeedRow;
  progress: MotionValue<number>;
  animate: boolean;
}) {
  const scaleX = useTransform(progress, RULE, [0, 1]);
  const chips = useTransform(progress, CHIPS, [0, 1]);

  return (
    <div className={PANE}>
      <p className={FIELD_LABEL}>What Prospect reads out of it</p>
      {/* The accent rule draws across the header as the record assembles. */}
      <div aria-hidden="true" className="mt-3 h-px w-full bg-hairline">
        <motion.div
          style={animate ? { scaleX, transformOrigin: "left" } : undefined}
          className="h-px w-full bg-accent"
        />
      </div>

      <dl className="mt-6 grid grow content-start gap-4 sm:grid-cols-2">
        {fieldsOf(row).map((field, index) => (
          <Field
            key={field.term}
            term={field.term}
            value={field.value}
            index={index}
            progress={progress}
            animate={animate}
          />
        ))}
      </dl>

      <motion.div style={animate ? { opacity: chips } : undefined} className="mt-6">
        <ul className="flex flex-wrap gap-2">
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
          Once your profile is in, every measured task on this posting carries one of those three labels, and the rest say not measured.{" "}
          {LABEL_SOURCE}
        </p>
      </motion.div>
    </div>
  );
}

export function BeforeAfter({ row }: { row: FeedRow | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const settled = useSettled();
  const wide = useWideViewport(PIN_FROM);
  const pinned = wide && !settled;
  const progress = usePinProgress(ref, !pinned);

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

  // Settled: prefers-reduced-motion, ?motion=final, or a viewport too narrow to
  // hold both panes. No runway, no pin, no interpolation — the same two panes
  // with every field and every chip already in place. The information, none of
  // the choreography.
  if (!pinned) {
    return (
      <div className="mx-auto grid w-full max-w-page items-stretch gap-6 sm:grid-cols-2">
        <RawPane row={row} progress={progress} animate={false} />
        <RecordPane row={row} progress={progress} animate={false} />
      </div>
    );
  }

  // The runway IS the scene: two viewports of scroll behind a viewport-tall
  // sticky frame. The panes are equal-width, equal-height siblings that fill
  // the container (D10), so the pin never shows a half-empty column.
  return (
    <div ref={ref} className="relative h-[240dvh]">
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-page items-stretch gap-6 sm:grid-cols-2 [&>*]:min-h-[56dvh]">
          <RawPane row={row} progress={progress} animate />
          <RecordPane row={row} progress={progress} animate />
        </div>
      </div>
    </div>
  );
}
