import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// v9 landing entry. Every redirect that lands a visitor on /welcome must open on
// the hero. Next keeps the PREVIOUS focusAndScrollRef.hashFragment on any
// hashless navigation (node_modules/next/dist/client/components/segment-cache/
// navigation.js), so a fragment left over from earlier in the session re-scrolls
// the landing to that section on arrival.
//
// The fix is at the DESTINATION (components/landing/open-on-hero.tsx), not on the
// redirect. Putting the fragment on the redirect was tried and reverted: a hash in
// the entry URL poisons Next's stored canonical URL, which appends each later hash
// to it, so the nav logo and the section links then build "#hero#hero" /
// "#hero#feed" -- ids that resolve to nothing. Verified on a real preview
// deployment, which is why these two rules are locked together here:
//   1. no cross-route link to /welcome carries a fragment;
//   2. the landing mounts the island that corrects the scroll.

const ROOTS = ["app", "lib", "components", "proxy.ts"];
const PAGE = "app/welcome/page.tsx";
const ISLAND = "components/landing/open-on-hero.tsx";

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

/** Source files under a root, minus build output and dotted dirs. */
function sourceFiles(root: string): string[] {
  if (fs.statSync(root).isFile()) return [root];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments so prose about /welcome is not read as a destination. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("no cross-route link to /welcome carries a fragment", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const code = stripComments(read(file));
      for (const match of code.matchAll(/["'`][^"'`]*?\/welcome([^"'`]*)["'`]/g)) {
        if (match[1].includes("#")) offenders.push(`${file}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a fragment in the entry URL poisons Next's canonical and breaks every later in-page anchor",
  );
});

test("the landing mounts the island that opens it on the hero", () => {
  const page = read(PAGE);
  assert.match(page, /import \{ OpenOnHero \} from "@\/components\/landing\/open-on-hero";/);
  assert.match(page, /<OpenOnHero \/>/);
});

test("the island corrects the scroll only when no fragment was asked for", () => {
  const island = read(ISLAND);
  // The early return is the whole contract: a visitor who asked for #feed by name
  // keeps it, and only a hashless arrival is forced to the top.
  assert.match(island, /if \(window\.location\.hash\) return;/);
  assert.match(island, /scrollTo\(\{ top: 0/);
  // An effect, not a layout effect: it has to run AFTER Next's layout-effect
  // scroll handler to override the carried-forward fragment.
  assert.match(island, /useEffect\(/);
  assert.doesNotMatch(island, /useLayoutEffect/);
});

test("sign-out and the expired-session bounce still target the landing", () => {
  const dests = [...read("app/auth/actions.ts").matchAll(/redirect\("([^"]*)"\)/g)].map((m) => m[1]);
  assert.ok(dests.includes("/welcome"), "signOutAction must still redirect to the landing");
  assert.match(read("lib/require-user.ts"), /redirect\("\/welcome"\)/);
});
