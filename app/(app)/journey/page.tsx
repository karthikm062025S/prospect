import Link from "next/link";
import { requireUser } from "@/lib/require-user";
import { getProfile } from "@/lib/student-profile";
import { getRoadmap, listNodes, type RoadmapNode } from "@/lib/roadmaps";
import { query } from "@/lib/db";
import { safeHttpUrl } from "@/lib/types";
import { deriveSeason } from "@/lib/season";
import { deriveFamily, familySignals, type Family } from "@/lib/family";
import type { Season } from "@/lib/season";
import { liveness } from "@/lib/liveness";
import { nowMs as getNowMs } from "@/lib/dashboard";
import { RoadmapBoard } from "@/components/roadmap/roadmap-board";
import { NudgesStrip, type NudgeRow } from "@/components/roadmap/nudges-strip";
import { CompactFeed } from "@/components/roadmap/compact-feed";
import type { HomeRow } from "@/components/role-row";

export const dynamic = "force-dynamic";

/**
 * L4 owns db/lakebase/003-nudges.sql and lib/nudges.ts is not this lane's to
 * create (rule 1 of the brief). A missing table (L4 hasn't applied it yet)
 * is a named, honest empty state -- the same pattern rule 3 uses for
 * unlocks_tasks -- never a guess and never a page crash. Any OTHER failure
 * (LAKEBASE_URL unset, a real query error) stays loud.
 */
async function loadNudges(userId: string): Promise<NudgeRow[] | null> {
  try {
    return await query<NudgeRow>(
      "select id, kind, title, body, created_at, read_at from nudges where user_id = $1 order by created_at desc limit 10",
      [userId],
      "nudges",
    );
  } catch (error) {
    if (/relation "nudges" does not exist/.test((error as Error).message)) return null;
    throw error;
  }
}

interface FeedRoleRow {
  id: string;
  company_id: string;
  title: string;
  lifecycle: "open" | "applied";
  created_at: string;
  posted_at: string | null;
  deadline: string | null;
  location: string | null;
  visa_class: string | null;
  eligibility_note: string | null;
  link: string | null;
  source: string | null;
  season: Season | null;
  family: Family | null;
  families: Family[] | null;
  repost_count: number | null;
  canonical_key: string | null;
  company_name: string | null;
  company_tier: string | null;
  company_url: string | null;
  company_visa_note: string | null;
}

/**
 * "Live feed" compact column (CONTEXT 12:50 Layout): the newest 30 open
 * `roles_public` rows, no ranking yet. L0 owns the Lakebase port of this
 * table; until it lands, this is a named empty state, never a crash.
 */
async function loadCompactFeed(nowMs: number): Promise<HomeRow[] | null> {
  let rows: FeedRoleRow[];
  try {
    rows = await query<FeedRoleRow>(
      `select r.id, r.company_id, r.title, r.lifecycle, r.created_at, r.posted_at, r.deadline, r.location,
              r.visa_class, r.eligibility_note, r.link, r.source, r.season, r.family, r.families,
              r.repost_count, r.canonical_key,
              c.name as company_name, c.tier as company_tier, c.careers_url as company_url, c.visa_note as company_visa_note
       from roles_public r
       left join companies_public c on c.id = r.company_id
       where r.lifecycle = 'open'
       order by r.created_at desc
       limit 30`,
      [],
      "roles_public",
    );
  } catch (error) {
    if (/relation "roles_public" does not exist/.test((error as Error).message)) return null;
    throw error;
  }
  return rows.map((role) => ({
    id: role.id,
    company_id: role.company_id,
    company_name: role.company_name ?? "Unknown company",
    title: role.title,
    lifecycle: role.lifecycle,
    created_at: role.created_at,
    posted_at: role.posted_at,
    deadline: role.deadline,
    location: role.location,
    saved_at: null,
    hidden_at: null,
    visa_class: role.visa_class,
    eligibility_note: role.eligibility_note,
    href: safeHttpUrl(role.link) ?? null,
    source: role.source,
    season: role.season && role.season !== "unspecified" ? role.season : deriveSeason(role.title),
    families: role.families ?? familySignals(role.title),
    family: role.families?.[0] ?? deriveFamily(role.title),
    apply_clicked_at: null,
    company_tier: role.company_tier,
    company_url: role.company_url,
    company_visa_note: role.company_visa_note,
    liveness: liveness(role, nowMs).label,
    repost_count: role.repost_count ?? 0,
    canonical_key: role.canonical_key,
    corrected: [],
    shared: null,
  }));
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 py-16 text-center" role="alert">
      <h1 className="font-display text-step-3 text-text">Journey couldn&apos;t load</h1>
      <p className="text-[15px] text-danger">{message}</p>
    </div>
  );
}

export default async function JourneyPage() {
  const userId = await requireUser();

  let profile;
  try {
    profile = await getProfile(userId);
  } catch (error) {
    return <ErrorState message={(error as Error).message} />;
  }
  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-16 text-center">
        <h1 className="font-display text-step-3 text-text">Set up your profile first</h1>
        <p className="text-[15px] text-text-dim">
          The Roadmap agent needs your courses, goal and target term before it can plan a journey.
        </p>
        <Link
          href="/setup"
          className="inline-flex min-h-11 items-center border border-hairline px-4 font-sans text-sm text-sage hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Go to setup
        </Link>
      </div>
    );
  }

  let roadmap;
  let nodes: RoadmapNode[] = [];
  try {
    roadmap = await getRoadmap(userId);
    if (roadmap) nodes = await listNodes(userId, roadmap.id);
  } catch (error) {
    return <ErrorState message={(error as Error).message} />;
  }

  const nowMs = getNowMs(); // Date.now() kept out of the component body (react-hooks/purity)
  const [nudges, feedRows] = await Promise.all([loadNudges(userId), loadCompactFeed(nowMs)]);
  const targetTerm = `${profile.profile.targetTerm.season} ${profile.profile.targetTerm.year}`;

  return (
    <div className="flex flex-col gap-6 py-4">
      <h1 className="sr-only">Journey</h1>
      <NudgesStrip nudges={nudges} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <RoadmapBoard roadmap={roadmap} nodes={nodes} targetTerm={targetTerm} />
        <div className="flex flex-col gap-3">
          <h2 className="font-label text-[11px] uppercase tracking-label text-text-dim">Live feed</h2>
          <CompactFeed rows={feedRows} nowMs={nowMs} />
        </div>
      </div>
    </div>
  );
}
