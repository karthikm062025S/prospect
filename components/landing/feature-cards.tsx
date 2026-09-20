import { ListSearchIcon, PathIcon, RobotIcon } from "@/components/landing/icons";
import { Rise } from "@/components/landing/rise";
import { SignInCta } from "@/components/landing/sign-in-cta";
import { TextReveal } from "@/components/motion/text-reveal";
import { formatStat } from "@/lib/public-stats-format";

// Section 7: the reference's card grid, as three cards, because three product
// surfaces exist and a fourth would have to be invented.
// Spec: build/research/wishlabs/components/07-features.md.
//
// Each card carries ONE real metric or a truthful status line, never a made-up
// figure: the feed has a real count, the roadmap and the agents do not have a
// public number, so they state what is true instead.
// Icons are Phosphor BOLD, inlined from design/icons/phosphor/SVGs/bold/.

export function FeatureCards({
  openRoles,
  signedIn,
}: {
  openRoles: number | null;
  signedIn: boolean;
}) {
  const cards = [
    {
      Icon: ListSearchIcon,
      title: "Feed",
      body: "Every open posting we watch, ranked best to least for your goal, with the reasons in words.",
      status: `${formatStat(openRoles)} open postings right now`,
      cta: "See the live feed",
    },
    {
      Icon: PathIcon,
      title: "Journey roadmap",
      body: "A semester by semester plan of real courses, clubs, projects and certifications that closes the gaps.",
      status: "Built as soon as your profile is in",
      cta: "Build my roadmap",
    },
    {
      Icon: RobotIcon,
      title: "Agents",
      body: "Profile, Match, Roadmap and Orchestrator. Each one reads real data and hands back a checked result.",
      status: "Temperature zero, schema-checked output",
      cta: "Start the run",
    },
  ];

  return (
    <section id="features" aria-labelledby="features-heading" className="bg-bg px-gutter py-section">
      <div className="mx-auto w-full max-w-page">
        <Rise>
          <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
            What you get
          </p>
        </Rise>
        <TextReveal
          as="h2"
          id="features-heading"
          text="Three surfaces. One journey."
          granularity="word"
          className="font-display mt-4 max-w-[16ch] text-balance text-step-4 leading-display text-text lg:text-step-5"
        />

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ Icon, title, body, status, cta }, index) => (
            <Rise
              as="li"
              key={title}
              delay={index * 0.06}
              className="scout-card flex flex-col rounded-card border border-hairline bg-raised p-6"
            >
              <span className="flex size-14 items-center justify-center rounded-pill bg-sage/10 text-sage">
                <Icon size={32} />
              </span>
              <h3 className="font-display mt-6 text-step-3 leading-title text-text">{title}</h3>
              <p className="mt-3 text-pretty text-step-0 leading-body text-text-dim">{body}</p>
              <p className="mt-4 font-sans text-step-xs tabular-nums text-sage">{status}</p>
              <SignInCta
                label={cta}
                signedIn={signedIn}
                className="mt-6 [&_a]:w-full [&_a]:justify-center [&_button]:w-full [&_button]:justify-center"
              />
            </Rise>
          ))}
        </ul>
      </div>
    </section>
  );
}
