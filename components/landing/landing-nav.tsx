"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { Logo } from "@/components/logo";
import { GoogleCta } from "@/components/landing/google-cta";
import { CaretDownIcon, ChatCircleIcon } from "@/components/landing/icons";
import { openFeedback } from "@/components/landing/feedback";
import { FeedbackTrigger } from "@/components/feedback-box";

const LINKS = [
  { label: "Live feed", href: "#feed" },
  { label: "How to use", href: "#how-to" },
  { label: "Features", href: "#features" },
] as const;

// v7 D22: feedback has to be highly visible and top right. Second strongest
// element after the sign-in pill (ui_laws 7: one dominant CTA,
// secondary actions quieter but never hidden), an accent FILL so the two never
// compete for "primary", sitting beside the Google pill because that is where
// attention already is (ui_laws 8). 44px, icon plus label (ui_laws 2).
//
// Fold 1 item 7: the button itself is components/feedback-box.tsx's
// FeedbackTrigger, the one open-control primitive the app bar and the fab also
// use (ui_laws 16). Only the skin is local, because this pill sits on the nav
// capsule's --raised ground rather than the app bar's, and needs a ring that
// the bar's pill does not: #e69a6f is 2.12:1 on --raised, under WCAG 1.4.11's
// 3:1 for a control's boundary. The --text ring measures 13.84:1 on the light
// capsule and 8.80:1 on the night one; the --ink label is 6.07:1 / 5.15:1 on
// the fill.
const FEEDBACK_PILL =
  "inline-flex items-center gap-2 rounded-pill border border-text bg-accent pl-3 pr-4 font-label text-step-2xs uppercase tracking-label text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text focus-visible:ring-offset-2 focus-visible:ring-offset-raised";

const MORE = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;

