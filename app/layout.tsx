import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { FeedbackDialog, FeedbackFab } from "@/components/feedback-box";
import "./globals.css";

// Body and controls (including stat numbers, tabular-nums). Weights match the
// copied files (Light/Regular/Medium); no bold cut needed anywhere in this UI.
const satoshi = localFont({
  src: [
    { path: "../public/fonts/Satoshi-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Satoshi-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

// Mono: the ONE mono face. Prospect 2026-09-19 (CONTEXT 20:30) gives it TWO
// roles, both uppercase-micro-labels (--font-label) and code-like data
// (--font-mono), because the second mono face is retired and three is the cap.
const plexMono = localFont({
  src: [
    { path: "../public/fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

// Display role: hero, section titles, card titles, the Prospect wordmark.
// Prospect 2026-09-19 (CONTEXT 20:30) retires the old serif display face: the
// wishlabs reference is all-sans with heavy black headings, so DM Sans
// variable takes --font-display at 800-900 with tight tracking. One localFont
// call carries both the upright and the italic variable file, so this is
// still ONE face. tests/fonts.test.ts pins the count at three.
const dmSans = localFont({
  src: [
    { path: "../public/fonts/DMSans-Variable.ttf", weight: "100 1000", style: "normal" },
    { path: "../public/fonts/DMSans-Italic-Variable.ttf", weight: "100 1000", style: "italic" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title: "Prospect",
  description:
    "The career journey for every Virginia Tech student: a live opportunity feed ranked for you and a semester roadmap to close the gaps.",
  openGraph: {
    title: "Prospect",
    description:
      "The career journey for every Virginia Tech student: a live opportunity feed ranked for you and a semester roadmap to close the gaps.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Prospect" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Prospect",
    description:
      "The career journey for every Virginia Tech student: a live opportunity feed ranked for you and a semester roadmap to close the gaps.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Sets data-theme before paint from localStorage.theme, falling back to
// prefers-color-scheme — avoids a flash of the wrong palette (04-uiux-brief §1).
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

// No h-full/min-h-full here (v6): the (app) shell is h-dvh; a 100%-of-html
// ancestor would resolve to 100vh (large viewport), which on mobile Chrome
// is taller than 100dvh by the URL-bar height, so the document scrolled by
// that difference. Public routes such as /welcome size themselves with min-h-screen.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${plexMono.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-bg font-sans text-sm text-text antialiased">
        {children}
        <FeedbackDialog />
        <FeedbackFab />
      </body>
    </html>
  );
}
