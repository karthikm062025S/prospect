// The pure half of the Rise entrance, in a plain .ts module so the node
// --experimental-strip-types test runner can import and EXERCISE it (the same
// split components/motion/reveal-math.ts already uses — a .tsx module cannot be
// imported by these tests, only read as source).
//
// design/SYSTEM.md "Motion grammar": Rise is a 12px rise + fade, 200ms, ease
// [0.23, 1, 0.32, 1], with a 0.04-0.06s stagger between siblings, never more.

export const RISE_DURATION = 0.2;
export const RISE_EASE = [0.23, 1, 0.32, 1] as const;
/** Sibling stagger in seconds. */
export const RISE_STAGGER = 0.05;
/** Beyond this index every sibling shares the last delay: Home renders up to
 *  144 rows, and an uncapped 0.05s/row would leave the tail blank for 7s. */
export const RISE_STAGGER_CAP = 8;

export function riseDelay(index: number): number {
  return Math.min(Math.max(index, 0), RISE_STAGGER_CAP) * RISE_STAGGER;
}
