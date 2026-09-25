import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// v7 S4 (app-functional lane). The S4 persona click-through opened a modal
// dialog and the feedback modal on the deployed build and found
// `document.querySelectorAll('[aria-modal],[role=dialog]').length === 0` on
// every page — the accessibility floor's modal contract, missing.
//
// Every modal in this app is a native <dialog> opened with showModal(), which
// already gives Escape, the focus trap and an inert background. What was
// missing is the STATED contract, so this walks the real component tree: every
// <dialog> that exists now, and every one added later, must carry role,
// aria-modal and an accessible name.

const ROOTS = ["components", "app"];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Source with // and block comments blanked out — several files say
 *  "the in-app <dialog> confirm" in prose, which is not markup. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every `<dialog ...>` opening tag in `source`, tag text only. */
function dialogTags(raw: string): string[] {
  const source = stripComments(raw);
  const tags: string[] = [];
  for (let at = source.indexOf("<dialog"); at !== -1; at = source.indexOf("<dialog", at + 1)) {
    // The opening tag ends at the first ">" that is not inside a {…} expression.
    let depth = 0;
    for (let i = at; i < source.length; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        tags.push(source.slice(at, i + 1));
        break;
      }
    }
  }
  return tags;
}

const found = ROOTS.flatMap((root) =>
  tsxFiles(root).flatMap((file) =>
    dialogTags(fs.readFileSync(file, "utf8")).map((tag) => ({ file, tag })),
  ),
);

test("every <dialog> in the app declares role, aria-modal and an accessible name", () => {
  assert.ok(found.length >= 5, `expected the app's modals to be found, got ${found.length}`);
  for (const { file, tag } of found) {
    assert.match(tag, /role="dialog"/, `${file}: <dialog> is missing role="dialog"`);
    assert.match(tag, /aria-modal="true"/, `${file}: <dialog> is missing aria-modal="true"`);
    assert.ok(
      /aria-labelledby=/.test(tag) || /aria-label=/.test(tag),
      `${file}: <dialog> has no accessible name (aria-labelledby or aria-label)`,
    );
  }
});

// A dialog is only modal — focus trap, Escape, inert background — when it is
// opened with showModal(). `.show()` renders the same markup non-modally, so
// role/aria-modal would then be a lie.
test("every dialog is opened with showModal(), never show()", () => {
  for (const root of ROOTS) {
    for (const file of tsxFiles(root)) {
      const source = fs.readFileSync(file, "utf8");
      if (!stripComments(source).includes("<dialog")) continue;
      assert.ok(source.includes(".showModal()"), `${file}: has a <dialog> but never calls showModal()`);
      assert.ok(!/\.show\(\)/.test(source), `${file}: opens a modal dialog with .show()`);
    }
  }
});

// The three confirm dialogs name themselves through the sentence the user
// reads. That id has to exist on an element inside the dialog or the name
// resolves to nothing.
test("aria-labelledby targets exist in the same file", () => {
  for (const { file, tag } of found) {
    const m = tag.match(/aria-labelledby="([^"]+)"/);
    if (!m) continue;
    const source = fs.readFileSync(file, "utf8");
    assert.ok(source.includes(`id="${m[1]}"`), `${file}: aria-labelledby="${m[1]}" has no matching id`);
  }
});
