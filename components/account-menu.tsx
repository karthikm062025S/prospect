"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { FeedbackTrigger } from "@/components/feedback-box";
import { ThemeToggle } from "@/components/theme-toggle";
import { firstName, initials, type Profile } from "@/lib/profile";

// D4: everything that used to sit loose in the bar (sign out, the theme
// toggle) lives behind this one control, so the bar reads as
// logo / tabs / feedback / you.
const ITEM =
  "flex min-h-11 w-full items-center rounded-card px-3 text-left font-sans text-sm text-text hover:bg-text/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";

const LINKS = [
  { label: "Profile", href: "/settings#profile" },
  { label: "Account", href: "/settings#account" },
  { label: "Settings", href: "/settings#settings" },
] as const;

function Divider() {
  return <span aria-hidden="true" className="my-1 block h-px bg-hairline" />;
}

export function AccountMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  // A menu that survives a navigation would hang over the new page; the
  // Profile/Account/Settings links all navigate, so closing on the committed
  // pathname is the one rule that covers every exit. Reset-during-render is
  // React's own pattern for clearing state on a prop change (the same one
  // components/tab-bar.tsx uses for its optimistic href) — an effect here
  // would paint the stale-open menu on the new route for one frame first.
  const [committedPathname, setCommittedPathname] = useState(pathname);
  if (pathname !== committedPathname) {
    setCommittedPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Roving focus by DOM order rather than a hand-kept index: the rows are a
  // mix of links, buttons and a submit, and querying them keeps the order the
  // user actually sees even as rows come and go.
  function moveFocus(step: number) {
    const menu = menuRef.current;
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = current === -1 ? (step > 0 ? 0 : items.length - 1) : (current + step + items.length) % items.length;
    items[next].focus();
  }

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${firstName(profile)}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
        }}
        className="flex min-h-11 items-center gap-2 rounded-pill px-1.5 text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Google avatar URL is not a project asset; next/image would need a remote-host allowlist for a 24px picture.
          <img
            src={profile.avatarUrl}
            alt=""
            width={24}
            height={24}
            referrerPolicy="no-referrer"
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage/15 font-sans text-[11px] leading-none text-sage"
          >
            {initials(profile)}
          </span>
        )}
        <span className="hidden font-sans text-sm md:inline">{firstName(profile)}</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(100%+8px)] z-50 flex min-w-[220px] max-w-[calc(100vw-2rem)] flex-col rounded-card border border-hairline bg-raised p-1.5 shadow-lg"
        >
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} role="menuitem" className={ITEM}>
              {link.label}
            </Link>
          ))}
          <Divider />
          <ThemeToggle variant="menu" />
          <Divider />
          <FeedbackTrigger role="menuitem" className={ITEM}>
            Send feedback
          </FeedbackTrigger>
          <Link href="/privacy" role="menuitem" className={ITEM}>
            Privacy
          </Link>
          <Link href="/terms" role="menuitem" className={ITEM}>
            Terms
          </Link>
          <Divider />
          <form action={signOutAction}>
            <button type="submit" role="menuitem" className={ITEM}>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
