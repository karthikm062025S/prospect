import { z } from "zod";
import type { Family } from "./family";
import type { Season } from "./season";

// Task 2: the residue sweep behind POST
// /api/classify. Rules first (deriveSeason over the stored JD text,
// familySignals over the title); a DeepSeek call only where the rules still
// cannot decide; the model may fill gaps and add families, never override a
// rule (D7). No static lib-to-lib VALUE import here on purpose: the strip-types
// test runner cannot follow one (the module-resolution rule), so the rules, the
// entity decoder and fetch arrive in `deps` and app/api/classify/route.ts wires
// the real ones. Type-only imports are stripped and safe.

export type Rules = { season: Season; families: Family[] };
export type ModelResult = { is_internship: boolean; families: Family[]; season: Season; confidence: number; error?: string };
export type Merged = Rules & { by: "rules" | "llm" };

export type LlmDeps = {
  fetch: typeof globalThis.fetch;
  apiKey?: string; // LLM_API_KEY; unset = tier 2 disabled
  baseUrl?: string; // LLM_BASE_URL
  model?: string; // LLM_MODEL
};

export type Deps = LlmDeps & {
  deriveSeason: (title: string, text?: string | null) => Season;
  familySignals: (title: string) => Family[];
  decodeEntities: (text: string) => string;
};

export type ResidueRow = {
  id: string;
  title: string;
  jd_snapshot: string;
  season: Season | null;
  family: Family | null;
  families: Family[] | null;
};

export type Db = {
  residue(limit: number, ids?: string[]): Promise<ResidueRow[]>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  remaining(): Promise<number>;
};

export type SweepOpts = { limit: number; dryRun: boolean; ids?: string[] };

type Snapshot = { season: Season; family: Family; families: Family[] };
export type SweepRow = { id: string; title: string; before: Snapshot; after: Snapshot; by: "rules" | "llm"; model_result?: ModelResult };
export type SweepResult = {
  dry_run: boolean;
  processed: number;
  rules_only: number;
  llm_called: number;
  llm_written: number;
  llm_low_confidence: number;
  remaining: number;
  rows: SweepRow[];
};

export const MAX_TEXT = 6_000;
export const CONFIDENCE_BAR = 0.8;
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;
const CONCURRENCY = 5; // model calls in flight; 20 rows sequentially could brush the 60 s route cap
// note: worst case (every row hangs twice) is limit/5 * 2 * 10 s, past the
// 60 s cap at limit 20. Each row is written on its own, so a killed sweep only
// leaves the rest in the residue for the next call; lower `limit` if it recurs.
const LLM_TIMEOUT_MS = 10_000;

// Exhaustive by construction: tsc rejects a missing or extra key, so these
// stay in step with the Family/Season unions without a runtime import.
const FAMILY_KEYS: Record<Family, true> = {
  engineering: true,
  software: true,
  data_ai: true,
  business_finance: true,
  consulting: true,
  sales_marketing: true,
  product_design: true,
  health_science: true,
  operations_supply: true,
  people_legal: true,
  education_research: true,
  other: true,
};
const SEASON_KEYS: Record<Season, true> = { summer_2027: true, fall_2027: true, spring_2028: true, summer_2028: true, coop: true, unspecified: true };
const FAMILIES = Object.keys(FAMILY_KEYS) as [Family, ...Family[]];
const SEASONS = Object.keys(SEASON_KEYS) as [Season, ...Season[]];

const ModelOutput = z.object({
  is_internship: z.boolean(),
  families: z.array(z.enum(FAMILIES)).min(1),
  season: z.enum(SEASONS),
  confidence: z.number().min(0).max(1),
});

// DeepSeek json mode (docs, verified 2026-09-15): the word "json" must appear
// in the prompt together with an example of the shape.
export const SYSTEM_PROMPT = [
  "You classify US job/internship postings for a student tracker covering every major, not just tech. Return only a json object with exactly this shape:",
  '{"is_internship": true, "families": ["software"], "season": "summer_2027", "confidence": 0.9}',
  "",
  "families: every family that fits, most specific first. Allowed values:",
  "engineering = mechanical, electrical, civil, chemical, aerospace, industrial, materials, biomedical, manufacturing",
  "software = software, SWE/SDE, developer, devops, SRE, IT support, systems admin, cloud, network, QA, security/cyber",
  "data_ai = data science/engineering/analytics, BI, machine learning, AI, research science, quant",
  "business_finance = finance, accounting, audit, tax, banking, investment, treasury, actuarial, economist",
  "consulting = consultant, consulting, advisory, strategy, transformation, management analyst",
  "sales_marketing = sales, account executive/manager, business development, marketing, brand, growth, customer success",
  "product_design = product/program/project manager, UX/UI, designer, graphic, industrial design, architect",
  "health_science = nurse, clinical, pharmacy, biology, chemistry, lab, research associate, physician, therapist, veterinary",
  "operations_supply = operations, supply chain, logistics, procurement, sourcing, planner, warehouse, manufacturing associate, quality",
  "people_legal = HR, recruiting, talent, legal, compliance, paralegal, policy, government affairs",
  "education_research = teacher, instructor, tutor, education, researcher, postdoc, fellowship",
  "other = none of these",
  "",
  "season: the term the posting states. Allowed values:",
  "summer_2027, fall_2027, spring_2028, summer_2028",
  "coop = a co-op with no named term",
  "unspecified = no term stated in the text; do not guess",
  "",
  "is_internship: false for full-time or non-internship postings.",
  "confidence: 0 to 1, how sure you are of families and season together.",
].join("\n");

