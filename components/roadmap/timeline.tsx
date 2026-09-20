"use client";

import type { RoadmapNode } from "@/lib/roadmaps";
import { Rise } from "@/components/motion/rise";

const KIND_LABEL: Record<RoadmapNode["kind"], string> = {
  course: "Course",
  club: "Club",
  project: "Project",
  certification: "Certification",
};

const STATUS_LABEL: Record<RoadmapNode["status"], string> = {
  suggested: "Suggested",
  planned: "Planned",
  done: "Done",
};

/** Semester columns of node cards. Purely presentational: selection and mutation live in RoadmapBoard. */
export function RoadmapTimeline({
  semesters,
  nodesBySemester,
  selectedNodeId,
  onSelectNode,
  onReplanFrom,
  replanPending,
  onAddNode,
}: {
  semesters: string[];
  nodesBySemester: Map<string, RoadmapNode[]>;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onReplanFrom: (semester: string) => void;
  replanPending: string | null;
  onAddNode: (semester: string) => void;
}) {
  return (
    // Baseline defect 2: the semester columns scroll INSIDE their own
    // horizontal scroller, never the page. `min-w-0` lets this flex/grid child
    // shrink below its content (min-width defaults to auto, which is what
    // pushed the whole page wide at 390); `snap-x` + `snap-start` makes a
    // touch swipe land on a whole column; `overscroll-x-contain` stops the
    // swipe chaining out to the page.
    <div
      className="-mx-1 flex min-w-0 snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain px-1 pb-3"
      role="list"
      aria-label="Semester roadmap"
    >
      {semesters.map((semester) => {
        const nodes = nodesBySemester.get(semester) ?? [];
        return (
          <section
            key={semester}
            role="listitem"
            aria-label={semester}
            className="flex w-72 shrink-0 snap-start flex-col gap-3 rounded-card border border-hairline bg-raised p-4"
          >
            <header className="flex items-center justify-between gap-2">
              <h3 className="font-display text-step-1 text-text">{semester}</h3>
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
              <p className="py-4 text-[13px] text-text-dim">No nodes yet for this semester.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {/* SYSTEM.md Motion grammar: roadmap nodes Rise with the same
                    0.04-0.06s stagger the feed rows use. */}
                {nodes.map((node, index) => (
                  <Rise as="li" key={node.id} index={index}>
                    <NodeCard node={node} selected={node.id === selectedNodeId} onSelect={() => onSelectNode(node.id)} />
                  </Rise>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => onAddNode(semester)}
              className="min-h-11 rounded-card border border-dashed border-hairline px-4 font-sans text-sm text-text-dim hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              + Add a course or club
            </button>
          </section>
        );
      })}
    </div>
  );
}

export function NodeCard({
  node,
  selected,
  onSelect,
}: {
  node: RoadmapNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex min-h-11 w-full flex-col items-start gap-1 border-l-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
        selected ? "border-sage bg-bg" : "border-transparent hover:bg-bg"
      }`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="font-label text-[11px] uppercase tracking-label text-text-dim">{KIND_LABEL[node.kind]}</span>
        <span
          className={`font-label text-[11px] uppercase tracking-label ${
            node.status === "done" ? "text-sage" : node.status === "planned" ? "text-text" : "text-text-dim"
          }`}
        >
          {STATUS_LABEL[node.status]}
        </span>
      </span>
      <span className="text-[15px] font-medium text-text">{node.title}</span>
      {node.ref_code || node.ref_name ? (
        <span className="font-mono text-[12px] text-text-dim">{node.ref_code ?? node.ref_name}</span>
      ) : null}
    </button>
  );
}
