import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal fake Supabase client covering the query chains exercised by tests.
// Originated in tests/tombstone-replay.test.ts (RB-008 tombstone replay);
// shared here so tests can use the same in-memory tables without duplicating
// query stubs.
export type Row = Record<string, unknown>;

export function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  function table(name: string) {
    const rows = (tables[name] ??= []);
    let filtered = rows;
    let mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | undefined;
    let conflictColumns: string[] = [];
    let limitN: number | undefined;

    async function execute(kind: "single" | "maybeSingle" | "many") {
      if (mode === "insert") {
        const inserted: Row = { id: `${name}-${rows.length + 1}`, ...payload };
        rows.push(inserted);
        return kind === "many" ? { data: [inserted], error: null } : { data: inserted, error: null };
      }
      if (mode === "upsert") {
        const match = conflictColumns.length > 0
          ? rows.find((row) => conflictColumns.every((column) => row[column] === payload?.[column]))
          : undefined;
        const upserted = match ?? { id: `${name}-${rows.length + 1}`, ...payload };
        if (match) Object.assign(match, payload);
        else rows.push(upserted);
        return kind === "many" ? { data: [upserted], error: null } : { data: upserted, error: null };
      }
      if (mode === "delete") {
        const deleted = [...filtered];
        const deletedSet = new Set(deleted);
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (deletedSet.has(rows[i])) rows.splice(i, 1);
        }
        if (kind === "single" || kind === "maybeSingle") return { data: deleted[0] ?? null, error: null };
        return { data: deleted, error: null };
      }
      if (mode === "update") {
        for (const row of filtered) Object.assign(row, payload);
        if (kind === "single") return { data: filtered[0] ?? null, error: null };
        if (kind === "maybeSingle") return { data: filtered[0] ?? null, error: null };
        return { data: filtered, error: null };
      }
      const result = limitN != null ? filtered.slice(0, limitN) : filtered;
      if (kind === "single" || kind === "maybeSingle") return { data: result[0] ?? null, error: null };
      return { data: result, error: null };
    }

    const api = {
      select() {
        return api;
      },
      insert(p: Row) {
        mode = "insert";
        payload = p;
        return api;
      },
      update(p: Row) {
        mode = "update";
        payload = p;
        return api;
      },
      upsert(p: Row, options?: { onConflict?: string }) {
        mode = "upsert";
        payload = p;
        conflictColumns = options?.onConflict?.split(",").map((column) => column.trim())
          ?? (p.id === undefined ? [] : ["id"]);
        return api;
      },
      delete() {
        mode = "delete";
        return api;
      },
      eq(col: string, val: unknown) {
        filtered = filtered.filter((r) => r[col] === val);
        return api;
      },
      // Task 3 L1 fold 2: the dedup-triple collision guard needs "every OTHER row".
      neq(col: string, val: unknown) {
        filtered = filtered.filter((r) => r[col] !== val);
        return api;
      },
      in(col: string, values: unknown[]) {
        filtered = filtered.filter((r) => values.includes(r[col]));
        return api;
      },
      ilike(col: string, val: string) {
        const unescaped = val.replace(/\\([\\%_])/g, "$1").toLowerCase();
        filtered = filtered.filter((r) => typeof r[col] === "string" && (r[col] as string).toLowerCase() === unescaped);
        return api;
      },
      is(col: string, val: null) {
        filtered = filtered.filter((r) => r[col] === val);
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      // Task 3 L1: canonical_key lookup needs "oldest row wins" (.order("created_at").limit(1)).
      // Sorts a COPY so the underlying table array is never reordered in place.
      order(col: string, options?: { ascending?: boolean }) {
        const ascending = options?.ascending !== false;
        filtered = [...filtered].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          if (av == null) return ascending ? -1 : 1;
          if (bv == null) return ascending ? 1 : -1;
          return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
        });
        return api;
      },
      maybeSingle: () => execute("maybeSingle"),
      single: () => execute("single"),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        execute("many").then(resolve, reject),
    };
    return api;
  }

  return { from: table } as unknown as SupabaseClient;
}
