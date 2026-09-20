// Shell nav: the three GlassTabBar tabs (04-uiux-brief.md §5/§6). Pure so it
// can be tested standalone and imported type-safely into the client tab bar.
// v5 D30: COMPANIES left the tab bar (admin surface, not a daily-driver need)
// — the /companies routes stay reachable from the company name in either
// detail pane, no route deletion.
export type NavItem = { label: string; href: string };

export const NAV: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Journey", href: "/journey" },
  { label: "Applications", href: "/applications" },
];

// Root "/" is active only on an exact match; every other tab matches its
// whole subtree (startsWith) so detail pages keep their tab lit. Extracted
// from the old components/sidebar.tsx isActive().
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
