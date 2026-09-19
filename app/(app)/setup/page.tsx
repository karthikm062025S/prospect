import { requireUser } from "@/lib/require-user";
import { SetupForm } from "@/components/setup/setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4">
      <header className="border-b border-hairline pb-3">
        <h1 className="font-display text-step-3 text-text">Build your profile</h1>
        <p className="text-sm text-text-dim">
          Upload your resume and unofficial transcript, or type your courses instead, so the agents can rank roles and
          build your roadmap.
        </p>
      </header>
      <SetupForm />
    </div>
  );
}
