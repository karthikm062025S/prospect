import { query } from "@/lib/db";
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
  // Every read throws (named) into the route's error boundary on failure.
  const [appRows, eventRows, companyRows] = await Promise.all([
    query<ApplicationRow>(
      `select ${APPLICATION_COLUMNS} from applications where user_id = $1 order by date_applied desc`,
      [uid],
      "applications",
    ),
    query<EventQueryRow>(
      `select ${EVENT_COLUMNS} from application_events
        where user_id = $1 and classified_by = 'user' and application_id is not null
        order by received_at desc`,
      [uid],
      "application_events",
    ),
    query<Company>("select id, name, tier, careers_url, link, visa_note from companies_public", [], "companies_public"),
  ]);

  // L8 audit item 4c: only the roles this user actually applied to, not the
  // whole shared feed — roleIds is empty for a user with no linked roles yet
  // (an off-app apply has no role_id).
  const roleIds = linkedRoleIds(appRows);
  const roleRows = roleIds.length
    ? await query<LinkedRoleRow>("select id, posted_at, deadline from roles_public where id = any($1::uuid[])", [roleIds], "roles_public")
    : [];

  const roleById = new Map(roleRows.map((role) => [role.id, role]));
  const companyById = new Map(companyRows.map((company) => [company.id, company]));

  const applications: ApplicationsRow[] = appRows.map((app) => {
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
  const events: EventRow[] = eventRows.map((event) => ({
    ...event,
    company_name: event.company_id ? companyById.get(event.company_id)?.name ?? null : null,
  }));

  return <ApplicationsSplit applications={applications} events={events} nowMs={nowMs()} />;
}
