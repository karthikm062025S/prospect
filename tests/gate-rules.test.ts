import { test } from "node:test";
import assert from "node:assert/strict";
import { gateFromText, postingText } from "../lib/gate-rules.ts";

// Task 3 L3: the abstaining sponsorship / citizenship /
// clearance rules. Every case is a posting snippet with the class the rules
// must write; anything the tables do not name stays null (abstain).

const snippets: { text: string; visa_class: string | null; note?: RegExp }[] = [
  // (a)-(c) no_sponsors
  { text: "We are unable to sponsor visas for this position.", visa_class: "no_sponsors", note: /^Posting says: "We are unable to sponsor visas for this position"\. You can still apply\.$/ },
  { text: "Candidates must be authorized to work in the U.S. without the need for sponsorship now or in the future.", visa_class: "no_sponsors", note: /without the need for sponsorship now or in the future"\. You can still apply\.$/ },
  { text: "Please note that we will not sponsor applicants for work visas.", visa_class: "no_sponsors" },
  { text: "This role is not eligible for visa sponsorship.", visa_class: "no_sponsors" },
  // (d)-(f) citizen_required
  { text: "Must be a U.S. citizen.", visa_class: "citizen_required", note: /^Posting says: "Must be a U\.S\. citizen"\. Check the posting before applying\.$/ },
  { text: "U.S. citizenship is required due to ITAR regulations.", visa_class: "citizen_required" },
  { text: "Active Secret clearance required.", visa_class: "citizen_required" },
  { text: "Candidates must have the ability to obtain a security clearance.", visa_class: "citizen_required" },
  { text: "Due to ITAR, applicants must be U.S. persons.", visa_class: "citizen_required" },
  // (g)-(h) question
  { text: "Visa sponsorship may be available for this role.", visa_class: "question", note: /^Posting says: "Visa sponsorship may be available for this role"\. You can still apply\.$/ },
  { text: "U.S. citizenship preferred.", visa_class: "question" },
  { text: "Sponsorship is considered on a case by case basis.", visa_class: "question" },
  // (i)-(j) abstain
  { text: "We sponsor H-1B visas and support the green card process.", visa_class: null },
  { text: "Great benefits and mentorship from senior engineers.", visa_class: null },
  { text: "Applicants must be authorized to work in the United States.", visa_class: null },
  // Fold 2026-09-16 F1: a negated requirement is not a requirement
  { text: "This role does not require a security clearance.", visa_class: null },
  { text: "No clearance required.", visa_class: null },
  { text: "Clearance is not required for this internship.", visa_class: null },
  // F2: "will not be considered" is a refusal, not a hedge
  { text: "Sponsorship will not be considered for this role.", visa_class: "no_sponsors" },
  // F3: "with or without sponsorship" welcomes both
  { text: "Candidates with or without sponsorship needs are welcome to apply.", visa_class: null },
  // the positives the guard must keep
  { text: "Applicants must be authorized to work without sponsorship.", visa_class: "no_sponsors" },
  { text: "No visa sponsorship for this position.", visa_class: "no_sponsors" },
  // Fold 2 A1: contractions negate too
  { text: "This role doesn't require a security clearance.", visa_class: null },
  { text: "Candidates don't need a clearance.", visa_class: null },
  // A2: a negation word is a whole word (Northern, Northrop, November, none)
  { text: "Positions in Northern Virginia require a security clearance.", visa_class: "citizen_required" },
  { text: "Northrop Grumman requires an active clearance.", visa_class: "citizen_required" },
  // A3: a preferred / possible requirement is a hedge (T4), with the same quote
  { text: "Active Secret clearance preferred.", visa_class: "question", note: /^Posting says: "Active Secret clearance preferred"\. You can still apply\.$/ },
  { text: "An active clearance is a plus.", visa_class: "question" },
  { text: "Some roles may require a security clearance.", visa_class: "question" },
  // A4: a window never crosses ! or ?
  { text: "Don't have a visa? We sponsor!", visa_class: null },
  // A6: cannot guarantee = hedge
  { text: "We cannot guarantee visa sponsorship.", visa_class: "question" },
  // A7: recall
  { text: "This position requires U.S. citizenship.", visa_class: "citizen_required" },
  { text: "This position is subject to ITAR.", visa_class: "citizen_required" },
  { text: "Candidates must not require sponsorship.", visa_class: "no_sponsors" },
  { text: "Sponsorship for this role is not available.", visa_class: "no_sponsors" },
];

// A5: bullet and paragraph ends are sentence ends, so a negation in one bullet
// never guards the next.
test("gateFromText treats li/p/div/heading/br ends as sentence ends", () => {
  const out = gateFromText("<ul><li>Relocation: not provided</li><li>Must be a U.S. citizen</li></ul>");
  assert.equal(out.visa_class, "citizen_required");
  assert.equal(out.matched, "Must be a U.S. citizen");
});

// A3: a hard requirement elsewhere in the text still beats a hedged hit.
test("gateFromText lets a hard hit after a hedged one win", () => {
  assert.equal(gateFromText("Active clearance preferred. We are unable to sponsor visas.").visa_class, "no_sponsors");
  assert.equal(gateFromText("Some roles may require a clearance. Must be a U.S. citizen.").visa_class, "citizen_required");
});

for (const s of snippets) {
  test(`gateFromText: ${JSON.stringify(s.text)} -> ${s.visa_class}`, () => {
    const out = gateFromText(s.text);
    assert.equal(out.visa_class, s.visa_class);
    if (s.visa_class === null) assert.deepEqual(out, { visa_class: null, note: null, matched: null });
    else assert.ok(out.matched && out.note, "a flag carries the quote and the note");
    if (s.note) assert.match(out.note ?? "", s.note);
  });
}

// (k) the note reads the text, never the markup
test("gateFromText strips html tags before matching and quoting", () => {
  const out = gateFromText("<p>We do <strong>not</strong> sponsor&nbsp;work visas.</p><script>x()</script>");
  assert.equal(out.visa_class, "no_sponsors");
  assert.equal(out.note, 'Posting says: "We do not sponsor work visas". You can still apply.');
});

// (l) precedence: citizen_required > no_sponsors > question
test("gateFromText precedence picks citizen_required over no_sponsors over question", () => {
  const both = "We are unable to sponsor visas. Applicants must be a U.S. citizen. Sponsorship may be available later.";
  assert.equal(gateFromText(both).visa_class, "citizen_required");
  assert.equal(gateFromText("We are unable to sponsor visas. Sponsorship may be available later.").visa_class, "no_sponsors");
});

// (n) the note is bounded so it fits the pane meta cell
test("gateFromText caps the quote at 140 chars and the note at 200, starting with Posting says", () => {
  const long = `Please be advised that we are unable to sponsor ${"applicants ".repeat(30)}for any visa at this time`;
  const out = gateFromText(long);
  assert.equal(out.visa_class, "no_sponsors");
  assert.ok(out.matched && out.matched.length <= 140, `matched ${out.matched?.length}`);
  assert.ok(out.note && out.note.length <= 200, `note ${out.note?.length}`);
  assert.ok(out.note?.startsWith('Posting says: "'));
  assert.doesNotMatch(out.note ?? "", /—/, "no em dash");
});

// (m) the sweep reads up to 50 postings per call; the rules must stay cheap
test("gateFromText finishes a 200 KB posting well under the budget", () => {
  const filler = "Design, build and ship features with a mentor. ".repeat(4_300);
  const text = `${filler}Applicants must be a U.S. citizen. ${filler}`;
  assert.ok(text.length > 200_000);
  const t0 = performance.now();
  const out = gateFromText(text);
  const ms = performance.now() - t0;
  assert.equal(out.visa_class, "citizen_required");
  assert.ok(ms < 250, `took ${ms.toFixed(1)} ms`); // brief: under 50 ms; generous guard against a slow CI box
});

test("postingText twin drops script/style, tags and entities and collapses whitespace", () => {
  // Fold 2 A5: a block end becomes ". " (differs from the classify twin on purpose).
  assert.equal(postingText("<style>p{}</style><p>Summer&nbsp;2027 &amp; more</p>\n\n<script>x</script>"), "Summer 2027 & more.");
  assert.equal(postingText("<p>One<br>Two</p><div>Three</div>"), "One. Two. Three.");
});
