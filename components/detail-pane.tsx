"use client";

// DetailPane (doc 4 §6, RB-022/023): header (company, role, status select,
// stale badge) + native <details> sections — Notes, Resume used, Follow-up,
// Posting data (with the JD snapshot), Timeline (RB-081). Every field
// autosaves through a result-returning action with its own SaveIndicator;
// status goes through setApplicationStatusAction (the ONE writer, RB-026).
//
// v5 (D29/D31): round company mark, one merged Timeline (applied marker +
// events + manual entries) with an Add form beside the Notes section, prose
// fields that grow with their content, and the bigger 15px type scale.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  recaptureJdAction,
  setApplicationStatusAction,
  updateApplicationDetailsAction,
  type JdCaptureResult,
} from "@/app/actions";
import { addTimelineEntryAction, deleteTimelineEntryAction } from "@/app/timeline-actions";
import { getApplicationJdAction } from "@/app/application-actions";
import type { ApplicationJd } from "@/lib/application-jd";
import { formatDate } from "@/lib/dashboard";
import {
  buildTimeline,
  type ApplicationsRow,
  type TimelineItem,
} from "@/lib/applications-list";
import { isStale } from "@/lib/stale";
import {
  isNoSponsorship,
  safeHttpUrl,
  type AppStatus,
  type EventRow,
} from "@/lib/types";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CalendarCheckIcon,
  CaretDownIcon,
  ClockCountdownIcon,
  FileTextIcon,
  NotePencilIcon,
  TrashIcon,
} from "@/components/icons";
import { AutoTextarea } from "@/components/auto-textarea";
import { CompanyAvatar } from "@/components/company-avatar";
import { JdHtml } from "@/components/jd-html";
import { SaveIndicator, useFieldSave } from "@/components/save-indicator";
import { StaleBadge } from "@/components/stale-badge";
import { absoluteDateTime } from "@/components/role-row";

