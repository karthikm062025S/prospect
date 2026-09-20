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
// --hairline. Redesign D9/D10: padding is the mock's 24px card rhythm (was
// 16px) and the inner gap its 16px block (was 24px), so every settings card
// reads at the same rhythm; hr.divider below is the mock's `hr.hairline`.
const card = "flex flex-col gap-4 rounded-card bg-raised p-6 shadow-sm ring-1 ring-hairline scroll-mt-24";
const heading = "font-display text-step-2 text-text";
const label = "font-label text-[11px] uppercase tracking-label text-text-dim";
const linkClass = "underline underline-offset-2 hover:text-sage";
const divider = "border-hairline";
const rowline = "flex flex-wrap items-center justify-between gap-3";
const pillButton =
  "inline-flex min-h-11 items-center self-start rounded-pill border border-hairline px-5 font-sans text-sm font-medium text-text hover:bg-bg hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

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
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-label text-[11px] uppercase tracking-label text-text-dim">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          Settings
        </p>
        <h1 className="font-display text-step-5 tracking-display text-text">Your account.</h1>
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

        <div className={rowline}>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-text">{profile.email}</p>
            <p className="text-sm text-text-dim">
              {profile.provider === "google" ? "Signed in with Google." : "Signed in with email."}
            </p>
          </div>
          <ChangePassword provider={profile.provider} />
        </div>

        <hr className={divider} />

        <TargetForm monthlyTarget={profile.monthlyTarget} />

        {/* Baseline defect 4: ranking is automatic at the end of the setup
            stream, so Home no longer leads with a "Rank my feed" card. The
            action stays reachable here as one quiet secondary line (the same
            RankFeedControl Home renders — ui_laws.md #16, one component per
            action). */}
        <hr className={divider} />

        <div className="flex flex-wrap items-center gap-3 text-[13px] text-text-dim">
          <RankFeedControl
            idle="Re-score every open posting against your current profile and goal."
            label="Re-rank my feed"
          />
        </div>

        <hr className={divider} />

        <div className={rowline}>
          <p className="text-sm text-text-dim">
            Send us a feedback message asking to delete your data and we will do it within 7 days.{" "}
            <FeedbackTrigger className={linkClass}>Send feedback</FeedbackTrigger>
          </p>
          <form action={signOutAction}>
            <button type="submit" className={pillButton}>
              Sign out
            </button>
          </form>
        </div>
      </section>

      <section id="settings" className={card} aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className={heading}>
          Appearance and data
        </h2>

        <div className={rowline}>
          <span className={label}>Theme</span>
          <ThemeToggle variant="settings" />
        </div>

        <hr className={divider} />

        <div className={`${rowline} text-sm`}>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy" className={linkClass}>
              Privacy
            </Link>
            <Link href="/terms" className={linkClass}>
              Terms
            </Link>
            <Link href="/faq" className={linkClass}>
              Help and FAQ
            </Link>
          </div>
          <span className="text-text-dim">Prospect · built at VTHacks 14</span>
        </div>
      </section>
    </div>
  );
}
