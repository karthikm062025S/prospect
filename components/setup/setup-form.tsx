"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AutoTextarea } from "@/components/auto-textarea";
import { SkillsTypeahead } from "@/components/skills-typeahead";
import { LoadingSteps, type StepKey, type StepState } from "@/components/loading-steps";
import { ChipToggleGroup } from "./chip-toggle-group";
import type { ProfileForm } from "@/lib/agents/profile";

// Duplicated from lib/agents/profile.ts (not imported): that module also
// exports runProfileAgent, whose Gemini/Lakebase calls must never reach the
// client bundle. A type-only import of ProfileForm below is erased at compile
// time and carries no such risk; these two short literal tuples are the only
// values this form needs from that module, so they're copied here instead.
const ROLE_TYPES = ["internship", "co-op", "full-time", "research"] as const;
const DREAM_TIERS = ["FAANG", "Big 4", "startups", "research labs", "government"] as const;
const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

const label = "font-label text-[11px] uppercase tracking-label text-text-dim";
const inputClass =
  "min-h-11 w-full border border-hairline bg-bg px-2 font-sans text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

const INITIAL_STEPS: Record<StepKey, StepState> = {
  transcript: { status: "pending" },
  resume: { status: "pending" },
  profile: { status: "pending" },
};

export function SetupForm() {
  const router = useRouter();
  const [typeCoursesInstead, setTypeCoursesInstead] = useState(false);
  const [roleTypes, setRoleTypes] = useState<string[]>([]);
  const [dreamTier, setDreamTier] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [stepStates, setStepStates] = useState<Record<StepKey, StepState>>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);

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
    if (!typeCoursesInstead && (!(transcript instanceof File) || transcript.size === 0)) {
      setError("Upload your unofficial transcript, or check \"type my courses instead\".");
      return;
    }
    if (typeCoursesInstead && !typedCourses.trim()) {
      setError("Type at least one course, or upload your transcript instead.");
      return;
    }
    if (roleTypes.length === 0) {
      setError("Pick at least one role type.");
      return;
    }
    if (dreamTier.length === 0) {
      setError("Pick at least one dream tier.");
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
      goal: String(data.get("goal") ?? ""),
      dreamTier: dreamTier as ProfileForm["dreamTier"],
      skills,
    };

    const payload = new FormData();
    payload.set("profile", JSON.stringify(form));
    if (resume instanceof File && resume.size > 0) payload.set("resume", resume);
    if (!typeCoursesInstead && transcript instanceof File) payload.set("transcript", transcript);
    if (typeCoursesInstead) payload.set("typedCourses", typedCourses);

    setSubmitting(true);
    setStepStates({ transcript: { status: "running" }, resume: { status: "pending" }, profile: { status: "pending" } });

    try {
      const response = await fetch("/api/profile", { method: "POST", body: payload });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? `Request failed (${response.status})`);
        setSubmitting(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const order: StepKey[] = ["transcript", "resume", "profile"];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { step?: StepKey; label?: string; count?: number; error?: string; done?: boolean };
          if (event.error) {
            setError(event.error);
            setStepStates((prev) => {
              const next = { ...prev };
              const running = order.find((key) => next[key].status === "running") ?? order[0];
              next[running] = { status: "error", message: event.error! };
              return next;
            });
            setSubmitting(false);
            return;
          }
          if (event.done) {
            router.push("/");
            return;
          }
          if (event.step) {
            setStepStates((prev) => {
              const next: Record<StepKey, StepState> = {
                ...prev,
                [event.step as StepKey]: { status: "done", label: event.label ?? "", count: event.count ?? 0 },
              };
              const nextIndex = order.indexOf(event.step as StepKey) + 1;
              if (nextIndex < order.length) next[order[nextIndex]] = { status: "running" };
              return next;
            });
          }
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-raised p-6 shadow-sm ring-1 ring-hairline">
        <h2 className="font-display text-step-2 text-text">Building your profile</h2>
        <LoadingSteps states={stepStates} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl bg-raised p-4 shadow-sm ring-1 ring-hairline">
        <h2 className="font-display text-step-2 text-text">Resume</h2>
        <label htmlFor="resume" className={label}>
          Resume (PDF)
        </label>
        <input id="resume" name="resume" type="file" accept="application/pdf" required className={inputClass} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-raised p-4 shadow-sm ring-1 ring-hairline">
        <h2 className="font-display text-step-2 text-text">Transcript</h2>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={typeCoursesInstead}
            onChange={(e) => setTypeCoursesInstead(e.target.checked)}
            className="h-5 w-5 accent-sage"
          />
          Type my courses instead
        </label>
        {typeCoursesInstead ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="typedCourses" className={label}>
              Courses
            </label>
            <AutoTextarea
              id="typedCourses"
              name="typedCourses"
              placeholder="CS 3114 Data Structures and Algorithms, MATH 2114 ..."
              className={inputClass}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="transcript" className={label}>
              Unofficial transcript (PDF)
            </label>
            <input id="transcript" name="transcript" type="file" accept="application/pdf" className={inputClass} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-raised p-4 shadow-sm ring-1 ring-hairline">
        <h2 className="font-display text-step-2 text-text">About you</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="major" className={label}>
            Major
          </label>
          <input id="major" name="major" required className={inputClass} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="gradTerm" className={label}>
            Graduation term
          </label>
          <input id="gradTerm" name="gradTerm" required placeholder="Spring 2028" className={inputClass} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="workAuthorization" className={label}>
            Work authorization
          </label>
          <input id="workAuthorization" name="workAuthorization" required placeholder="F-1 (CPT/OPT)" className={inputClass} />
        </div>

        <div className="flex flex-col gap-1">
          <span className={label}>Skills</span>
          <SkillsTypeahead name="skills" />
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-raised p-4 shadow-sm ring-1 ring-hairline">
        <h2 className="font-display text-step-2 text-text">Your search</h2>

        <ChipToggleGroup
          legend="Role types"
          options={ROLE_TYPES}
          selected={roleTypes}
          onToggle={(v) => toggle(roleTypes, setRoleTypes, v)}
        />

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="season" className={label}>
              Target season
            </label>
            <select id="season" name="season" required defaultValue="" className={inputClass}>
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
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="year" className={label}>
              Target year
            </label>
            <input id="year" name="year" type="number" required min={2026} max={2035} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="goal" className={label}>
            Your goal, in one sentence
          </label>
          <AutoTextarea id="goal" name="goal" required maxLength={280} className={inputClass} />
        </div>

        <ChipToggleGroup
          legend="Dream tier"
          options={DREAM_TIERS}
          selected={dreamTier}
          onToggle={(v) => toggle(dreamTier, setDreamTier, v)}
        />
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center self-start rounded-pill bg-text px-5 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
      >
        Build my profile
      </button>
    </form>
  );
}
