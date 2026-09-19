export const ALL_HOME_FILTER = "all" as const;

export type HomeFilters = {
  season: string;
  family: string;
};

// Task 2 / D3-D4 (lane L1, 2026-09-15): a row is one or more families at once
// (e.g. ai_ml + swe), so the family filter is membership, not equality.
type FilterableHomeRow = {
  season: string;
  families: readonly string[];
};

export type HomeFilterCounts = {
  season: Record<string, number>;
  family: Record<string, number>;
};

function seasonMatches(value: string, selected: string): boolean {
  return selected === ALL_HOME_FILTER || value === selected;
}

function familyMatches(families: readonly string[], selected: string): boolean {
  return selected === ALL_HOME_FILTER || families.includes(selected);
}

export function applyFilters<T extends FilterableHomeRow>(
  rows: readonly T[],
  filters: HomeFilters,
): T[] {
  return rows.filter(
    (row) => seasonMatches(row.season, filters.season) && familyMatches(row.families, filters.family),
  );
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function filterCounts<T extends FilterableHomeRow>(
  rows: readonly T[],
  current: HomeFilters,
): HomeFilterCounts {
  const season: Record<string, number> = { [ALL_HOME_FILTER]: 0 };
  const family: Record<string, number> = { [ALL_HOME_FILTER]: 0 };

  for (const row of rows) {
    if (familyMatches(row.families, current.family)) {
      season[ALL_HOME_FILTER] += 1;
      increment(season, row.season);
    }
    if (seasonMatches(row.season, current.season)) {
      family[ALL_HOME_FILTER] += 1;
      // A row counts once per family it belongs to (D3/D4), not once total.
      for (const fam of row.families) increment(family, fam);
    }
  }

  return { season, family };
}
