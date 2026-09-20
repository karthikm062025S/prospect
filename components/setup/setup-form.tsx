"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AutoTextarea } from "@/components/auto-textarea";
import { SkillsTypeahead } from "@/components/skills-typeahead";
import { LoadingSteps } from "@/components/loading-steps";
import { ChipToggleGroup } from "./chip-toggle-group";
import { PdfDropZone } from "./pdf-drop-zone";
import { applyStreamEvent, initialSteps, type StepStates, type StreamEvent } from "./profile-stream";
import { GOAL_MAX, HELP, MAJORS, SEASONS, WORK_AUTH } from "@/lib/profile-options";
import type { ProfileForm } from "@/lib/agents/profile";

// Duplicated from lib/agents/profile.ts (not imported): that module also
// exports runProfileAgent, whose Gemini/Lakebase calls must never reach the
// client bundle. A type-only import of ProfileForm below is erased at compile
// time and carries no such risk; these two short literal tuples are the only
// values this form needs from that module, so they're copied here instead.
const ROLE_TYPES = ["internship", "co-op", "full-time", "research"] as const;
const DREAM_TIERS = ["FAANG", "Big 4", "startups", "research labs", "government"] as const;

/** What an existing profile row pre-fills (Law 18: never ask twice). */
export type SetupDefaults = {
  updatedAt: string;
  major: string;
  gradTerm: string;
  workAuthorization: string;
  goal: string;
  roleTypes: string[];
  dreamTier: string[];
  season: string;
  year: number | null;
};

const label = "font-label text-[11px] uppercase tracking-label text-text-dim";
const help = "font-sans text-xs text-text-dim";
const inputClass =
  "min-h-11 w-full rounded-lg border border-hairline bg-bg px-3 font-sans text-sm text-text placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";
const card = "flex flex-col gap-6 rounded-card bg-raised p-6 shadow-sm ring-1 ring-hairline";
const heading = "font-display text-step-2 text-text";

// Graduation terms a current student can plausibly name: this year through
// six years out, derived from the clock, never a fixed chip list.
const THIS_YEAR = new Date().getFullYear();
const GRAD_TERMS = Array.from({ length: 7 }, (_, i) => THIS_YEAR + i).flatMap((year) =>
  (["Spring", "Summer", "Fall"] as const).map((season) => `${season} ${year}`),
);

type FieldErrors = Partial<Record<"resume" | "transcript" | "typedCourses" | "roleTypes" | "dreamTier", string>>;

function Field({
  id,
  label: text,
  help: helpText,
  children,
}: {
  id: string;
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
      <p id={`${id}-help`} className={help}>
        {helpText}
      </p>
    </div>
  );
}

