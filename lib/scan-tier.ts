// Tier split for the fast discovery lane (RB-082 v2, slice 6c). Pure so the
// route and tests/scan-tier.test.ts share it with zero I/O.
//
// note: normName is a deliberate copy of scripts/read-alerts.mjs#normName
// (D6: a helper needed by both the app graph and the test runner is INLINED —
// importing the .mjs would drag the whole alerts parser into the route bundle).
// tests/scan-tier.test.ts locks the behaviour so drift surfaces as a red test.

export type Tier = "hot" | "full";

export type Targets = {
  companies?: Record<string, string>;
  aliases?: Record<string, string>;
};

export function normName(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop "(SIG)"/"(Optum)"/"(Evernorth)" decorations
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|corp|corporation|ltd|plc|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// hot = endpoints whose company resolves to a targets.json target: a
// `companies` key, the parenthetical content of one ("SIG"), or an `aliases`
// key — the same three keys read-alerts.mjs#loadContext builds. full = all.
export function filterTier<T extends { company: string }>(endpoints: T[], targets: Targets, tier: Tier): T[] {
  if (tier === "full") return endpoints;
  const hot = new Set<string>();
  for (const name of Object.keys(targets.companies ?? {})) {
    hot.add(normName(name));
    const paren = name.match(/\(([^)]+)\)/);
    if (paren) hot.add(normName(paren[1]));
  }
  for (const alias of Object.keys(targets.aliases ?? {})) hot.add(normName(alias));
  hot.delete("");
  return endpoints.filter((ep) => hot.has(normName(ep.company)));
}
