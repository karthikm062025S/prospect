#!/usr/bin/env node
// One runnable check for lib/genie.ts against the live Genie space: asks one
// question, prints the SQL Genie wrote, its text reply and the first rows.
// Exits 1 by name on a missing env var, a FAILED message or a timeout.
//
// Requires DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_GENIE_SPACE_ID.
// Usage: node --experimental-strip-types scripts/genie-smoke.mjs ["your question"]
import { askGenie } from "../lib/genie.ts";

const question = process.argv[2] ?? "How many postings landed in the last 7 days, and from which sources?";
const answer = await askGenie(question);
console.log("question:", question);
console.log("conversation:", answer.conversationId, "message:", answer.messageId);
console.log("sql:", answer.sql ?? "(none)");
console.log("text:", answer.text ?? "(none)");
console.log("columns:", answer.columns.join(", "));
for (const row of answer.rows.slice(0, 10)) console.log("row:", JSON.stringify(row));
console.log(`rows: ${answer.rows.length}`);
