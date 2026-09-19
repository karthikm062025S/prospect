import assert from "node:assert";
import fs from "node:fs";
import test from "node:test";

// v7 S4 (app-functional lane). The regression net for the Home freeze.
//
// The cause, measured against the production build with a real session (see
// `## APP-FUNCTIONAL` in planning/v7-S4-handoff.md): app/(app)/page.tsx is
// force-dynamic and renders the whole 1,293-role feed, so ONE revalidatePath("/")
// inside a per-role server action made every save/hide/apply response carry the
// entire re-serialised list — 791,727 bytes, per click. Six of those on a slow
// link is the 30s+ freeze the persona run hit.
//
// Both halves of the fix are one line each, and a later edit puts either back
// with no visible symptom in dev or on a short list. Hence this file.

const ROLE_ACTIONS = "app/role-actions.ts";
const ACTIONS = "app/actions.ts";
const HOME_LIST = "components/home-list.tsx";
const ROLE_ROW = "components/role-row.tsx";

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

/** The body of the exported async function called `name`, up to its closing brace. */
function actionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `no action named ${name}`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

// The actions Home fires on a click. None of them may revalidate "/": the row
// state they change is held by the Overlay in components/home-list.tsx, and the
// next real read of "/" brings the server's truth back.
const HOME_ACTIONS: [string, string][] = [
  [ROLE_ACTIONS, "saveRoleAction"],
  [ROLE_ACTIONS, "hideRoleAction"],
  [ROLE_ACTIONS, "markAlreadyAppliedAction"],
  [ACTIONS, "armApplyIntentAction"],
  [ACTIONS, "applyNotYetAction"],
  [ACTIONS, "confirmAppliedAction"],
  [ACTIONS, "deleteRolesAction"],
];

test('no per-role action revalidates "/" (that re-serialises the whole feed)', () => {
  for (const [file, name] of HOME_ACTIONS) {
    const body = actionBody(read(file), name);
    assert.ok(
      !/^\s*revalidatePath\("\/"\)/m.test(body),
      `${file}: ${name} calls revalidatePath("/") — that ships the entire Home feed in the action response`,
    );
  }
});

// The two apply actions fire from Home, and Next refreshes the page an action
// was called FROM whenever ANY revalidatePath runs — naming /applications there
// still shipped the whole Home feed (791,736 bytes, measured). It is redundant:
// /applications is force-dynamic and staleTimes.dynamic defaults to 0, so every
// navigation to it round-trips the server anyway.
test("the two apply actions Home fires revalidate nothing at all", () => {
  for (const [file, name] of [
    [ROLE_ACTIONS, "markAlreadyAppliedAction"],
    [ACTIONS, "confirmAppliedAction"],
  ] as [string, string][]) {
    assert.ok(
      !/^\s*revalidatePath\(/m.test(actionBody(read(file), name)),
      `${file}: ${name} revalidates a path — from Home that re-serialises the whole feed`,
    );
  }
});

// The actions fired ON /applications still revalidate it: there the refreshed
// page IS /applications, and its payload is the user's applications, not 1,293
// shared roles.
test("actions fired on /applications still revalidate it", () => {
  for (const [file, name] of [
    [ACTIONS, "setApplicationStatusAction"],
    [ACTIONS, "deleteApplicationAction"],
  ] as [string, string][]) {
    assert.match(
      actionBody(read(file), name),
      /revalidatePath\("\/applications"\)/,
      `${file}: ${name} must still revalidate /applications`,
    );
  }
});

// useOptimistic drops its value at the end of the transition, so it only works
// when the action revalidates the page. Reintroducing it here would silently
// re-require the payload the test above forbids.
test("HomeList holds mutations in committed state, not useOptimistic", () => {
  const source = read(HOME_LIST);
  // The word appears in the Overlay note that explains why it is gone, so this
  // looks for the hook itself: the react import and the call.
  assert.ok(!/useOptimistic\s*\(/.test(source), "home-list.tsx calls useOptimistic again");
  assert.ok(!/^\s*useOptimistic,$/m.test(source), "home-list.tsx imports useOptimistic again");
  assert.match(source, /const NO_OVERLAY: Overlay/, "the Overlay reset value is gone");
});

// Untouched rows keep their identity across an action; memo is what turns that
// into "one row re-renders" instead of 144.
test("RoleRow is memoised and HomeList passes it stable callbacks", () => {
  assert.match(read(ROLE_ROW), /export const RoleRow = memo\(RoleRowBase\)/, "RoleRow is no longer memoised");
  const source = read(HOME_LIST);
  for (const name of ["onSaveRow", "onHideRow"]) {
    assert.ok(source.includes(`const ${name} = useCallback(`), `${name} is not a stable callback`);
  }
  assert.ok(
    !/onSave=\{\(id/.test(source) && !/onHide=\{\(id/.test(source),
    "an inline arrow is being passed as onSave/onHide — that defeats the memo on every row",
  );
});
