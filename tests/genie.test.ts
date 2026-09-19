import { test } from "node:test";
import assert from "node:assert/strict";
import { askGenie, parseGenieMessage } from "../lib/genie.ts";

// No network: the missing-env checks throw before `fetch` is called (the
// tests/databricks-sql.test.ts pattern) and the parser is pure. The message
// shapes below follow the documented Genie API examples cited in lib/genie.ts.
const ENV_KEYS = ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_GENIE_SPACE_ID"] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], undefined>>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return (async () => {
    try {
      for (const key of ENV_KEYS) {
        if (key in overrides) delete process.env[key];
        else process.env[key] ??= "placeholder";
      }
      await fn();
    } finally {
      for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  })();
}

test("askGenie throws DATABRICKS_GENIE_SPACE_ID is not set when unset", async () => {
  await withEnv({ DATABRICKS_GENIE_SPACE_ID: undefined }, async () => {
    await assert.rejects(askGenie("how many postings?"), /^Error: DATABRICKS_GENIE_SPACE_ID is not set$/);
  });
});

test("askGenie throws DATABRICKS_HOST is not set when unset", async () => {
  await withEnv({ DATABRICKS_HOST: undefined }, async () => {
    await assert.rejects(askGenie("how many postings?"), /^Error: DATABRICKS_HOST is not set$/);
  });
});

test("parseGenieMessage returns sql, description, text and the query attachment id from a COMPLETED message", () => {
  const parsed = parseGenieMessage({
    status: "COMPLETED",
    error: null,
    attachments: [
      { attachment_id: "b3c4", text: { content: "6,188 postings landed in the last 7 days." } },
      {
        attachment_id: "c4d5",
        query: {
          query: "SELECT COUNT(*) FROM scout.core.silver_roles WHERE created_at >= date_sub(current_date(), 7)",
          description: "Counts postings created in the last 7 days",
        },
      },
      { attachment_id: "d5e6" },
    ],
  });
  assert.equal(parsed.queryAttachmentId, "c4d5");
  assert.match(parsed.sql ?? "", /^SELECT COUNT\(\*\) FROM scout\.core\.silver_roles/);
  assert.equal(parsed.description, "Counts postings created in the last 7 days");
  assert.equal(parsed.text, "6,188 postings landed in the last 7 days.");
});

test("parseGenieMessage returns a text-only answer with no sql when Genie asks a clarifying question", () => {
  const parsed = parseGenieMessage({
    status: "COMPLETED",
    attachments: [{ attachment_id: "a1", text: { content: "Which term do you mean by 'this season'?" } }],
  });
  assert.equal(parsed.sql, null);
  assert.equal(parsed.queryAttachmentId, null);
  assert.equal(parsed.text, "Which term do you mean by 'this season'?");
});

test("parseGenieMessage throws GENIE_QUESTION_FAILED naming Genie's error type and message on FAILED", () => {
  assert.throws(
    () =>
      parseGenieMessage({
        status: "FAILED",
        error: { type: "SQL_EXECUTION_EXCEPTION", error: "[TABLE_OR_VIEW_NOT_FOUND] scout.core.missing" },
      }),
    /^Error: GENIE_QUESTION_FAILED: SQL_EXECUTION_EXCEPTION: \[TABLE_OR_VIEW_NOT_FOUND\] scout\.core\.missing$/,
  );
});

test("parseGenieMessage throws on CANCELLED even with no error body", () => {
  assert.throws(() => parseGenieMessage({ status: "CANCELLED" }), /^Error: GENIE_QUESTION_FAILED: no type: status CANCELLED$/);
});
