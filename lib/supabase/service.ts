import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only: service-role key bypasses RLS. Never import this from a
// Client Component. Used by the watcher webhook and the MCP tool handlers.
if (typeof window !== "undefined") {
  throw new Error("lib/supabase/service.ts must never reach the client bundle");
}

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
