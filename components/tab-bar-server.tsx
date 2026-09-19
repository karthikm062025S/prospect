import { createClient } from "@/lib/supabase/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { nowMs } from "@/lib/dashboard";
import { velocity } from "@/lib/velocity";
import { readProfile, type Profile } from "@/lib/profile";
import { TabBar } from "@/components/tab-bar";
import { RememberAccount } from "@/components/remember-account";

// The account menu needs a name/avatar even if getUser() ever comes back empty
// (the (app) layout already guarantees a session, so this is belt-and-braces
// rather than a real state): an anonymous-looking bar beats a crashed shell.
const EMPTY_PROFILE: Profile = {
  fullName: null,
  monthlyTarget: null,
  school: null,
  gradTerm: null,
  email: "",
  avatarUrl: null,
  provider: "email",
};

// Server wrapper: computes the Applications-tab badge (RB-007 week count) and
// reads the D9 user_metadata profile, so the client TabBar never needs its own
// Supabase round trip. A failed applications read throws, named, into the
// (app) error boundary (build/MISSION.md 13:25 lock: nothing catches and
// continues); auth stays on Supabase.
export async function TabBarServer() {
  const uid = await requireUser();
  const supabase = await createClient();
  const [data, { data: userData }] = await Promise.all([
    query<{ date_applied: string | null }>("select date_applied from applications where user_id = $1", [uid], "applications"),
    supabase.auth.getUser(),
  ]);
  const weekCount = velocity(data, nowMs()).week;
  const profile = userData?.user ? readProfile(userData.user) : EMPTY_PROFILE;

  return (
    <>
      <RememberAccount fullName={profile.fullName} email={profile.email} avatarUrl={profile.avatarUrl} provider={profile.provider} />
      <TabBar weekCount={weekCount} profile={profile} />
    </>
  );
}
