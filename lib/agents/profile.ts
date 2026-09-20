import { z } from "zod";
// UI/UX D-UI5: the form constants live in lib/profile-options.ts (pure, no
// imports) so the /setup client and this schema read the same values. The
// explicit .ts suffix is D24: Node tests load this file directly.
import { GOAL_MAX, WORK_AUTH_VALUES, normaliseSkill } from "../profile-options.ts";

// ponytail: "../gemini" and "../student-profile" are imported DYNAMICALLY inside
// runProfileAgent, never as a static top-level import. A static extensionless
// value import between two lib/*.ts files throws ERR_MODULE_NOT_FOUND the
// moment `node --experimental-strip-types --test` loads a test that imports
// THIS file directly (proven pattern, see lib/role-jd.ts's defaultCapture).
// The pure pieces below (schema, labels, encoder) have no such import and are
// what tests/profile-agent.test.ts exercises directly.

export const ROLE_TYPES = ["internship", "co-op", "full-time", "research"] as const;
export const DREAM_TIERS = ["FAANG", "Big 4", "startups", "research labs", "government"] as const;

export type ProfileForm = {
  major: string;
  gradTerm: string;
  /** One of WORK_AUTH_VALUES; kept `string` here so callers building a form from argv (scripts/) compile, the schema enforces the enum. */
  workAuthorization: string;
  roleTypes: Array<(typeof ROLE_TYPES)[number]>;
  targetTerm: { season: string; year: number };
  goal: string;
  dreamTier: Array<(typeof DREAM_TIERS)[number]>;
  /** Skills typed into the onboarding typeahead, merged with the resume-parsed skills. */
  skills?: string[];
};

// The onboarding form's own fields (no courses/experiences -- those come only
// from the PDFs; `skills` here is the typed-in extra, merged with the resume's
// parsed skills in runProfileAgent). Shared by the /setup client and
// app/api/profile/route.ts so the 400 "bad form" check and the client
// validation never drift apart.
export const ProfileFormSchema = z.object({
  major: z.string().min(1, "major is required"),
  gradTerm: z.string().min(1, "gradTerm is required"),
  workAuthorization: z.enum(WORK_AUTH_VALUES, { error: "workAuthorization must be one of the listed statuses" }),
  roleTypes: z.array(z.enum(ROLE_TYPES)).min(1, "roleTypes is required"),
  targetTerm: z.object({ season: z.string().min(1), year: z.number().int() }),
  goal: z.string().min(1, "goal is required").max(GOAL_MAX, `goal is over ${GOAL_MAX} characters`),
  dreamTier: z.array(z.enum(DREAM_TIERS)).min(1, "dreamTier is required"),
  // Each typed skill is fuzzy-corrected against the vocabulary or refused by
  // name (CONTEXT 20:30: "normalised once more server-side").
  skills: z
    .array(
      z.string().transform((raw, ctx) => {
        const result = normaliseSkill(raw);
        if (!result.ok) {
          ctx.addIssue({ code: "custom", message: result.reason });
          return z.NEVER;
        }
        return result.skill;
      }),
    )
    .optional(),
});

export type ProfileAgentInput = {
  userId: string;
  resumePdf?: Uint8Array;
  transcriptPdf?: Uint8Array;
  typedCourses?: string;
  form: ProfileForm;
};

export type ProfileStep = {
  step: "transcript" | "resume" | "profile";
  label: string;
  count: number;
};

const CourseSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  term: z.string().optional(),
  grade: z.string().optional(),
});

const ExperienceSchema = z.object({
  org: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
});

const ProfileFields = z.object({
  major: z.string().min(1),
  gradTerm: z.string().min(1),
  workAuthorization: z.string().min(1),
  courses: z.array(CourseSchema),
  skills: z.array(z.string()),
  experiences: z.array(ExperienceSchema),
  roleTypes: z.array(z.enum(ROLE_TYPES)),
  targetTerm: z.object({ season: z.string().min(1), year: z.number().int() }),
  goal: z.string().min(1),
  dreamTier: z.array(z.enum(DREAM_TIERS)),
});

export type ProfileOutput = z.infer<typeof ProfileFields>;

/**
 * The validation gate for a parsed profile. A factory (not a bare object) because
 * the zero-courses check needs to know whether the student typed courses instead
 * of uploading a transcript -- that context lives outside the candidate payload.
 * Zero courses from BOTH the transcript and the typed-courses fallback is a named,
 * loud error, never a silently empty roadmap input.
 */
export function ProfileSchema(opts: { typedCourses?: string } = {}) {
  const hasTypedCourses = Boolean(opts.typedCourses && opts.typedCourses.trim().length > 0);
  return ProfileFields.superRefine((value, ctx) => {
    if (value.courses.length === 0 && !hasTypedCourses) {
      ctx.addIssue({
        code: "custom",
        path: ["courses"],
        message: "Transcript parse found 0 courses in transcript.pdf",
      });
    }
  });
}

/** "CS3114" / "cs 3114" / "CS-3114" -> "CS 3114". Unrecognized shapes pass through unchanged. */
export function normalizeCourseCode(raw: string): string {
  const match = raw.trim().toUpperCase().match(/^([A-Z]{2,4})[\s-]*(\d{3,4}[A-Z]?)$/);
  return match ? `${match[1]} ${match[2]}` : raw.trim();
}

export function courseCountLabel(count: number): string {
  return `${count} course${count === 1 ? "" : "s"} found`;
}

