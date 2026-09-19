// Pure auth-decision helper for app/api/match/route.ts, extracted to its own
// file (deviation from the brief's stated file fence -- flagged in the
// handoff) because route.ts imports "next/server" (NextResponse/after), which
// throws `ERR_MODULE_NOT_FOUND` under plain `node --experimental-strip-types
// --test` (confirmed: Next ships no bare "next/server" entry outside the
// Next build). tests/match-route-auth.test.ts needs a module with zero
// Next-specific imports to exercise "no session + no secret -> 401" and
// "wrong secret -> 401" without a running Next server -- matching the
// brief's own instruction ("extract the auth decision into a pure function
// so it is testable").
//
// isCorrectPassword (lib/gate) is passed in rather than imported, so this
// stays a pure function of its inputs: the same DI shape every dynamic-import
// lib file in this lane uses for its Gemini client (lib/agents/roadmap.ts) or
// its framing function (lib/archetypes.ts buildAssignArchetypePrompt).
export type MatchAuthDecision =
  | { kind: "user"; userId: string }
  | { kind: "watcher" }
  | { kind: "unauthorized" };

export function resolveMatchAuth(
  opts: {
    userId: string | null;
    all: boolean;
    secretHeader: string | null;
    expectedSecret: string | undefined;
  },
  isCorrectPassword: (candidate: string, expected: string) => boolean,
): MatchAuthDecision {
  // A signed-in session always wins: the per-user streaming path never needs
  // ?all=1 or the watcher secret, and a browser tab would never send either.
  if (opts.userId) return { kind: "user", userId: opts.userId };
  if (opts.all && opts.secretHeader && opts.expectedSecret && isCorrectPassword(opts.secretHeader, opts.expectedSecret)) {
    return { kind: "watcher" };
  }
  return { kind: "unauthorized" };
}
