"use client";

// Home list orchestrator (v5). Owns: the All · Saved · Hidden filter chips
// (D27, `?v=` in the URL), row→pane selection (D26, `?r=` replaceState
// mirroring the Applications `?a=` pattern) with the View-Transitions morph
// (D32), sort (persisted, RB-004), search (RB-003), grouping via buildHomeList,
// bulk-select + remove with the in-app <dialog> confirm (never native
// confirm()), and the optimistic apply/save/hide mutations (RB-010/011, the
// committed Overlay below — no full-reload anything).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { confirmAppliedAction, deleteRolesAction } from "@/app/actions";
import {
  correctRoleAction,
  hideRoleAction,
  markAlreadyAppliedAction,
  saveRoleAction,
  uncorrectRoleAction,
} from "@/app/role-actions";
import { bumpWeekCount } from "@/components/week-count";
import { buildHomeList, capHomeGroups, hydrateHomeRows, type HomeCompany } from "@/lib/sort";
import { addedToday } from "@/lib/velocity";
import type { CorrectionField, SharedLabels } from "@/lib/corrections";
import { mergePatch, correctionPatch, uncorrectionPatch, rollbackPatch, type RowPatchLike } from "@/lib/row-patch";
import { RoleRow, prefersReducedMotion, type ApplyMode, type HomeRow, type HomeRowLite } from "@/components/role-row";
import { RoleDetailPane } from "@/components/role-detail-pane";
import { FilterChips } from "@/components/filter-chips";
import { GetStarted } from "@/components/get-started";
import { PillDropdown, type PillDropdownOption } from "@/components/pill-dropdown";
import { CompanyGroup } from "@/components/company-group";
import { SortControl, useHomeSort } from "@/components/sort-control";
import { SearchInput } from "@/components/search-input";
import { VelocityStrip } from "@/components/velocity-strip";
import { FileTextIcon } from "@/components/icons";
import { FAMILY_LABEL, FAMILY_ORDER, type Family } from "@/lib/family";
import { TIER_LABEL, TIER_ORDER, type TierTag } from "@/lib/company-tier";
import { ALL_HOME_FILTER, applyFilters, filterCounts } from "@/lib/home-filters";
import { SEASON_LABEL, SEASON_ORDER, type Season } from "@/lib/season";
import styles from "./applications-split.module.css";

const barButton =
  "inline-flex min-h-11 items-center border border-hairline px-3 font-sans text-sm font-medium hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:text-text-dim disabled:hover:bg-transparent";
// L8 audit item 1: see components/detail-pane.tsx's dialogMotion for the
// full recipe (opacity + 4px rise, @starting-style + allow-discrete, native,
// no library) — the same string, one const per file (this codebase's
// existing convention: barButton/actionCls/etc. are duplicated per file too).
const dialogMotion =
  "translate-y-1 opacity-0 open:translate-y-0 open:opacity-100 transition-discrete transition-[opacity,transform,overlay,display] duration-[120ms] ease-[cubic-bezier(0.4,0,1,1)] open:duration-[180ms] open:ease-[cubic-bezier(0.23,1,0.32,1)] open:starting:translate-y-1 open:starting:opacity-0 backdrop:opacity-0 open:backdrop:opacity-100 backdrop:transition-discrete backdrop:transition-[opacity,overlay,display] backdrop:duration-[120ms] open:backdrop:duration-[180ms] open:backdrop:starting:opacity-0 motion-reduce:transition-none";

const NARROW = "(max-width: 767px)";
// v6 DX3: on md+ the pane is its own scroll container filling the grid row,
// with the vertical hairline + gutter between the columns. Below md the
// slide-over classes on the section itself apply instead (DX4).
// v6 L3 A: <main> no longer pads vertically, so the pane column owns its own
// top/bottom air on md+ (its <md slide-over already has py-4).
const PANE_COLUMN =
  "md:min-h-0 md:overflow-y-auto md:border-l md:border-hairline md:pb-6 md:pl-6 md:pr-2 md:pt-4";

const VIEWS = ["all", "saved", "hidden"] as const;
type HomeView = (typeof VIEWS)[number];
const VIEW_LABELS: Record<HomeView, string> = { all: "All", saved: "Saved", hidden: "Hidden" };

// "Now" for every relative label on this page. useSyncExternalStore is the
// codebase's hydration-safe clock pattern (theme-toggle / sort-control): SSR
// renders the server's timestamp, the client swaps in its own on hydration, so
// a "today" computed in the reader's timezone never trips a mismatch.
// ponytail: frozen at hydration — a tab left open across midnight relabels on
// its next reload; upgrade to an interval store only if that ever bites.
let cachedNow = 0;
const noSubscribe = () => () => {};
function getClientNow(): number {
  if (cachedNow === 0) cachedNow = Date.now();
  return cachedNow;
}
function useClientNow(serverNowMs: number): number {
  return useSyncExternalStore(noSubscribe, getClientNow, () => serverNowMs);
}

