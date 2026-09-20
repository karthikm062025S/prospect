"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Roadmap, RoadmapNode, NodeStatus } from "@/lib/roadmaps";
import type { RoadmapStep, RoadmapStepKey } from "@/lib/agents/roadmap";
import { semestersFromTerm, seasonFromDate } from "@/lib/semesters";
import { RoadmapTimeline } from "@/components/roadmap/timeline";
import { NodeDetailPane } from "@/components/roadmap/node-detail-pane";
import { AddNodeSearch, type CatalogHit } from "@/components/roadmap/add-node-search";
import { RoadmapLoadingSteps, type RoadmapStepState } from "@/components/roadmap/roadmap-loading-steps";
import {
  runRoadmapAction,
  setNodeStatusAction,
  setNodeNotesAction,
  deleteNodeAction,
  addNodeAction,
  searchCatalogAction,
} from "@/app/(app)/journey/actions";

const STEP_KEYS: RoadmapStepKey[] = ["profile", "catalog", "certifications", "planning", "validating"];

function pendingStates(doneSteps: RoadmapStep[], runningIndex: number): Record<RoadmapStepKey, RoadmapStepState> {
  const byKey = new Map(doneSteps.map((s) => [s.step, s] as const));
  const states = {} as Record<RoadmapStepKey, RoadmapStepState>;
  STEP_KEYS.forEach((key, i) => {
    const done = byKey.get(key);
    states[key] = done ? { status: "done", label: done.label } : i === runningIndex ? { status: "running" } : { status: "pending" };
  });
  return states;
}

