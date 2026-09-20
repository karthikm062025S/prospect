"use client";

import type { RoadmapNode } from "@/lib/roadmaps";
import { XIcon } from "@/components/icons";
import { Rise } from "@/components/motion/rise";

const KIND_LABEL: Record<RoadmapNode["kind"], string> = {
  course: "Course",
  club: "Club",
  project: "Project",
  certification: "Certification",
};

/** Hostname only, never the query string, for the certification "Source" chip -- derived from the real source_url, never invented. */
function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Semester rail: a continuous vertical line with one dot per semester, each
 * holding an equal-width grid of node cards (mock journey.html .rail/.nodes).
 * Purely presentational -- selection and mutation live in RoadmapBoard.
 * D10: equal-width columns via auto-fill, shared card padding/radius, no
 * horizontal scroll at any width (semesters stack, cards wrap).
 */
export function RoadmapTimeline({
  semesters,
  nodesBySemester,
  selectedNodeId,
  onSelectNode,
  onReplanFrom,
  replanPending,
  onAddNode,
  onRemoveNode,
}: {
  semesters: string[];
  nodesBySemester: Map<string, RoadmapNode[]>;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onReplanFrom: (semester: string) => void;
  replanPending: string | null;
  onAddNode: (semester: string) => void;
  onRemoveNode: (id: string) => void;
}) {
  const nowSemester = semesters[0];
  const targetSemester = semesters[semesters.length - 1];

  return (
    <div className="relative flex min-w-0 flex-col gap-8 pl-6 sm:pl-7" role="list" aria-label="Semester roadmap">
      <div className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-0.5 bg-hairline sm:left-2" aria-hidden />
      {semesters.map((semester, semesterIndex) => {
        const nodes = nodesBySemester.get(semester) ?? [];
        const isNow = semester === nowSemester;
        // A one-semester plan is entirely "now"; only call it "the goal" when
        // it is a distinct later term.
        const isTarget = semester === targetSemester && semesters.length > 1;
        const qualifier = [
          isNow ? "now" : isTarget ? "the goal" : null,
          nodes.length > 0 ? `${nodes.length} item${nodes.length === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <Rise as="section" key={semester} index={semesterIndex} className="relative flex min-w-0 flex-col gap-3">
            <span
              className={`absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full border-2 sm:-left-7 ${
                isNow ? "border-accent bg-accent" : "border-sage bg-bg"
              }`}
              aria-hidden
            />
            <header
              role="listitem"
              aria-label={semester}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
            >
              <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-step-3 text-text">
                {semester}
                {qualifier ? (
                  <span className="font-label text-[11px] uppercase tracking-label text-text-dim">{qualifier}</span>
                ) : null}
              </h3>
              <button
                type="button"
                onClick={() => onReplanFrom(semester)}
                disabled={replanPending !== null}
                className="min-h-11 shrink-0 font-label text-[11px] uppercase tracking-label text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:text-text-dim"
              >
                {replanPending === semester ? "Replanning…" : "Replan"}
              </button>
            </header>

            {nodes.length === 0 ? (
              <p className="rounded-card border border-dashed border-hairline p-4 text-center text-[13px] text-text-dim">
                No nodes yet for this semester.
              </p>
            ) : (
              // D10: equal-width columns that fill the available row (auto-fill
              // + 1fr), so a 2-node semester never leaves a half-empty column
              // and a 5-node one wraps cleanly. Grid's default row stretch
              // gives every card in a row the same height.
              <ul className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {nodes.map((node, index) => (
                  <Rise as="li" key={node.id} index={index}>
                    <NodeCard
                      node={node}
                      nowSemester={nowSemester}
                      selected={node.id === selectedNodeId}
                      onSelect={() => onSelectNode(node.id)}
                      onRemove={() => onRemoveNode(node.id)}
                    />
                  </Rise>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => onAddNode(semester)}
              className="flex min-h-11 w-full items-center justify-center rounded-card border border-dashed border-hairline px-4 font-sans text-sm text-text-dim hover:border-sage hover:bg-sage/5 hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              + Add a course or club
            </button>
          </Rise>
        );
      })}
    </div>
  );
}

export function NodeCard({
  node,
  nowSemester,
  selected,
  onSelect,
  onRemove,
}: {
  node: RoadmapNode;
  nowSemester: string;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  // "In progress" is derived display only, never stored: a `planned` node in
  // the semester the student is currently in reads as underway; the same
  // status in a future semester reads as merely planned. `done`/`suggested`
  // are unaffected by this derivation.
  const inProgress = node.status === "planned" && node.semester === nowSemester;
  const statusLabel =
    node.status === "done" ? "Done" : inProgress ? "In progress" : node.status === "suggested" ? "Suggested" : "Planned";
  const dotClass = node.status === "done" ? "border-sage bg-sage" : inProgress ? "border-accent bg-accent" : "border-sage bg-transparent";

  // Provenance chips: real fields only. Course/club nodes never carry a
  // source_url (lib/agents/roadmap.ts always writes it null for those kinds),
  // so a "Source" chip only ever renders for a grounded certification, and the
  // "not from a dataset" note only ever renders for an agent-suggested project
  // (both true by construction, not a guess).
  const hasFoot = node.moves_toward.length > 0 || (node.kind === "certification" && node.source_url) || node.kind === "project";

  return (
    // A <button> can't nest another <button> (the remove control below), so
    // the card itself is a div and the select button covers its content.
    <div
      className={`group relative flex h-full min-h-[168px] flex-col gap-2 rounded-card border p-4 transition-colors ${
        node.status === "done"
          ? "border-transparent bg-sage/10"
          : selected
            ? "border-sage bg-raised"
            : "border-hairline bg-raised hover:border-sage/40"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="flex min-h-11 flex-1 flex-col items-start gap-2 rounded-card pr-11 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="font-label text-[11px] uppercase tracking-label text-text-dim">{KIND_LABEL[node.kind]}</span>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-text-dim">
            <span className={`h-2 w-2 shrink-0 rounded-full border-[1.5px] ${dotClass}`} aria-hidden />
            {statusLabel}
          </span>
        </span>
        <span className="font-display text-step-1 leading-[1.15] text-text">{node.title}</span>
        <span className="text-[14px] text-text-dim">{node.why}</span>
        {node.ref_code || node.ref_name ? (
          <span className="font-mono text-[12px] text-text-dim">{node.ref_code ?? node.ref_name}</span>
        ) : null}
        {hasFoot ? (
          <span className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {node.moves_toward.map((target) => (
              <span
                key={target}
                className="inline-flex h-[26px] shrink-0 items-center rounded-pill bg-sage/10 px-2.5 font-sans text-[12px] font-medium text-sage"
              >
                Moves you toward &middot; {target}
              </span>
            ))}
            {node.kind === "certification" && node.source_url ? (
              <a
                href={node.source_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-[26px] shrink-0 items-center rounded-pill border border-hairline px-2.5 font-sans text-[12px] text-text-dim hover:border-sage hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                Source &middot; {sourceLabel(node.source_url)}
              </a>
            ) : null}
            {node.kind === "project" ? (
              <span className="inline-flex h-[26px] shrink-0 items-center rounded-pill border border-hairline px-2.5 font-sans text-[12px] text-text-dim">
                Suggested, not from a dataset
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${node.title}`}
        className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded-sm text-text-dim opacity-60 hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <XIcon />
      </button>
    </div>
  );
}
