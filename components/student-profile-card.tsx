import Link from "next/link";
import { getProfile } from "@/lib/student-profile";

// Settings has no reader for the Match agent's own profile (lib/student-profile.ts,
// the resume+transcript+goal Lakebase row, distinct from lib/profile.ts's D9
// account preferences) -- a signed-in student had no way to see or re-run it.
// Small server component so it can await getProfile() directly, matching
// app/(app)/journey/page.tsx's own await getProfile(userId) call.
const card = "flex flex-col gap-4 rounded-card bg-raised p-6 shadow-sm ring-1 ring-hairline scroll-mt-24";
const heading = "font-display text-step-2 text-text";
const label = "font-label text-[11px] uppercase tracking-label text-text-dim";
const linkClass =
  "inline-flex min-h-11 w-fit items-center border border-hairline px-4 font-sans text-sm text-sage hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

function Field({ label: fieldLabel, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={label}>{fieldLabel}</dt>
      <dd className="text-sm text-text">{value}</dd>
    </div>
  );
}

export async function StudentProfileCard({ userId }: { userId: string }) {
  const stored = await getProfile(userId);

  return (
    <section id="match-profile" className={card} aria-labelledby="match-profile-heading">
      <h2 id="match-profile-heading" className={heading}>
        Match profile
      </h2>

      {stored ? (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Major" value={stored.major ?? "Not set"} />
            <Field label="Graduation term" value={stored.grad_term ?? "Not set"} />
            <Field label="Work authorization" value={stored.work_authorization ?? "Not set"} />
            <Field label="Target term" value={stored.target_term ?? "Not set"} />
            <Field label="Role types" value={stored.role_types && stored.role_types.length > 0 ? stored.role_types.join(", ") : "Not set"} />
            <Field label="Dream tier" value={stored.dream_tier && stored.dream_tier.length > 0 ? stored.dream_tier.join(", ") : "Not set"} />
          </dl>
          <div className="flex flex-col gap-0.5">
            <span className={label}>Goal</span>
            <p className="text-sm text-text">{stored.goal ?? "Not set"}</p>
          </div>
          <p className="text-[13px] text-text-dim">Ingested {new Date(stored.updated_at).toLocaleString()}</p>
        </>
      ) : (
        <p className="text-sm text-text-dim">No student profile yet.</p>
      )}

      <Link href="/setup" className={linkClass}>
        Update profile and re-run the agents
      </Link>
    </section>
  );
}
