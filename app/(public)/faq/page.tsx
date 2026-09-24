import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Help & FAQ · Prospect" };

// Native <details>/<summary> per km-ui rung 1: no JS, no state, keyboard and
// screen-reader correct for free. One entry open by default (the first) so a
// visitor sees an answer's shape immediately; every other entry stays closed.
type Faq = { q: string; a: string };
type FaqGroup = { label: string; items: Faq[] };

// Redesign D9/D10: the mock (planning/mocks/faq.html) groups the FAQ into
// labelled sections with one row-height rhythm and hairline dividers, the
// same pattern Home's rows use, instead of one long flat list. Every
// question/answer below is unchanged text from the pre-redesign page;
// only the grouping and heading copy are new.
const FAQ_GROUPS: FaqGroup[] = [
  {
    label: "The basics",
    items: [
      {
        q: "What is Prospect and who is it for?",
        a: "Prospect is the career journey for every Virginia Tech student, in every major, guiding toward FAANG, Big Four, startups, research labs and government. It ranks the live opportunity feed for you and builds a semester roadmap alongside it.",
      },
      {
        q: "What do I upload, and what if I don't want to upload a transcript?",
        a: "A resume PDF and an unofficial transcript PDF. If you'd rather not upload a transcript, you can type your courses instead, and the Profile agent reads that typed list the same way.",
      },
      {
        q: "What happens to my resume and transcript?",
        a: "Gemini reads the PDF in memory to pull out your courses, skills and experience. The raw PDF file is not saved. What lands in Lakebase is the structured result: your profile facts and the parsed courses, skills and experiences, tied to your account.",
      },
      {
        q: "How fresh is the feed?",
        a: "New postings are scanned every 3 hours.",
      },
      {
        q: "Is Prospect an official Virginia Tech service?",
        a: "No. Prospect is a student project built at VTHacks 14, not an official Virginia Tech service.",
      },
      {
        q: "Does it cost anything?",
        a: "No. Prospect has no paid plan or billing anywhere in the product.",
      },
    ],
  },
  {
    label: "Ranking and the roadmap",
    items: [
      {
        q: "How are roles ranked for me?",
        a: "The Match agent matches your stated goal to an archetype (for example, \"Backend Software Engineer\") using Vector Search over an archetype registry, then scores every open posting on archetype fit, role-type and level match, dream-tier match and recency, and prints the reasons on the card.",
      },
      {
        q: "Why did a role rank where it did?",
        a: "Each card lists the fit reasons behind its score: archetype match, role-type and level match, dream-tier match, how recently it was posted, and sponsorship information when a role names one.",
      },
      {
        q: "What do Human-led, AI-assisted and Automatable mean?",
        a: "Task labels come from the Anthropic Economic Index, which measured how AI was actually used on real O*NET tasks. Human-led means AI mostly assisted with validation or iteration, not automation. AI-assisted means a mix. Automatable means AI mostly carried the task directively. A task the index never measured shows as \"not measured\", never guessed.",
      },
      {
        q: "Where do roadmap courses and clubs come from?",
        a: "Courses and clubs come only from Virginia Tech's own datasets, never invented. Certifications come from a live web search with the source linked, since there's no certification dataset. Projects are always labeled suggested.",
      },
    ],
  },
  {
    label: "What Prospect never does",
    items: [
      {
        q: "Does Prospect apply for me?",
        a: "No. Apply opens the real posting on the employer's own site and logs that you applied so you can track it. Nothing is ever auto-submitted on your behalf.",
      },
      {
        q: "I'm an international student, what does the work authorization field do?",
        a: "It's one of the permanent facts saved with your profile. Prospect never uses it to filter or hide roles from your feed. A role's own sponsorship information shows as a visible reason on its card, so you can judge fit yourself.",
      },
    ],
  },
  {
    label: "Your account",
    items: [
      {
        q: "How do I change my profile or re-run the agents?",
        a: "Open Settings, edit any fact or upload new files, then re-ingest. Saving your profile automatically re-runs the agents on the updated information.",
      },
      {
        q: "How do I delete my data?",
        a: "Ask through the feedback box in the app. Everything tied to your account is deleted.",
      },
    ],
  },
];

function FaqItem({ item, defaultOpen }: { item: Faq; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-step-2 leading-title tracking-display text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage">
        {item.q}
        <span aria-hidden="true" className="shrink-0 font-mono text-lg leading-none text-text-dim">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">–</span>
        </span>
      </summary>
      <p className="max-w-[62ch] pb-4 text-sm text-text-dim">{item.a}</p>
    </details>
  );
}

export default function FaqPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[68ch] flex-col gap-10 px-6 py-16">
      <Link
        href="/welcome"
        className="inline-flex min-h-11 w-fit items-center gap-2 self-start font-sans text-sm text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        ← Back to Prospect
      </Link>

      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 font-label text-[11px] uppercase tracking-label text-text-dim">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          Help
        </p>
        <h1 className="font-display text-step-5 leading-display tracking-display text-text">Help &amp; FAQ</h1>
        <p className="max-w-[60ch] text-text-dim">
          Plain answers about what Prospect does and what it does with your data. This isn&apos;t
          legal advice, see{" "}
          <Link href="/privacy" className="text-sage underline-offset-4 hover:underline">
            Privacy
          </Link>{" "}
          for that.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {FAQ_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="font-label text-[11px] uppercase tracking-label text-text-dim">{group.label}</p>
            <div className="flex flex-col divide-y divide-hairline border-y border-hairline">
              {group.items.map((item, itemIndex) => (
                <FaqItem key={item.q} item={item} defaultOpen={groupIndex === 0 && itemIndex === 0} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
