import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import { readProfile } from "@/lib/profile";
import { ProfileBanner } from "@/components/profile-banner";
import { nowMs } from "@/lib/dashboard";
import { nyTodayStartIso } from "@/lib/mcp-helpers";
import { isInPlay } from "@/lib/in-play";
import { liveness } from "@/lib/liveness";
import { mergeUserRoles, type UserRoleState } from "@/lib/user-roles";
import { velocity } from "@/lib/velocity";
import { safeHttpUrl, type Company, type Role } from "@/lib/types";
import { deriveFamily, familySignals } from "@/lib/family";
import { deriveSeason } from "@/lib/season";
import { overlayCorrections, parseCorrection, type Correction } from "@/lib/corrections";
import { HomeList } from "@/components/home-list";
import type { HomeCompany } from "@/lib/sort";
import type { HomeRowLite } from "@/components/role-row";

export const dynamic = "force-dynamic";

const ROLE_COLUMNS =
  "id, company_id, title, role_type, lifecycle, created_at, updated_at, posted_at, deadline, location, visa_class, eligible, eligibility_note, link, source, season, family, families, last_seen_at, repost_count, canonical_key";

// PostgREST caps ANY single response at 1,000 rows on this Supabase project
// (measured 2026-09-03: `roles_public` holds 1,276 open roles, and both an
// unbounded select and `.limit(1500)` came back with exactly 1,000). An
// unbounded read therefore silently dropped 276 live internships from Home —
// the feed is the product, so the read pages through instead. `.order` is
// REQUIRED for range paging to be deterministic (PostgREST gives no stable
// order otherwise, so pages could overlap or skip).
// ponytail: a plain loop, ceiling PAGE_ROWS per request. Upgrade path if the
// feed outgrows a single pageview: server-side filtering + infinite scroll.
const PAGE_ROWS = 1000;

type PagedResult<T> = { data: T[]; error: { message: string } | null };

async function selectAllOrdered<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<PagedResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return { data: rows, error };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_ROWS) return { data: rows, error: null };
  }
}

