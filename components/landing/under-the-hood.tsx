import { CheckIcon } from "@/components/landing/icons";
import { Rise } from "@/components/landing/rise";
import { TextReveal } from "@/components/motion/text-reveal";

// Section 8: the reference's two-column "we build the models / and the
// distribution power" band, with what is actually running behind Prospect.
// Spec: build/research/wishlabs/components/08-under-the-hood.md. Content is
// fixed by MISSION D-UI7: Databricks on the left, the four Gemini agents and
// the harness guardrails on the right. The agent passport work is NOT here,
// because it is not live and the landing lists only what runs.

const DATABRICKS = [
  "Lakebase holds every application table.",
  "Delta holds the bronze, silver and gold mirror plus the course, club and certification datasets.",
  "One Vector Search endpoint indexes the archetype definitions and the course catalog.",
  "Jobs run the Orchestrator and the hourly sync.",
  "Genie answers why questions over the same tables.",
] as const;

const AGENTS = [
  "Profile reads a resume and an unofficial transcript into a structured profile.",
  "Match ranks the live feed against your goal and picks the archetype target.",
  "Roadmap turns the gaps into a semester plan built from the datasets.",
  "Orchestrator re-scores every profile when new postings land.",
  "Temperature zero, schema-validated output, and a timeout per step that fails by name.",
  "A rejected answer goes back to the model once with the reason, a roadmap step that is not in the catalog is dropped by name, and Match links the postings it ranks to your roadmap steps.",
  "Document and posting text is treated as data, never as instructions.",
] as const;

function Panel({
  eyebrow,
  title,
  items,
  delay,
}: {
  eyebrow: string;
  title: string;
  items: readonly string[];
  delay: number;
}) {
  return (
    <Rise delay={delay} className="rounded-card border border-hairline bg-raised p-8">
      <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">{eyebrow}</p>
      <h3 className="font-display mt-3 text-balance text-step-3 leading-title text-text">
        {title}
      </h3>
      <ul className="mt-6 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-1 shrink-0 text-sage">
              <CheckIcon size={16} />
            </span>
            <span className="text-pretty text-step-0 leading-body text-text-dim">{item}</span>
          </li>
        ))}
      </ul>
    </Rise>
  );
}

export function UnderTheHood() {
  return (
    <section
      id="under-the-hood"
      aria-labelledby="under-the-hood-heading"
      className="bg-bg px-gutter py-section"
    >
      <div className="mx-auto w-full max-w-page">
        <Rise>
          <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
            Under the hood
          </p>
        </Rise>
        <TextReveal
          as="h2"
          id="under-the-hood-heading"
          text="One data platform. Four agents."
          granularity="word"
          className="font-display mt-4 max-w-[16ch] text-balance text-step-4 leading-display text-text lg:text-step-5"
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Panel
            eyebrow="Data and compute"
            title="Powered by Databricks"
            items={DATABRICKS}
            delay={0.06}
          />
          <Panel
            eyebrow="Reasoning"
            title="Four Gemini agents behind one harness"
            items={AGENTS}
            delay={0.12}
          />
        </div>
      </div>
    </section>
  );
}