// TRD §3: the settable set; legacy `withdrawn` renders with a label only.
const STATUS_OPTIONS: AppStatus[] = ["applied", "oa", "interviewing", "offer", "rejected"];
export const STATUS_LABELS: Record<AppStatus, string> = {
  applied: "Applied",
  oa: "OA",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const selectCls =
  "min-h-11 border border-hairline bg-transparent px-1 font-label text-[11px] uppercase tracking-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:text-text-dim";
const fieldCls =
  "min-h-11 w-full border border-hairline bg-transparent px-2 py-2 text-[15px] leading-relaxed text-text placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";
const actionCls =
  "inline-flex min-h-11 items-center gap-1 px-2 font-sans text-sm font-medium text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:text-text-dim disabled:no-underline";
const quietCls =
  "inline-flex min-h-11 items-center gap-1 px-2 font-sans text-sm font-medium text-text-dim hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed";
const labelCls = "font-label text-[11px] uppercase tracking-label text-text-dim";
// L8 audit item 1 (D19.2, feel.md): opacity + 4px rise, native @starting-style
// + transition-behavior: allow-discrete (Tailwind's `starting:`/
// `transition-discrete`, v4.1+) — no library. Open is the strong ease-out
// curve at 150-200ms; close reuses the house exit curve (role-row.tsx
// EXIT_MS) at 120ms — the asymmetric duration/easing comes from declaring it
// on `open:` (the "after" style wins the transition it starts). Falls back
// to an instant open/close in browsers without @starting-style support.
// motion-reduce:transition-none is redundant with globals.css's blanket
// prefers-reduced-motion rule but kept for the same explicitness as
// components/feedback-box.tsx's existing dialog transition.
const dialogMotion =
  "translate-y-1 opacity-0 open:translate-y-0 open:opacity-100 transition-discrete transition-[opacity,transform,overlay,display] duration-[120ms] ease-[cubic-bezier(0.4,0,1,1)] open:duration-[180ms] open:ease-[cubic-bezier(0.23,1,0.32,1)] open:starting:translate-y-1 open:starting:opacity-0 backdrop:opacity-0 open:backdrop:opacity-100 backdrop:transition-discrete backdrop:transition-[opacity,overlay,display] backdrop:duration-[120ms] open:backdrop:duration-[180ms] open:backdrop:starting:opacity-0 motion-reduce:transition-none";

export function DetailPane({
  app,
  events,
  nowMs,
  onRequestDelete,
  onBack,
}: {
  app: ApplicationsRow;
  events: EventRow[];
  nowMs: number;
  onRequestDelete: () => void;
  onBack: () => void;
}) {
  // --- status (the one writer) --------------------------------------------
  const statusSave = useFieldSave();
  const [status, setStatus] = useState<AppStatus>(app.status);
  const [seenStatus, setSeenStatus] = useState(app.status);
  if (app.status !== seenStatus) {
    // Reset-during-render: the server caught up (own save, auto-flip, undo).
    setSeenStatus(app.status);
    setStatus(app.status);
  }
  function changeStatus(next: AppStatus) {
    const previous = status;
    void statusSave.run(async () => {
      // Set inside the thunk so a Retry re-shows `next` (a failed attempt
      // reverted it) instead of flickering the old value while retrying.
      setStatus(next);
      const res = await setApplicationStatusAction(app.id, next);
      if (!res.ok) setStatus(previous);
      return res;
    });
  }
  const stale = isStale({ status, status_changed_at: app.status_changed_at }, nowMs);

  // --- detail fields (never touch the ghosting clock) ---------------------
  const notesSave = useFieldSave();
  const [notes, setNotes] = useState(app.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(app.notes ?? "");
  function saveNotes() {
    if (notes === savedNotes) return;
    setSavedNotes(notes);
    void notesSave.run(() => updateApplicationDetailsAction(app.id, { notes }));
  }

  const resumeSave = useFieldSave();
  const [resumeFile, setResumeFile] = useState(app.resume_file ?? "");
  const [savedResumeFile, setSavedResumeFile] = useState(app.resume_file ?? "");
  function saveResumeFile() {
    if (resumeFile === savedResumeFile) return;
    setSavedResumeFile(resumeFile);
    void resumeSave.run(() => updateApplicationDetailsAction(app.id, { resume_file: resumeFile }));
  }

  const followSave = useFieldSave();
  const [followUp, setFollowUp] = useState(app.follow_up_at ?? "");
  function changeFollowUp(next: string) {
    setFollowUp(next);
    void followSave.run(() => updateApplicationDetailsAction(app.id, { follow_up_at: next }));
  }

  const nextSave = useFieldSave();
  const [nextAction, setNextAction] = useState(app.next_action ?? "");
  const [savedNextAction, setSavedNextAction] = useState(app.next_action ?? "");
  function saveNextAction() {
    if (nextAction === savedNextAction) return;
    setSavedNextAction(nextAction);
    void nextSave.run(() => updateApplicationDetailsAction(app.id, { next_action: nextAction }));
  }

  // --- JD snapshot (RB-015, TRD §6) ----------------------------------------
  // Fetched ON DEMAND for the selected application (A15): the page payload
  // carries jd_snapshot_at, never the posting itself. ApplicationsSplit keys
  // this component on the application id, so a new selection remounts and
  // refetches — the same shape components/role-detail-pane.tsx uses.
  const [jd, setJd] = useState<ApplicationJd | null>(null);
  useEffect(() => {
    let alive = true;
    getApplicationJdAction(app.id)
      .then((res) => {
        if (alive) setJd(res);
      })
      .catch(() => {
        if (alive) setJd({ html: null, captured_at: null });
      });
    return () => {
      alive = false;
    };
  }, [app.id]);

  const [capturing, setCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<JdCaptureResult | null>(null);
  function recapture() {
    setCapturing(true);
    setCaptureResult(null);
    recaptureJdAction(app.id)
      .catch(() => ({ ok: false as const, error: "network error" }))
      .then((res) => {
        setCaptureResult(res);
        // The action wrote a new snapshot server-side; the pane only holds the
        // OLD one, so re-read rather than re-render stale text.
        if (res.ok) return getApplicationJdAction(app.id).then(setJd, () => {});
      })
      .finally(() => setCapturing(false));
  }
  // The page payload still carries jd_snapshot_at, so the "captured" stamp can
  // render before the snapshot itself lands; the fetched value wins after.
  const capturedAt = jd?.captured_at ?? app.jd_snapshot_at;
  const postingHref = safeHttpUrl(app.jd_link);
  const noSponsorship = isNoSponsorship(app.visa_flag);

  return (
    <article aria-label={`${app.company_name} ${app.role}`} className="flex flex-col gap-1">
      <header className="flex flex-col gap-3 border-b border-hairline pb-4">
        <button type="button" onClick={onBack} className={`${quietCls} -ml-2 self-start md:hidden`}>
          <ArrowLeftIcon /> All applications
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <CompanyAvatar name={app.company_name} url={app.careers_url ?? app.jd_link} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium leading-snug text-text">{app.role}</div>
            <span className="text-[13px] text-text-dim">{app.company_name}</span>
          </div>
        </div>
        {/* Stage controls on one line, then the dates row — the header reads
            top-down: who → where it stands → when (D31 spacing pass). */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Status"
            value={status}
            disabled={statusSave.state === "saving"}
            onChange={(e) => changeStatus(e.target.value as AppStatus)}
            className={selectCls}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
            {status === "withdrawn" ? (
              <option value="withdrawn" disabled>
                {STATUS_LABELS.withdrawn} (legacy)
              </option>
            ) : null}
          </select>
          {stale ? <StaleBadge /> : null}
          <SaveIndicator state={statusSave.state} error={statusSave.error} onRetry={statusSave.retry} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 font-mono text-[11px] text-text-dim">
          <span>
            Applied <span className="text-text">{formatDate(app.date_applied)}</span>
          </span>
          {app.posted_at ? (
            <span>
              Posted <span className="text-text">{formatDate(app.posted_at)}</span>
            </span>
          ) : null}
          {/* Visa warnings are never visually dropped (carried from the old card). */}
          {noSponsorship ? (
            <span className="font-bold uppercase tracking-wide text-danger">No sponsorship</span>
          ) : app.visa_flag ? (
            <span>{app.visa_flag}</span>
          ) : null}
          <button
            type="button"
            onClick={onRequestDelete}
            className="ml-auto inline-flex min-h-11 items-center gap-1 px-2 font-sans text-sm font-medium text-text-dim transition-colors duration-[120ms] hover:text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <TrashIcon /> Delete
          </button>
        </div>
      </header>

      <Section icon={<NotePencilIcon />} title="Notes" meta={notes.trim() ? "" : "Empty"}>
        <div className="flex flex-col gap-1">
          {/* v5: Enter is a newline here, and the box grows with the text. */}
          <AutoTextarea
            aria-label="Notes"
            value={notes}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Anything worth remembering about this one."
            className={fieldCls}
          />
          <SaveIndicator state={notesSave.state} error={notesSave.error} onRetry={notesSave.retry} />
        </div>
      </Section>

      <Section icon={<FileTextIcon />} title="Resume used" meta={resumeFile.trim() || "Empty"}>
        <div className="flex flex-col gap-1">
          {/* note: free text, not a file. The app stores WHICH resume went
              out, never the PDF — uploads stay cut. Add a
              picker only if a stored-file library ever lands. */}
          <input
            type="text"
            aria-label="Resume used"
            value={resumeFile}
            onChange={(e) => setResumeFile(e.target.value)}
            onBlur={saveResumeFile}
            placeholder="e.g. john_doe_resume_swe"
            className={fieldCls}
          />
          <SaveIndicator state={resumeSave.state} error={resumeSave.error} onRetry={resumeSave.retry} />
        </div>
      </Section>

      <Section icon={<CalendarCheckIcon />} title="Follow-up" meta={followUp ? formatDate(followUp) : "None"}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex min-h-11 items-center gap-2 ${labelCls}`}>
              Date
              <input
                type="date"
                value={followUp}
                disabled={followSave.state === "saving"}
                onChange={(e) => changeFollowUp(e.target.value)}
                className={`${selectCls} normal-case`}
              />
            </label>
            <SaveIndicator state={followSave.state} error={followSave.error} onRetry={followSave.retry} />
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Next action</span>
            <AutoTextarea
              value={nextAction}
              rows={1}
              onChange={(e) => setNextAction(e.target.value)}
              onBlur={saveNextAction}
              placeholder="e.g. nudge the recruiter"
              className={fieldCls}
            />
          </label>
          <SaveIndicator state={nextSave.state} error={nextSave.error} onRetry={nextSave.retry} />
        </div>
      </Section>

      <Section
        icon={<ArrowSquareOutIcon />}
        title="Posting data"
        meta={jd === null ? "Loading…" : jd.html ? "Captured" : "Not captured"}
      >
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 break-words font-mono text-[11px]">
            <dt className="text-text-dim">Posting</dt>
            <dd>
              {postingHref ? (
                <a href={postingHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage">
                  Open <ArrowSquareOutIcon />
                </a>
              ) : (
                <span className="text-text-dim">No link</span>
              )}
            </dd>
            <dt className="text-text-dim">Posted</dt>
            <dd className="text-text">{formatDate(app.posted_at)}</dd>
            <dt className="text-text-dim">Deadline</dt>
            <dd className="text-text">{formatDate(app.deadline)}</dd>
            <dt className="text-text-dim">Visa</dt>
            <dd className={noSponsorship ? "text-danger" : "text-text"}>{app.visa_flag ?? "Unknown"}</dd>
          </dl>
          {jd === null ? (
            // Loading skeleton, same three static bars the role pane uses.
            <div aria-busy="true" aria-label="Loading the posting" className="flex flex-col gap-2">
              <span className="block h-3 w-2/3 bg-hairline" />
              <span className="block h-3 w-full bg-hairline" />
              <span className="block h-3 w-5/6 bg-hairline" />
            </div>
          ) : jd.html ? (
            // TRD §6: the sanitizer IS the trust boundary — JdHtml re-runs it
            // at render (defense in depth) even though the stored value was
            // already sanitized. v6 L3 B: no nested scroll box (the pane
            // column scrolls) and a readable measure on the posting body.
            <div className="min-w-0 max-w-[78ch] break-words">
              <JdHtml html={jd.html} />
            </div>
          ) : (
            <p className="text-[15px] text-text-dim">No posting text captured.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-dim">
            {capturedAt ? <span>captured {formatDate(capturedAt)}</span> : null}
            <button type="button" onClick={recapture} disabled={capturing} className={actionCls}>
              <ArrowClockwiseIcon /> {capturing ? "Capturing…" : jd?.html ? "Re-capture" : "Capture posting text"}
            </button>
            {captureResult ? (
              captureResult.ok ? (
                <span role="status" className="text-sage">captured</span>
              ) : (
                <span role="alert" className="text-danger">{captureResult.error}</span>
              )
            ) : null}
          </div>
        </div>
      </Section>

      <TimelineSection app={app} events={events} />
    </article>
  );
}

// --- Timeline --------------------------------------------------------------
// What the signed-in user wrote, newest first, and nothing else.

function todayNy(): string {
  // en-CA formats as YYYY-MM-DD; the zone is the app's ONE fixed zone so the
  // default date matches the day the entry is stored under.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

// Mirrors app/timeline-actions.ts nyNoonOf exactly: the server stores the
// manual entry at NY noon, not UTC midnight, so the optimistic draft has to
// compute the same instant client-side or the row jumps position once
// router.refresh() brings back the real (different) timestamp.
function nyNoonOf(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "-05:00";
  const at = new Date(`${date}T12:00:00${offset}`);
  return Number.isNaN(at.getTime()) ? `${date}T12:00:00.000Z` : at.toISOString();
}

function TimelineSection({
  app,
  events,
}: {
  app: ApplicationsRow;
  events: EventRow[];
}) {
  const router = useRouter();
  const add = useFieldSave();
  const del = useFieldSave();

  // Optimistic overlays. A fresh `events` array means the server render caught
  // up (router.refresh landed), so both overlays are dropped — the same
  // reset-during-render pattern the status field uses.
  const [pending, setPending] = useState<TimelineItem[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [seenEvents, setSeenEvents] = useState(events);
  if (events !== seenEvents) {
    setSeenEvents(events);
    setPending([]);
    setHidden([]);
  }

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [date, setDate] = useState("");

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimelineItem | null>(null);

  const visible = events.filter((e) => !hidden.includes(e.id));
  const items = buildTimeline(visible, pending);

  function submit() {
    const body = text.trim();
    if (!body) return;
    const day = date || todayNy();
    const nyNoon = nyNoonOf(day);
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const draft: TimelineItem = {
      id: optimisticId,
      at: nyNoon,
      event: {
        id: optimisticId,
        application_id: app.id,
        company_id: app.company_id,
        kind: "other",
        subject: body.slice(0, 200),
        sender: "you",
        received_at: nyNoon,
        snippet: body,
        classified_by: "user",
        created_at: new Date().toISOString(),
        company_name: app.company_name,
      },
    };
    setPending((p) => [...p, draft]);
    setOpen(false);
    setText("");
    void add.run(async () => {
      const res = await addTimelineEntryAction(app.id, { text: body, date: day });
      if (res.ok) router.refresh();
      else setPending((p) => p.filter((x) => x.id !== optimisticId));
      return res;
    });
  }

  function remove(id: string) {
    setHidden((h) => [...h, id]);
    void del.run(async () => {
      const res = await deleteTimelineEntryAction(id);
      if (res.ok) router.refresh();
      else setHidden((h) => h.filter((x) => x !== id));
      return res;
    });
  }

  return (
    <Section
      icon={<ClockCountdownIcon />}
      defaultOpen
      title="Timeline"
      meta={`${items.length} entr${items.length === 1 ? "y" : "ies"}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDate(todayNy());
              setOpen((o) => !o);
            }}
            aria-expanded={open}
            className={actionCls}
          >
            {open ? "Cancel" : "+ Add"}
          </button>
          <SaveIndicator state={add.state} error={add.error} onRetry={add.retry} />
          {del.state !== "idle" ? (
            <SaveIndicator state={del.state} error={del.error} onRetry={del.retry} />
          ) : null}
        </div>

        {open ? (
          <div className="flex flex-col gap-2 border border-hairline bg-raised p-3">
            <AutoTextarea
              aria-label="Timeline entry"
              autoFocus
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Recruiter call scheduled for Tuesday…"
              className={fieldCls}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex min-h-11 items-center gap-2 ${labelCls}`}>
                Date
                <input
                  type="date"
                  aria-label="Entry date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${selectCls} normal-case`}
                />
              </label>
              <button type="button" onClick={submit} disabled={text.trim() === ""} className={actionCls}>
                Save entry
              </button>
            </div>
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="text-[15px] text-text-dim">Nothing written down yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {items.map((item) => (
              <EventItem
                key={item.id}
                event={item.event}
                onDelete={
                  item.id.startsWith("pending-")
                    ? undefined
                    : () => {
                        setPendingDelete(item);
                        dialogRef.current?.showModal();
                      }
                }
              />
            ))}
          </ul>
        )}
      </div>

      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-delete-title"
        onClose={() => setPendingDelete(null)}
        className={`m-auto w-full max-w-sm border border-hairline bg-raised p-5 text-text ${dialogMotion}`}
      >
        <p id="timeline-delete-title" className="text-[15px]">Delete this timeline entry? Only entries you wrote can be removed.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className={`${quietCls} border border-hairline`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const target = pendingDelete;
              dialogRef.current?.close();
              if (target) remove(target.id);
            }}
            className={`${quietCls} border border-hairline text-danger`}
          >
            Delete
          </button>
        </div>
      </dialog>
    </Section>
  );
}

