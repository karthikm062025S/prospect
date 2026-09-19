// Zero imports (see lib/public-stats-format.ts header for why): keeps this
// testable under `npm test` (node --experimental-strip-types can't resolve
// `next/cache`), unlike the unstable_cache-wrapped functions it guards.
//
// `unstable_cache` never memoizes a call that throws (verified against
// node_modules/next/dist/server/web/spec-extension/unstable-cache.js: the
// cache-write only runs after the wrapped callback resolves). So a cached
// reader must THROW on failure, and the fallback-on-failure logic must live
// OUTSIDE the unstable_cache boundary — otherwise a caught-and-returned empty
// value gets cached as if it were real data (one DB blip = an empty landing
// for the whole revalidate window).

/** Wraps a (possibly cached) reader so a thrown failure never reaches the
 * caller — but is never itself cached, since it runs after unstable_cache
 * has already decided not to store anything. */
export function guardedRead<T>(
  read: () => Promise<T>,
  fallback: T | (() => T),
  label: string,
): () => Promise<T> {
  return async () => {
    try {
      return await read();
    } catch (error) {
      console.error(`[${label}] read failed`, error);
      return typeof fallback === "function" ? (fallback as () => T)() : fallback;
    }
  };
}
