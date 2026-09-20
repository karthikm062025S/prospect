import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import { readProfile } from "@/lib/profile";
import { signOutAction } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { FeedbackTrigger } from "@/components/feedback-box";
import { ChangePassword } from "@/components/change-password";
import { StudentProfileCard } from "@/components/student-profile-card";
import { RankFeedControl } from "@/components/get-started";
import { ProfileForm, TargetForm } from "./forms";

export const dynamic = "force-dynamic";

// SYSTEM.md Components: cards are --radius-card on --raised bounded by
// --hairline; SYSTEM.md Spacing: the gap inside a section is the 24px block.
const card = "flex flex-col gap-6 rounded-card bg-raised p-4 shadow-sm ring-1 ring-hairline scroll-mt-24";
const heading = "font-display text-step-2 text-text";
const label = "font-label text-[11px] uppercase tracking-label text-text-dim";
const linkClass = "underline underline-offset-2 hover:text-sage";

export default async function SettingsPage() {
  const uid = await requireUser();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // requireUser() already redirected signed-out visitors

  const profile = readProfile(user);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4">
      <header className="border-b border-hairline pb-3">
        <h1 className="font-display text-step-3 text-text">Settings</h1>
      </header>

      <section id="profile" className={card} aria-labelledby="profile-heading">
        <h2 id="profile-heading" className={heading}>
          Profile
        </h2>
        <ProfileForm
          fullName={profile.fullName ?? ""}
          school={profile.school ?? ""}
          gradTerm={profile.gradTerm ?? ""}
        />
      </section>

      <StudentProfileCard userId={uid} />

      <section id="account" className={card} aria-labelledby="account-heading">
        <h2 id="account-heading" className={heading}>
          Account
        </h2>

        <div className="flex flex-col gap-1">
          <span className={label}>Email</span>
          <p className="text-sm text-text">{profile.email}</p>
        </div>

        <p className="text-sm text-text-dim">
          {profile.provider === "google" ? "Signed in with Google." : "Signed in with email."}
        </p>

        <ChangePassword provider={profile.provider} />

        <TargetForm monthlyTarget={profile.monthlyTarget} />

        {/* Baseline defect 4: ranking is automatic at the end of the setup
            stream, so Home no longer leads with a "Rank my feed" card. The
            action stays reachable here as one quiet secondary line (the same
            RankFeedControl Home renders — ui_laws.md #16, one component per
            action). */}
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-text-dim">
          <RankFeedControl
            idle="Re-score every open posting against your current profile and goal."
            label="Re-rank my feed"
          />
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center self-start rounded-pill border border-hairline px-5 font-sans text-sm font-medium text-text hover:bg-bg hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            Sign out
          </button>
        </form>

        <p className="text-sm text-text-dim">
          Send us a feedback message asking to delete your data and we will do it within 7 days.{" "}
          <FeedbackTrigger className={linkClass}>Send feedback</FeedbackTrigger>
        </p>
      </section>

      <section id="settings" className={card} aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className={heading}>
          Appearance and data
        </h2>

        <div className="flex items-center justify-between gap-3">
          <span className={label}>Theme</span>
          <ThemeToggle />
        </div>

        <div className="flex gap-4 text-sm">
          <Link href="/privacy" className={linkClass}>
            Privacy
          </Link>
          <Link href="/terms" className={linkClass}>
            Terms
          </Link>
        </div>
      </section>
    </div>
  );
}
