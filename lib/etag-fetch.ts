// Conditional-request wrapper for the fast discovery lane (RB-082 v2, slice
// 6c-finish; TRD §13 spike-5 "ETag branch"). scripts/scan-core.mjs already
// threads a `fetchFn` through every vendor fetch; this wraps it so the moved
// body stays untouched:
//   - GET with a stored validator → If-None-Match (or If-Modified-Since when
//     only last_modified is known);
//   - 304 from a vendor whose empty payload we know → a synthetic 200 carrying
//     that empty payload + `x-scout-304: 1`, so normalize() parses "no jobs"
//     and the multi-MB download + JSON.parse (the CPU) is skipped;
//   - 304 from any other host passes through (the core's `!res.ok` throw
//     applies, exactly as before);
//   - every 200 has its etag / last-modified harvested into `updates`.
// POST (Workday) has no validator and passes through untouched.
//
// Pure and injectable: no I/O of its own, the route supplies the base fetch
// and the watch_state rows; tests/etag-fetch.test.ts locks the behaviour.
//
// note: state is keyed by the FULL URL string (endpoint_key = url). Upgrade
// to a per-vendor key (ats:token) only if a vendor URL ever grows volatile
// query params — today's URLs are stable per endpoints.json row.

export type WatchValidator = { etag?: string | null; last_modified?: string | null };
export type WatchState = Map<string, WatchValidator>;

// Same input union as global fetch so the wrapper is assignable to `typeof fetch`
// (scan-core's option type); state is keyed by the resolved URL string.
export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ConditionalFetch = {
  fetch: FetchFn;
  /** url → validators harvested from 200 responses this run (DB-row shaped). */
  updates: Map<string, { etag: string | null; last_modified: string | null }>;
  /** conditional requests sent (a validator was attached) */
  readonly sent: number;
  /** 304s received */
  readonly hits: number;
};

// The exact shape scan-core.mjs#normalize reads for each vendor when a board is
// empty. Any host not listed has no known empty shape → null (pass the 304 on).
const EMPTY_BY_HOST: Record<string, string> = {
  "boards-api.greenhouse.io": '{"jobs":[]}',
  "api.lever.co": "[]",
  "api.ashbyhq.com": '{"jobs":[]}',
};

export function vendorEmptyPayload(url: string): string | null {
  try {
    return EMPTY_BY_HOST[new URL(url).hostname] ?? null;
  } catch {
    return null;
  }
}

export function makeConditionalFetch(baseFetch: FetchFn, state: WatchState): ConditionalFetch {
  const updates: ConditionalFetch["updates"] = new Map();
  let sent = 0;
  let hits = 0;

  const fetch: FetchFn = async (input, init) => {
    if ((init?.method ?? "GET").toUpperCase() !== "GET") return baseFetch(input, init);

    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const stored = state.get(url);
    let res: Response;
    let attached = false;
    if (stored?.etag || stored?.last_modified) {
      const headers = new Headers(init?.headers);
      if (stored.etag) headers.set("if-none-match", stored.etag);
      else headers.set("if-modified-since", stored.last_modified as string);
      sent += 1;
      attached = true;
      res = await baseFetch(url, { ...init, headers });
    } else {
      res = await baseFetch(url, init);
    }

    // Only a 304 we ASKED for means "unchanged"; a 304 to an unconditional GET
    // is a misbehaving upstream and keeps failing the endpoint as before.
    if (res.status === 304 && attached) {
      hits += 1;
      const empty = vendorEmptyPayload(url);
      if (empty === null) return res;
      return new Response(empty, { status: 200, headers: { "content-type": "application/json", "x-scout-304": "1" } });
    }
    if (res.status === 200) {
      const etag = res.headers.get("etag");
      const lastModified = res.headers.get("last-modified");
      if (etag || lastModified) updates.set(url, { etag, last_modified: lastModified });
    }
    return res;
  };

  return {
    fetch,
    updates,
    get sent() {
      return sent;
    },
    get hits() {
      return hits;
    },
  };
}
