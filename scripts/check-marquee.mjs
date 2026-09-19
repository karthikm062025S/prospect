// v8 D6 check. Prints OK <name> <mark source> / MISSING for each of the 20
// marquee companies (ROW_A + ROW_B in components/landing/brand-marks.tsx);
// exits 1 on any MISSING or duplicate. No deps.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "components/landing/brand-marks.tsx"), "utf8");
const index = JSON.parse(readFileSync(path.join(root, "public/brand/index.json"), "utf8"));
const endpoints = JSON.parse(readFileSync(path.join(root, "scripts/endpoints.json"), "utf8"));

function parseArray(name) {
  const start = source.indexOf(`export const ${name} = [`);
  const block = source.slice(start, source.indexOf("];", start));
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function parsePathsKeys() {
  const block = source.slice(source.indexOf("const PATHS"), source.indexOf("export const ROW_A"));
  return [...block.matchAll(/^ {2}([A-Za-z][A-Za-z0-9 ]*):/gm)].map((m) => m[1].trim());
}

function normalizeCompanyName(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");
}

const rowA = parseArray("ROW_A");
const rowB = parseArray("ROW_B");
const inlineNames = new Set(parsePathsKeys());
const endpointNames = new Set(endpoints.map((e) => e.company));

const all = [...rowA, ...rowB];
let ok = true;
const seen = new Set();

for (const name of all) {
  if (seen.has(name)) {
    console.log(`MISSING ${name} (duplicate)`);
    ok = false;
    continue;
  }
  seen.add(name);

  const inEndpoints = endpointNames.has(name);
  let source_ = null;
  if (inlineNames.has(name)) {
    source_ = "inline";
  } else {
    const slug = index[normalizeCompanyName(name)];
    if (slug) source_ = `public/brand/${slug}.svg`;
  }

  if (inEndpoints && source_) {
    console.log(`OK ${name} ${source_}`);
  } else {
    console.log(`MISSING ${name}`);
    ok = false;
  }
}

if (rowA.length !== 10 || rowB.length !== 10) {
  console.log(`MISSING row sizes (ROW_A=${rowA.length}, ROW_B=${rowB.length}, want 10/10)`);
  ok = false;
}

process.exit(ok ? 0 : 1);
