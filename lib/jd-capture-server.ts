import "server-only";

import { query } from "@/lib/db";
import { ensureRoleJd, type RoleJd } from "@/lib/role-jd";
import { captureJobDescription, type Endpoint } from "@/lib/jd-snapshot";
import jdEndpoints from "@/scripts/endpoints.json";

export async function captureRoleJdServer(
  roleId: string,
  opts?: { force?: boolean },
): Promise<RoleJd> {
  return ensureRoleJd(query, roleId, opts);
}

export async function captureUnlinkedApplicationJdServer(input: {
  applicationId: string;
  companyId: string;
  link: string | null;
}): Promise<RoleJd> {
  let company: { name: string | null; ats: string | null; endpoint: string | null } | undefined;
  try {
    [company] = await query<{ name: string | null; ats: string | null; endpoint: string | null }>(
      "select name, ats, endpoint from companies where id = $1",
      [input.companyId],
      "companies",
    );
  } catch (error) {
    // Same contract as ensureRoleJd: this path returns its error instead of throwing.
    return { html: null, captured_at: null, error: (error as Error).message, location: null };
  }

  const snapshot = await captureJobDescription(
    {
      role: { id: input.applicationId, link: input.link, source: null },
      company: {
        name: company?.name ?? null,
        ats: company?.ats ?? null,
        endpoint: company?.endpoint ?? null,
      },
    },
    { fetch, endpoints: jdEndpoints as Endpoint[] },
  );
  if (!snapshot) return { html: null, captured_at: null, error: "capture failed", location: null };
  return {
    html: snapshot.html,
    captured_at: snapshot.captured_at,
    error: null,
    location: null,
  };
}
