import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import { nowMs } from "@/lib/dashboard";
import type { Application, ApplicationEvent, Company, EventRow } from "@/lib/types";
import { linkedRoleIds, type ApplicationsRow } from "@/lib/applications-list";
import { ApplicationsSplit } from "@/components/applications-split";

export const dynamic = "force-dynamic";

const APPLICATION_COLUMNS =
  "id, company_id, role_id, role, status, date_applied, resume_file, visa_flag, jd_link, notes, updated_at, follow_up_at, next_action, jd_snapshot_at, status_changed_at";
const EVENT_COLUMNS =
  "id, application_id, company_id, kind, subject, sender, received_at, snippet, classified_by, created_at";

type ApplicationRow = Omit<Application, "jd_snapshot" | "user_id">;
type EventQueryRow = Omit<ApplicationEvent, "user_id">;
type LinkedRoleRow = { id: string; posted_at: string | null; deadline: string | null };

export default async function ApplicationsPage() {
  const uid = await requireUser();
  const supabase = await createClient();
  const [
    { data: appRows, error: appError },
    { data: eventRows, error: eventError },
    { data: companyRows, error: companyError },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select(APPLICATION_COLUMNS)
      .eq("user_id", uid)
      .order("date_applied", { ascending: false }),
    supabase
      .from("application_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", uid)
      .eq("classified_by", "user")
      .not("application_id", "is", null)
      .order("received_at", { ascending: false }),
    supabase.from("companies_public").select("id, name, tier, careers_url, link, visa_note"),
  ]);
  if (appError) throw new Error(appError.message);
  if (eventError) throw new Error(eventError.message);
  if (companyError) throw new Error(companyError.message);

  // L8 audit item 4c: only the roles this user actually applied to, not the
  // whole shared feed — roleIds is empty for a user with no linked roles yet
  // (an off-app apply has no role_id), and .in([]) errors, so skip the query.
  const roleIds = linkedRoleIds((appRows ?? []) as unknown as ApplicationRow[]);
  const { data: roleRows, error: roleError } = roleIds.length
    ? await supabase.from("roles_public").select("id, posted_at, deadline").in("id", roleIds)
    : { data: [] as LinkedRoleRow[], error: null };
  if (roleError) throw new Error(roleError.message);

  const roleById = new Map(((roleRows ?? []) as LinkedRoleRow[]).map((role) => [role.id, role]));
  const companyById = new Map(((companyRows ?? []) as Company[]).map((company) => [company.id, company]));

  const applications: ApplicationsRow[] = ((appRows ?? []) as unknown as ApplicationRow[]).map((app) => {
    const company = companyById.get(app.company_id);
    const role = app.role_id ? roleById.get(app.role_id) : undefined;
    return {
      ...app,
      company_name: company?.name ?? app.company_id,
      careers_url: company?.careers_url ?? null,
      posted_at: role?.posted_at ?? null,
      deadline: role?.deadline ?? null,
    };
  });
  const events: EventRow[] = ((eventRows ?? []) as EventQueryRow[]).map((event) => ({
    ...event,
    company_name: event.company_id ? companyById.get(event.company_id)?.name ?? null : null,
  }));

  return <ApplicationsSplit applications={applications} events={events} nowMs={nowMs()} />;
}
