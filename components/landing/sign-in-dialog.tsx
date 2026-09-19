"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  signInWithGoogleAction,
  signInWithPasswordAction,
  signUpAction,
} from "@/app/auth/actions";
import { LAST_ACCOUNT_KEY, clearLastAccount, parseLastAccount, type LastAccount } from "@/lib/last-account";
import { initials } from "@/lib/profile";
import { GoogleGlyph, SIGN_IN_EVENT } from "@/components/landing/google-cta";

// v8 onboarding: the ONE sign-in dialog. Mounted once in app/welcome/page.tsx;
// every GoogleCta on the landing opens it by dispatching SIGN_IN_EVENT.
// Native <dialog> + showModal(): Escape, focus trap and inert background come
// from the UA (tests/dialog-a11y.test.ts states the contract).
//
// Top to bottom: "Continue as <name>" card (localStorage, lib/last-account.ts)
// -> Continue with Google -> "or" -> email form (Sign in / Create account /
// Reset password) -> the Terms + cookies line (Karthik decision 5).
//
// Server actions redirect back to /welcome?error=... or ?notice=... ; those
// codes map to one sentence each here, and the dialog re-opens on mount when
// one is present. Raw Supabase error text never reaches this file.

type Mode = "signin" | "signup" | "reset";

const MESSAGES: Record<string, { text: string; tone: "danger" | "sage"; mode: Mode }> = {
  "error=password": { text: "Wrong email or password.", tone: "danger", mode: "signin" },
  "error=signup": {
    text: "Could not create the account. Check the details and try again.",
    tone: "danger",
    mode: "signup",
  },
  "notice=confirm": { text: "Check your email to confirm your account.", tone: "sage", mode: "signin" },
  "notice=reset": { text: "If that email exists, a reset link is on its way.", tone: "sage", mode: "signin" },
};

// Same motion string as components/feedback-box.tsx / detail-pane.tsx
// (an independent literal by house rule: the dialogs never import each other).
const dialogMotion =
  "translate-y-1 opacity-0 open:translate-y-0 open:opacity-100 transition-discrete transition-[opacity,transform,overlay,display] duration-[120ms] ease-[cubic-bezier(0.4,0,1,1)] open:duration-[180ms] open:ease-[cubic-bezier(0.23,1,0.32,1)] open:starting:translate-y-1 open:starting:opacity-0 backdrop:opacity-0 open:backdrop:opacity-100 backdrop:transition-discrete backdrop:transition-[opacity,overlay,display] backdrop:duration-[120ms] open:backdrop:duration-[180ms] open:backdrop:starting:opacity-0 motion-reduce:transition-none";

const labelClass = "font-label text-[11px] uppercase tracking-label text-text-dim";
const inputClass =
  "min-h-11 w-full rounded-md border border-hairline bg-bg px-3 font-sans text-sm text-text placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";
const primaryButton =
  "inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-pill bg-text px-5 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised disabled:cursor-not-allowed disabled:opacity-60";
const textLink =
  "inline-flex min-h-11 items-center font-sans text-sm text-text-dim underline underline-offset-4 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={primaryButton}>
      {pending ? "One moment" : children}
    </button>
  );
}

function ContinueAsCard({
  account,
  onUseEmail,
  onForget,
}: {
  account: LastAccount;
  onUseEmail: () => void;
  onForget: () => void;
}) {
  const avatar = account.avatarUrl ? (
    // Plain <img>: an external Google avatar host, no next/image domain config.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={account.avatarUrl} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-10 items-center justify-center rounded-full bg-sage/15 font-sans text-sm font-medium text-sage"
    >
      {initials({
        fullName: account.fullName,
        email: account.email,
        avatarUrl: null,
        provider: account.provider,
        monthlyTarget: null,
        school: null,
        gradTerm: null,
      })}
    </span>
  );
  const cardClass =
    "flex min-h-11 w-full items-center gap-3 rounded-card border border-hairline bg-bg p-3 text-left hover:border-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";
  const body = (
    <>
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-sm font-medium text-text">
          Continue as {account.fullName ?? account.email}
        </span>
        <span className="block truncate font-sans text-step-xs text-text-dim">
          {account.email} · via {account.provider === "google" ? "Google" : "email"}
        </span>
      </span>
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      {account.provider === "google" ? (
        <form action={signInWithGoogleAction}>
          <input type="hidden" name="login_hint" value={account.email} />
          <button type="submit" className={cardClass}>
            {body}
          </button>
        </form>
      ) : (
        <button type="button" onClick={onUseEmail} className={cardClass}>
          {body}
        </button>
      )}
      <button type="button" onClick={onForget} className={`${textLink} self-start`}>
        Not you? Use a different account
      </button>
    </div>
  );
}

