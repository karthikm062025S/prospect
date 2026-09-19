import { updatePasswordAction } from "@/app/auth/actions";
import { requireUser } from "@/lib/require-user";

// v8 onboarding: the page a password-reset link lands on, and the Settings
// "Change password" target. It lives under the (app) group ON PURPOSE:
// app/auth/callback/route.ts exchanges the PKCE code (setting the session
// cookies) BEFORE redirecting here, so the visitor is already signed in and
// gets the normal shell. No proxy allow-list entry is needed (and /auth/* is
// public there anyway); requireUser() is the gate.
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  password: "Use at least 8 characters.",
  update: "Could not update the password. Try again, or request a new reset link.",
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;
  const message = error ? MESSAGES[error] : undefined;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-8">
      <header className="border-b border-hairline pb-3">
        <h1 className="font-display text-step-3 text-text">Set a new password</h1>
      </header>

      <form action={updatePasswordAction} className="flex flex-col gap-3 rounded-2xl bg-raised p-4 shadow-sm ring-1 ring-hairline">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-password" className="font-label text-[11px] uppercase tracking-label text-text-dim">
            New password
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            autoFocus
            className="min-h-11 w-full rounded-md border border-hairline bg-bg px-3 font-sans text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
          <p className="font-sans text-step-xs text-text-dim">At least 8 characters.</p>
        </div>
        {message && (
          <p role="status" className="font-sans text-sm text-danger">
            {message}
          </p>
        )}
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center self-start rounded-pill bg-text px-5 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
        >
          Save password
        </button>
      </form>
    </div>
  );
}
