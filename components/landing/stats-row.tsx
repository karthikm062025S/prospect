import { Rise } from "@/components/landing/rise";
import { StatOdometer } from "@/components/motion/stat-odometer";
import { TextReveal } from "@/components/motion/text-reveal";
import { formatStat } from "@/lib/public-stats-format";
import type { PublicStats } from "@/lib/public-stats-format";

// Section 3: the reference's "Only the real numbers here." band.
// Spec: build/research/wishlabs/components/03-stats.md.
//
// Every figure comes from lib/public-stats.ts, which counts them in our own
// database. Nothing here is hardcoded and nothing is estimated: a count that
// could not be read renders "n/a" (formatStat's null path), never a zero and
// never a rounded-up guess.
//
// The figures are Satoshi tabular-nums, NEVER the label face: Plex Mono's
// dotted zero misreads at a glance, which is why tests/landing-numerals.test.ts
// fails a numeral inside a font-label element.

export function StatsRow({ stats }: { stats: PublicStats }) {
  const figures = [
    { key: "open", label: "Open postings", value: stats.openRoles },
    { key: "companies", label: "Companies", value: stats.companies },
    { key: "added", label: "Added in the last day", value: stats.addedLast24h },
  ];

  return (
    <section id="stats" aria-labelledby="stats-heading" className="bg-bg px-gutter py-section">
      <div className="mx-auto w-full max-w-page text-center">
        <Rise>
          <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
            Measured, not claimed
          </p>
        </Rise>
        <TextReveal
          as="h2"
          id="stats-heading"
          text="Live, not estimated."
          granularity="word"
          className="font-display mx-auto mt-4 max-w-[16ch] text-balance text-step-4 leading-display text-text lg:text-step-5"
        />

        <dl className="mt-12 grid gap-12 sm:grid-cols-3 sm:gap-6">
          {figures.map((figure, index) => (
            // flex-col-reverse: the figure reads above its label, while the
            // source keeps the only order a <dl> allows, dt before dd.
            <Rise key={figure.key} delay={index * 0.06} className="flex flex-col-reverse gap-4">
              <dt className="font-label text-step-2xs uppercase tracking-label text-text-dim">
                {figure.label}
              </dt>
              <dd className="font-sans text-step-5 leading-none tabular-nums text-text">
                {/* The figure rolls up once, when the band is on screen. The
                    string formatStat() returns is what is read aloud and what
                    renders under reduced motion; the columns are decorative. */}
                <StatOdometer value={figure.value} text={formatStat(figure.value)} />
              </dd>
            </Rise>
          ))}
        </dl>

        <Rise delay={0.18}>
          <p className="mx-auto mt-12 max-w-[56ch] text-pretty text-step-0 text-text-dim">
            Counted in Prospect&rsquo;s own database. Every watched board is re-read every 3
            hours, so these move while you read them.
          </p>
        </Rise>
      </div>
    </section>
  );
}
