import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms · Scout" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[68ch] flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="font-label text-[11px] uppercase tracking-label text-text-dim">
          Effective 2026-09-02
        </p>
        <h1 className="font-display text-step-4 leading-display tracking-display text-text">Terms</h1>
        <p className="text-text-dim">
          Scout is operated by its maker, working solo. This page explains, in plain language,
          the terms of using it. It isn&apos;t legal advice.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">This is an MVP</h2>
        <p className="text-text-dim">
          Scout is provided as-is, still early, and can change or break. There&apos;s no guarantee
          that every posting in the feed is current or accurate. Always verify a listing on the
          employer&apos;s own site before relying on it.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Your data</h2>
        <p className="text-text-dim">
          You own the applications, notes, and outreach you enter. See{" "}
          <Link href="/privacy" className="text-sage underline-offset-4 hover:underline">
            Privacy
          </Link>{" "}
          for what&apos;s stored and how to delete it.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Don&apos;t abuse it</h2>
        <ul className="flex flex-col gap-2 text-text-dim">
          <li>Don&apos;t scrape the shared job feed.</li>
          <li>Don&apos;t send spam or abusive feedback.</li>
          <li>Don&apos;t impersonate anyone.</li>
        </ul>
        <p className="text-text-dim">
          Accounts that do any of the above may be suspended.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Governing law</h2>
        <p className="text-text-dim">The laws applicable to the operator govern these terms.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Contact</h2>
        <p className="text-text-dim">Reach out through the feedback box in the app.</p>
      </section>

      <Link
        href="/welcome"
        className="min-h-11 self-start font-sans text-sm text-text-dim underline-offset-4 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        ← Back to Scout
      </Link>
    </main>
  );
}
