export const ALL_HOME_FILTER = "all" as const;

export type HomeFilters = {
  season: string;
  family: string;
  // VTHacks speed pass: optional so every existing caller/test built before
  // the tier pill keeps compiling and behaving unchanged (defaults to "all").
  tier?: string;
};

// Task 2 / D3-D4 (2026-09-15): a row is one or more families at once
// (e.g. ai_ml + swe), so the family filter is membership, not equality. Same
// membership rule for tierTags (a company can carry several tags at once).
type FilterableHomeRow = {
  season: string;
  families: readonly string[];
  tierTags?: readonly string[];
};

export type HomeFilterCounts = {
  season: Record<string, number>;
  family: Record<string, number>;
  tier: Record<string, number>;
};

function seasonMatches(value: string, selected: string): boolean {
  return selected === ALL_HOME_FILTER || value === selected;
}

function familyMatches(families: readonly string[], selected: string): boolean {
  return selected === ALL_HOME_FILTER || families.includes(selected);
}

function tierMatches(tierTags: readonly string[] | undefined, selected: string): boolean {
  return selected === ALL_HOME_FILTER || (tierTags ?? []).includes(selected);
}

export function applyFilters<T extends FilterableHomeRow>(
  rows: readonly T[],
  filters: HomeFilters,
): T[] {
  const tier = filters.tier ?? ALL_HOME_FILTER;
  return rows.filter(
    (row) =>
      seasonMatches(row.season, filters.season) &&
      familyMatches(row.families, filters.family) &&
      tierMatches(row.tierTags, tier),
  );
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function filterCounts<T extends FilterableHomeRow>(
  rows: readonly T[],
  current: HomeFilters,
): HomeFilterCounts {
  const currentTier = current.tier ?? ALL_HOME_FILTER;
  const season: Record<string, number> = { [ALL_HOME_FILTER]: 0 };
  const family: Record<string, number> = { [ALL_HOME_FILTER]: 0 };
  const tier: Record<string, number> = { [ALL_HOME_FILTER]: 0 };

  for (const row of rows) {
    // Each count is measured under only the OTHER two active filters.
    if (familyMatches(row.families, current.family) && tierMatches(row.tierTags, currentTier)) {
      season[ALL_HOME_FILTER] += 1;
      increment(season, row.season);
    }
    if (seasonMatches(row.season, current.season) && tierMatches(row.tierTags, currentTier)) {
      family[ALL_HOME_FILTER] += 1;
      // A row counts once per family it belongs to (D3/D4), not once total.
      for (const fam of row.families) increment(family, fam);
    }
    if (seasonMatches(row.season, current.season) && familyMatches(row.families, current.family)) {
      tier[ALL_HOME_FILTER] += 1;
      for (const t of row.tierTags ?? []) increment(tier, t);
    }
  }

  return { season, family, tier };
}