// The Framer "Pill Dropdown Nav" pattern: one frosted pill, a shared `layoutId`
// capsule that slides between items, and a rounded card that opens under the
// item that owns it. Hover AND focus open it; Escape closes it and returns focus
// to the trigger, so it is usable with a keyboard alone.
export function LandingNav({ signedIn = false }: { signedIn?: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const [openMore, setOpenMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 220));

  useEffect(() => {
    if (!openMore && !menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenMore(false);
      moreRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openMore, menuOpen]);

  function openSheet() {
    setMenuOpen(true);
    dialogRef.current?.showModal();
  }
  function closeSheet() {
    setMenuOpen(false);
    dialogRef.current?.close();
  }

  return (
    // reducedMotion="user": the capsule spring and the dropdown transition go
    // static under prefers-reduced-motion (contract V7) without a second code path.
    <MotionConfig reducedMotion="user">
      <header className="scout-nav fixed inset-x-0 z-50 flex justify-center px-gutter">
        <nav
          aria-label="Primary"
          onMouseLeave={() => {
            setActive(null);
            setOpenMore(false);
          }}
          className={`scout-nav-capsule relative isolate flex w-full max-w-[min(100%,940px)] items-center gap-1 border border-hairline px-2 py-1.5 transition-colors duration-200 ${
            scrolled ? "bg-raised" : "bg-raised/80 backdrop-blur"
          }`}
        >
          <Logo href="#hero" className="px-2 text-step-0" size={28} />

          <div className="ml-2 hidden items-center gap-0.5 lg:flex">
            {LINKS.map((link) => (
              <NavItem
                key={link.href}
                id={link.href}
                active={active}
                onActivate={() => {
                  setActive(link.href);
                  setOpenMore(false);
                }}
              >
                <Link
                  href={link.href}
                  className="relative z-10 flex min-h-11 items-center rounded-pill px-3 font-label text-step-2xs uppercase tracking-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  {link.label}
                </Link>
              </NavItem>
            ))}

            <NavItem
              id="more"
              active={active}
              onActivate={() => setActive("more")}
            >
              <button
                ref={moreRef}
                type="button"
                aria-expanded={openMore}
                aria-haspopup="menu"
                onFocus={() => {
                  setActive("more");
                  setOpenMore(true);
                }}
                onMouseEnter={() => setOpenMore(true)}
                onClick={() => setOpenMore((v) => !v)}
                className="relative z-10 flex min-h-11 items-center gap-1.5 rounded-pill px-3 font-label text-step-2xs uppercase tracking-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                More
                <CaretDownIcon />
              </button>
              <AnimatePresence>
                {openMore ? (
                  <motion.div
                    role="menu"
                    aria-label="More"
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                    style={{ transformOrigin: "top left" }}
                    className="absolute left-0 top-full z-20 pt-[15px]"
                  >
                    <div className="flex w-[212px] flex-col rounded-panel border border-hairline bg-raised p-1.5">
                      {MORE.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          className="flex min-h-11 items-center rounded-card px-3 text-step-xs text-text hover:bg-text/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                        >
                          {item.label}
                        </Link>
                      ))}
                      <a
                        href="#feedback"
                        role="menuitem"
                        onClick={(event) => {
                          event.preventDefault();
                          setOpenMore(false);
                          openFeedback();
                        }}
                        className="flex min-h-11 items-center rounded-card px-3 text-step-xs text-text hover:bg-text/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                      >
                        Send feedback
                      </a>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </NavItem>
          </div>

          {/* D22: feedback beside the primary CTA, never behind a menu. */}
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <FeedbackTrigger className={`${FEEDBACK_PILL} h-9`}>
              <ChatCircleIcon size={18} />
              Feedback
            </FeedbackTrigger>
            <GoogleCta
              label="Sign in"
              signedIn={signedIn}
              className="[&_a]:h-9 [&_a]:text-step-xs [&_button]:h-9 [&_button]:text-step-xs"
            />
          </div>

          <button
            type="button"
            onClick={openSheet}
            className="ml-auto flex min-h-11 items-center rounded-pill px-3 font-label text-step-2xs uppercase tracking-label text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage lg:hidden"
          >
            Menu
          </button>
        </nav>

        {/* Mobile sheet: native <dialog>, so Escape, focus trapping and the
          backdrop are the platform's job, not ours (km-ui rung 1). */}
        <dialog
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onClose={() => setMenuOpen(false)}
          className="m-0 w-full max-w-none rounded-none border-b border-hairline bg-raised p-4 text-text backdrop:bg-black/55"
        >
          <div className="flex items-center justify-between">
            <Logo href="#hero" size={20} />
            <button
              type="button"
              onClick={closeSheet}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-pill font-label text-step-2xs uppercase tracking-label text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Close
            </button>
          </div>
          {/* D22: first item in the sheet, not the last. */}
          <FeedbackTrigger
            className={`${FEEDBACK_PILL} h-11 mt-4 w-full justify-center`}
          >
            <ChatCircleIcon size={18} />
            Feedback
          </FeedbackTrigger>
          <ul className="mt-2 flex flex-col">
            {[...LINKS, ...MORE].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={closeSheet}
                  className="flex min-h-11 items-center text-step-0 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* v8 fixes: close the sheet before the sign-in dialog opens, so the
            two never sit open together. */}
          <div onClickCapture={closeSheet}>
            <GoogleCta
              signedIn={signedIn}
              className="mt-3 [&_a]:w-full [&_a]:justify-center [&_button]:w-full [&_button]:justify-center"
            />
          </div>
        </dialog>
      </header>
    </MotionConfig>
  );
}

// The shared capsule. `layoutId` means ONE pill exists in the tree and Motion
// animates it from its old box to its new one when it re-parents.
function NavItem({
  id,
  active,
  onActivate,
  children,
}: {
  id: string;
  active: string | null;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" onMouseEnter={onActivate} onFocus={onActivate}>
      {active === id ? (
        <motion.span
          layoutId="landing-nav-capsule"
          aria-hidden="true"
          transition={{ type: "spring", duration: 0.32, bounce: 0 }}
          className="absolute inset-y-1 inset-x-0 rounded-full bg-text/[0.07]"
        />
      ) : null}
      {children}
    </div>
  );
}
