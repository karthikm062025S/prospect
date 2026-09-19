import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../lib/csv.ts";

test("parses a simple header and rows", () => {
  const { header, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
  assert.deepEqual(header, ["a", "b", "c"]);
  assert.deepEqual(rows, [
    ["1", "2", "3"],
    ["4", "5", "6"],
  ]);
});

test("round-trips a quoted field containing a comma and a newline", () => {
  const text = 'name,note\n"Ada Lovelace","first line, with a comma\nsecond line"\n';
  const { header, rows } = parseCsv(text);
  assert.deepEqual(header, ["name", "note"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], "Ada Lovelace");
  assert.equal(rows[0][1], "first line, with a comma\nsecond line");
});

test("doubled quotes inside a quoted field become one literal quote", () => {
  const { rows } = parseCsv('a\n"she said ""hi"" today"\n');
  assert.equal(rows[0][0], 'she said "hi" today');
});

test("handles CRLF line endings", () => {
  const { header, rows } = parseCsv("a,b\r\n1,2\r\n");
  assert.deepEqual(header, ["a", "b"]);
  assert.deepEqual(rows, [["1", "2"]]);
});

test("a trailing blank line is not a data row", () => {
  const { rows } = parseCsv("a,b\n1,2\n\n");
  assert.deepEqual(rows, [["1", "2"]]);
});

test("a row ending in a comma keeps its trailing empty field", () => {
  const { rows } = parseCsv("a,b,c\n1,2,\n");
  assert.deepEqual(rows, [["1", "2", ""]]);
});