export function SetupForm({ defaults }: { defaults?: SetupDefaults }) {
  const router = useRouter();
  const [typeCoursesInstead, setTypeCoursesInstead] = useState(false);
  const [roleTypes, setRoleTypes] = useState<string[]>(defaults?.roleTypes ?? []);
  const [dreamTier, setDreamTier] = useState<string[]>(defaults?.dreamTier ?? []);
  const [workAuth, setWorkAuth] = useState<string>(defaults?.workAuthorization ?? "");
  const [goal, setGoal] = useState(defaults?.goal ?? "");
  const [phase, setPhase] = useState<"idle" | "running" | "failed">("idle");
  const [stepStates, setStepStates] = useState<StepStates>(initialSteps);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  const workAuthOption = WORK_AUTH.find((o) => o.value === workAuth);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formEl = event.currentTarget;
    const data = new FormData(formEl);

    const resume = data.get("resume");
    const transcript = data.get("transcript");
    const typedCourses = typeCoursesInstead ? String(data.get("typedCourses") ?? "") : "";

    // Law 15: every problem lands next to its field, and the form keeps every value.
    const errors: FieldErrors = {};
    if (!(resume instanceof File) || resume.size === 0) errors.resume = "Upload your resume as a PDF.";
    if (!typeCoursesInstead && (!(transcript instanceof File) || transcript.size === 0)) {
      errors.transcript = "Upload your unofficial transcript, or tick \"Type my courses instead\".";
    }
    if (typeCoursesInstead && !typedCourses.trim()) errors.typedCourses = "Type at least one course, or upload your transcript instead.";
    if (roleTypes.length === 0) errors.roleTypes = "Pick at least one role type.";
    if (dreamTier.length === 0) errors.dreamTier = "Pick at least one dream tier.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Fix the highlighted fields and submit again.");
      return;
    }

    const skillsRaw = data.get("skills");
    const skills: string[] = typeof skillsRaw === "string" && skillsRaw ? JSON.parse(skillsRaw) : [];

    const form: ProfileForm = {
      major: String(data.get("major") ?? ""),
      gradTerm: String(data.get("gradTerm") ?? ""),
      workAuthorization: String(data.get("workAuthorization") ?? ""),
      roleTypes: roleTypes as ProfileForm["roleTypes"],
      targetTerm: { season: String(data.get("season") ?? ""), year: Number(data.get("year")) },
      goal,
      dreamTier: dreamTier as ProfileForm["dreamTier"],
      skills,
    };

    const payload = new FormData();
    payload.set("profile", JSON.stringify(form));
    if (resume instanceof File && resume.size > 0) payload.set("resume", resume);
    if (!typeCoursesInstead && transcript instanceof File) payload.set("transcript", transcript);
    if (typeCoursesInstead) payload.set("typedCourses", typedCourses);

    let states = initialSteps();
    setStepStates(states);
    setPhase("running");

    try {
      const response = await fetch("/api/profile", { method: "POST", body: payload });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Request failed (${response.status})`);
        setPhase("failed");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const out = applyStreamEvent(states, JSON.parse(line) as StreamEvent);
          states = out.states;
          setStepStates(states);
          if (out.error) {
            setError(out.error);
            setPhase("failed");
            return;
          }
          if (out.navigateTo) {
            router.push(out.navigateTo);
            return;
          }
        }
      }
      // The stream closed without done or error: name it instead of spinning forever.
      setError("STREAM_ENDED: the profile stream closed before it finished");
      setPhase("failed");
    } catch (err) {
      setError((err as Error).message);
      setPhase("failed");
    }
  }

  const running = phase === "running";

  return (
    <div className="flex flex-col gap-6">
      {phase !== "idle" && (
        <section className={card} aria-labelledby="progress-heading">
          <h2 id="progress-heading" className={heading}>
            {phase === "failed" ? "Something stopped" : "Building your profile"}
          </h2>
          <LoadingSteps states={stepStates} />
          {phase === "failed" && (
            <p className="font-sans text-sm text-text-dim">Your answers below are kept. Fix the problem and submit again.</p>
          )}
        </section>
      )}

      {/* `hidden` (not unmount) so every value, including the chosen PDFs, survives an error (Law 15). */}
      <form onSubmit={onSubmit} hidden={running} aria-busy={running} className="flex flex-col gap-6">
        <section className={card} aria-labelledby="documents-heading">
          <h2 id="documents-heading" className={heading}>
            Your documents
          </h2>
          <PdfDropZone id="resume" name="resume" label="Resume" what="resume PDF" help={HELP.resume} required error={fieldErrors.resume} />

          <div className="flex flex-col gap-3">
            {!typeCoursesInstead && (
              <PdfDropZone
                id="transcript"
                name="transcript"
                label="Unofficial transcript"
                what="transcript PDF"
                help={HELP.transcript}
                required
                error={fieldErrors.transcript}
              />
            )}
            <label className="inline-flex min-h-11 items-center gap-3 font-sans text-sm text-text">
              <input
                type="checkbox"
                checked={typeCoursesInstead}
                onChange={(e) => setTypeCoursesInstead(e.target.checked)}
                className="h-5 w-5 accent-sage"
              />
              Type my courses instead
            </label>
            {typeCoursesInstead && (
              <Field id="typedCourses" label="Courses" help={HELP.typedCourses}>
                <AutoTextarea
                  id="typedCourses"
                  name="typedCourses"
                  rows={3}
                  spellCheck
                  placeholder="CS 3114 Data Structures and Algorithms, MATH 2114 Introduction to Linear Algebra"
                  aria-describedby="typedCourses-help"
                  aria-invalid={Boolean(fieldErrors.typedCourses)}
                  className={`${inputClass} py-2`}
                />
                {fieldErrors.typedCourses && (
                  <p role="alert" className="font-sans text-sm text-danger">
                    {fieldErrors.typedCourses}
                  </p>
                )}
              </Field>
            )}
          </div>
        </section>

        <section className={card} aria-labelledby="about-heading">
          <h2 id="about-heading" className={heading}>
            About you
          </h2>

          <Field id="major" label="Major" help={HELP.major}>
            <input
              id="major"
              name="major"
              list="major-options"
              required
              spellCheck
              autoComplete="off"
              defaultValue={defaults?.major}
              placeholder="Computer Science Major"
              aria-describedby="major-help"
              className={inputClass}
            />
            <datalist id="major-options">
              {MAJORS.map((major) => (
                <option key={major} value={major} />
              ))}
            </datalist>
          </Field>

          <Field id="gradTerm" label="Graduation term" help={HELP.gradTerm}>
            <input
              id="gradTerm"
              name="gradTerm"
              list="grad-term-options"
              required
              spellCheck
              autoComplete="off"
              pattern="(Spring|Summer|Fall|Winter) \d{4}"
              title="A season and a year, like Spring 2028"
              defaultValue={defaults?.gradTerm}
              placeholder="Spring 2028"
              aria-describedby="gradTerm-help"
              className={inputClass}
            />
            <datalist id="grad-term-options">
              {GRAD_TERMS.map((term) => (
                <option key={term} value={term} />
              ))}
            </datalist>
          </Field>

          <Field id="workAuthorization" label="Work authorization" help={workAuthOption?.help ?? HELP.workAuthorization}>
            <select
              id="workAuthorization"
              name="workAuthorization"
              required
              value={workAuth}
              onChange={(e) => setWorkAuth(e.target.value)}
              aria-describedby="workAuthorization-help"
              className={inputClass}
            >
              <option value="" disabled>
                Choose your status
              </option>
              {WORK_AUTH.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col gap-2">
            <span id="skills-label" className={label}>
              Skills
            </span>
            <SkillsTypeahead name="skills" describedBy="skills-help" />
            <p id="skills-help" className={help}>
              {HELP.skills}
            </p>
          </div>
        </section>

        <section className={card} aria-labelledby="search-heading">
          <h2 id="search-heading" className={heading}>
            Your search
          </h2>

          <ChipToggleGroup
            legend="Role types"
            help={HELP.roleTypes}
            options={ROLE_TYPES}
            selected={roleTypes}
            onToggle={(v) => toggle(roleTypes, setRoleTypes, v)}
            error={fieldErrors.roleTypes}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className={label}>Target term</legend>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor="season" className="font-sans text-xs text-text-dim">
                  Season
                </label>
                <select
                  id="season"
                  name="season"
                  required
                  defaultValue={defaults?.season ?? ""}
                  aria-describedby="targetTerm-help"
                  className={inputClass}
                >
                  <option value="" disabled>
                    Choose a season
                  </option>
                  {SEASONS.map((season) => (
                    <option key={season} value={season}>
                      {season}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label htmlFor="year" className="font-sans text-xs text-text-dim">
                  Year
                </label>
                <input
                  id="year"
                  name="year"
                  type="number"
                  required
                  min={THIS_YEAR}
                  max={THIS_YEAR + 9}
                  defaultValue={defaults?.year ?? undefined}
                  placeholder={String(THIS_YEAR + 1)}
                  aria-describedby="targetTerm-help"
                  className={inputClass}
                />
              </div>
            </div>
            <p id="targetTerm-help" className={help}>
              {HELP.targetTerm}
            </p>
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor="goal" className={label}>
              Your goal
            </label>
            <AutoTextarea
              id="goal"
              name="goal"
              rows={3}
              required
              spellCheck
              maxLength={GOAL_MAX}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="A backend software engineering internship at a company that ships to millions, where I can learn distributed systems."
              aria-describedby="goal-help goal-count"
              className={`${inputClass} py-2`}
            />
            <div className="flex items-start justify-between gap-3">
              <p id="goal-help" className={help}>
                {HELP.goal}
              </p>
              <span id="goal-count" className={`shrink-0 font-sans text-xs tabular-nums ${goal.length >= GOAL_MAX ? "text-danger" : "text-text-dim"}`}>
                {goal.length} / {GOAL_MAX}
              </span>
            </div>
          </div>

          <ChipToggleGroup
            legend="Dream tier"
            help={HELP.dreamTier}
            options={DREAM_TIERS}
            selected={dreamTier}
            onToggle={(v) => toggle(dreamTier, setDreamTier, v)}
            error={fieldErrors.dreamTier}
          />
        </section>

        {error && (
          <p role="alert" className="font-sans text-sm text-danger">
            {error}
          </p>
        )}

        {/* The only primary action on the page (Law 7), right after the last input (Law 8). */}
        <button
          type="submit"
          disabled={running}
          className="inline-flex min-h-12 items-center justify-center self-start rounded-pill bg-sage px-6 font-sans text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          {defaults ? "Rebuild my profile" : "Build my profile"}
        </button>
      </form>
    </div>
  );
}
