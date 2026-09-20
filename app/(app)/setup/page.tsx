import { requireUser } from "@/lib/require-user";
import { getProfile } from "@/lib/student-profile";
import { SetupForm, type SetupDefaults } from "@/components/setup/setup-form";

export const dynamic = "force-dynamic";

// /setup never calls requireProfile (D-UI4): it is the page the gate sends a
// new student to, and an existing student may come back to edit. A Lakebase
// failure here throws into the route's error boundary, named (rule 13:25).
export default async function SetupPage() {
  const uid = await requireUser();
  const existing = await getProfile(uid);

  const defaults: SetupDefaults | undefined = existing
    ? {
        updatedAt: existing.updated_at,
        major: existing.major ?? "",
        gradTerm: existing.grad_term ?? "",
        workAuthorization: existing.work_authorization ?? "",
        goal: existing.goal ?? "",
        roleTypes: existing.role_types ?? [],
        dreamTier: existing.dream_tier ?? [],
        season: existing.target_term?.split(" ")[0] ?? "",
        year: Number(existing.target_term?.split(" ")[1]) || null,
      }
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4">
      <header className="flex flex-col gap-3 border-b border-hairline pb-3">
        <h1 className="font-display text-step-3 text-text">{existing ? "Edit your profile" : "Build your profile"}</h1>
        <p className="font-sans text-sm text-text-dim">
          Upload your resume and unofficial transcript, or type your courses instead. Four agents then read them,
          rank the live feed for you and plan your roadmap. About 20 seconds.
        </p>
        {existing && (
          <p className="font-sans text-sm text-text">
            You already have a profile, saved {new Date(existing.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
            Re-running replaces it, re-ranks your feed and rebuilds your roadmap. Upload both PDFs again.
          </p>
        )}
      </header>
      <SetupForm defaults={defaults} />
    </div>
  );
}
