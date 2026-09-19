"use client";

import { useEffect } from "react";
import { writeLastAccount, type LastAccount } from "@/lib/last-account";

// Renders nothing. Mounted by the signed-in shell (components/tab-bar-server.tsx)
// so every signed-in page refreshes the "Continue as" card's data. See
// lib/last-account.ts for what is stored and why sign-out keeps it.
export function RememberAccount({ fullName, email, avatarUrl, provider }: LastAccount) {
  useEffect(() => {
    if (email) writeLastAccount({ fullName, email, avatarUrl, provider });
  }, [fullName, email, avatarUrl, provider]);
  return null;
}
