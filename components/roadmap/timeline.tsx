"use client";

import type { RoadmapNode } from "@/lib/roadmaps";
import { XIcon } from "@/components/icons";

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
  return (
    <div className="flex gap-4 overflow-x-auto pb-2" role="list" aria-label="Semester roadmap">
      {semesters.map((semester) => {
        const nodes = nodesBySemester.get(semester) ?? [];
        return (
          <section
            key={semester}
            role="listitem"
            aria-label={semester}
            className="flex w-72 shrink-0 flex-col gap-3 border border-hairline bg-raised p-3"
            style={{ borderRadius: "var(--radius-card, 16px)" }}
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
              <ul className="flex flex-col gap-2">
                {nodes.map((node) => (
                  <li key={node.id}>
                    <NodeCard
                      node={node}
                      selected={node.id === selectedNodeId}
                      onSelect={() => onSelectNode(node.id)}
                      onRemove={() => onRemoveNode(node.id)}
                    />
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => onAddNode(semester)}
              className="min-h-11 border border-dashed border-hairline px-2 font-sans text-sm text-text-dim hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
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
  onRemove,
}: {
  node: RoadmapNode;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    // A <button> can't nest another <button> (the × below), so the card
    // itself is a div and the select button covers its content, pr-8 leaving
    // room for the × that sits on top of it, absolutely positioned.
    <div
      className={`relative flex min-h-11 w-full flex-col items-start gap-1 border-l-2 ${
        selected ? "border-sage bg-bg" : "border-transparent hover:bg-bg"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="flex w-full flex-col items-start gap-1 px-2 py-2 pr-11 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${node.title}`}
        className="absolute right-0 top-0 flex min-h-11 min-w-11 items-center justify-center text-text-dim hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <XIcon />
      </button>
    </div>
  );
}
