import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Task 3 L5 (V6): source-level structural assertions, the codebase's existing
// convention for UI (tests/role-row-layout.test.ts, tests/dialog-a11y.test.ts)
// — no DOM runner is installed here.
const control = readFileSync(new URL("../components/correction-control.tsx", import.meta.url), "utf8");
const row = readFileSync(new URL("../components/role-row.tsx", import.meta.url), "utf8");
const pane = readFileSync(new URL("../components/role-detail-pane.tsx", import.meta.url), "utf8");
const homeList = readFileSync(new URL("../components/home-list.tsx", import.meta.url), "utf8");

const THREE = { "correction-control.tsx": control, "role-row.tsx": row, "role-detail-pane.tsx": pane };

test("the three correction labels exist (Season, Role, Sponsorship)", () => {
  assert.match(pane, /label="Season"/);
  assert.match(pane, /label="Role"/);
  assert.match(pane, /label="Sponsorship"/);
});

test("every correction select carries a visible focus ring and the 44px touch target", () => {
  const selectBlock = control.match(/<select[\s\S]*?<\/select>|<select[\s\S]*?\/>/)?.[0] ?? "";
  assert.notEqual(selectBlock, "", "expected a <select> element in correction-control.tsx");
  assert.match(selectBlock, /focus-visible:ring-2/);
  assert.match(selectBlock, /min-h-11/);
});

test("the correction select's leading option resets to the shared label via onUncorrect", () => {
  assert.match(control, /<option value=\{SHARED_OPTION\}>Shared label<\/option>/);
  assert.match(control, /onUncorrect\(field\)/);
});

test("a corrected field shows a 'your correction' tag", () => {
  assert.match(control, /your correction/);
  assert.match(control, /isCorrected/);
});

test("pending state disables the select and marks it aria-busy", () => {
  assert.match(control, /disabled=\{pending\}/);
  assert.match(control, /aria-busy=\{pending\}/);
});

test("the correction error is a role=\"alert\" line in text-danger", () => {
  assert.match(pane, /role="alert"[\s\S]{0,80}text-danger[\s\S]{0,40}correctionError|correctionError[\s\S]{0,120}role="alert"/);
});