// localStorage as an external store: the card re-reads it on every open
// (SIGN_IN_EVENT), after "Not you?" (LAST_ACCOUNT_CHANGED) and when another tab
// changes it (storage). The server snapshot is null, so the first paint never
// shows a card the server could not have known about.
const LAST_ACCOUNT_CHANGED = "scout:lastaccount";
function subscribeLastAccount(onChange: () => void) {
  for (const name of ["storage", SIGN_IN_EVENT, LAST_ACCOUNT_CHANGED]) window.addEventListener(name, onChange);
  return () => {
    for (const name of ["storage", SIGN_IN_EVENT, LAST_ACCOUNT_CHANGED]) window.removeEventListener(name, onChange);
  };
}
function readRawLastAccount(): string | null {
  try {
    return window.localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function SignInDialogInner() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const errorCode = searchParams.get("error");
  const noticeCode = searchParams.get("notice");
  const bounceKey = errorCode ? `error=${errorCode}` : noticeCode ? `notice=${noticeCode}` : null;
  const bounce = bounceKey ? MESSAGES[bounceKey] : undefined;

  const [mode, setMode] = useState<Mode>(() => bounce?.mode ?? "signin");
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const rawLastAccount = useSyncExternalStore(subscribeLastAccount, readRawLastAccount, () => null);
  const lastAccount = useMemo(() => parseLastAccount(rawLastAccount), [rawLastAccount]);
  const message = bounce && !dismissed ? bounce : null;

  // A server action bounced back with a code: open with its sentence showing.
  useEffect(() => {
    if (bounce && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [bounce]);

  useEffect(() => {
    const open = () => {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
    };
    window.addEventListener(SIGN_IN_EVENT, open);
    return () => window.removeEventListener(SIGN_IN_EVENT, open);
  }, []);

  function close() {
    dialogRef.current?.close();
  }

  // The code in the URL has been shown; drop it so a reload does not repeat it.
  function onClose() {
    setDismissed(true);
    if (bounceKey) router.replace("/welcome", { scroll: false });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setDismissed(true);
  }

  function pickLastEmail() {
    if (!lastAccount) return;
    setEmail(lastAccount.email);
    switchMode("signin");
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  function forgetLastAccount() {
    clearLastAccount();
    window.dispatchEvent(new Event(LAST_ACCOUNT_CHANGED));
  }

  const emailAction =
    mode === "signin" ? signInWithPasswordAction : mode === "signup" ? signUpAction : requestPasswordResetAction;

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-title"
      onClose={onClose}
      className={`m-auto w-[min(100%-2rem,400px)] rounded-card border border-hairline bg-raised p-6 text-text shadow-lg backdrop:bg-ink/60 ${dialogMotion}`}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="sign-in-title" className="font-display text-step-3 leading-title text-text">
          Welcome to Scout
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="-mr-2 -mt-2 flex size-11 items-center justify-center rounded-pill text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {message && (
        <p role="status" className={`mt-3 font-sans text-sm ${message.tone === "danger" ? "text-danger" : "text-sage"}`}>
          {message.text}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {lastAccount && (
          <ContinueAsCard account={lastAccount} onUseEmail={pickLastEmail} onForget={forgetLastAccount} />
        )}

        <form action={signInWithGoogleAction}>
          <SubmitButton>
            <GoogleGlyph />
            Continue with Google
          </SubmitButton>
        </form>

        <p className="flex items-center gap-3 font-sans text-step-xs text-text-dim" aria-hidden="true">
          <span className="h-px flex-1 bg-hairline" />
          or
          <span className="h-px flex-1 bg-hairline" />
        </p>

        <form action={emailAction} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="sign-in-name" className={labelClass}>
                Full name
              </label>
              <input
                id="sign-in-name"
                name="full_name"
                autoComplete="name"
                required
                maxLength={80}
                className={inputClass}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="sign-in-email" className={labelClass}>
              Email
            </label>
            <input
              id="sign-in-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>

          {mode !== "reset" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="sign-in-password" className={labelClass}>
                  Password
                </label>
                {mode === "signin" && (
                  <button type="button" onClick={() => switchMode("reset")} className={`${textLink} min-h-6 text-step-xs`}>
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                ref={passwordRef}
                id="sign-in-password"
                name="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={mode === "signup" ? 8 : 1}
                maxLength={256}
                className={inputClass}
              />
              {mode === "signup" && (
                <p className="font-sans text-step-xs text-text-dim">At least 8 characters.</p>
              )}
            </div>
          )}

          <SubmitButton>
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </SubmitButton>
        </form>

        <p className="font-sans text-sm text-text-dim">
          {mode === "signin" && (
            <>
              No account?{" "}
              <button type="button" onClick={() => switchMode("signup")} className={textLink}>
                Create one
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => switchMode("signin")} className={textLink}>
                Sign in
              </button>
            </>
          )}
          {mode === "reset" && (
            <button type="button" onClick={() => switchMode("signin")} className={textLink}>
              Back to sign in
            </button>
          )}
        </p>
      </div>

      <p className="mt-6 border-t border-hairline pt-4 font-sans text-step-xs leading-body text-text-dim">
        By continuing you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-text">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-text">
          Privacy
        </Link>
        . Scout uses only the cookies needed to keep you signed in.
      </p>
    </dialog>
  );
}

// useSearchParams needs a Suspense boundary; it lives inside this export so the
// mount in app/welcome/page.tsx stays one line.
export function SignInDialog() {
  return (
    <Suspense fallback={null}>
      <SignInDialogInner />
    </Suspense>
  );
}
