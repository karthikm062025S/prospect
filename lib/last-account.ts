// v8 onboarding (Karthik decision 2): after sign-out or an expired session the
// landing offers "Continue as <name>" for the last account used in THIS
// browser. Display data only: no token, no user id. The key survives sign-out
// on purpose; the dialog's "Not you?" link is the only thing that clears it.
export const LAST_ACCOUNT_KEY = "scout_last_account";

export type LastAccount = {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  provider: "google" | "email";
};

// Anything larger than this is not something we wrote.
const MAX_BYTES = 1024;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.length <= max ? trimmed : null;
}

export function serializeLastAccount(account: LastAccount): string {
  // Explicit key list: nothing else on the object can leak into storage.
  return JSON.stringify({
    fullName: account.fullName,
    email: account.email,
    avatarUrl: account.avatarUrl,
    provider: account.provider,
  });
}

// Strict on the way back in: storage is writable by any script on the origin,
// so a malformed, oversized or foreign value is simply "no remembered account".
export function parseLastAccount(raw: string | null | undefined): LastAccount | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const email = text(record.email, 254);
  if (!email || !email.includes("@")) return null;
  const provider = record.provider === "google" ? "google" : record.provider === "email" ? "email" : null;
  if (!provider) return null;
  const avatarUrl = text(record.avatarUrl, 512);

  return {
    fullName: text(record.fullName, 80),
    email,
    // Only an https image is ever rendered back into an <img>.
    avatarUrl: avatarUrl?.startsWith("https://") ? avatarUrl : null,
    provider,
  };
}

// Browser accessors. Storage can be missing or throw (private mode, blocked
// site data); every path degrades to "no remembered account".
export function readLastAccount(): LastAccount | null {
  try {
    return parseLastAccount(window.localStorage.getItem(LAST_ACCOUNT_KEY));
  } catch {
    return null;
  }
}

export function writeLastAccount(account: LastAccount): void {
  try {
    window.localStorage.setItem(LAST_ACCOUNT_KEY, serializeLastAccount(account));
  } catch {
    // Nothing to do: the card is a convenience, not a requirement.
  }
}

export function clearLastAccount(): void {
  try {
    window.localStorage.removeItem(LAST_ACCOUNT_KEY);
  } catch {
    // See writeLastAccount.
  }
}