type RowPatch = {
  id: string;
  saved_at?: string | null;
  hidden_at?: string | null;
  season?: Season;
  family?: Family;
  families?: Family[];
  visa_class?: string | null;
  eligibility_note?: string | null;
  corrected?: CorrectionField[];
  shared?: SharedLabels | null;
};

// v7 S4 (app-functional): the mutation overlay that replaced useOptimistic.
//
// WHY it is not useOptimistic any more. useOptimistic only holds its value for
// the life of the transition, so every save/hide/apply/remove needed the action
// to `revalidatePath("/")` or the row snapped back. Home is force-dynamic over
// the whole feed, so that one call made EVERY action response carry the entire
// re-serialised list — measured 791,727 bytes per save against the production
// build, on top of a 1,275,797-byte page. Six of those is the 30s+ freeze the
// S4 persona run hit. The overlay is committed state: the change survives
// without a server payload, and the next real read of "/" (navigation, reload)
// replaces it with server truth — the reset-during-render below.
//
// `patched` rows are rebuilt; every UNTOUCHED row keeps its object identity, so
// the memoised RoleRow re-renders one row per action instead of all of them.
type Overlay = { removed: ReadonlySet<string>; patched: ReadonlyMap<string, RowPatch> };
const NO_OVERLAY: Overlay = { removed: new Set(), patched: new Map() };

