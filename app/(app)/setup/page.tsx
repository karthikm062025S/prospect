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
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 font-label text-[11px] uppercase tracking-label text-text-dim">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          Step 1 of 1 · about 20 seconds
        </div>
        <h1 className="font-display text-step-5 text-text">{existing ? "Edit your profile." : "Build your profile."}</h1>
        <p className="max-w-[60ch] font-sans text-sm text-text-dim">
          Upload your resume and unofficial transcript, or type your courses instead. Four agents then read them,
          rank the live feed for you and plan your roadmap.
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