// Native <details>/<summary> styled to tokens (ladder rung 1; doc 4 §6).
// Collapsed by default (doc 4 §8 progressive disclosure); the summary
// carries a one-word meta so a closed section still says what is inside.
function Section({
  icon,
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  icon: ReactNode;
  title: string;
  meta: string;
  children: ReactNode;
  // Timeline opens by default — it is the reason the pane exists; everything
  // else stays collapsed per doc 4 §8 progressive disclosure.
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-hairline">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-1 py-1 text-[15px] text-text hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage [&::-webkit-details-marker]:hidden">
        <span className="text-text-dim">{icon}</span>
        <span className="font-medium">{title}</span>
        {/* max-w + truncate: a tailored resume filename is the one meta long
            enough to squeeze the title out of the summary row. */}
        <span className="ml-auto max-w-[45%] truncate font-mono text-[11px] text-text-dim">{meta}</span>
        <span className="text-text-dim transition-transform duration-[240ms] group-open:rotate-180">
          <CaretDownIcon />
        </span>
      </summary>
      <div className="pb-4 pl-7">{children}</div>
    </details>
  );
}

function EventItem({
  event,
  onDelete,
}: {
  event: EventRow;
  onDelete?: () => void;
}) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span aria-label="written by you" title="written by you" className="text-text-dim">
          <NotePencilIcon />
        </span>
        <span className="font-mono text-[11px] text-text-dim">{absoluteDateTime(event.received_at)}</span>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete entry "${event.subject}"`}
            title="Delete entry"
            className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-text-dim hover:bg-raised hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <TrashIcon />
          </button>
        ) : null}
      </div>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-text">{event.snippet ?? event.subject}</p>
    </li>
  );
}
