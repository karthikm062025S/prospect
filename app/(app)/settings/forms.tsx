"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfileAction, updateTargetAction, type ActionResult } from "./actions";

const INITIAL_STATE: ActionResult = { ok: true };

const label = "font-label text-[11px] uppercase tracking-label text-text-dim";
const inputClass =
  "min-h-11 border border-hairline bg-bg px-2 font-sans text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex min-h-11 items-center self-start rounded-pill bg-text px-5 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function StatusMessage({ state }: { state: ActionResult }) {
  if (state === INITIAL_STATE) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-sage" : "text-danger"}`}>
      {state.ok ? "Saved." : state.error}
    </p>
  );
}

export function ProfileForm({
  fullName,
  school,
  gradTerm,
}: {
  fullName: string;
  school: string;
  gradTerm: string;
}) {
  const [state, formAction] = useActionState(updateProfileAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="full_name" className={label}>
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          maxLength={80}
          defaultValue={fullName}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="school" className={label}>
          School
        </label>
        <input id="school" name="school" maxLength={80} defaultValue={school} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="grad_term" className={label}>
          Graduation term
        </label>
        <input
          id="grad_term"
          name="grad_term"
          maxLength={40}
          placeholder="Spring 2028"
          defaultValue={gradTerm}
          className={inputClass}
        />
      </div>

      <SubmitButton>Save profile</SubmitButton>
      <StatusMessage state={state} />
    </form>
  );
}

export function TargetForm({ monthlyTarget }: { monthlyTarget: number | null }) {
  const [state, formAction] = useActionState(updateTargetAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <label htmlFor="monthly_target" className={label}>
        Monthly application target
      </label>
      <input
        id="monthly_target"
        name="monthly_target"
        type="number"
        min={1}
        max={500}
        defaultValue={monthlyTarget ?? ""}
        className={`${inputClass} max-w-40`}
      />
      <p className="text-sm text-text-dim">Leave empty for no target.</p>
      <SubmitButton>Save target</SubmitButton>
      <StatusMessage state={state} />
    </form>
  );
}
