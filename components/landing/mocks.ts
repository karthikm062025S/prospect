import fs from "node:fs";
import path from "node:path";

// Server-only. The landing's screenshot strip and the two product bands show
// REAL captures of the running app, never placeholder art (MISSION D-UI6).
// The orchestrator owns the captures (a worker cannot reach localhost), so
// until it drops PNGs into public/mocks/ this returns an empty list and every
// consumer renders its own NAMED empty state.
//
// Read at render time on the server: the folder is filled by the orchestrator
// after this lane is written, and the page is already dynamic (it reads the
// session cookie), so there is no build-time snapshot to go stale.

const DIR = path.join(process.cwd(), "public", "mocks");

export type MockShot = {
  /** Public URL of the capture. */
  src: string;
  /** Filename stem, lowercased: the name a band asks for ("feed", "roadmap"). */
  name: string;
  /** Alt text derived from the stem, so a real capture is never unlabelled. */
  alt: string;
};

function toAlt(stem: string): string {
  const words = stem.replace(/[-_]+/g, " ").trim();
  if (!words) return "Prospect app screenshot";
  return `Prospect ${words} screen`;
}

/** Every .png in public/mocks, sorted by filename. [] when the folder holds only its README. */
export function listMockShots(): MockShot[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(DIR);
  } catch {
    // The folder is committed with a README, so this is the "not checked out"
    // case. An empty list is the named-empty-state path, not a silent success.
    return [];
  }
  return entries
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort()
    .map((file) => {
      const stem = file.slice(0, -4).toLowerCase();
      return { src: `/mocks/${file}`, name: stem, alt: toAlt(stem) };
    });
}

/** The capture a band asks for by name, or null when it has not been dropped in yet. */
export function findMockShot(name: string): MockShot | null {
  return listMockShots().find((shot) => shot.name.startsWith(name)) ?? null;
}
