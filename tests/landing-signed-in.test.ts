import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// v9: /welcome?view=landing shows the landing to a visitor who already has a
// session, so the page must recognise them and every sign-in CTA must become a
// link into the app. Sessions are 400-day cookies; nobody signs in twice.
function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("the landing reads the session and threads it to every CTA", () => {
  const page = read("app/welcome/page.tsx");
  assert.match(page, /auth\.getUser\(\)/);
  assert.ok(page.split("signedIn={signedIn}").length - 1 >= 4);
});

test("a signed-in visitor is offered the dashboard, not a sign-in", () => {
  assert.match(read("components/landing/sign-in-cta.tsx"), /My dashboard/);
});
