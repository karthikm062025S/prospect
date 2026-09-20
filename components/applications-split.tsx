"use client";

// ApplicationsSplit (doc 4 §6, RB-020/021/024/025): 45/55 split on desktop,
// list + slide-over detail on narrow viewports. Selection lives in the URL
// (`?a=<id>`, history.replaceState — no navigation, RB-021; survives
// reload). Owns sort/filter (lib/applications-list.ts), the RB-014 delete
// with the in-app <dialog> confirm, and the optimistic row exit + badge
// honesty (D19).
//
// v5 (D29/D31/D32): status chips with live counts and a sliding indicator
// (`?s=<chip>`), a right pane that is its own scroll container beside the
// list (v6 DX3), the row→pane View-Transition morph, round company avatars,
// and the bigger type scale.
//
// L7 (redesign 2026-09-20, mission "Redesign mission 2026-09-20" D9/D10):
// restyled to wt-redesign/planning/mocks/applications.html — raised/bordered
// list card, 40px avatar + 12px/16px row padding, status dot, a real header
// (eyebrow + serif h1 + a this-week/this-month/follow-ups-due stat trio, all
// derived from props already on the page, no new data call), a proper
// bordered empty-state panel for the pane. See build/MISSION.md "Lane
// handoffs" 2026-09-20 (L7) for the exact sizes and the pill-height CONFLICT
// logged there. Every server action, its name and its arguments are
// untouched.
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { deleteApplicationAction } from "@/app/actions";
import { bumpWeekCount } from "@/components/week-count";
import {
  buildApplicationsList,
  chipCounts,
  filterByChip,
  parseChip,
  CHIP_LABELS,
  STATUS_CHIPS,
  type ApplicationsRow,
  type ApplicationsSort,
  type StatusChip,
} from "@/lib/applications-list";
import { formatDate } from "@/lib/dashboard";
import { isStale } from "@/lib/stale";
import { velocity } from "@/lib/velocity";
import type { AppStatus, EventRow } from "@/lib/types";
import { CompanyAvatar } from "@/components/company-avatar";
import { DetailPane, STATUS_LABELS } from "@/components/detail-pane";
import { FilterChips } from "@/components/filter-chips";
import { SearchInput } from "@/components/search-input";
import { StaleBadge } from "@/components/stale-badge";
import { FileTextIcon } from "@/components/icons";

const barButton =
  "inline-flex min-h-11 items-center border border-hairline px-3 font-sans text-sm font-medium hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:text-text-dim disabled:hover:bg-transparent";
// L8 audit item 1: see components/detail-pane.tsx's dialogMotion for the
// full recipe (opacity + 4px rise, @starting-style + allow-discrete, native,
// no library) — the same string, one const per file (this codebase's
// existing convention: barButton/actionCls/etc. are duplicated per file too).
const dialogMotion =
  "translate-y-1 opacity-0 open:translate-y-0 open:opacity-100 transition-discrete transition-[opacity,transform,overlay,display] duration-[120ms] ease-[cubic-bezier(0.4,0,1,1)] open:duration-[180ms] open:ease-[cubic-bezier(0.23,1,0.32,1)] open:starting:translate-y-1 open:starting:opacity-0 backdrop:opacity-0 open:backdrop:opacity-100 backdrop:transition-discrete backdrop:transition-[opacity,overlay,display] backdrop:duration-[120ms] open:backdrop:duration-[180ms] open:backdrop:starting:opacity-0 motion-reduce:transition-none";

// mocks/applications.html's per-row status dot: sage for the settled-forward
// states, accent for the one actively moving, danger for a closed door. offer
// gets the tint ring the mock reserves for it. (tokens-wanted: --sage-tint —
// mocks/tokens.css defines it, app/globals.css does not; `sage/10` below is
// the Tailwind opacity-modifier stand-in.)
const STATUS_DOT: Record<AppStatus, string> = {
  applied: "bg-sage",
  oa: "bg-sage",
  interviewing: "bg-accent",
  offer: "bg-sage ring-[3px] ring-sage/20",
  rejected: "bg-danger",
  withdrawn: "bg-danger",
};

