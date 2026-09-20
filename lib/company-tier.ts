// Company "dream tier" tags (VTHacks speed pass, 2026-09-20). Pure, no
// imports. companies.tier holds a market-tier label ("Big Tech", "Fintech /
// Banks / Quant", "High-Growth Tech", "AI & Frontier", ...) the ingest side
// writes; this derives display TAGS from the company NAME (specific known
// employers) and/or that stored tier text, so Home can filter "I want to see
// big 4 as a filter" (Karthik). A company can carry several tags at once;
// none of these match -> [].

export type TierTag = "big4" | "mbb_consulting" | "big_tech" | "finance" | "government" | "startup";

export const TIER_LABEL: Record<TierTag, string> = {
  big4: "Big 4",
  mbb_consulting: "Consulting firms",
  big_tech: "Big Tech",
  finance: "Banks & finance",
  government: "Government",
  startup: "Startups",
};

export const TIER_ORDER: TierTag[] = ["big4", "mbb_consulting", "big_tech", "finance", "government", "startup"];

const BIG4_NAME = /\bdeloitte\b|\bpwc\b|pricewaterhousecoopers|\bkpmg\b|ernst\s*&?\s*young|\bey\b/i;

const MBB_CONSULTING_NAME =
  /\bmckinsey\b|\bbcg\b|boston consulting|\bbain\b|\baccenture\b|booz allen|oliver wyman|\bkearney\b|capgemini|guidehouse|\bslalom\b|\bzs\b/i;

const BIG_TECH_NAME = /\bgoogle\b|\balphabet\b|\bmeta\b|\bamazon\b|\bapple\b|\bmicrosoft\b|\bnetflix\b|\bnvidia\b/i;

const FINANCE_NAME =
  /jpmorgan|jp morgan|\bgoldman\b|morgan stanley|\bciti\b|citigroup|bank of america|wells fargo|capital one|blackrock|\bvanguard\b|\bfidelity\b|\bcitadel\b|jane street|two sigma|\bbank/i;

const GOVERNMENT_NAME = /\bfederal\b|\bnasa\b|\bnih\b|\bdod\b|department of defense|state of |\bcounty\b/i;

export function deriveTierTags(companyName: string, storedTier: string | null): TierTag[] {
  const name = companyName ?? "";
  const tier = (storedTier ?? "").toLowerCase();
  const tags: TierTag[] = [];
  if (BIG4_NAME.test(name)) tags.push("big4");
  if (MBB_CONSULTING_NAME.test(name)) tags.push("mbb_consulting");
  if (BIG_TECH_NAME.test(name) || tier.includes("big tech")) tags.push("big_tech");
  if (FINANCE_NAME.test(name) || tier.includes("fintech") || tier.includes("bank")) tags.push("finance");
  if (GOVERNMENT_NAME.test(name) || tier.includes("government") || tier.includes("usajobs")) tags.push("government");
  if (tier.includes("high-growth") || tier.includes("ai & frontier")) tags.push("startup");
  return tags;
}
