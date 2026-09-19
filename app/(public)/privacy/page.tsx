import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Prospect" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[68ch] flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="font-label text-[11px] uppercase tracking-label text-text-dim">
          Effective 2026-09-02
        </p>
        <h1 className="font-display text-step-4 leading-display tracking-display text-text">
          Privacy
        </h1>
        <p className="text-text-dim">
          Prospect is operated by its maker, working solo. This page explains, in plain language,
          what the app stores and why. It isn&apos;t legal advice.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">What we collect</h2>
        <ul className="flex flex-col gap-3 text-text-dim">
          <li>
            <strong className="text-text">From sign-in:</strong> with Google, your Google account
            id, email, name, and avatar URL; with email, your name, email and a password hash. Used
            only to run your account. Your browser also keeps the name and email of the last
            account you used, so the sign-in dialog can offer it back to you.
          </li>
          <li>
            <strong className="text-text">Application-tracking data you enter:</strong>{" "}
            applications, notes, outreach, timeline entries, and the roles you save or hide.
          </li>
          <li>
            <strong className="text-text">Feedback you submit:</strong> your message, an optional
            email address, the page you were on, your browser&apos;s user-agent, and a salted hash
            of your IP address, kept only to limit repeat submissions. The raw IP is never stored.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">The shared job feed</h2>
        <p className="text-text-dim">
          The internship listings every signed-in user sees are public listing data, scraped from
          employers&apos; own applicant-tracking systems, not personal data about you.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">What we don&apos;t do</h2>
        <ul className="flex flex-col gap-2 text-text-dim">
          <li>No ads.</li>
          <li>We don&apos;t sell your data.</li>
          <li>
            No third-party analytics. Only hosting logs (Vercel) and our database (Supabase,
            hosted in the US).
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Cookies</h2>
        <p className="text-text-dim">Sign-in cookies only, to keep you signed in between visits.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Deleting your data</h2>
        <p className="text-text-dim">
          Ask through the feedback box in the app. Everything tied to your account is deleted.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Children</h2>
        <p className="text-text-dim">Prospect isn&apos;t for anyone under 16.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Changes</h2>
        <p className="text-text-dim">
          If this policy changes, the update is posted on this page.
        </p>
      </section>

      <Link
        href="/welcome"
        className="min-h-11 self-start font-sans text-sm text-text-dim underline-offset-4 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        ← Back to Prospect
      </Link>
    </main>
  );
}
