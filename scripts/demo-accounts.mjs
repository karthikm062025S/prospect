// Creates (or finds) demo sign-in accounts through the Supabase Admin API.
// Run from scout/: node --env-file=.env.local scripts/demo-accounts.mjs email1 email2 ...
// Password for every account comes from DEMO_PASSWORD (default gold2026, the
// convention in datasets/private/test-accounts.md). Prints "<email> <user id>".
// Service role only, server-side; never bundled, never in the app.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
const password = process.env.DEMO_PASSWORD ?? "gold2026";
const emails = process.argv.slice(2);
if (emails.length === 0) throw new Error("usage: demo-accounts.mjs <email> [email ...]");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const email of emails) {
  const found = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) {
    console.log(`${email} ${found.id} (existing)`);
    continue;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${email}: ${error.message}`);
  console.log(`${email} ${data.user.id} (created)`);
}
