import type { Metadata } from "next";

// TEMPORARY gate artefact (mission UI/UX 2026-09-19, leaf T0). It renders every
// token and face pairing at once so the orchestrator can screenshot light and
// dark side by side and Karthik can react to real pixels rather than a table of
// hex values. Delete this route once the palette is signed off.
//
// The two sheets carry their own data-theme, so both palettes paint in one
// screenshot whatever the document theme is. Every ratio quoted here is printed
// by `node scripts/contrast-pairs.mjs`.

export const metadata: Metadata = { title: "Pairing sheet", robots: { index: false } };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-label text-step-2xs tracking-label text-text-dim uppercase">{children}</p>
  );
}

/** Every element of the pairing, rendered on whatever ground it is dropped on. */
function Specimen({ ground }: { ground: "page" | "card" }) {
  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>{ground === "page" ? "On the page ground" : "On a raised card"}</Eyebrow>

      <h1 className="font-display text-step-hero text-text">Your career, mapped.</h1>
      <h2 className="font-display text-step-5 text-text">Only the real numbers here.</h2>
      <h3 className="font-display text-step-3 text-text">What Prospect found</h3>

      <p className="text-step-0 text-text-dim max-w-[52ch]">
        Prospect reads your transcript and resume, ranks every live opening against them, and
        writes a semester roadmap for the gaps. <span className="text-sage">Maroon is the action
        colour</span>, and it is the only colour a link or a step number is allowed to use.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="bg-sage text-bg font-sans inline-flex min-h-11 items-center rounded-pill px-5 text-step-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          Build my profile
        </button>
        <button
          type="button"
          className="border-text text-text font-sans inline-flex min-h-11 items-center rounded-pill border px-5 text-step-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          See an example
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-text text-bg font-label text-step-2xs tracking-label inline-flex min-h-8 items-center rounded-pill px-4 uppercase">
          Active chip
        </span>
        <span className="border-text-dim text-text-dim font-label text-step-2xs tracking-label inline-flex min-h-8 items-center rounded-pill border px-4 uppercase">
          Inactive chip
        </span>
      </div>

      <div>
        <p className="font-sans text-step-2 text-text tabular-nums leading-none">1,295</p>
        <p className="font-label text-step-2xs tracking-label text-text-dim mt-1 uppercase">
          Roles live today
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-label text-step-2xs tracking-label text-text-dim uppercase">
          Graduation term
        </span>
        <input
          type="text"
          defaultValue="Spring 2028"
          spellCheck={false}
          className="border-hairline bg-raised text-text font-sans min-h-11 rounded-card border px-3 text-step-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        />
      </label>

      <p className="font-mono text-step-2xs text-text-dim break-all">
        POST /api/profile → step=roadmap count=14 ms=8321
      </p>

      {/* Orange: FILL only. On the page ground it is 3.05:1 (light) and clears
          the 1.4.11 3:1 boundary on its own; on a raised card it measures
          2.85:1, so it wears the .accent-fill-on-raised ring instead. */}
      <div className="flex flex-col gap-2">
        <div className="bg-hairline h-2 w-full overflow-hidden rounded-pill">
          <div
            className={`bg-accent h-full w-3/5 rounded-pill ${ground === "card" ? "accent-fill-on-raised" : ""}`}
          />
        </div>
        <span
          className={`bg-accent text-ink font-label text-step-2xs tracking-label inline-flex min-h-8 w-fit items-center rounded-pill px-4 uppercase ${ground === "card" ? "accent-fill-on-raised" : ""}`}
        >
          New this week
        </span>
      </div>
    </div>
  );
}

function Sheet({ theme }: { theme: "light" | "dark" }) {
  return (
    <section data-theme={theme} className="bg-bg text-text flex-1 p-[var(--gutter)]">
      <Eyebrow>{theme} theme</Eyebrow>
      <div className="mt-6 flex flex-col gap-6">
        <Specimen ground="page" />
        <div className="border-hairline bg-raised rounded-card border p-6">
          <Specimen ground="card" />
        </div>
        <div className="bg-ink rounded-card p-6">
          <p className="font-label text-step-2xs tracking-label text-ink-text uppercase">
            Ink band
          </p>
          <p className="font-display text-step-4 text-ink-text mt-2">
            The band surface is the same value in both themes.
          </p>
          <p className="text-accent text-step-0 mt-2">
            Orange is text-safe here only: 6.10:1 on the ink band.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function PairingPage() {
  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      <Sheet theme="light" />
      <Sheet theme="dark" />
    </main>
  );
}
