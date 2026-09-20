#!/usr/bin/env node
// L5.2 stage demo: `ANS_ENFORCE=1 node --experimental-strip-types scripts/ans-impostor.mjs`
// A look-alike Roadmap agent ("roadmap-agent") tries the same gate our real
// agents call (lib/ans-verify.ts assertVerifiedAgent) and must be refused
// BEFORE any write -- this script never touches the database, it only calls
// the gate directly. Exit 0 when the impostor is refused, exit 1 if not.

import { assertVerifiedAgent, ansIdentityFor } from "../lib/ans-verify.ts";
import registry from "../ans/registry.json" with { type: "json" };

if (process.env.ANS_ENFORCE !== "1") {
  console.log("WARNING: ANS_ENFORCE is not \"1\" -- the gate is a no-op and this demo proves nothing.");
}

/** Calls the real gate with `appFacingName`, prints its ANS identity + verdict. Returns true if verified. */
async function tryAgent(appFacingName, fallbackIdentity) {
  const identity = ansIdentityFor(appFacingName) ?? fallbackIdentity ?? null;
  console.log(`\n${appFacingName} -> ${identity ? identity.ans_name : "(no ANS identity on record)"}`);
  try {
    await assertVerifiedAgent(appFacingName);
    console.log("VERIFIED");
    return true;
  } catch (error) {
    console.log(error.message);
    console.log("REFUSED, nothing written");
    return false;
  }
}

const impostorVerified = await tryAgent("roadmap-agent", registry.impostor);
await tryAgent("roadmap");

if (impostorVerified) {
  console.error("\nFAIL: the impostor was NOT refused.");
  process.exit(1);
}
console.log("\nImpostor refused as required.");
process.exit(0);