export function HomeList({
  rows,
  companies,
  recentCreatedAt,
  pace,
  serverNowMs,
  getStartedEligible,
  userId,
  hasProfile,
  hasScores,
}: {
  rows: HomeRowLite[];
  // A15: the per-company fields arrive ONCE here, keyed by company_id, instead
  // of four columns duplicated onto every role. hydrateHomeRows puts the full
  // HomeRow back together below, so nothing downstream changes.
  companies: Record<string, HomeCompany>;
  // created_at of every role Prospect added since midnight ET — hidden, applied
  // and deleted-from-view ones included. "Added today" counts raw drops, and
  // the boundary is the SAME fixed America/New_York one the server query used,
  // so the client recount can never disagree with the server render.
  recentCreatedAt: string[];
  pace: { today: number; week: number; month: number; target: number | null };
  serverNowMs: number;
  getStartedEligible: boolean;
  // Only ever used to namespace the checklist's per-device localStorage flags
  // to this account (components/get-started.tsx), so a shared browser never
  // shows one user the checklist state of the last one.
  userId: string;
  // L2c: whether this caller has a Match agent profile / a ranked feed yet --
  // decides both the default sort below and which GetStarted nudge renders.
  hasProfile: boolean;
  hasScores: boolean;
}) {
  const nowMs = useClientNow(serverNowMs);
  const fullRows: HomeRow[] = useMemo(() => hydrateHomeRows(rows, companies), [rows, companies]);
  // L2c: "best_match" only wins as the NEVER-TOUCHED-sort default once the
  // Match agent has scored the feed -- an explicit past choice (recent/company/
  // title, or best_match itself) always overrides this (useHomeSort's fallback).
  const [sort, setSort] = useHomeSort(hasScores ? "best_match" : "recent");
  const [query, setQuery] = useState("");
  // A15 render cap: only the first HOME_GROUP_CAP company groups are put in the
  // DOM until this flips. Nothing is filtered out of the DATA — every count,
  // search and sort below still runs over the whole list.
  const [showAll, setShowAll] = useState(false);

  // Optimistic mutations: applied/deleted rows leave the list before the server
  // confirms, and save/hide flip their timestamp in place so the chips and
  // counts move at the click. See the Overlay note above for why this is
  // committed state rather than useOptimistic.
  const [overlay, setOverlay] = useState<Overlay>(NO_OVERLAY);
  // Reset-during-render (the idiom role-row.tsx uses for its apply override): a
  // new `rows` array is a fresh server read, i.e. the truth the overlay was
  // standing in for. Drop it rather than let it shadow real data.
  const [seenRows, setSeenRows] = useState(fullRows);
  if (fullRows !== seenRows) {
    setSeenRows(fullRows);
    setOverlay(NO_OVERLAY);
  }
  const optimisticRows: HomeRow[] = useMemo(() => {
    if (overlay.removed.size === 0 && overlay.patched.size === 0) return fullRows;
    const out: HomeRow[] = [];
    for (const row of fullRows) {
      if (overlay.removed.has(row.id)) continue;
      const patch = overlay.patched.get(row.id);
      out.push(patch ? { ...row, ...patch } : row);
    }
    return out;
  }, [fullRows, overlay]);

  // L5 re-audit: MERGE into the row's existing entry (never replace), so a
  // save/hide patch and a correction patch on the same row coexist.
  const patchRow = useCallback((patch: RowPatch) => {
    setOverlay((o) => ({
      removed: o.removed,
      patched: new Map(o.patched).set(patch.id, mergePatch(o.patched.get(patch.id), patch) as RowPatch),
    }));
  }, []);
  const removeRows = useCallback((ids: string[], gone: boolean) => {
    setOverlay((o) => {
      const removed = new Set(o.removed);
      for (const id of ids) if (gone) removed.add(id);
        else removed.delete(id);
      return { removed, patched: o.patched };
    });
  }, []);
  const [, startTransition] = useTransition();

  // --- filter chips (D27) -------------------------------------------------
  const searchParams = useSearchParams();
  const paramView = searchParams.get("v");
  const paramSeason = searchParams.get("season");
  const paramFamily = searchParams.get("family");
  const paramTier = searchParams.get("tier");
  const [view, setView] = useState<HomeView>(
    VIEWS.includes(paramView as HomeView) ? (paramView as HomeView) : "all",
  );
  const [season, setSeason] = useState<string>(
    SEASON_ORDER.includes(paramSeason as Season) ? (paramSeason as Season) : ALL_HOME_FILTER,
  );
  const [family, setFamily] = useState<string>(
    FAMILY_ORDER.includes(paramFamily as Family) ? (paramFamily as Family) : ALL_HOME_FILTER,
  );
  const [tier, setTier] = useState<string>(
    TIER_ORDER.includes(paramTier as TierTag) ? (paramTier as TierTag) : ALL_HOME_FILTER,
  );

  // A15: a chip switch or a new search is a NEW list, so it starts capped
  // again — carrying an expansion into a 3-result search makes the cap feel
  // arbitrary. Reset-during-render, the same idiom role-row.tsx uses to drop a
  // stale optimistic override: NOT an effect and NOT a wrapper around
  // SearchInput's onQuery, whose debounce effect lists that callback in its
  // deps and needs the stable state-setter identity.
  const listKey = `${view} | ${season} | ${family} | ${tier} | ${query}`;
  const [seenListKey, setSeenListKey] = useState(listKey);
  if (listKey !== seenListKey) {
    setSeenListKey(listKey);
    setShowAll(false);
  }

  const writeUrl = useCallback((next: {
    v?: HomeView;
    r?: string | null;
    season?: string;
    family?: string;
    tier?: string;
  }) => {
    const url = new URL(window.location.href);
    if (next.v !== undefined) {
      if (next.v === "all") url.searchParams.delete("v");
      else url.searchParams.set("v", next.v);
    }
    if (next.r !== undefined) {
      if (next.r) url.searchParams.set("r", next.r);
      else url.searchParams.delete("r");
    }
    if (next.season !== undefined) {
      if (next.season === ALL_HOME_FILTER) url.searchParams.delete("season");
      else url.searchParams.set("season", next.season);
    }
    if (next.family !== undefined) {
      if (next.family === ALL_HOME_FILTER) url.searchParams.delete("family");
      else url.searchParams.set("family", next.family);
    }
    if (next.tier !== undefined) {
      if (next.tier === ALL_HOME_FILTER) url.searchParams.delete("tier");
      else url.searchParams.set("tier", next.tier);
    }
    window.history.replaceState(null, "", url);
  }, []);

  const counts = useMemo(
    () => ({
      all: optimisticRows.filter((r) => r.hidden_at === null).length,
      saved: optimisticRows.filter((r) => r.hidden_at === null && r.saved_at !== null).length,
      hidden: optimisticRows.filter((r) => r.hidden_at !== null).length,
    }),
    [optimisticRows],
  );

  const viewRows = useMemo(
    () =>
      optimisticRows.filter((r) =>
        view === "hidden"
          ? r.hidden_at !== null
          : r.hidden_at === null && (view === "saved" ? r.saved_at !== null : true),
      ),
    [optimisticRows, view],
  );

  const dropdownCounts = useMemo(
    () => filterCounts(viewRows, { season, family, tier }),
    [viewRows, season, family, tier],
  );
  const seasonOptions: PillDropdownOption[] = useMemo(
    () => [
      { key: ALL_HOME_FILTER, label: "All", count: dropdownCounts.season[ALL_HOME_FILTER] },
      ...SEASON_ORDER.filter((key) => optimisticRows.some((row) => row.season === key)).map((key) => ({
        key,
        label: SEASON_LABEL[key],
        count: dropdownCounts.season[key] ?? 0,
      })),
    ],
    [dropdownCounts.season, optimisticRows],
  );
  const familyOptions: PillDropdownOption[] = useMemo(
    () => [
      { key: ALL_HOME_FILTER, label: "All", count: dropdownCounts.family[ALL_HOME_FILTER] },
      ...FAMILY_ORDER.filter((key) => optimisticRows.some((row) => row.families.includes(key))).map((key) => ({
        key,
        label: FAMILY_LABEL[key],
        count: dropdownCounts.family[key] ?? 0,
      })),
    ],
    [dropdownCounts.family, optimisticRows],
  );
  const tierOptions: PillDropdownOption[] = useMemo(
    () => [
      { key: ALL_HOME_FILTER, label: "All", count: dropdownCounts.tier[ALL_HOME_FILTER] },
      ...TIER_ORDER.filter((key) => optimisticRows.some((row) => row.tierTags.includes(key))).map((key) => ({
        key,
        label: TIER_LABEL[key],
        count: dropdownCounts.tier[key] ?? 0,
      })),
    ],
    [dropdownCounts.tier, optimisticRows],
  );
  const inView = useMemo(
    () => applyFilters(viewRows, { season, family, tier }),
    [viewRows, season, family, tier],
  );

  // The chip row itself (pill, measurement, both themes, a11y) lives in
  // components/filter-chips.tsx — the SAME component Applications renders.
  const chipItems = useMemo(
    () => VIEWS.map((v) => ({ key: v, label: VIEW_LABELS[v], count: counts[v] })),
    [counts],
  );

  // --- selection + row→pane morph (D26/D32) --------------------------------
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("r"));
  // The row that is the shared-element SOURCE of the current morph. It carries
  // view-transition-name "role-card" in the OLD snapshot; the pane carries the
  // same name in the NEW one, which is what makes the pane grow out of the row.
  const [morphId, setMorphId] = useState<string | null>(null);
  // L8 audit item 1: the mobile sheet takes focus on open (below); on <md the
  // sheet fully covers the row that opened it, so closing it (Escape or the
  // pane's own Back button) has to hand focus back explicitly or it falls
  // through to <body>. Captured only on narrow open — desktop never steals
  // focus from the row in the first place.
  const openerRef = useRef<HTMLElement | null>(null);
  // The latest selection, readable from event handlers WITHOUT making them
  // change identity every time it moves — that identity is what lets the
  // memoised RoleRow skip 143 of 144 rows on an action. Written in an effect
  // (never during render); every handler that reads it runs after commit.
  const selectedIdRef = useRef<string | null>(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  const select = useCallback(
    (id: string | null) => {
      if (id === selectedIdRef.current) return;
      if (id !== null && window.matchMedia(NARROW).matches && document.activeElement instanceof HTMLElement) {
        openerRef.current = document.activeElement;
      }
      writeUrl({ r: id });
      if (id === null || prefersReducedMotion() || typeof document.startViewTransition !== "function") {
        setSelectedId(id);
        setMorphId(null);
        return;
      }
      // Paint the source row with the shared name BEFORE the snapshot is taken.
      flushSync(() => setMorphId(id));
      const vt = document.startViewTransition(() => {
        flushSync(() => setSelectedId(id));
      });
      // A skipped/aborted transition rejects these; nothing awaits them, so
      // swallow the rejection (components/view-transition.tsx does the same).
      vt.ready.catch(() => {});
      // Drop the shared name once the morph is over. Leaving it on the pane
      // meant the pane stayed a named view-transition element forever, so the
      // NEXT transition on the page — a tab navigation — snapshotted it as a
      // shared element and ghost-faded it. Same clear-on-finished the
      // Applications split does.
      const clear = () => setMorphId(null);
      vt.finished.then(clear, clear);
    },
    [writeUrl],
  );

  function switchView(next: HomeView) {
    setView(next);
    writeUrl({ v: next });
  }

  function switchSeason(next: string) {
    setSeason(next);
    writeUrl({ season: next });
  }

  function switchFamily(next: string) {
    setFamily(next);
    writeUrl({ family: next });
  }

  function switchTier(next: string) {
    setTier(next);
    writeUrl({ tier: next });
  }

  // D27.4 guided actions for the GetStarted checklist (get-started.tsx does
  // not own the Season pill or the role rows, so the checklist calls back
  // into these two refs instead). PillDropdown renders no id of its own; the
  // wrapping ref finds its one <button> trigger without editing that file.
  const seasonPillRef = useRef<HTMLDivElement | null>(null);
  const rowListRef = useRef<HTMLUListElement | null>(null);

  const focusSeasonFilter = useCallback(() => {
    seasonPillRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const pulseFirstRow = useCallback(() => {
    const row = rowListRef.current?.querySelector<HTMLLIElement>("li");
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.classList.add("ring-2", "ring-sage");
    window.setTimeout(() => row.classList.remove("ring-2", "ring-sage"), 600);
  }, []);

  const selected = selectedId ? optimisticRows.find((r) => r.id === selectedId) ?? null : null;

  // Narrow viewport: the slide-over takes focus when it opens; Escape closes it.
  const paneRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Reset the pane's own scroll on every selection — otherwise the new
    // role can land mid-scroll from the previous one's read position.
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

  // --- bulk select + remove ------------------------------------------------
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; label: string } | null>(null);

  // Inline mutation errors with retry: confirm failures keyed by role id (the
  // row re-renders them), remove/flag failures at list level.
  const [confirmErrors, setConfirmErrors] = useState<Map<string, string>>(new Map());
  const [deleteError, setDeleteError] = useState<{ message: string; ids: string[]; label: string } | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [correctionErrors, setCorrectionErrors] = useState<Map<string, string>>(new Map());
  const [correctionPending, setCorrectionPending] = useState<Set<string>>(new Set());

  // Expanders: collapsed by default; groups holding an armed "Applied?"
  // confirmation start expanded so a persisted confirm (RB-013) is never
  // hidden behind "show N more".
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.apply_clicked_at !== null).map((r) => r.company_id)),
  );

  const rowById = useMemo(() => new Map(optimisticRows.map((r) => [r.id, r])), [optimisticRows]);
  // Task 3 L5 fold (B2, the "corrected" array specifically): runCorrection's
  // rollback runs inside an async continuation, where a plain closure over
  // `rowById` would be stale (the same staleness B2's generation guard
  // exists to dodge). `corrected` is the one field every one of the three
  // corrections' patches writes to, so rolling back season must remove ONLY
  // "season" from whatever `corrected` holds AT ROLLBACK TIME — never a
  // whole-array replay of a snapshot taken before a sibling field (family)
  // was corrected in between, which would silently un-tag that sibling. A
  // ref updated every render, read only inside the rollback branch, is the
  // "always current" idiom for exactly this.
  const rowByIdRef = useRef(rowById);
  useEffect(() => {
    rowByIdRef.current = rowById;
  }, [rowById]);
  const groups = useMemo(() => buildHomeList(inView, { sort, query }), [inView, sort, query]);
  const shownGroups = useMemo(() => capHomeGroups(groups, showAll), [groups, showAll]);
  // How many groups the cap WOULD hide — measured against the collapsed list,
  // not the current one, so the toggle keeps its label while expanded.
  const hiddenByCap = groups.length - capHomeGroups(groups, false).length;

  // Only actually-RENDERED rows: a collapsed group shows its first (newest)
  // role only, so "Select all shown" must never sweep roles hidden behind
  // "show N more" — or behind the A15 render cap — into an irreversible
  // removal (audit F1).
  const visibleIds = useMemo(
    () =>
      shownGroups.flatMap((g) =>
        g.roles.length === 1 || expanded.has(g.company_id) ? g.roles.map((r) => r.id) : [g.roles[0].id],
      ),
    [shownGroups, expanded],
  );
  const selectedIds = visibleIds.filter((id) => selectedForDelete.has(id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirmApplied = useCallback(
    (id: string, mode: ApplyMode) => {
      // The exit is committed, not transition-scoped: the actions no longer
      // revalidate "/", so nothing arrives later to hold the row out.
      removeRows([id], true);
      // Badge tick synchronous with the optimistic exit (doc 4 §6 — under
      // reduced motion this tick IS the confirmation). Reverted on failure.
      bumpWeekCount(1);
      startTransition(async () => {
        const run = mode === "already" ? markAlreadyAppliedAction(id) : confirmAppliedAction(id);
        const res = await run.catch(() => ({ ok: false as const, error: "network error" }));
        if (selectedIdRef.current === id) select(null);
        if (!res.ok) {
          bumpWeekCount(-1);
          removeRows([id], false); // no phantom applied state: the row comes back
        }
        setConfirmErrors((prev) => {
          const next = new Map(prev);
          if (res.ok) next.delete(id);
          else next.set(id, `Recording the application failed (${res.error}). Nothing was saved.`);
          return next;
        });
      });
    },
    [removeRows, select],
  );

  const setFlag = useCallback(
    (id: string, kind: "saved" | "hidden", on: boolean) => {
      setFlagError(null);
      const stamp = on ? new Date().toISOString() : null;
      const column = kind === "saved" ? "saved_at" : "hidden_at";
      // Read through the ref (not `rowById` in the deps): setFlag/onSaveRow/onHideRow must keep
      // a stable identity or every memoized RoleRow re-renders on each action (the PERF fix above).
      const prev = rowByIdRef.current.get(id)?.[column] ?? null;
      patchRow(column === "saved_at" ? { id, saved_at: stamp } : { id, hidden_at: stamp });
      startTransition(async () => {
        const res = await (kind === "saved" ? saveRoleAction(id, on) : hideRoleAction(id, on)).catch(() => ({
          ok: false as const,
          error: "network error",
        }));
        if (!res.ok) {
          // The server never took it: restore THIS field only (a correction on the row survives).
          patchRow(column === "saved_at" ? { id, saved_at: prev } : { id, hidden_at: prev });
          setFlagError(`Couldn't ${on ? kind === "saved" ? "save" : "hide" : "undo that"} the role (${res.error}).`);
        }
      });
    },
    [patchRow],
  );
  const onSaveRow = useCallback((id: string, on: boolean) => setFlag(id, "saved", on), [setFlag]);
  const onHideRow = useCallback((id: string, on: boolean) => setFlag(id, "hidden", on), [setFlag]);

  // Task 3 L5 fold (B1): field-scoped merge, never a whole-row replace — a
  // correction's own patch (and a save/hide patch already sitting on the
  // same row) survives a LATER correction to a different field. Always a
  // functional setOverlay update: never reads the render-time `overlay`.
  const mergeRow = useCallback((patch: RowPatch) => {
    setOverlay((o) => ({
      removed: o.removed,
      patched: new Map(o.patched).set(
        patch.id,
        mergePatch(o.patched.get(patch.id) as RowPatchLike | undefined, patch as RowPatchLike) as RowPatch,
      ),
    }));
  }, []);

  // Task 3 L5 fold (B2): a per-(id:field) generation counter. A stale
  // response (an earlier request that resolves AFTER a later correction on
  // the SAME field) must never roll back what the newer request already
  // applied — the generation check below is what decides "stale".
  const correctionGen = useRef<Map<string, number>>(new Map());

  const runCorrection = useCallback(
    (
      id: string,
      field: CorrectionField,
      run: () => Promise<{ ok: true } | { ok: false; error: string }>,
      patch: Record<string, unknown>,
      before: {
        season: Season;
        family: Family;
        families: Family[];
        visa_class: string | null;
        eligibility_note: string | null;
        corrected: CorrectionField[];
      },
    ) => {
      const key = `${id}:${field}`;
      const myGen = (correctionGen.current.get(key) ?? 0) + 1;
      correctionGen.current.set(key, myGen);
      setCorrectionErrors((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setCorrectionPending((prev) => new Set(prev).add(key));
      mergeRow({ id, ...patch });
      startTransition(async () => {
        const res = await run().catch(() => ({ ok: false as const, error: "network error" }));
        if (correctionGen.current.get(key) !== myGen) return; // a newer call now owns this field
        setCorrectionPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        if (!res.ok) {
          // `corrected` specifically is re-read fresh off rowByIdRef (never
          // off `before`, which is a call-time snapshot): a sibling field
          // corrected in between must stay tagged after this rollback.
          const liveCorrected = rowByIdRef.current.get(id)?.corrected ?? before.corrected;
          mergeRow({
            id,
            ...rollbackPatch(field, { ...before, corrected: liveCorrected.filter((f) => f !== field) }),
          });
          setCorrectionErrors((prev) => new Map(prev).set(id, res.error));
        }
      });
    },
    [mergeRow],
  );

  const onCorrectRow = useCallback(
    (id: string, field: CorrectionField, value: string) => {
      const current = rowById.get(id);
      if (!current) return;
      const before = {
        season: current.season,
        family: current.family,
        families: current.families,
        visa_class: current.visa_class,
        eligibility_note: current.eligibility_note,
        corrected: current.corrected,
      };
      // Fold 2: correctionPatch snapshots `shared` from `current` itself the
      // FIRST time this row is corrected (current.shared is still null) — a
      // later uncorrect then restores that true shared value at once.
      const patch = correctionPatch(field, value, { ...before, shared: current.shared });
      runCorrection(id, field, () => correctRoleAction(id, field, value), patch, before);
    },
    [rowById, runCorrection],
  );

  const onUncorrectRow = useCallback(
    (id: string, field: CorrectionField) => {
      const current = rowById.get(id);
      if (!current) return;
      const before = {
        season: current.season,
        family: current.family,
        families: current.families,
        visa_class: current.visa_class,
        eligibility_note: current.eligibility_note,
        corrected: current.corrected,
      };
      // Fold 2: the true shared value lives on the row itself (`current.shared`,
      // set by overlayCorrections/correctionPatch) — never a stale prior
      // server read. A field can only be uncorrected if it was corrected
      // first, which is exactly when `shared` was captured, so the fallback
      // to `before` below is unreachable in practice, never a silent no-op.
      const shared = current.shared ?? before;
      const patch = uncorrectionPatch(field, {
        season: shared.season,
        family: shared.family,
        families: shared.families,
        visa_class: shared.visa_class,
        eligibility_note: shared.eligibility_note,
        corrected: current.corrected,
      });
      runCorrection(id, field, () => uncorrectRoleAction(id, field), patch, before);
    },
    [rowById, runCorrection],
  );

  const requestDelete = useCallback((ids: string[], label: string) => {
    setPendingDelete({ ids, label });
    dialogRef.current?.showModal();
  }, []);

  function runDelete(ids: string[], label: string) {
    setDeleteError(null);
    removeRows(ids, true);
    startTransition(async () => {
      const res = await deleteRolesAction(ids).catch(() => ({ ok: false as const, error: "network error" }));
      // same reason
      if (selectedIdRef.current && ids.includes(selectedIdRef.current)) select(null);
      if (!res.ok) {
        removeRows(ids, false);
        setDeleteError({ message: `Remove failed (${res.error}).`, ids, label });
      } else {
        setSelectedForDelete((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
      }
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
    setPendingDelete(null);
  }

  const added = useMemo(
    () => addedToday(recentCreatedAt.map((created_at) => ({ created_at })), nowMs),
    [recentCreatedAt, nowMs],
  );

  const empty = viewRows.length === 0;
  const noFilterMatches = !empty && inView.length === 0;
  const nothingMatches = !empty && !noFilterMatches && groups.length === 0 && query.trim() !== "";
  const seasonLabel = season === ALL_HOME_FILTER ? "All" : SEASON_LABEL[season as Season];
  const familyLabel = family === ALL_HOME_FILTER ? "All" : FAMILY_LABEL[family as Family];
  const selectedCorrectionError = useMemo(
    () => (selected ? correctionErrors.get(selected.id) ?? null : null),
    [selected, correctionErrors],
  );

  return (
    <div className="flex flex-col gap-4 md:h-full">
      {/* D32: the row→pane morph runs on the shared name "role-card". A morph
          needs ONE name on both ends by definition, so the pane wears the row's
          name rather than a second one. Scoped here (globals.css belongs to
          another lane this round). */}
      <style>{`
        ::view-transition-group(role-card),
        ::view-transition-old(role-card),
        ::view-transition-new(role-card) {
          animation-duration: 240ms;
          animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          ::view-transition-group(role-card),
          ::view-transition-old(role-card),
          ::view-transition-new(role-card) { animation: none; }
        }
      `}</style>

      {/* v6 DX3: the split owns the height on md+ — the grid fills <main>, its
          one row is pinned to that height, and each column scrolls on its own
          (min-h-0 + overflow-y-auto). The page header (h1, velocity, chips)
          lives INSIDE the list column so the posting gets the full height.
          Below md nothing here applies: <main> scrolls the page and the pane
          is the fixed slide-over (DX4). */}
      <div className={`grid gap-6 md:-mx-1 md:h-full md:min-h-0 md:grid-rows-[minmax(0,1fr)] md:overflow-hidden md:px-1 ${selected ? "md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" : "md:grid-cols-1"}`}>
        <section aria-label="Roles" className="flex min-w-0 flex-col gap-3 pt-4 pb-6 md:-mx-1 md:min-h-0 md:overflow-y-auto md:px-1 md:pr-2">
          <h1 className="sr-only">Home</h1>

          <VelocityStrip added={added} today={pace.today} week={pace.week} month={pace.month} target={pace.target} />

          <div className="flex flex-wrap items-center gap-2">
            <FilterChips
              items={chipItems}
              active={view}
              onSelect={(key) => switchView(key as HomeView)}
              ariaLabel="Filter roles"
            />
            <div ref={seasonPillRef} className="contents">
              <PillDropdown label="Season" value={season} options={seasonOptions} onSelect={switchSeason} />
            </div>
            <PillDropdown label="Field" value={family} options={familyOptions} onSelect={switchFamily} />
            <PillDropdown label="Tier" value={tier} options={tierOptions} onSelect={switchTier} />
          </div>

          <GetStarted
            userId={userId}
            hasProfile={hasProfile}
            hasScores={hasScores}
            eligible={getStartedEligible}
            filtersDone={season !== ALL_HOME_FILTER || family !== ALL_HOME_FILTER}
            savedDone={optimisticRows.some((row) => row.saved_at !== null)}
            onFocusFilters={focusSeasonFilter}
            onPulseSaved={pulseFirstRow}
          />

          {/* Toolbar + select bar pin to the top of the scrolling column on
              md+. `contents` below md: the wrapper generates no box there, so
              the toolbar stays in flow and the select bar keeps the column as
              its sticky containing block, exactly as before. The column's
              -mx-1/px-1 and this pt-1 are a 4px bleed so ring-2 + offset-2
              focus rings are not clipped by the column's overflow. */}
          <div className="contents md:sticky md:top-0 md:z-10 md:flex md:flex-col md:gap-3 md:border-b md:border-hairline md:bg-bg md:pb-3 md:pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput onQuery={setQuery} />
              <SortControl value={sort} onChange={setSort} />
              <button
                type="button"
                onClick={() => {
                  setSelectMode((on) => !on);
                  setSelectedForDelete(new Set());
                }}
                aria-pressed={selectMode}
                className={`${barButton} ml-auto text-text-dim`}
              >
                {selectMode ? "Done" : "Select"}
              </button>
            </div>

            {selectMode ? (
              <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-hairline bg-bg py-2 md:border-b-0">
                <span className="font-label text-[11px] uppercase tracking-label text-text-dim">
                  <span className="font-sans tabular-nums">{selectedIds.length}</span> selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedForDelete(new Set(visibleIds))}
                  className={`${barButton} text-text-dim`}
                >
                  Select all shown
                </button>
                <button
                  type="button"
                  onClick={() => requestDelete(selectedIds, `${selectedIds.length} selected roles`)}
                  disabled={selectedIds.length === 0}
                  className={`${barButton} text-danger`}
                >
                  Remove selected
                </button>
              </div>
            ) : null}
          </div>

          {flagError ? (
            <p role="alert" className="text-[13px] text-danger">
              {flagError}
            </p>
          ) : null}

          {deleteError ? (
            <p role="alert" className="text-[13px] text-danger">
              {deleteError.message}{" "}
              <button
                type="button"
                onClick={() => runDelete(deleteError.ids, deleteError.label)}
                className="min-h-11 font-sans text-sm text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                Retry
              </button>
            </p>
          ) : null}

          {empty ? (
            <p className="py-6 text-[15px] text-text-dim">
              {view === "saved"
                ? "Nothing saved yet. The bookmark on a row keeps it here for later."
                : view === "hidden"
                  ? "Nothing hidden. Hiding a role takes it out of All without deleting it."
                  : "No open roles right now. The watchers check every few minutes."}
            </p>
          ) : noFilterMatches ? (
            <p className="py-6 text-[15px] text-text-dim">
              No open postings for {seasonLabel} &middot; {familyLabel}. Widen a filter.
            </p>
          ) : nothingMatches ? (
            <p className="py-6 text-[15px] text-text-dim">
              Nothing matches &ldquo;{query}&rdquo;.{" "}
              <span className="font-sans text-sm">Clear search</span>
            </p>
          ) : (
            <ul ref={rowListRef}>
              {shownGroups.map((group) => {
                const renderRow = (role: { id: string }, showCompany: boolean) => {
                  const row = rowById.get(role.id);
                  if (!row) return null;
                  return (
                    <RoleRow
                      key={row.id}
                      row={row}
                      showCompany={showCompany}
                      nowMs={nowMs}
                      selectMode={selectMode}
                      selected={selectedForDelete.has(row.id)}
                      active={row.id === selectedId}
                      morphing={row.id === morphId && row.id !== selectedId}
                      saveExits={view === "saved"}
                      onSelect={select}
                      onToggleSelect={toggleSelect}
                      onConfirmApplied={confirmApplied}
                      onSave={onSaveRow}
                      onHide={onHideRow}
                      onRequestDelete={requestDelete}
                      confirmError={confirmErrors.get(row.id) ?? null}
                    />
                  );
                };
                // Header only when the company has >1 role (doc 4 §6).
                if (group.roles.length === 1) return renderRow(group.roles[0], true);
                return (
                  <CompanyGroup
                    key={group.company_id}
                    name={group.company_name}
                    url={group.roles[0].company_url}
                    count={group.roles.length}
                    expanded={expanded.has(group.company_id)}
                    onToggle={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.company_id)) next.delete(group.company_id);
                        else next.add(group.company_id);
                        return next;
                      })
                    }
                    first={renderRow(group.roles[0], false)}
                    rest={group.roles.slice(1).map((role) => renderRow(role, false))}
                  />
                );
              })}
            </ul>
          )}

          {/* A15: the tail of the list, one click away. The rows behind it are
              already in memory — the chips above, the search and the sort all
              counted them — so this reveals markup, never data. The button
              stays MOUNTED across the toggle (the CompanyGroup expander
              pattern): unmounting it on click drops keyboard/SR focus to
              <body> with nothing announced. */}
          {hiddenByCap > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll((on) => !on)}
              aria-expanded={showAll}
              className={`${barButton} self-start text-text-dim`}
            >
              {showAll
                ? "Show fewer companies"
                : `Show ${hiddenByCap} more ${hiddenByCap === 1 ? "company" : "companies"}`}
            </button>
          ) : null}
        </section>

        {/* The pane is its own scroll container beside the list (V3: selecting
            the bottom row of a long list must never mean scrolling back up to
            read it). */}
        <section
          ref={paneRef}
          tabIndex={-1}
          aria-label="Role details"
          onKeyDown={(e) => {
            if (e.key === "Escape" && window.matchMedia(NARROW).matches) select(null);
          }}
          className={
            selected
              ? `${styles.pane} fixed inset-0 z-40 overflow-y-auto bg-bg px-6 py-4 focus-visible:outline-none md:static md:z-auto md:bg-transparent ${PANE_COLUMN}`
              : `hidden md:block ${PANE_COLUMN}`
          }
        >
          {selected ? (
            <RoleDetailPane
              key={selected.id}
              row={selected}
              nowMs={nowMs}
              morphing={selected.id === morphId}
              onConfirmApplied={confirmApplied}
              onSave={onSaveRow}
              onHide={onHideRow}
              onRequestDelete={requestDelete}
              onBack={() => select(null)}
              onCorrectRow={onCorrectRow}
              onUncorrectRow={onUncorrectRow}
              correctionPending={correctionPending}
              correctionError={selectedCorrectionError}
            />
          ) : (
            // RB-024: designed empty state, thin icon + one line (doc 4 §6).
            <div className="hidden min-h-64 flex-col items-center justify-center gap-3 text-text-dim md:h-full md:min-h-0">
              <FileTextIcon thin />
              <p className="text-[15px]">
                {selectedId ? "That role is gone." : "Select a role to read the posting."}
              </p>
            </div>
          )}
        </section>
      </div>

        {/* a11y (km-ui): native <dialog> + showModal() already gives Escape,
            the focus trap and an inert background, and maps to the dialog role
            in the a11y tree. role/aria-modal are stated EXPLICITLY anyway —
            the S4 persona audit found every modal on this app with
            `querySelectorAll('[aria-modal],[role=dialog]').length === 0`, and
            tests/dialog-a11y.test.ts keeps them there. */}
      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-remove-title"
        onClose={() => setPendingDelete(null)}
        className={`m-auto w-full max-w-sm border border-hairline bg-raised p-5 text-text ${dialogMotion}`}
      >
        <p id="home-remove-title" className="text-[15px]">
          Remove {pendingDelete?.label}? This removes the role from your Prospect feed only.
          To keep it available under Hidden, hide it instead.
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
              if (pending) runDelete(pending.ids, pending.label);
            }}
            className={`${barButton} text-danger`}
          >
            Remove
          </button>
        </div>
      </dialog>
    </div>
  );
}
