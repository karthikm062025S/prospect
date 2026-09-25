"use client";

// RoleDetailPane (v5, D26/D28/D31/D32): the right half of the Home split.
// The role should be clickable so the user can see the actual date
// of posting, and an apply link there so I don't come back home".
// Everything the posting says, in place: posted vs added dates (D28, never
// conflated), location, visa, deadline, source, the full apply/save/hide/
// already-applied action row, and the employer's own posting text fetched ON
// DEMAND (D24/A15 — the snapshot never rides in the page payload).
import { useEffect, useState, useTransition } from "react";
import { getRoleJdAction } from "@/app/role-actions";
import { formatDate } from "@/lib/dashboard";
import { relativeDay } from "@/lib/sort";
import type { RoleJd } from "@/lib/role-jd";
import type { CorrectionField } from "@/lib/corrections";
import { SEASON_ORDER, SEASON_LABEL } from "@/lib/season";
import { FAMILY_ORDER, FAMILY_LABEL } from "@/lib/family";
import { JdHtml } from "@/components/jd-html";
import { CompanyAvatar } from "@/components/company-avatar";
import { CorrectionControl, VISA_LABELS } from "@/components/correction-control";
import { LabelsBar } from "@/components/labels-bar";
import {
  ApplyConfirm,
  absoluteDateTime,
  applyPillCls,
  useApplyFlow,
  type ApplyMode,
  type HomeRow,
} from "@/components/role-row";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowClockwiseIcon,
  BookmarkIcon,
  EyeIcon,
  EyeSlashIcon,
  TrashIcon,
} from "@/components/icons";

const VISA_OPTIONS = Object.entries(VISA_LABELS).map(([value, label]) => ({ value, label }));
const SEASON_OPTIONS = SEASON_ORDER.map((value) => ({ value, label: SEASON_LABEL[value] }));
const FAMILY_OPTIONS = FAMILY_ORDER.map((value) => ({ value, label: FAMILY_LABEL[value] }));

// Lane handoffs 2026-09-20 (L9 logged first; adopted here): min-h-11 (44px)
// -- secondary pane actions match the toolbar's pill height (only Apply, the
// lg pill, is taller).
const paneButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-hairline px-3 font-sans text-sm font-medium text-text-dim hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

function Meta({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-label text-[11px] uppercase tracking-label text-text-dim">{label}</dt>
      <dd className="text-[15px] text-text">
        {value}
        {hint ? <span className="block text-[13px] text-text-dim">{hint}</span> : null}
      </dd>
    </div>
  );
}