const NARROW = "(max-width: 767px)";
// v6 DX3: on md+ the pane is its own scroll container filling the grid row,
// with the vertical hairline + gutter between the columns. Below md the
// slide-over classes on the section itself apply instead (DX4).
// v6 L3 A: <main> no longer pads vertically, so the pane column owns its own
// top/bottom air on md+ (its <md slide-over already has py-4).
const PANE_COLUMN =
  "md:min-h-0 md:overflow-y-auto md:border-l md:border-hairline md:pb-6 md:pl-6 md:pr-2 md:pt-4";
// D32: ONE shared name — the clicked row carries it in the old snapshot, the
// pane in the new one. That single identity is the morph.
const MORPH = "app-card";

export function ApplicationsSplit({
  applications,
  events,
  nowMs,
  targetTerm = null,
}: {
  applications: ApplicationsRow[];
  events: EventRow[];
  nowMs: number;
  // Real data already returned by page.tsx's existing requireProfile(uid)
  // call (lib/student-profile.ts StoredProfile.target_term, e.g. "Summer
  // 2027") — no new query, just the value the call already fetched. null
  // when the profile has none set.
  targetTerm?: string | null;
}) {
  const [sort, setSort] = useState<ApplicationsSort>("date");
  const [query, setQuery] = useState("");

  // Selection + chip = the `a` / `s` search params, mirrored into local state.
  // State is authoritative because replaceState only reaches useSearchParams
  // on the next router sync — too late for the synchronous DOM update that
  // startViewTransition has to snapshot.
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("a"));
  const [chip, setChipState] = useState<StatusChip>(() => parseChip(searchParams.get("s")));

  const syncUrl = useCallback((next: { a?: string | null; s?: StatusChip }) => {
    const url = new URL(window.location.href);
    if (next.a !== undefined) {
      if (next.a) url.searchParams.set("a", next.a);
      else url.searchParams.delete("a");
    }
    if (next.s !== undefined) {
      if (next.s !== "all") url.searchParams.set("s", next.s);
      else url.searchParams.delete("s");
    }
    window.history.replaceState(null, "", url);
  }, []);

  // L8 audit item 1: the mobile sheet takes focus on open (below); on <md the
  // sheet fully covers the row that opened it, so closing it (Escape or the
  // pane's own Back button) has to hand focus back explicitly or it falls
  // through to <body>. Captured only on narrow open — desktop never steals
  // focus from the row in the first place.
  const openerRef = useRef<HTMLElement | null>(null);
  const select = useCallback(
    (id: string | null) => {
      if (id !== null && window.matchMedia(NARROW).matches && document.activeElement instanceof HTMLElement) {
        openerRef.current = document.activeElement;
      }
      setSelectedId(id);
      syncUrl({ a: id });
    },
    [syncUrl],
  );

  function setChip(next: StatusChip) {
    setChipState(next);
    syncUrl({ s: next });
  }

  // Optimistic exit on delete; the action's revalidation brings truth back.
  const [optimisticRows, removeRow] = useOptimistic(applications, (current: ApplicationsRow[], id: string) =>
    current.filter((r) => r.id !== id),
  );
  const [, startTransition] = useTransition();

  const counts = useMemo(() => chipCounts(optimisticRows), [optimisticRows]);
  const rows = useMemo(
    () => buildApplicationsList(filterByChip(optimisticRows, chip), { sort, query }),
    [optimisticRows, chip, sort, query],
  );

  // mocks/applications.html's header stat trio, built only from data already
  // on the page (no new query): lib/velocity.ts is already imported below for
  // the delete-badge check, reused here for the week/month figures (target
  // stays null — nothing here fetches lib/profile.ts's monthlyTarget, so the
  // mock's "/ 25" fraction is left off rather than invented; see handoff).
  // isFollowUpDue is the same "due" test the per-row chip below uses.
  const isFollowUpDue = useCallback(
    (row: ApplicationsRow) =>
      row.follow_up_at !== null &&
      new Date(row.follow_up_at).getTime() <= nowMs &&
      row.status !== "rejected" &&
      row.status !== "withdrawn",
    [nowMs],
  );
  const pace = useMemo(() => velocity(optimisticRows, nowMs, null), [optimisticRows, nowMs]);
  const dueCount = useMemo(() => optimisticRows.filter(isFollowUpDue).length, [optimisticRows, isFollowUpDue]);
  const selected = selectedId ? optimisticRows.find((r) => r.id === selectedId) ?? null : null;
  const selectedEvents = useMemo(
    () => (selected ? events.filter((e) => e.application_id === selected.id) : []),
    [events, selected],
  );

  // The chip row itself lives in components/filter-chips.tsx — the SAME
  // component Home renders, so the two can no longer drift apart.
  const chipItems = useMemo(
    () => STATUS_CHIPS.map((c) => ({ key: c, label: CHIP_LABELS[c], count: counts[c] })),
    [counts],
  );

  // --- row → pane morph (D32) ---------------------------------------------
  const paneRef = useRef<HTMLElement | null>(null);
  function selectWithMotion(id: string, rowEl: HTMLElement | null) {
    if (id === selectedId) return;
    const morphable =
      rowEl !== null &&
      paneRef.current !== null &&
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !window.matchMedia(NARROW).matches;
    if (!morphable) {
      select(id);
      return;
    }
    const pane = paneRef.current!;
    // A fast second click can land while the previous transition still owns
    // the name; two elements sharing one name abort it. Drop the leftover.
    pane.style.viewTransitionName = "";
    rowEl.style.viewTransitionName = MORPH;
    const vt = document.startViewTransition(() => {
      // flushSync commits the new pane synchronously, which is what the
      // "new" snapshot is taken against; the name then moves row → pane so
      // the two are never named at the same time (a duplicate aborts it).
      flushSync(() => select(id));
      rowEl.style.viewTransitionName = "";
      pane.style.viewTransitionName = MORPH;
    });
    const clear = () => {
      rowEl.style.viewTransitionName = "";
      pane.style.viewTransitionName = "";
    };
    // A skipped/aborted transition rejects these; nothing awaits them, so
    // swallow it instead of logging "InvalidStateError" (seen in prod).
    vt.ready.catch(() => {});
    vt.finished.then(clear, clear);
  }

  // Narrow viewport: the slide-over takes focus when it opens so keyboard
  // and screen-reader users land in it; Escape closes it.
  useEffect(() => {
    // Reset the pane's own scroll on every selection — otherwise the new
    // application can land mid-scroll from the previous one's read position.
    paneRef.current?.scrollTo(0, 0);
    if (selectedId && window.matchMedia(NARROW).matches) {
      paneRef.current?.focus();
    } else if (!selectedId && window.matchMedia(NARROW).matches && openerRef.current) {
      // L8 audit item 1: the sheet just went display:none — its own focus
      // would otherwise drop to <body>. Return it to the row that opened it.
      // Audit L8 P1: the opener row can unmount while the sheet is open; a detached
      // node no-ops on focus() and focus would fall to <body>.
      if (document.body.contains(openerRef.current)) openerRef.current.focus();
      openerRef.current = null;
    }
  }, [selectedId]);

  // RB-014 delete with the in-app <dialog> confirm (RB-050; S5 pattern).
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApplicationsRow | null>(null);
  const [deleteError, setDeleteError] = useState<{ message: string; app: ApplicationsRow } | null>(null);
  function closeDialog() {
    dialogRef.current?.close();
    setPendingDelete(null);
  }
  function runDelete(app: ApplicationsRow) {
    setDeleteError(null);
    // D19 badge honesty: an application dated this week leaves the badge
    // count at the optimistic exit; reverted if the action fails.
    const inWeek = velocity([app], Date.now()).week === 1;
    startTransition(async () => {
      removeRow(app.id);
      if (inWeek) bumpWeekCount(-1);
      const res = await deleteApplicationAction(app.id).catch(() => ({ ok: false as const, error: "network error" }));
      // history.replaceState mid-action dispatches Next's ACTION_RESTORE, which discards
      // the action's revalidated payload; deselect only after it lands.
      if (selectedId === app.id) select(null);
      if (!res.ok) {
        if (inWeek) bumpWeekCount(1);
        select(app.id); // the row comes back — put the user back on it, not the empty pane
        setDeleteError({ message: `Delete failed (${res.error}).`, app });
      }
    });
  }

  const empty = optimisticRows.length === 0;
  const nothingMatches = !empty && rows.length === 0 && query.trim() !== "";
  const chipEmpty = !empty && rows.length === 0 && query.trim() === "";

  return (
    <div className="flex flex-col gap-6 md:h-full">
      {/* v6 DX3: the split owns the height on md+ — the grid fills <main>, its
          one row is pinned to that height, and each column scrolls on its own
          (min-h-0 + overflow-y-auto). The page header (h1, count) and the
          chips sit INSIDE the list column above the pinned toolbar so the
          detail pane gets the full height. Below md nothing here applies:
          <main> scrolls the page and the pane is the fixed slide-over (DX4). */}
      <div className={`grid gap-6 md:-mx-1 md:h-full md:min-h-0 md:grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:overflow-hidden md:px-1`}>
        <section aria-label="Applications" className="flex min-w-0 flex-col gap-6 pt-4 pb-6 md:-mx-1 md:min-h-0 md:overflow-y-auto md:px-1 md:pr-2">
          {/* mocks/applications.html header: eyebrow + serif h1 + a small
              stat trio, all built from props already on the page (no new
              data call — see the pace/dueCount comment above). */}
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-label text-[11px] uppercase tracking-label text-text-dim">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
                Applications{targetTerm ? ` · ${targetTerm}` : ""}
              </p>
              <h1 className="font-display text-step-4 text-text">
                <span className="tabular-nums">{optimisticRows.length}</span> application
                {optimisticRows.length === 1 ? "" : "s"} recorded
              </h1>
            </div>
            {empty ? null : (
              <div className="flex items-baseline gap-6">
                <div className="flex flex-col gap-1">
                  <p className="font-sans text-step-2 leading-none tabular-nums text-text">{pace.week}</p>
                  <p className="font-label text-[11px] uppercase tracking-label text-text-dim">This week</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-sans text-step-2 leading-none tabular-nums text-text">{pace.month}</p>
                  <p className="font-label text-[11px] uppercase tracking-label text-text-dim">This month</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-sans text-step-2 leading-none tabular-nums text-text">{dueCount}</p>
                  <p className="font-label text-[11px] uppercase tracking-label text-text-dim">Follow-ups due</p>
                </div>
              </div>
            )}
          </div>

          {/* D29 status chips — one shared visual with Home's All/Saved/Hidden. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-pill border border-hairline bg-raised p-1">
              <FilterChips
                items={chipItems}
                active={chip}
                onSelect={(key) => setChip(key as StatusChip)}
                ariaLabel="Filter by stage"
              />
            </div>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-transparent bg-sage px-4 font-sans text-sm font-medium text-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
            >
              Log an application
            </Link>
          </div>

          {/* Pinned to the top of the scrolling column on md+. The column's
              -mx-1/px-1 and this pt-1 are a 4px bleed so ring-2 + offset-2
              focus rings are not clipped by the column's overflow. */}
          <div className="flex flex-wrap items-center gap-2 md:sticky md:top-0 md:z-10 md:border-b md:border-hairline md:bg-bg md:pb-3 md:pt-1">
            <SearchInput onQuery={setQuery} />
            <label className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-hairline px-1 font-label text-[11px] uppercase tracking-label text-text-dim">
              Sort
              <select
                aria-label="Sort applications"
                value={sort}
                onChange={(e) => setSort(e.target.value as ApplicationsSort)}
                className="min-h-11 rounded-pill bg-transparent px-2 font-label text-[11px] uppercase tracking-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                <option value="date">Recently added</option>
                <option value="company">Company A–Z</option>
              </select>
            </label>
          </div>

          {deleteError ? (
            <p role="alert" className="text-sm text-danger">
              {deleteError.message}{" "}
              <button
                type="button"
                onClick={() => runDelete(deleteError.app)}
                className="min-h-11 font-sans text-sm text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                Retry
              </button>
            </p>
          ) : null}

          {empty ? (
            <p className="rounded-card border border-hairline bg-raised px-4 py-6 text-[15px] text-text-dim">
              No applications yet. Confirm an apply on Home and it lands here.
            </p>
          ) : nothingMatches ? (
            <p className="rounded-card border border-hairline bg-raised px-4 py-6 text-[15px] text-text-dim">
              Nothing matches &ldquo;{query}&rdquo;.{" "}
              <span className="font-sans text-sm">Clear search</span>
            </p>
          ) : chipEmpty ? (
            <p className="rounded-card border border-hairline bg-raised px-4 py-6 text-[15px] text-text-dim">
              No applications in {CHIP_LABELS[chip]}.
            </p>
          ) : (
            // mocks/applications.html .card: a raised, bordered list card
            // instead of a bare divided list (D10: rows share Home's rhythm
            // — 40px avatar column, 12px/16px row padding, token radii).
            <ul className="overflow-hidden rounded-card border border-hairline bg-raised [&>li:last-child]:border-b-0">
              {rows.map((row) => {
                const active = row.id === selectedId;
                const due = isFollowUpDue(row);
                return (
                  <li key={row.id} className="border-b border-hairline">
                    <button
                      type="button"
                      onClick={(e) => selectWithMotion(row.id, e.currentTarget)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full flex-col gap-2 border-l-2 px-4 py-3 text-left transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage md:flex-row md:items-center md:gap-3 ${
                        active ? "border-sage bg-bg" : "border-transparent hover:bg-bg"
                      }`}
                    >
                      <CompanyAvatar name={row.company_name} url={row.careers_url ?? row.jd_link} size={40} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[16px] font-medium leading-snug text-text">{row.role}</span>
                          {due ? (
                            <span className="inline-flex h-[26px] shrink-0 items-center rounded-pill bg-accent/15 px-2.5 text-[12px] font-medium text-text">
                              Follow-up due
                            </span>
                          ) : null}
                        </span>
                        <span className="text-[13px] leading-snug text-text-dim">
                          {row.company_name} · applied {formatDate(row.date_applied)}
                          {row.resume_file ? (
                            <>
                              {" · resume "}
                              <span className="font-mono text-[12px]">{row.resume_file}</span>
                            </>
                          ) : row.deadline ? (
                            <> · deadline {formatDate(row.deadline)}</>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-[13px] text-text-dim md:flex-col md:items-end md:gap-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATUS_DOT[row.status]}`} />
                          {STATUS_LABELS[row.status]}
                        </span>
                        {isStale(row, nowMs) ? <StaleBadge /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          ref={paneRef}
          tabIndex={-1}
          aria-label="Application details"
          onKeyDown={(e) => {
            if (e.key === "Escape" && window.matchMedia(NARROW).matches) select(null);
          }}
          className={
            selected
              ? `pane fixed inset-0 z-40 overflow-y-auto bg-bg px-6 py-4 focus-visible:outline-none md:static md:z-auto md:bg-transparent ${PANE_COLUMN}`
              : `hidden md:block ${PANE_COLUMN}`
          }
        >
          {selected ? (
            <DetailPane
              key={selected.id}
              app={selected}
              events={selectedEvents}
              nowMs={nowMs}
              onRequestDelete={() => {
                setPendingDelete(selected);
                dialogRef.current?.showModal();
              }}
              onBack={() => select(null)}
            />
          ) : (
            // RB-024 / D10: a proper empty-state PANEL (raised, bordered,
            // rounded — mocks/applications.html's .pane card), not a blank
            // column, thin icon + one line (doc 4 §6).
            <div className="hidden min-h-64 flex-col items-center justify-center gap-3 rounded-panel border border-hairline bg-raised px-6 py-16 text-center text-text-dim md:flex md:h-full md:min-h-0">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage/10 text-sage">
                <FileTextIcon />
              </span>
              <p className="text-[15px]">
                {selectedId && !empty ? "That application is gone." : "Select an application to see its details."}
              </p>
            </div>
          )}
        </section>
      </div>

      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-delete-title"
        onClose={() => setPendingDelete(null)}
        className={`m-auto w-full max-w-sm border border-hairline bg-raised p-5 text-text ${dialogMotion}`}
      >
        <p id="application-delete-title" className="text-[15px]">
          Delete the {pendingDelete?.company_name} · {pendingDelete?.role} application? The role returns to Home as
          not applied, and any emails matched to it are removed.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={closeDialog} autoFocus className={`${barButton} text-text-dim`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const pending = pendingDelete;
              closeDialog();
              if (pending) runDelete(pending);
            }}
            className={`${barButton} text-danger`}
          >
            Delete
          </button>
        </div>
      </dialog>
    </div>
  );
}
