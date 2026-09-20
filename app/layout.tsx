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

// Mono for all data values: counts, dates, statuses, tickers, caps labels.
// v7 D12 asked whether Departure Mono should take this role. It does NOT —
// see the measured verdict in app/globals.css (@theme inline). Plex stays.
const plexMono = localFont({
  src: [
    { path: "../public/fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

// ---- v8 D1 locked display/label faces (design/FONTS.md); reverted onto
// Prospect's VT palette by mission D-UI12 after T0's sans-weight display face
// was rejected on sight ("use my design system") ----

// Display role for the hero, section titles, and Scout wordmark.
const instrumentSerif = localFont({
  src: "../public/fonts/InstrumentSerif-Regular.ttf",
  weight: "400",
  style: "normal",
  variable: "--font-instrument-serif",
  display: "swap",
});

// Uppercase labels / eyebrows / nav only (NOT data values — see the verdict).
const departure = localFont({
  src: "../public/fonts/DepartureMono-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-departure",
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
      className={`${satoshi.variable} ${plexMono.variable} ${instrumentSerif.variable} ${departure.variable}`}
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