// jd_snapshot is sanitized html; the rules and the model read plain text.
export function postingText(html: string, decode: (text: string) => string = (text) => text): string {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decode(text).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

export function needsModel(rules: Rules): boolean {
  return rules.season === "unspecified" || (rules.families.length === 1 && rules.families[0] === "other");
}

// D7: rules win. The model may set a season the rules left unspecified,
// replace an other-only family list, or add families; never remove one.
export function mergeModel(rules: Rules, model: ModelResult): Merged {
  if (model.confidence < CONFIDENCE_BAR || !model.is_internship) return { ...rules, by: "rules" };
  const season = rules.season === "unspecified" ? model.season : rules.season;
  const added = model.families.filter((family) => family !== "other");
  const onlyOther = rules.families.length === 1 && rules.families[0] === "other";
  const families = onlyOther ? (added.length > 0 ? added : rules.families) : [...new Set([...rules.families, ...added])];
  // The audit column names the model only when it changed something.
  const unchanged = season === rules.season && families.length === rules.families.length && families.every((f, i) => f === rules.families[i]);
  return { season, families, by: unchanged ? "rules" : "llm" };
}

const failed = (error: string): ModelResult => ({ is_internship: false, families: ["other"], season: "unspecified", confidence: 0, error });

// One chat completion, one retry on empty or invalid output, then confidence 0.
export async function classifyWithModel(input: { title: string; text: string }, deps: LlmDeps): Promise<ModelResult> {
  const body = JSON.stringify({
    model: deps.model || DEFAULT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Title: ${input.title}\n\nPosting:\n${input.text}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 200,
    stream: false,
  });
  let error = "no attempt";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await deps.fetch(`${deps.baseUrl || DEFAULT_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${deps.apiKey ?? ""}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });
      if (!res.ok) {
        error = `llm http ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        error = "empty content";
        continue;
      }
      const parsed = ModelOutput.safeParse(JSON.parse(content));
      if (!parsed.success) {
        error = `schema: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`;
        continue;
      }
      return parsed.data;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  return failed(error);
}

export function parseParams(url: URL): SweepOpts {
  const dryRun = url.searchParams.get("dry_run") === "1";
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, LIMIT_MAX);
  const raw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  // ids without a limit means all of those ids (the D9 eval), never the default 20.
  const fallback = ids.length > 0 ? ids.length : LIMIT_DEFAULT;
  const limit = Number.isFinite(raw) ? Math.min(LIMIT_MAX, Math.max(1, raw)) : fallback;
  return ids.length > 0 ? { limit, dryRun, ids } : { limit, dryRun };
}

export async function runSweep(opts: SweepOpts, db: Db, deps: Deps): Promise<SweepResult> {
  const rows = await db.residue(opts.limit, opts.ids);
  const out: SweepRow[] = new Array(rows.length);
  const now = new Date().toISOString();
  let i = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
    while (i < rows.length) {
      const index = i++;
      const row = rows[index];
      const text = postingText(row.jd_snapshot, deps.decodeEntities);
      const families0 = deps.familySignals(row.title);
      let season0 = deps.deriveSeason(row.title, text);
      // D7: a stored season the rules cannot reproduce from the text is kept, never blanked.
      if (season0 === "unspecified" && row.season && row.season !== "unspecified") season0 = row.season;
      const rules: Rules = { season: season0, families: families0 };

      let merged: Merged = { ...rules, by: "rules" };
      let modelResult: ModelResult | undefined;
      if (deps.apiKey && needsModel(rules)) {
        modelResult = await classifyWithModel({ title: row.title, text }, deps);
        merged = mergeModel(rules, modelResult);
      }

      const before: Snapshot = {
        season: row.season ?? "unspecified",
        family: row.family ?? row.families?.[0] ?? "other",
        families: row.families ?? (row.family ? [row.family] : ["other"]),
      };
      const after: Snapshot = { season: merged.season, family: merged.families[0], families: merged.families };
      if (!opts.dryRun) {
        await db.update(row.id, {
          ...after,
          classified_by: merged.by,
          classified_model: merged.by === "llm" ? deps.model || DEFAULT_MODEL : null,
          classified_at: now,
        });
      }
      out[index] = { id: row.id, title: row.title, before, after, by: merged.by, ...(modelResult ? { model_result: modelResult } : {}) };
    }
  });
  await Promise.all(workers);

  const llmCalled = out.filter((r) => r.model_result).length;
  const llmWritten = out.filter((r) => r.by === "llm").length;
  return {
    dry_run: opts.dryRun,
    processed: out.length,
    rules_only: out.length - llmCalled,
    llm_called: llmCalled,
    llm_written: llmWritten,
    llm_low_confidence: llmCalled - llmWritten,
    remaining: await db.remaining(),
    rows: out,
  };
}

export type RequestCtx = {
  expected: string | undefined; // process.env.WATCHER_SECRET
  isCorrectPassword: (candidate: string, expected: string) => boolean;
  db: () => Db; // built only after the secret passes
  deps: Deps;
  log?: (entry: Record<string, unknown>) => void; // server-side only; the real failure message goes here, never to the caller
};

// The whole route minus Next: same bearer check as app/api/scan/route.ts.
export async function classifyRequest(request: Request, ctx: RequestCtx): Promise<{ status: number; body: unknown }> {
  const secret = request.headers.get("X-Watcher-Secret");
  if (!secret || !ctx.expected || !ctx.isCorrectPassword(secret, ctx.expected)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  try {
    const result = await runSweep(parseParams(new URL(request.url)), ctx.db(), ctx.deps);
    return { status: 200, body: result };
  } catch (err) {
    ctx.log?.({ lane: "classify", status: 500, error: err instanceof Error ? err.message : String(err) });
    return { status: 500, body: { error: "sweep failed" } };
  }
}