// ponytail: no userId prop -- every server action here calls requireUser()
// itself and re-derives the server-side identity, so the client never needs
// to carry or forward one.
export function RoadmapBoard({
  roadmap,
  nodes,
  targetTerm,
}: {
  roadmap: Roadmap | null;
  nodes: RoadmapNode[];
  targetTerm: string;
}) {
  const router = useRouter();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [addingSemester, setAddingSemester] = useState<string | null>(null);
  const [replanPending, setReplanPending] = useState<string | null>(null);
  const [nodePending, setNodePending] = useState(false);
  const [nodeError, setNodeError] = useState<string | null>(null);

  const [agentSteps, setAgentSteps] = useState<RoadmapStep[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentPending, startAgentTransition] = useTransition();

  const target = useMemo(() => {
    const [season, year] = targetTerm.split(" ");
    return { season, year: Number(year) };
  }, [targetTerm]);

  const semesters = useMemo(() => {
    try {
      const now = new Date();
      return semestersFromTerm({ season: seasonFromDate(now), year: now.getFullYear() }, target);
    } catch {
      return [];
    }
  }, [target]);

  const nodesBySemester = useMemo(() => {
    const map = new Map<string, RoadmapNode[]>();
    for (const node of nodes) {
      const list = map.get(node.semester) ?? [];
      list.push(node);
      map.set(node.semester, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [nodes]);

  const selectedNode = selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null;

  function runAgent(fromSemester?: string) {
    setAgentError(null);
    setAgentSteps([]);
    if (fromSemester) setReplanPending(fromSemester);
    startAgentTransition(async () => {
      const res = await runRoadmapAction(fromSemester);
      setReplanPending(null);
      if (res.ok) {
        setAgentSteps(res.data.steps);
        router.refresh();
      } else {
        setAgentError(res.error);
      }
    });
  }

  function setStatus(status: NodeStatus) {
    if (!selectedNode) return;
    setNodePending(true);
    setNodeError(null);
    setNodeStatusAction(selectedNode.id, status)
      .then((res) => {
        if (!res.ok) setNodeError(res.error);
        else router.refresh();
      })
      .finally(() => setNodePending(false));
  }

  function setNotes(notes: string) {
    if (!selectedNode) return;
    setNodePending(true);
    setNodeError(null);
    setNodeNotesAction(selectedNode.id, notes)
      .then((res) => {
        if (!res.ok) setNodeError(res.error);
        else router.refresh();
      })
      .finally(() => setNodePending(false));
  }

  function deleteSelected() {
    if (!selectedNode) return;
    setNodePending(true);
    setNodeError(null);
    deleteNodeAction(selectedNode.id)
      .then((res) => {
        if (!res.ok) setNodeError(res.error);
        else {
          setSelectedNodeId(null);
          router.refresh();
        }
      })
      .finally(() => setNodePending(false));
  }

  // VTHacks speed pass: the × on a roadmap pill (timeline.tsx NodeCard) —
  // same deleteNodeAction the detail pane's "Delete node" already uses, no
  // local node list to optimistically drop from (the board renders server
  // props), so a refresh is enough.
  function removeNode(id: string) {
    deleteNodeAction(id).then((res) => {
      if (res.ok) {
        if (selectedNodeId === id) setSelectedNodeId(null);
        router.refresh();
      }
    });
  }

  async function search(keyword: string) {
    const res = await searchCatalogAction(keyword);
    if (!res.ok) return { ok: false as const, error: res.error };
    const hits: CatalogHit[] = [
      ...res.data.courses.map((c) => ({ kind: "course" as const, code: c.code, title: c.title })),
      ...res.data.clubs.map((c) => ({ kind: "club" as const, name: c.name, description: c.description })),
    ];
    return { ok: true as const, data: hits };
  }

  async function addHit(semester: string, hit: CatalogHit) {
    if (!roadmap) return { ok: false, error: "No roadmap yet" };
    const res = await addNodeAction({
      roadmapId: roadmap.id,
      semester,
      kind: hit.kind,
      refCode: hit.kind === "course" ? hit.code : null,
      refName: hit.kind === "club" ? hit.name : null,
      title: hit.kind === "course" ? `${hit.code}: ${hit.title}` : hit.name,
      why: "Added by you.",
    });
    if (res.ok) {
      setAddingSemester(null);
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }

  if (!roadmap) {
    return (
      <div className="flex flex-col items-center gap-4 border border-hairline bg-raised p-8 text-center" style={{ borderRadius: "var(--radius-card, 16px)" }}>
        <h2 className="font-display text-step-3 text-text">Build your journey</h2>
        <p className="max-w-md text-[15px] text-text-dim">
          The Roadmap agent plans a semester-by-semester path to {targetTerm} from your real courses, VT clubs and
          live-searched certifications.
        </p>
        {isAgentPending ? (
          <RoadmapLoadingSteps states={pendingStates(agentSteps, agentSteps.length)} />
        ) : (
          <button
            type="button"
            onClick={() => runAgent()}
            className="min-h-11 border border-sage bg-sage px-4 font-sans text-sm text-ink-text hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Build my roadmap
          </button>
        )}
        {agentError ? (
          <p role="alert" className="text-[13px] text-danger">
            {agentError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isAgentPending ? (
        <div className="border border-hairline bg-raised p-4" style={{ borderRadius: "var(--radius-card, 16px)" }}>
          <RoadmapLoadingSteps states={pendingStates(agentSteps, agentSteps.length)} />
        </div>
      ) : agentError ? (
        <p role="alert" className="text-[13px] text-danger">
          {agentError}
        </p>
      ) : null}

      <RoadmapTimeline
        semesters={semesters}
        nodesBySemester={nodesBySemester}
        selectedNodeId={selectedNodeId}
        onSelectNode={(id) => {
          setSelectedNodeId(id);
          setNodeError(null);
        }}
        onReplanFrom={runAgent}
        replanPending={isAgentPending ? replanPending : null}
        onAddNode={(semester) => setAddingSemester(semester)}
        onRemoveNode={removeNode}
      />

      {addingSemester ? (
        <AddNodeSearch
          semester={addingSemester}
          onSearch={search}
          onAdd={(hit) => addHit(addingSemester, hit)}
          onCancel={() => setAddingSemester(null)}
        />
      ) : null}

      {selectedNode ? (
        <NodeDetailPane
          node={selectedNode}
          onSetStatus={setStatus}
          onSetNotes={setNotes}
          onDelete={deleteSelected}
          onClose={() => setSelectedNodeId(null)}
          pending={nodePending}
          error={nodeError}
        />
      ) : null}
    </div>
  );
}
