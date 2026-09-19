import type { NextConfig } from "next";

// SR-002 (security review 2026-09-03): the live preview served HSTS and nothing
// else. These are the headers that carry no breakage risk for this app.
//
// The CSP deliberately has no script-src/style-src: the theme script in
// app/layout.tsx runs inline before paint and the landing's motion + WebGL
// layers inject styles, so a real script policy needs per-request nonces from
// proxy.ts. frame-ancestors/object-src/base-uri cost nothing and close the
// click-jacking hole on the signed-in Home controls.
//
// SAMEORIGIN / frame-ancestors 'self' rather than DENY / 'none': a same-origin
// iframe of the app is the responsive QA harness (Karthik's Chrome is
// maximized at DPR 1.5, so window.resize is a no-op and 390/1440 get tested by
// framing the build). Click-jacking protection is identical - an attacker's
// page is a different origin and still cannot frame us; only we can.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
