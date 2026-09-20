// US-only location filter (VTHacks speed pass, 2026-09-20). Pure, no imports.
// A TypeScript port of `looksUS` in scripts/scan-core.mjs, location-text-only
// (no countryHint at read time — the app never stored the ATS's own country
// field). US_TOKENS/NON_US_COUNTRY are copied verbatim from scan-core.mjs and
// kept in sync by hand, same discipline as lib/family.ts's deriveLevel.
// Ambiguous / blank / "N Locations" stays true (recall-first, same as ingest).

const US_TOKENS =
  /\b(u\.?s\.?a?|united states|remote)\b|,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b|\b(new york|san francisco|seattle|boston|austin|chicago|los angeles|mountain view|menlo park|palo alto|sunnyvale|bellevue|redmond|atlanta|denver|dallas|houston|washington|dc|pittsburgh|cambridge|santa clara|san jose|san diego|cupertino|bay area)\b/i;
const NON_US_COUNTRY =
  /\b(canada|toronto|vancouver|montreal|united kingdom|london|england|ireland|dublin|germany|berlin|munich|france|paris|netherlands|amsterdam|india|bangalore|bengaluru|hyderabad|pune|singapore|australia|sydney|japan|tokyo|china|beijing|shanghai|israel|tel aviv|zurich|switzerland|spain|madrid|barcelona|poland|warsaw|krakow|sweden|stockholm|brazil|mexico|korea|seoul|hong kong|taiwan|romania|portugal|lisbon|italy|milan|denmark|norway|finland|austria|belgium|czech|hungary|greece|turkey|uae|dubai|philippines|vietnam|malaysia|thailand|indonesia|argentina|chile|colombia|egypt|nigeria|south africa|new zealand)\b/i;

export function isUsLocation(location: string | null): boolean {
  const loc = location ?? "";
  if (US_TOKENS.test(loc)) return true;
  if (NON_US_COUNTRY.test(loc)) return false;
  return true; // ambiguous / blank -> keep
}
