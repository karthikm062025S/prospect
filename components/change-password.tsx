"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

// v8 onboarding: the Account section's password affordance, mounted with one
// line in app/(app)/settings/page.tsx. Google accounts have no password here,
// so only email accounts get the link. /settings?notice=password#account is
// where app/auth/actions.ts updatePasswordAction lands.
// L9 2026-09-20: styled as a pill button (rounded-pill, border-hairline),
// matching the mock's "Change password" pill and the Sign-out pill already on
// this page — same href, same conditional render, no behavior change.
function ChangePasswordInner({ provider }: { provider: "google" | "email" }) {
  const updated = useSearchParams().get("notice") === "password";
  if (provider !== "email" && !updated) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      {provider === "email" && (
        <Link
          href="/auth/update-password"
          className="inline-flex min-h-11 items-center self-start rounded-pill border border-hairline px-5 font-sans text-sm font-medium text-text hover:bg-bg hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
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
