"use client";

import { useState } from "react";
import type { RoadmapNode, NodeStatus } from "@/lib/roadmaps";

const STATUS_ORDER: NodeStatus[] = ["suggested", "planned", "done"];
const STATUS_LABEL: Record<NodeStatus, string> = { suggested: "Suggested", planned: "Planned", done: "Done" };

/**
 * Why / unlocks / moves-toward / source link / notes / status / delete.
 * "unlocks_tasks" is always empty until the Match agent runs (rule 3: a
 * named, honest empty state, never a guess).
 */
export function NodeDetailPane({
  node,
  onSetStatus,
  onSetNotes,
  onDelete,
  onClose,
  pending,
  error,
}: {
  node: RoadmapNode;
  onSetStatus: (status: NodeStatus) => void;
  onSetNotes: (notes: string) => void;
  onDelete: () => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [notesDraft, setNotesDraft] = useState(node.notes ?? "");
  const notesDirty = notesDraft !== (node.notes ?? "");

  return (
    <aside
      aria-label={`${node.title} details`}
      className="flex flex-col gap-4 border border-hairline bg-raised p-4"
      style={{ borderRadius: "var(--radius-panel, 18px)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-step-2 text-text">{node.title}</h3>
          <p className="font-label text-[11px] uppercase tracking-label text-text-dim">
            {node.semester} &middot; {node.kind}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close node details"
          className="min-h-11 min-w-11 shrink-0 text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Close
        </button>
      </div>

      <section>
        <h4 className="font-label text-[11px] uppercase tracking-label text-text-dim">Why</h4>
        <p className="text-[15px] text-text">{node.why}</p>
      </section>

      <section>
        <h4 className="font-label text-[11px] uppercase tracking-label text-text-dim">Unlocks</h4>
        {node.unlocks_tasks.length === 0 ? (
          <p className="text-[13px] text-text-dim">Task mapping arrives when the Match agent runs.</p>
        ) : (
          <ul className="list-disc pl-5 text-[15px] text-text">
            {node.unlocks_tasks.map((task, i) => (
              <li key={i}>{String(task)}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="font-label text-[11px] uppercase tracking-label text-text-dim">Moves you toward</h4>
        {node.moves_toward.length === 0 ? (
          <p className="text-[13px] text-text-dim">No target jobs named yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {node.moves_toward.map((target) => (
              <li
                key={target}
                className="border border-hairline px-2 py-0.5 font-label text-[11px] uppercase tracking-label text-text-dim"
                style={{ borderRadius: "var(--radius-pill, 999px)" }}
              >
                {target}
              </li>
            ))}
          </ul>
        )}
      </section>

      {node.source_url ? (
        <section>
          <h4 className="font-label text-[11px] uppercase tracking-label text-text-dim">Source</h4>
          <a
            href={node.source_url}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-[13px] text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            {node.source_url}
          </a>
        </section>
      ) : null}

      <section>
        <h4 className="font-label text-[11px] uppercase tracking-label text-text-dim">Status</h4>
        <div className="flex gap-2">
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onSetStatus(status)}
              disabled={pending || status === node.status}
              aria-pressed={status === node.status}
              className={`min-h-11 border px-3 font-label text-[11px] uppercase tracking-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed ${
                status === node.status ? "border-sage bg-sage text-ink-text" : "border-hairline text-text-dim hover:bg-bg"
              }`}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor={`notes-${node.id}`} className="font-label text-[11px] uppercase tracking-label text-text-dim">
          Notes
        </label>
        <textarea
          id={`notes-${node.id}`}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={3}
          className="w-full border border-hairline bg-bg p-2 text-[15px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        />
        <button
          type="button"
          onClick={() => onSetNotes(notesDraft)}
          disabled={pending || !notesDirty}
          className="min-h-11 self-start border border-hairline px-3 font-sans text-sm text-text hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:text-text-dim"
        >
          Save notes
        </button>
      </section>

      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="min-h-11 self-start font-label text-[11px] uppercase tracking-label text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed"
      >
        Delete node
      </button>
    </aside>
  );
}
