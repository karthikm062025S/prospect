"use client";

import { useId, useState } from "react";

const inputClass =
  "min-h-11 w-full border border-hairline bg-bg px-2 font-sans text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

/**
 * A chip input for skills. `suggestions` is the ONLY source of autocomplete
 * options -- the skills already parsed from the student's own resume, passed
 * in by the caller. There is no hardcoded skill list: with an empty
 * `suggestions` array (e.g. before a resume has been parsed) this is a plain
 * free-text chip input.
 */
export function SkillsTypeahead({
  name,
  suggestions = [],
  initialSkills = [],
}: {
  name: string;
  suggestions?: string[];
  initialSkills?: string[];
}) {
  const [skills, setSkills] = useState<string[]>(initialSkills);
  const [draft, setDraft] = useState("");
  const listId = useId();

  function addSkill(raw: string) {
    const skill = raw.trim();
    if (!skill || skills.includes(skill)) return;
    setSkills((prev) => [...prev, skill]);
    setDraft("");
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  const matches = suggestions
    .filter((s) => !skills.includes(s) && s.toLowerCase().includes(draft.trim().toLowerCase()))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={JSON.stringify(skills)} />
      {skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected skills">
          {skills.map((skill) => (
            <li key={skill}>
              <button
                type="button"
                onClick={() => removeSkill(skill)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-text-dim px-3.5 text-[13px] font-medium text-text hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addSkill(draft);
          }
        }}
        placeholder="Add a skill and press Enter"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className={inputClass}
      />
      {matches.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Skill suggestions" className="flex flex-wrap gap-1.5">
          {matches.map((match) => (
            <li key={match}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => addSkill(match)}
                className="inline-flex min-h-11 items-center rounded-full border border-hairline px-3.5 text-[13px] text-text-dim hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
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