export function RoleDetailPane({
  row,
  nowMs,
  morphing,
  onConfirmApplied,
  onSave,
  onHide,
  onRequestDelete,
  onBack,
  onCorrectRow,
  onUncorrectRow,
  correctionPending,
  correctionError,
}: {
  row: HomeRow;
  nowMs: number;
  morphing: boolean;
  onConfirmApplied: (id: string, mode: ApplyMode) => void;
  onSave: (id: string, saved: boolean) => void;
  onHide: (id: string, hidden: boolean) => void;
  onRequestDelete: (ids: string[], label: string) => void;
  onBack: () => void;
  // Task 3 T5/K1 (lane L5): the per-user correction control. Both actions are
  // the CALLER's — this pane only trusts their ActionResult, never re-derives
  // validation beyond offering the allowed options (K1/T5).
  onCorrectRow: (roleId: string, field: CorrectionField, value: string) => void;
  onUncorrectRow: (roleId: string, field: CorrectionField) => void;
  correctionPending: ReadonlySet<string>;
  correctionError: string | null;
}) {
  const flow = useApplyFlow(row, onConfirmApplied);
  const isSaved = row.saved_at !== null;
  const isHidden = row.hidden_at !== null;

  // D24 lazy capture: one call per selection (the component is keyed on the
  // role id, so a new selection remounts and refetches). Never throws — the
  // action returns { html, error } and the error renders as text with a retry.
  const [jd, setJd] = useState<RoleJd | null>(null);
  const [, startJd] = useTransition();
  useEffect(() => {
    // No reset needed on the way in: HomeList keys this component on the role
    // id, so a new selection remounts it with jd already back at null.
    let alive = true;
    getRoleJdAction(row.id)
      .then((res) => {
        if (alive) setJd(res);
      })
      .catch(() => {
        if (alive) setJd({ html: null, captured_at: null, error: "network error", location: null });
      });
    return () => {
      alive = false;
    };
  }, [row.id]);

  function retryCapture() {
    setJd(null);
    startJd(async () => {
      const res = await getRoleJdAction(row.id, { force: true }).catch(() => ({
        html: null,
        captured_at: null,
        error: "network error",
        location: null,
      }));
      setJd(res);
    });
  }

  const location = jd?.location ?? row.location;
  // FR-007 + Task 3 T5 decision (L4 handoff): a visa_class correction nulls
  // eligibility_note, so the company_visa_note fallback is suppressed once
  // this caller has corrected visa_class — showing it would read as a stale
  // rules-derived quote next to the caller's own corrected label.
  const isVisaCorrected = row.corrected.includes("visa_class");
  const visaLabel = row.visa_class ? VISA_LABELS[row.visa_class] ?? row.visa_class : "Not listed";
  const visaValue = isVisaCorrected && !row.eligibility_note ? `${visaLabel} (your correction)` : visaLabel;
  const visaHint = row.eligibility_note ?? (isVisaCorrected ? null : row.company_visa_note);

  return (
    <div
      className="flex flex-col gap-4"
      style={morphing ? { viewTransitionName: "role-card" } : undefined}
    >
      <button type="button" onClick={onBack} className={`${paneButton} self-start md:hidden`}>
        <ArrowLeftIcon /> Back
      </button>

      <header className="flex items-start gap-3 border-b border-hairline pb-3">
        <CompanyAvatar name={row.company_name} url={row.company_url} size={40} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] text-text-dim">{row.company_name}</span>
          <h2 className="font-display text-step-2 text-text">{row.title}</h2>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
        <Meta
          label="Posted"
          value={row.posted_at ? formatDate(row.posted_at) : "Not given by the ATS"}
        />
        <Meta
          label="Added"
          value={`${relativeDay(row.created_at, nowMs)} · ${absoluteDateTime(row.created_at)}`}
        />
        <Meta label="Location" value={location ?? "Not listed"} />
        <Meta label="Visa" value={visaValue} hint={visaHint} />
        <Meta label="Deadline" value={row.deadline ? formatDate(row.deadline) : "Not listed"} />
        <Meta label="Source" value={row.source ? row.source[0].toUpperCase() + row.source.slice(1) : "Not listed"} />
      </dl>

      {/* L2c (Match agent, 2026-09-19): only a scored posting gets this
          section at all -- an unscored one (no profile, or ranked before the
          agent ran) shows nothing here, never a placeholder fit score. */}
      {row.matchScore != null ? (
        <section aria-label="Why this matches" className="flex flex-col gap-2 border-t border-hairline pt-3">
          <h3 className="font-label text-[11px] uppercase tracking-label text-text-dim">Why this matches</h3>

          <div className="flex flex-wrap items-center gap-2">
            {row.archetypeName ? (
              // D10: the same chip h26 recipe as role-row.tsx's status chips.
              <span className="inline-flex h-[26px] items-center rounded-pill border border-hairline px-2.5 font-label text-[11px] uppercase tracking-label text-text-dim">
                {row.archetypeName}
              </span>
            ) : null}
            <LabelsBar counts={row.taskLabelCounts ?? null} />
          </div>

          {row.matchReasons && row.matchReasons.length > 0 ? (
            <ul className="flex flex-col gap-1 text-[15px] text-text">
              {row.matchReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}

          {row.requirementsChecked ? (
            <div className="flex flex-col gap-1 text-[13px]">
              {row.requirementsMet && row.requirementsMet.length > 0 ? (
                <p className="text-text">
                  <span className="font-label text-[11px] uppercase tracking-label text-text-dim">Met </span>
                  {row.requirementsMet.join(", ")}
                </p>
              ) : null}
              {row.requirementsUnknown && row.requirementsUnknown.length > 0 ? (
                <p className="text-text-dim">
                  <span className="font-label text-[11px] uppercase tracking-label text-text-dim">Unknown </span>
                  {row.requirementsUnknown.join(", ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[13px] text-text-dim">Requirements not yet checked for this posting.</p>
          )}

          {row.beforeYouApply && row.beforeYouApply.length > 0 ? (
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="font-label text-[11px] uppercase tracking-label text-text-dim">Before you apply</span>
              <ul className="flex flex-col gap-0.5 text-text">
                {row.beforeYouApply.map((node) => (
                  <li key={node.id}>
                    {node.title} <span className="text-text-dim">- {node.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Task 3 T5/K1 (lane L5, FR-008): a signed-in user corrects a wrong
          season/family/sponsorship label for their own view only — never a
          write to the shared roles row (K1/T5, app/role-actions.ts
          correctRoleAction/uncorrectRoleAction). Native <select>s give
          keyboard focus and arrow-key selection for free. */}
      <fieldset className="flex flex-col gap-3 border-t border-hairline pt-3 sm:flex-row sm:flex-wrap">
        <legend className="mb-1 w-full font-label text-[11px] uppercase tracking-label text-text-dim sm:mb-0">
          Not right?
        </legend>
        <CorrectionControl
          label="Season"
          field="season"
          value={row.season}
          isCorrected={row.corrected.includes("season")}
          options={SEASON_OPTIONS}
          pending={correctionPending.has(`${row.id}:season`)}
          onCorrect={(field, value) => onCorrectRow(row.id, field, value)}
          onUncorrect={(field) => onUncorrectRow(row.id, field)}
        />
        <CorrectionControl
          label="Role"
          field="family"
          value={row.family}
          isCorrected={row.corrected.includes("family")}
          options={FAMILY_OPTIONS}
          pending={correctionPending.has(`${row.id}:family`)}
          onCorrect={(field, value) => onCorrectRow(row.id, field, value)}
          onUncorrect={(field) => onUncorrectRow(row.id, field)}
        />
        <CorrectionControl
          label="Sponsorship"
          field="visa_class"
          value={row.visa_class}
          isCorrected={isVisaCorrected}
          options={VISA_OPTIONS}
          pending={correctionPending.has(`${row.id}:visa_class`)}
          onCorrect={(field, value) => onCorrectRow(row.id, field, value)}
          onUncorrect={(field) => onUncorrectRow(row.id, field)}
        />
      </fieldset>
      {correctionError ? (
        <p role="alert" className="text-[13px] text-danger">
          {correctionError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-y border-hairline py-3">
        {flow.state === "confirming" ? (
          <ApplyConfirm flow={flow} />
        ) : (
          <>
            {row.href ? (
              <a href={row.href} target="_blank" rel="noreferrer" onClick={flow.arm} className={applyPillCls}>
                Apply <ArrowSquareOutIcon />
              </a>
            ) : (
              <button type="button" onClick={flow.arm} className={applyPillCls}>
                Apply
              </button>
            )}
            <button type="button" onClick={flow.openConfirm} className={paneButton}>
              Already applied
            </button>
            <button
              type="button"
              onClick={() => onSave(row.id, !isSaved)}
              aria-pressed={isSaved}
              className={`${paneButton} ${isSaved ? "text-sage" : ""}`}
            >
              <BookmarkIcon filled={isSaved} /> {isSaved ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => onHide(row.id, !isHidden)}
              aria-pressed={isHidden}
              className={paneButton}
            >
              {isHidden ? <EyeIcon /> : <EyeSlashIcon />} {isHidden ? "Unhide" : "Hide"}
            </button>
            <button
              type="button"
              onClick={() => onRequestDelete([row.id], `${row.company_name} ${row.title}`)}
              className={`${paneButton} hover:text-danger`}
            >
              <TrashIcon /> Remove
            </button>
          </>
        )}
      </div>

      {flow.localError ? (
        <p role="alert" className="text-[13px] text-danger">
          {flow.localError.message}{" "}
          <button
            type="button"
            onClick={flow.retryLocal}
            className="min-h-11 font-sans text-sm text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            Retry
          </button>
        </p>
      ) : null}

      <section aria-label="The posting" className="flex flex-col gap-2">
        <h3 className="font-label text-[11px] uppercase tracking-label text-text-dim">
          The posting
          {jd?.captured_at ? (
            <span className="ml-2 normal-case text-text-dim">Captured {formatDate(jd.captured_at)}</span>
          ) : null}
        </h3>
        <div className="min-w-0 max-w-[78ch] break-words text-[15px] leading-[1.6] text-text">
          {jd === null ? (
            // Loading skeleton: three shimmer-free bars (globals.css collapses
            // animation under reduced motion; these are static by design).
            <div aria-busy="true" aria-label="Loading the posting" className="flex flex-col gap-2">
              <span className="block h-3 w-2/3 bg-hairline" />
              <span className="block h-3 w-full bg-hairline" />
              <span className="block h-3 w-5/6 bg-hairline" />
            </div>
          ) : jd.html ? (
            <JdHtml html={jd.html} />
          ) : (
            <div className="flex flex-col items-start gap-2 text-text-dim">
              <p className="text-[13px]">{jd.error ?? "No posting captured yet."}</p>
              <button type="button" onClick={retryCapture} className={paneButton}>
                <ArrowClockwiseIcon /> Retry capture
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
