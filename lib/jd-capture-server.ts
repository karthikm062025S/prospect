import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { ensureRoleJd, type RoleJd } from "@/lib/role-jd";
import { captureJobDescription, type Endpoint } from "@/lib/jd-snapshot";
import jdEndpoints from "@/scripts/endpoints.json";

export async function captureRoleJdServer(
  roleId: string,
  opts?: { force?: boolean },
): Promise<RoleJd> {
  return ensureRoleJd(createServiceClient(), roleId, opts);
}

export async function captureUnlinkedApplicationJdServer(input: {
  applicationId: string;
  companyId: string;
  link: string | null;
}): Promise<RoleJd> {
  const supabase = createServiceClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select("name, ats, endpoint")
    .eq("id", input.companyId)
    .maybeSingle();
  if (error) return { html: null, captured_at: null, error: error.message, location: null };

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
