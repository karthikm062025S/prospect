"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// v8 onboarding: the Account section's password affordance, mounted with one
// line in app/(app)/settings/page.tsx. Google accounts have no password here,
// so only email accounts get the link. /settings?notice=password#account is
// where app/auth/actions.ts updatePasswordAction lands.
function ChangePasswordInner({ provider }: { provider: "google" | "email" }) {
  const updated = useSearchParams().get("notice") === "password";
  if (provider !== "email" && !updated) return null;

  return (
    <div className="flex flex-col gap-1">
      {provider === "email" && (
        <Link
          href="/auth/update-password"
          className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-2 hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Change password
        </Link>
      )}
      {updated && (
        <p role="status" className="text-sm text-sage">
          Password updated.
        </p>
      )}
    </div>
  );
}

export function ChangePassword({ provider }: { provider: "google" | "email" }) {
  return (
    <Suspense fallback={null}>
      <ChangePasswordInner provider={provider} />
    </Suspense>
  );
}