export function skillsExperienceLabel(skills: number, experiences: number): string {
  return `${skills} skill${skills === 1 ? "" : "s"}, ${experiences} experience${experiences === 1 ? "" : "s"} found`;
}

/** One NDJSON line: `{"step":...,"label":...,"count":...}\n`. */
export function encodeStepLine(step: ProfileStep): string {
  return `${JSON.stringify(step)}\n`;
}

/**
 * PDFs + form -> a validated profile row in Lakebase. Not covered by the unit
 * suite (it calls the real Gemini API and the real DB) -- see scripts/profile-smoke.ts
 * for the live proof path and the handoff for what ran.
 */
export async function runProfileAgent(
  input: ProfileAgentInput,
  onStep: (step: ProfileStep) => void,
): Promise<ProfileOutput> {
  const { startAgentRun, finishAgentRun, upsertProfile } = await import("../student-profile");
  const { gemini, MODEL_PARSE } = await import("../gemini");

  const runId = await startAgentRun("profile", input.userId);

  try {
    // The two PDF parses are independent: run them at once (measured 2026-09-20:
    // sequential = 47-70 s per profile, both on the Pro parse model).
    const [courses, { skills: parsedSkills, experiences }] = await Promise.all([
      extractCourses(gemini, MODEL_PARSE, input.transcriptPdf, input.typedCourses).then((result) => {
        onStep({ step: "transcript", label: courseCountLabel(result.length), count: result.length });
        return result;
      }),
      extractResume(gemini, MODEL_PARSE, input.resumePdf),
    ]);
    // Onboarding's skills typeahead lets a student add skills the resume parse
    // missed; merged and deduped here rather than dropped on the floor.
    const skills = Array.from(new Set([...parsedSkills, ...(input.form.skills ?? [])]));
    onStep({
      step: "resume",
      label: skillsExperienceLabel(skills.length, experiences.length),
      count: skills.length + experiences.length,
    });

    const candidate = {
      // The three facts come from the form and win over anything the PDF said.
      major: input.form.major,
      gradTerm: input.form.gradTerm,
      workAuthorization: input.form.workAuthorization,
      courses,
      skills,
      experiences,
      roleTypes: input.form.roleTypes,
      targetTerm: input.form.targetTerm,
      goal: input.form.goal,
      dreamTier: input.form.dreamTier,
    };
    const profile = ProfileSchema({ typedCourses: input.typedCourses }).parse(candidate);

    await upsertProfile(input.userId, profile, runId);
    onStep({ step: "profile", label: "profile saved", count: 1 });

    await finishAgentRun(runId, {
      status: "ok",
      counts: { courses: courses.length, skills: skills.length, experiences: experiences.length },
    });
    return profile;
  } catch (error) {
    // The real failure is rethrown either way; a failed audit write is logged,
    // never left to mask the real error the caller is about to see.
    await finishAgentRun(runId, { status: "error", error: (error as Error).message }).catch((auditError) =>
      console.error("runProfileAgent: finishAgentRun failed while recording an error", auditError),
    );
    throw error;
  }
}

type GeminiClient = ReturnType<typeof import("../gemini").gemini>;

async function extractCourses(
  gemini: () => GeminiClient,
  model: string,
  transcriptPdf: Uint8Array | undefined,
  typedCourses: string | undefined,
): Promise<z.infer<typeof CourseSchema>[]> {
  if (!transcriptPdf && !typedCourses) return [];
  const parts = transcriptPdf
    ? [{ inlineData: { data: Buffer.from(transcriptPdf).toString("base64"), mimeType: "application/pdf" } }]
    : [{ text: typedCourses ?? "" }];
  const response = await gemini().models.generateContent({
    model,
    contents: [
      ...parts,
      {
        text: "Extract every completed or in-progress course from this unofficial transcript (or typed course list). Return ONLY a JSON array of {code, title, term, grade}. Normalize course codes like 'CS 3114' (subject, space, number).",
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            code: { type: "STRING" },
            title: { type: "STRING" },
            term: { type: "STRING" },
            grade: { type: "STRING" },
          },
          required: ["code", "title"],
        },
      },
    },
  });
  const raw = JSON.parse(response.text ?? "[]") as Array<{ code: string; title: string; term?: string; grade?: string }>;
  return raw.map((course) => ({ ...course, code: normalizeCourseCode(course.code) }));
}

async function extractResume(
  gemini: () => GeminiClient,
  model: string,
  resumePdf: Uint8Array | undefined,
): Promise<{ skills: string[]; experiences: z.infer<typeof ExperienceSchema>[] }> {
  if (!resumePdf) return { skills: [], experiences: [] };
  const response = await gemini().models.generateContent({
    model,
    contents: [
      { inlineData: { data: Buffer.from(resumePdf).toString("base64"), mimeType: "application/pdf" } },
      { text: "Extract this resume's skills (a flat list of strings) and experiences ({org, title, summary}). Return ONLY JSON {skills, experiences}." },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          skills: { type: "ARRAY", items: { type: "STRING" } },
          experiences: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                org: { type: "STRING" },
                title: { type: "STRING" },
                summary: { type: "STRING" },
              },
              required: ["org", "title", "summary"],
            },
          },
        },
        required: ["skills", "experiences"],
      },
    },
  });
  return JSON.parse(response.text ?? '{"skills":[],"experiences":[]}');
}
