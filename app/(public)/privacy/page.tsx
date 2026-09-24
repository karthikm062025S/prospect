import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Prospect" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[68ch] flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="font-label text-[11px] uppercase tracking-label text-text-dim">
          Effective 2026-09-19
        </p>
        <h1 className="font-display text-step-4 leading-display tracking-display text-text">
          Privacy
        </h1>
        <p className="text-text-dim">
          Prospect is a student project. This page explains, in plain language, what the app
          stores and why. It isn&apos;t legal advice.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">What you upload</h2>
        <ul className="flex flex-col gap-3 text-text-dim">
          <li>
            <strong className="text-text">Sign-in:</strong> your email and password.
          </li>
          <li>
            <strong className="text-text">Setup:</strong> a resume PDF and an unofficial transcript
            PDF (or a typed list of your courses instead of a transcript), your major, grad term,
            work authorization, role types, target term, one-sentence goal, dream tier and any
            skills you type in.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">
          What we extract and store
        </h2>
        <p className="text-text-dim">
          Gemini reads your resume and transcript PDFs in memory to pull out your courses, skills
          and work experience. What gets saved to our database is that structured result, plus the
          facts you typed in setup, tied to your account: major, grad term, work authorization,
          goal, target term, role types, dream tier, and your parsed courses, skills and
          experiences. Your ranked feed, roadmap and any applications you log are stored the same
          way, tied to your account.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">
          What we never store
        </h2>
        <ul className="flex flex-col gap-2 text-text-dim">
          <li>The resume or transcript PDF file itself, once it has been read.</li>
          <li>Your raw IP address (only a salted hash, see Feedback below).</li>
          <li>Your password in plain text.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">
          Services we rely on
        </h2>
        <ul className="flex flex-col gap-2 text-text-dim">
          <li>Gemini (Google) reads your PDFs and does the agent reasoning.</li>
          <li>Databricks Lakebase (Postgres) stores every app table.</li>
          <li>Vercel hosts the app.</li>
          <li>Supabase Auth handles sign-in only. It never sees your resume or transcript.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">The shared job feed</h2>
        <p className="text-text-dim">
          The internship, co-op, new-grad, full-time and research listings every signed-in user
          sees are public listing data from employers&apos; own applicant-tracking systems, not
          personal data about you. New postings are scanned every 3 hours.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-label text-[11px] uppercase tracking-label text-text">Feedback</h2>
        <p className="text-text-dim">
          Feedback you submit keeps your message, an optional email address, the page you were on,
          your browser&apos;s user-agent, and a salted hash of your IP address, kept only to limit
          repeat submissions. The raw IP is never stored.
        </p>
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
