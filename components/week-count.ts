// Optimistic delta for the Applications-tab badge (doc 4 §6): under reduced
// motion the badge tick IS the apply confirmation, so it must move at the
// same moment the row optimistically leaves — not after the revalidation
// round-trip. Module-level external store (the theme-toggle pattern);
// consumed via useSyncExternalStore in TabBar, bumped by HomeList.
let delta = 0;
const listeners = new Set<() => void>();

export function subscribeWeekDelta(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getWeekDelta(): number {
  return delta;
}

export function getServerWeekDelta(): number {
  return 0;
}

// +1 at optimistic row-exit; -1 if the server action then fails (the row
// comes back, so must the badge).
export function bumpWeekCount(by: number = 1) {
  delta += by;
  listeners.forEach((cb) => cb());
}

// Silent (no notify): called from TabBar's reset-during-render when the
// server-computed weekCount prop changes — the triggering render re-reads
// the snapshot immediately, so notifying would be redundant work.
export function resetWeekDeltaSilently() {
  delta = 0;
}