test("the sponsorship flag text is a JSX text expression, never dangerouslySetInnerHTML", () => {
  for (const [file, src] of Object.entries(THREE)) {
    assert.doesNotMatch(src, /dangerouslySetInnerHTML/, `${file} must not use dangerouslySetInnerHTML for flag/correction text`);
  }
  assert.match(row, /\{row\.eligibility_note\s*\?\?\s*`\$\{VISA_LABELS\[row\.visa_class\]/);
});

// Task 3 done-gate L5 fix (2026-09-16): the "(your correction)" suffix must
// be guarded by row.corrected.includes("visa_class") specifically, not just
// present anywhere in the flag line.
test("the flag line's '(your correction)' suffix is guarded by row.corrected.includes(\"visa_class\")", () => {
  const flagStart = row.indexOf("{row.visa_class ? (");
  const flagEnd = row.indexOf("</p>", flagStart);
  assert.ok(flagStart !== -1 && flagEnd !== -1, "expected the flag-line paragraph");
  const flagBlock = row.slice(flagStart, flagEnd);
  const correctionIdx = flagBlock.indexOf("(your correction)");
  assert.notEqual(correctionIdx, -1, "expected the '(your correction)' text in the flag line");
  const guardIdx = flagBlock.indexOf('row.corrected.includes("visa_class")');
  assert.notEqual(guardIdx, -1, 'expected a row.corrected.includes("visa_class") guard in the flag line');
  assert.ok(guardIdx < correctionIdx, "the guard must precede the '(your correction)' text it controls");
});

test("no --danger class on the liveness, repost or flag elements in role-row.tsx", () => {
  // The row's liveness label, repost chip and eligibility flag line are all
  // information, never alarm (design/SYSTEM.md: text-dim, never red).
  const livenessBlock = row.slice(row.indexOf("{row.liveness}") - 400, row.indexOf("{row.liveness}") + 20);
  assert.doesNotMatch(livenessBlock, /text-danger/, "liveness label");
  const repostStart = row.indexOf("row.repost_count > 0 ?");
  const repostEnd = row.indexOf("</span>", row.indexOf("reposted "));
  assert.ok(repostStart !== -1 && repostEnd !== -1);
  assert.doesNotMatch(row.slice(repostStart, repostEnd), /text-danger/, "repost chip");
  const flagStart = row.indexOf("{row.visa_class ? (");
  const flagEnd = row.indexOf("</p>", flagStart);
  assert.ok(flagStart !== -1 && flagEnd !== -1, "expected the flag-line paragraph");
  assert.doesNotMatch(row.slice(flagStart, flagEnd), /text-danger/, "flag line");
});

test("correctRoleAction/uncorrectRoleAction are the only new imports from @/app/role-actions in home-list.tsx", () => {
  const importBlock = homeList.match(/import\s*\{([^}]*)\}\s*from\s*"@\/app\/role-actions";/)?.[1] ?? "";
  const names = importBlock
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.deepEqual(
    [...names].sort(),
    ["correctRoleAction", "hideRoleAction", "markAlreadyAppliedAction", "saveRoleAction", "uncorrectRoleAction"].sort(),
  );
});

test("no .from( call in role-row.tsx, role-detail-pane.tsx or correction-control.tsx", () => {
  for (const [file, src] of Object.entries(THREE)) {
    assert.doesNotMatch(src, /\.from\(/, `${file} must never call a Supabase table directly`);
  }
});

test("home-list.tsx wires onCorrectRow/onUncorrectRow into RoleDetailPane", () => {
  assert.match(homeList, /onCorrectRow=\{onCorrectRow\}/);
  assert.match(homeList, /onUncorrectRow=\{onUncorrectRow\}/);
  assert.match(homeList, /correctionPending=\{correctionPending\}/);
  assert.match(homeList, /correctionError=\{selectedCorrectionError\}/);
  // React Compiler could not preserve requestDelete's manual memoization when
  // this Map lookup was inlined directly in the JSX prop (a reproducible
  // compiler quirk, see the handoff's Issues section) — it must be a memoized
  // value computed ahead of the return.
  assert.match(homeList, /const selectedCorrectionError = useMemo\(/);
});

test("RowPatch carries the correction overlay fields", () => {
  const rowPatch = homeList.match(/type RowPatch = \{[\s\S]*?\};/)?.[0] ?? "";
  assert.match(rowPatch, /season\?:/);
  assert.match(rowPatch, /family\?:/);
  assert.match(rowPatch, /families\?:/);
  assert.match(rowPatch, /visa_class\?:/);
  assert.match(rowPatch, /eligibility_note\?:/);
  assert.match(rowPatch, /corrected\?:/);
});

test("onCorrectRow patches the overlay before the await, and calls correctRoleAction", () => {
  const fn = homeList.match(/const onCorrectRow = useCallback\(\s*\(([\s\S]*?)\n  \);/)?.[0] ?? "";
  assert.notEqual(fn, "", "expected onCorrectRow to be found");
  assert.match(fn, /correctRoleAction\(id, field, value\)/);
});

test("onUncorrectRow calls uncorrectRoleAction", () => {
  const fn = homeList.match(/const onUncorrectRow = useCallback\(\s*\(([\s\S]*?)\n  \);/)?.[0] ?? "";
  assert.notEqual(fn, "", "expected onUncorrectRow to be found");
  assert.match(fn, /uncorrectRoleAction\(id, field\)/);
});

test("runCorrection patches optimistically before the async run(), and rolls back on failure", () => {
  const start = homeList.indexOf("const runCorrection = useCallback(");
  const end = homeList.indexOf("const onCorrectRow = useCallback(");
  assert.ok(start !== -1 && end !== -1 && start < end, "expected runCorrection to be found");
  const fn = homeList.slice(start, end);
  const patchIdx = fn.indexOf("mergeRow({ id, ...patch })");
  const runIdx = fn.indexOf("await run()");
  assert.ok(patchIdx !== -1 && runIdx !== -1 && patchIdx < runIdx, "mergeRow must run before the await");
  assert.match(fn, /if \(!res\.ok\)/);
  assert.match(fn, /setCorrectionErrors/);
});

// Fold (audit B1): patchRow used to REPLACE a row's whole overlay entry, so
// a correction's own patch (holding only the changed field) dropped any
// other field already patched on that row (a second correction, or an
// in-flight saved_at/hidden_at patch). mergeRow must merge instead.
test("mergeRow merges via mergePatch inside a functional setOverlay update (B1)", () => {
  const start = homeList.indexOf("const mergeRow = useCallback(");
  const end = homeList.indexOf("const correctionGen = useRef");
  assert.ok(start !== -1 && end !== -1 && start < end, "expected mergeRow to be found");
  const fn = homeList.slice(start, end);
  assert.match(fn, /setOverlay\(\(o\)/, "mergeRow must use a functional setOverlay update");
  const setOverlayIdx = fn.indexOf("setOverlay((o)");
  assert.match(fn.slice(setOverlayIdx), /mergePatch\(/, "mergePatch must be called inside the functional setOverlay update");
});

// Fold (audit B2): the old rollback restored a whole-row snapshot captured
// at call time, so an earlier failing request that resolved AFTER a later
// correction on a different field clobbered it. A generation guard per
// (id:field) must make a stale response a no-op instead of a rollback.
test("runCorrection compares a generation before rolling back (B2)", () => {
  const start = homeList.indexOf("const runCorrection = useCallback(");
  const end = homeList.indexOf("const onCorrectRow = useCallback(");
  const fn = homeList.slice(start, end);
  assert.match(fn, /correctionGen\.current\.set\(key, myGen\)/, "a new call must claim the generation before patching");
  const genCheckIdx = fn.indexOf("correctionGen.current.get(key) !== myGen");
  const rollbackIdx = fn.indexOf("rollbackPatch(field,");
  assert.ok(genCheckIdx !== -1 && rollbackIdx !== -1 && genCheckIdx < rollbackIdx, "the generation check must gate the rollback");
});

test("rollbackPatch is field-scoped, never a whole-row snapshot (B2)", () => {
  const start = homeList.indexOf("const runCorrection = useCallback(");
  const end = homeList.indexOf("const onCorrectRow = useCallback(");
  const fn = homeList.slice(start, end);
  assert.doesNotMatch(fn, /overlay\.patched\.get\(/, "runCorrection must never read a whole-row snapshot off the render-time overlay");
  assert.match(fn, /rollbackPatch\(field,/);
});

// A sibling field corrected in between must not lose its "your correction"
// tag when an UNRELATED field's request fails and rolls back — the pure
// rollbackPatch has no way to know this on its own (tests/row-patch.test.ts
// proves it replays exactly the `corrected` array it's given), so the
// caller must re-read the live list off a ref, never off the call-time
// `before` snapshot, right before rolling back.
test("the rollback re-reads the live corrected list off a ref, never the call-time snapshot (B2)", () => {
  assert.match(homeList, /const rowByIdRef = useRef\(rowById\)/);
  assert.match(homeList, /rowByIdRef\.current = rowById/);
  const start = homeList.indexOf("const runCorrection = useCallback(");
  const end = homeList.indexOf("const onCorrectRow = useCallback(");
  const fn = homeList.slice(start, end);
  assert.match(fn, /rowByIdRef\.current\.get\(id\)/, "the rollback branch must read the live row off the ref");
  assert.match(fn, /\.filter\(\(f\) => f !== field\)/, "and filter out only the field this call owns");
});

test("Apply is never conditionally rendered or disabled based on visa_class (K2)", () => {
  // The only occurrences of "visa_class" in role-row.tsx are the HomeRow type
  // field and the flag-line render; none of them sit near the Apply block.
  const applyIdx = row.indexOf('row.href ? (');
  assert.notEqual(applyIdx, -1);
  const applyBlock = row.slice(applyIdx, applyIdx + 700);
  assert.doesNotMatch(applyBlock, /visa_class/);
});

test("patchRow merges into the row's existing overlay entry, and the save/hide rollback is field-scoped (L5 re-audit F1)", () => {
  const src = readFileSync(new URL("../components/home-list.tsx", import.meta.url), "utf8");
  const patchRow = src.slice(src.indexOf("const patchRow = useCallback"), src.indexOf("const removeRows = useCallback"));
  assert.match(patchRow, /mergePatch\(o\.patched\.get\(patch\.id\), patch\)/);
  assert.doesNotMatch(src, /unpatchRow/);
  const setFlag = src.slice(src.indexOf("const setFlag = useCallback"), src.indexOf("const onSaveRow"));
  assert.match(setFlag, /const prev = rowByIdRef\.current\.get\(id\)/);
  assert.match(setFlag, /\[patchRow\],\s*\);\s*$/); // deps stay stable: no rowById in setFlag's deps
  assert.match(setFlag, /saved_at: prev/);
});

