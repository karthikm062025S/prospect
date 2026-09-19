import { createClient } from "@/lib/supabase/server";
import { query } from "@/lib/db";
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

export default async function HomePage() {
  const uid = await requireUser();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? readProfile(user) : null;
  const now = nowMs();
  const recentSince = nyTodayStartIso(new Date(now));

  // D9 (build/MISSION.md): fail-loud. Any failed read throws a named
  // DB_QUERY_FAILED (<table>) into the route's error boundary; nothing here
  // catches and renders a partial feed. No paging: Postgres has no 1,000-row cap.
  const [roleRows, userRows, appRows, recentRows, companyRows, correctionRows] = await Promise.all([
    query<Role>(
      `select ${ROLE_COLUMNS} from roles_public where lifecycle = 'open' order by created_at desc`,
      [],
      "roles_public",
    ),
    query<UserRoleState>(
      "select role_id, saved_at, hidden_at, apply_clicked_at, deleted_at, application_id from user_roles where user_id = $1",
      [uid],
      "user_roles",
    ),
    query<{ date_applied: string | null }>("select date_applied from applications where user_id = $1", [uid], "applications"),
    query<{ created_at: string }>("select created_at from roles_public where created_at >= $1", [recentSince], "roles_public"),
    query<Company>("select id, name, tier, careers_url, link, visa_note from companies_public order by id", [], "companies_public"),
    // T5 (K1): the caller's own corrections, scoped explicitly to the owner.
    query<{ role_id: string; field: string; value: string }>(
      "select role_id, field, value from role_corrections where user_id = $1",
      [uid],
      "role_corrections",
    ),
  ]);

  const pace = velocity(appRows, now, profile?.monthlyTarget ?? null);
  const merged = mergeUserRoles(roleRows, userRows);
  const inPlay = merged.rows.filter((role) => isInPlay(role, now));

  const companyById = new Map(companyRows.map((company) => [company.id, company]));
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
  // Defense in depth (L4 audit): a stored value is re-validated here exactly
  // like the action validates it; a row that fails is ignored, never rendered.
  const corrections: Correction[] = correctionRows
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
        recentCreatedAt={recentRows.map((row) => row.created_at)}
        pace={pace}
        serverNowMs={now}
        getStartedEligible={userRows.length === 0 && appRows.length === 0}
        userId={uid}
      />
    </>
  );
}
