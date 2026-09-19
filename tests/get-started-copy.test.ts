import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("../components/get-started.tsx", import.meta.url)),
  "utf8",
);

const D27_STRINGS = [
  "See only your term and role",
  "Save a posting worth applying to",
  "Tell us one thing that is off",
  "You&apos;re set. New postings land every 30 minutes; the saved ones are yours to track.",
];

test("components/get-started.tsx uses the D27 outcome copy", () => {
  for (const line of D27_STRINGS) {
    assert.ok(source.includes(line), `missing D27 string: ${line}`);
  }
});

test("components/get-started.tsx has no em dash", () => {
  assert.ok(!source.includes("—"), "em dash found in get-started.tsx");
});
