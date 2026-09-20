#!/usr/bin/env node
// v8 D3/V2 responsive gate. Visits the public + auth-gated routes at every
// bound viewport width and flags horizontal overflow (scrollWidth > innerWidth).
// Screenshots go to .claude/screens/ (gitignored via .claude/).
//
// playwright is NOT a project dependency (no npm install allowed in a worktree
// — node_modules is a junction). This drives playwright-core against the local
// Chrome install instead, so nothing is added to package.json.
//
// Run:
//   npm run dev -- -p 3105          (in one terminal, from the repo root)
//   BASE_URL=http://localhost:3105 node scripts/responsive-check.mjs
// (BASE_URL defaults to http://localhost:3000 if omitted.)

import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PATHS = ["/welcome", "/", "/applications"];
const WIDTHS = [320, 390, 768, 1024, 1440, 1920, 2560];
const SCREEN_DIR = path.join(".claude", "screens");

async function main() {
  await mkdir(SCREEN_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();

  for (const route of PATHS) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      const status = scrollWidth > innerWidth ? "FAIL" : "PASS";
      console.log(`${status} ${route} ${width} scrollWidth=${scrollWidth} innerWidth=${innerWidth}`);
      const file = `${route.replace(/\//g, "_") || "_root"}-${width}.png`;
      await page.screenshot({ path: path.join(SCREEN_DIR, file), fullPage: false });
    }
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
