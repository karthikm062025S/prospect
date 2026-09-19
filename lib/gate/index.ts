import { createHash, timingSafeEqual } from "node:crypto";

// The watcher, scanner, and MCP routes use this constant-time shared-secret
// comparison for their independent bearer authentication. It intentionally
// contains none of the deleted password-cookie gate.
export function isCorrectPassword(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}
