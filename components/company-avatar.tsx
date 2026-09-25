"use client";

import { type CSSProperties, useState } from "react";

import { BrandGlyph } from "@/components/brand-glyph";
import { brandMarkSrc } from "@/lib/brand-mark";

// v5: round company mark so rows are distinguishable at a glance. Favicon from the
// company's domain (careers_url / link) with an initials fallback; the hue is a
// stable hash of the name so the same company always gets the same circle.
// note: plain <img> + DuckDuckGo icon service (no next/image remotePatterns);
// upgrade to a stored logo column if the icon service ever becomes a problem.
//
// v7 S4 (OD2) puts a real brand mark first when lib/brand-mark.ts matches the
// company with high confidence: chain = vendored mark -> favicon -> initials.
// The mark is painted as a CSS mask filled with `currentColor` rather than an
// <img>, so one file is correct in both themes. USAGE.md's `fill: currentColor`
// on a wrapper only works on an INLINE svg, and several thesvg mono files pin
// their own fill (`style="fill:#221f1f"`), which would beat an inherited one —
// a mask ignores the file's paint entirely and uses only its shape.

const HUES = [152, 262, 24, 200, 330, 48, 100, 290];

export function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // ATS hosts are not the company — fall back to initials there.
    if (/greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com|jobvite\.com|icims\.com/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CompanyAvatar({
  name,
  url,
  size = 28,
  className = "",
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const domain = domainOf(url);
  const [failed, setFailed] = useState(false);
  const hue = hueFor(name);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  const mark = brandMarkSrc(name, domain);
  if (mark) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-hairline bg-raised text-text ${className}`}
        style={style}
      >
        <BrandGlyph src={mark} size={Math.round(size * 0.58)} />
      </span>
    );
  }
  if (domain && !failed) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-raised ${className}`}
        style={style}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-[3px]"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium ${className}`}
      // v8 D13: the disc is theme-aware in CSS (app/globals.css derives
      // --avatar-bg/--avatar-fg from this hue per theme). It used to be
      // light-only oklch patched by a dark `filter: brightness()`.
      style={{ ...style, "--avatar-hue": hue } as CSSProperties}
      data-avatar-initials
    >
      {initialsOf(name)}
    </span>
  );
}
