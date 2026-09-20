"use client";

import { useId, useState } from "react";
import { normaliseSkill, suggestSkills } from "@/lib/profile-options";

const inputClass =
  "min-h-11 w-full rounded-lg border border-hairline bg-bg px-3 font-sans text-sm text-text placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

/**
 * A chip input for skills, backed by the real vocabulary in
 * lib/profile-options.ts (CONTEXT 20:30 "Profile form"). Every add goes
 * through normaliseSkill: a typo is corrected ("pythn" -> Python), an alias
 * expands ("js" -> JavaScript) and gibberish is refused inline by name, so the
 * hidden field only ever carries recognised skills. `initialSkills` are
 * assumed already normalised (they come from a stored profile).
 */
export function SkillsTypeahead({
  name,
  initialSkills = [],
  describedBy,
}: {
  name: string;
  initialSkills?: string[];
  describedBy?: string;
}) {
  const [skills, setSkills] = useState<string[]>(initialSkills);
  const [draft, setDraft] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const listId = useId();
  const errorId = useId();

  function addSkill(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const result = normaliseSkill(trimmed);
    if (!result.ok) {
      setRefusal(result.reason);
      return;
    }
    setRefusal(null);
    setDraft("");
    if (!skills.includes(result.skill)) setSkills((prev) => [...prev, result.skill]);
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  const matches = suggestSkills(draft, skills, 6);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={JSON.stringify(skills)} />
      {skills.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected skills">
          {skills.map((skill) => (
            <li key={skill}>
              <button
                type="button"
                onClick={() => removeSkill(skill)}
                className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-transparent bg-sage px-4 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
                aria-label={`Remove ${skill}`}
              >
                {skill}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (refusal) setRefusal(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addSkill(draft);
          }
        }}
        onBlur={() => {
          if (draft.trim()) addSkill(draft);
        }}
        placeholder="Type a skill and press Enter"
        spellCheck
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={Boolean(refusal)}
        aria-describedby={[describedBy, refusal ? errorId : null].filter(Boolean).join(" ") || undefined}
        className={`${inputClass} ${refusal ? "border-danger" : ""}`}
      />
      {refusal && (
        <p id={errorId} role="alert" className="font-sans text-sm text-danger">
          {refusal}. Pick one of the suggestions or check the spelling.
        </p>
      )}
      {matches.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Skill suggestions" className="flex flex-wrap gap-2">
          {matches.map((match) => (
            <li key={match}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => addSkill(match)}
                className="inline-flex min-h-11 items-center rounded-pill border border-hairline bg-bg px-4 font-sans text-sm text-text-dim hover:border-sage hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
              >
                {match}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
