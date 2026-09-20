"use client";

// The app bar: replaces components/sidebar.tsx (04-uiux-brief.md §5/§6).
// v6 DX1/DX2: a normal top child of the h-dvh shell — content scrolls inside
// <main> beneath it, never behind it, so no sticky. v8 D4: the row became a
// CENTRED capsule mirroring the landing nav (components/landing/landing-nav.tsx),
// with sign out and the theme toggle moved off the bar
// into components/account-menu.tsx. Sliding active indicator measured off the
// active tab's own DOM rect; tab clicks go through the view-transition helper
// (spike 2 pattern) instead of a plain <Link>.

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isActive } from "@/lib/nav";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/account-menu";
import { FeedbackTrigger } from "@/components/feedback-box";
import { ChatIcon } from "@/components/icons";
import { useViewTransitionNav } from "@/components/view-transition";
import type { Profile } from "@/lib/profile";
import {
  subscribeWeekDelta,
  getWeekDelta,
  getServerWeekDelta,
  resetWeekDeltaSilently,
} from "@/components/week-count";

type IndicatorRect = { left: number; width: number };

export function TabBar({ weekCount, profile }: { weekCount: number; profile: Profile }) {
  const pathname = usePathname();
  const navigate = useViewTransitionNav();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<IndicatorRect | null>(null);
  // Optimistic UI (04-uiux-brief.md §8): the underlying pages are
  // force-dynamic with a live server query, so the real route commit can lag
  // well past SC-4's 200ms budget. The indicator (and the tab's active
  // state) responds to the CLICK, not the eventual pathname — "skeleton
  // counts as rendered" per 02-trd.md §11. Reset-during-render (React's
  // documented pattern for clearing derived state on a prop change, instead
  // of an effect) reconciles it once the route actually catches up.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [committedPathname, setCommittedPathname] = useState(pathname);
  if (pathname !== committedPathname) {
    setCommittedPathname(pathname);
    setPendingHref(null);
  }

  // Optimistic Applications badge (doc 4 §6): weekCount is server-computed;
  // the delta bumps at the optimistic row-exit so the tick is synchronous
  // with it (under reduced motion the tick IS the confirmation). When the
  // server prop catches up, reset-during-render drops the delta — the same
  // pattern as pendingHref above; the setState re-render re-reads the
  // snapshot, so the committed badge never double-counts.
  const weekDelta = useSyncExternalStore(subscribeWeekDelta, getWeekDelta, getServerWeekDelta);
  const [seenWeekCount, setSeenWeekCount] = useState(weekCount);
  if (weekCount !== seenWeekCount) {
    setSeenWeekCount(weekCount);
    resetWeekDeltaSilently();
  }
  const shownWeekCount = weekCount + weekDelta;

  const effectivePath = pendingHref ?? pathname;
  const activeIndex = useMemo(
    () => NAV.findIndex((item) => isActive(effectivePath, item.href)),
    [effectivePath],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeTab = activeIndex === -1 ? null : tabRefs.current[activeIndex];
    if (!container || !activeTab) {
      // No tab matches the current route — don't leave the pill floating on a stale tab.
      setIndicator(null);
      return;
    }

    // offsetLeft/offsetWidth are relative to the container (the nearest
    // positioned ancestor) and, unlike getBoundingClientRect(), are NOT
    // affected by the container's own horizontal scroll — needed since the
    // bar scrolls internally on narrow viewports (below).
    function measure() {
      if (!activeTab) return;
      setIndicator({ left: activeTab.offsetLeft, width: activeTab.offsetWidth });
    }

    measure();
    // Baseline defect 3: at 390 the four labels cannot fit the capsule, so the
    // bar scrolls — and "Applications" was left clipped mid-word as "APP".
    // Scrolling the ACTIVE tab fully into view is what turns a clipped label
    // into a deliberate edge (SYSTEM.md Navigation: below md the bar is logo +
    // scrollable tabs + avatar; ui_laws.md #3 Jakob's Law — this is the
    // scrolling tab strip every mobile app already uses). `nearest` so a tab
    // already fully visible never jumps.
    activeTab.scrollIntoView({ inline: "nearest", block: "nearest" });
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeIndex]);

  function focusTab(index: number) {
    const wrapped = (index + NAV.length) % NAV.length;
    tabRefs.current[wrapped]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    }
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return; // let the browser handle new-tab / new-window clicks natively
    }
    event.preventDefault();
    setPendingHref(href);
    navigate(href);
  }

  return (
    // D4: the signed-in bar mirrors the landing capsule -- one centred
    // max-w-[min(100%,940px)] pill on the shell's own ground, three zones
    // (mark / tabs / you) instead of the old left-packed row of controls.
    <header className="relative z-40 flex w-full shrink-0 justify-center px-gutter py-2">
      <div className="flex w-full max-w-[min(100%,940px)] items-center gap-3 rounded-pill border border-hairline bg-raised/80 px-2 backdrop-blur">
        <Logo href="/welcome?view=landing" size={24} className="shrink-0 px-1" />

        {/* The tabs own the middle: flex-1 between two shrink-0 zones centres
            them in the capsule; `safe center` degrades to flex-start the moment
            the tabs overflow, so the first tab is never pushed into the
            unreachable start-overflow that a plain `center` creates below md.
            scrollbar-width:none hides the track that shows there -- touch
            scroll still works, nothing is clipped.
            `relative` is what the sliding indicator measures against
            (offsetLeft is relative to the nearest positioned ancestor and,
            unlike getBoundingClientRect, survives this container's own
            horizontal scroll). */}
        <div
          ref={containerRef}
          className="relative flex min-h-[44px] min-w-0 flex-1 snap-x items-center gap-1 overflow-x-auto overscroll-x-contain [justify-content:safe_center] [mask-image:linear-gradient(to_right,transparent_0,black_12px,black_calc(100%_-_12px),transparent_100%)] [scrollbar-width:none] md:[mask-image:none]"
        >
          {indicator ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-1 left-0 rounded-pill bg-sage/10"
              style={{
                width: indicator.width,
                transform: `translateX(${indicator.left}px)`,
                transition: "transform 240ms cubic-bezier(0,0,0.2,1), width 240ms cubic-bezier(0,0,0.2,1)",
              }}
            />
          ) : null}
          {/* z-10 without `relative`: a flex ITEM honours z-index while staying
                unpositioned, so each tab's offsetParent is still the measured
                container above and the indicator maths keeps working. */}
          <nav aria-label="Primary" className="z-10 flex items-center gap-1">
            {NAV.map((item, index) => {
              const active = index === activeIndex;
              const badge = item.href === "/applications" && shownWeekCount > 0 ? shownWeekCount : null;
              return (
                <Link
                  key={item.href}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  // Roving tabindex; when NO tab matches the route (activeIndex -1),
                  // the first tab stays reachable so the bar never drops out of Tab order.
                  tabIndex={activeIndex === -1 ? (index === 0 ? 0 : -1) : active ? 0 : -1}
                  onClick={(event) => handleClick(event, item.href)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={`flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-pill px-3 font-label text-[11px] uppercase tracking-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                    active ? "text-sage" : "text-text-dim hover:text-text"
                  }`}
                >
                  {item.label}
                  {/* D1: digits are Satoshi tabular, never the label face. */}
                  {badge !== null ? (
                    <span className="font-sans text-[11px] tabular-nums text-text-dim">{badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* v7 D22: filled accent pill. A plain button (FeedbackTrigger), not a
            Link -- it never joins NAV.map/tabRefs, so it takes no part in the
            roving tabindex or the sliding indicator. hidden md:flex mirrors
            FeedbackFab's md:hidden (feedback-box.tsx) so exactly one feedback
            trigger is visible per breakpoint; below md the right zone is the
            avatar alone. */}
        <div className="flex shrink-0 items-center gap-3">
          <FeedbackTrigger
            aria-label="Feedback"
            className="accent-fill-on-raised hidden min-h-11 shrink-0 items-center gap-1.5 rounded-pill bg-accent px-4 font-label text-[11px] uppercase tracking-label text-ink hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage md:flex"
          >
            <ChatIcon />
            Feedback
          </FeedbackTrigger>
          <AccountMenu profile={profile} />
        </div>
      </div>
    </header>
  );
}