export default async function HomePage() {
  const uid = await requireUser();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? readProfile(user) : null;
  const now = nowMs();
  const recentSince = nyTodayStartIso(new Date(now));

  const [
    { data: roleRows, error: roleError },
    { data: userRows, error: userError },
    { data: appRows, error: appError },
    { data: recentRows, error: recentError },
    { data: companyRows, error: companyError },
    { data: correctionRows, error: correctionError },
  ] = await Promise.all([
    selectAllOrdered<Role>((from, to) =>
      supabase
        .from("roles_public")
        .select(ROLE_COLUMNS)
        .eq("lifecycle", "open")
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    supabase
      .from("user_roles")
      .select("role_id, saved_at, hidden_at, apply_clicked_at, deleted_at, application_id")
      .eq("user_id", uid),
    supabase.from("applications").select("date_applied").eq("user_id", uid),
    supabase.from("roles_public").select("created_at").gte("created_at", recentSince),
    selectAllOrdered<Company>((from, to) =>
      supabase
        .from("companies_public")
        .select("id, name, tier, careers_url, link, visa_note")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    // T5 (K1): the caller's own corrections. RLS already scopes this table to
    // the owner; the .eq stays explicit rather than relying on the policy alone.
    supabase.from("role_corrections").select("role_id, field, value").eq("user_id", uid),
  ]);

  // Crash-proofing (2026-09-03, v7/feed lane): a read that fails must degrade to
  // an empty/partial feed, never a 500. An empty DB, a column the live schema
  // has not got yet, or a transient PostgREST error all land here; the DB
  // message is logged server-side and never rendered (it can name columns).
  for (const [label, error] of [
    ["roles", roleError],
    ["user_roles", userError],
    ["applications", appError],
    ["recent", recentError],
    ["companies", companyError],
    ["role_corrections", correctionError],
  ] as const) {
    if (error) console.error(`[home] ${label} read failed`, error.message);
  }

  const pace = velocity((appRows ?? []) as { date_applied: string | null }[], now, profile?.monthlyTarget ?? null);
  const merged = mergeUserRoles(
    (roleRows ?? []) as unknown as Role[],
    (userRows ?? []) as UserRoleState[],
  );
  const inPlay = merged.rows.filter((role) => isInPlay(role, now));

  const companyById = new Map(((companyRows ?? []) as Company[]).map((company) => [company.id, company]));
  const companies: Record<string, HomeCompany> = {};
  for (const { company_id } of inPlay) {
    const company = companyById.get(company_id);
    if (company && companies[company_id] === undefined) {
      companies[company_id] = {
        name: company.name,
        tier: company.tier,
        url: company.careers_url,
        visa_note: company.visa_note,
      };
    }
  }

  const rows: HomeRowLite[] = inPlay.map((role) => ({
    id: role.id,
    company_id: role.company_id,
    title: role.title,
    lifecycle: role.lifecycle,
    created_at: role.created_at,
    posted_at: role.posted_at,
    deadline: role.deadline,
    location: role.location,
    saved_at: role.saved_at,
    hidden_at: role.hidden_at,
    visa_class: role.visa_class,
    eligibility_note: role.eligibility_note,
    href: safeHttpUrl(role.link) ?? null,
    source: role.source,
    // The stored columns are a CACHE of lib/season.ts / lib/family.ts, written at
    // ingest. Rows inserted by a scanner build older than this one carry
    // season 'unspecified' / family NULL (15 live rows on 2026-09-03), and a
    // classifier widening never reaches already-stored rows. Deriving here keeps
    // the pills exhaustive with no backfill: a stored season is trusted only
    // when it is MORE specific than the title (it can come from posting text,
    // which the title-only call cannot see).
    season: role.season && role.season !== "unspecified" ? role.season : deriveSeason(role.title),
    // Task 2 / D4: trust a stored multi-family classification when the
    // scanner wrote one, else derive from the title exactly like season does.
    families: role.families ?? familySignals(role.title),
    family: role.families?.[0] ?? deriveFamily(role.title),
    apply_clicked_at: role.apply_clicked_at,
    // Task 3 T2/T3 (lane L2): derived at read time, never stored.
    liveness: liveness(role, now).label,
    repost_count: role.repost_count ?? 0,
    canonical_key: role.canonical_key ?? null,
    corrected: [],
    // Task 3 L5 fold 2: overwritten by overlayCorrections below for any row
    // it actually corrects; TypeScript requires the field here since
    // HomeRowLite now carries it (satisfied here exactly like `corrected: []`
    // above — this literal is otherwise untouched).
    shared: null,
  }));

  // T5 (K1): overlay the caller's own corrections onto their own rows only.
  // Pure; never touches the shared roles row.
  // Defense in depth (L4 audit): RLS lets a user insert their own row directly
  // over PostgREST, so a stored value is re-validated here exactly like the
  // action validates it; a row that fails is ignored, never rendered.
  const corrections: Correction[] = ((correctionRows ?? []) as { role_id: string; field: string; value: string }[])
    .map((c) => parseCorrection({ roleId: c.role_id, field: c.field, value: c.value }))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => ({ role_id: c.roleId, field: c.field, value: c.value }));
  const correctedRows = overlayCorrections(rows, corrections);

  return (
    <>
      {profile && !profile.fullName ? <ProfileBanner uid={uid} /> : null}
      <HomeList
        rows={correctedRows}
        companies={companies}
        recentCreatedAt={((recentRows ?? []) as { created_at: string }[]).map((row) => row.created_at)}
        pace={pace}
        serverNowMs={now}
        getStartedEligible={(userRows ?? []).length === 0 && (appRows ?? []).length === 0}
        userId={uid}
      />
    </>
  );
}
