"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/require-user";
import { runRoadmapAgent, type RoadmapStep } from "@/lib/agents/roadmap";
import { setNodeStatus, setNodeNotes, deleteNode, addNode, type RoadmapNode, type NodeStatus, type NodeKind } from "@/lib/roadmaps";
import { loadCourseCandidates, loadClubCandidates } from "@/lib/catalog";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Rule 4 (CONTEXT.md Locked 2026-09-19 13:25 "failures are loud"): the real
// message, never a generic swallow. Every string this lane throws is one it
// names itself (a Gemini/Databricks/catalog/profile error), never a raw
// secret or an unrelated internal detail.
function failed<T>(error: unknown): ActionResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function runRoadmapAction(fromSemester?: string): Promise<ActionResult<{ steps: RoadmapStep[]; nodeCount: number }>> {
  const userId = await requireUser();
  const steps: RoadmapStep[] = [];
  try {
    const result = await runRoadmapAgent({ userId, fromSemester }, (step) => steps.push(step));
    revalidatePath("/journey");
    return { ok: true, data: { steps, nodeCount: result.nodes.length } };
  } catch (error) {
    return failed(error);
  }
}

export async function setNodeStatusAction(nodeId: string, status: NodeStatus): Promise<ActionResult<null>> {
  const userId = await requireUser();
  try {
    await setNodeStatus(userId, nodeId, status);
    revalidatePath("/journey");
    return { ok: true, data: null };
  } catch (error) {
    return failed(error);
  }
}

export async function setNodeNotesAction(nodeId: string, notes: string): Promise<ActionResult<null>> {
  const userId = await requireUser();
  try {
    await setNodeNotes(userId, nodeId, notes);
    revalidatePath("/journey");
    return { ok: true, data: null };
  } catch (error) {
    return failed(error);
  }
}

export async function deleteNodeAction(nodeId: string): Promise<ActionResult<null>> {
  const userId = await requireUser();
  try {
    await deleteNode(userId, nodeId);
    revalidatePath("/journey");
    return { ok: true, data: null };
  } catch (error) {
    return failed(error);
  }
}

export async function addNodeAction(input: {
  roadmapId: string;
  semester: string;
  kind: NodeKind;
  refCode?: string | null;
  refName?: string | null;
  title: string;
  why: string;
}): Promise<ActionResult<RoadmapNode>> {
  const userId = await requireUser();
  try {
    const node = await addNode(userId, input);
    revalidatePath("/journey");
    return { ok: true, data: node };
  } catch (error) {
    return failed(error);
  }
}

export async function searchCoursesAction(keyword: string): Promise<ActionResult<Array<{ code: string; title: string }>>> {
  await requireUser();
  try {
    const rows = await loadCourseCandidates({ keywords: [keyword], limit: 20 });
    return { ok: true, data: rows.map((r) => ({ code: r.code, title: r.title })) };
  } catch (error) {
    return failed(error);
  }
}

export async function searchClubsAction(keyword: string): Promise<ActionResult<Array<{ name: string; description: string }>>> {
  await requireUser();
  try {
    const rows = await loadClubCandidates({ keywords: [keyword], limit: 20 });
    return { ok: true, data: rows.map((r) => ({ name: r.name, description: r.description })) };
  } catch (error) {
    return failed(error);
  }
}
