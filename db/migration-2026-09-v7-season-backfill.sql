-- v7 season/family backfill (MISSION v7 D8, contract V4, 2026-09-02). Additive
-- + idempotent: safe to run before or after another v7 migration that may also
-- add these columns (add column if not exists), and safe to re-run (the UPDATEs
-- only touch rows still at the un-backfilled default). Apply in the Supabase
-- SQL editor.
--
-- Going forward, lib/upsert-role.ts sets season/family on every insert/update
-- (deriveSeason/deriveFamily from lib/season.ts, lib/family.ts) — this file is
-- ONLY the one-time catch-up for rows that predate those columns.
--
-- Divergences from the TypeScript deriveSeason/deriveFamily (documented, not
-- fixed here — a later re-scan through the real ingest path self-heals any
-- row this coarser SQL mirror gets wrong):
--   * Postgres ARE (~*) has no lazy quantifiers; the "gap between a season
--     word and its year" class below is a plain bounded repetition, which is
--     slightly more permissive than the TypeScript version on unusual
--     punctuation between the two.
--   * The TypeScript "Spring/Summer 2028" tie-break (whichever season the
--     year is grammatically attached to wins) is not attempted here — SQL
--     picks by CASE branch order (summer_2027 > fall_2027 > spring_2028 >
--     summer_2028), which can pick a different season than the TS function on
--     a genuinely ambiguous multi-season title. Rare in practice.

alter table roles
  add column if not exists season text not null default 'unspecified',
  add column if not exists family text; -- null = not yet backfilled/ingested (mirrors deriveFamily's "other" only once set)

update roles
set season = case
  -- winter first (matches the TypeScript rule order: any 'winter' short-circuits to unspecified)
  when title ~* $rx$\ywinter\y$rx$ then 'unspecified'
  -- explicit season + the one year each of the four supported values covers
  when title ~* $rx$\y(summer|su)[[:space:]'-]{0,3}(?:20)?27\y$rx$ then 'summer_2027'
  when title ~* $rx$\y(fall|autumn)[[:space:]'-]{0,3}(?:20)?27\y$rx$ then 'fall_2027'
  when title ~* $rx$\yspring[[:space:]'-]{0,3}(?:20)?28\y$rx$ then 'spring_2028'
  when title ~* $rx$\y(summer|su)[[:space:]'-]{0,3}(?:20)?28\y$rx$ then 'summer_2028'
  -- an explicit season + an UNSUPPORTED year (e.g. "Summer 2026") must not
  -- fall through to the bare-word mapping below
  when title ~* $rx$\y(summer|su)[[:space:]'-]{0,3}(?:20)?[0-9]{2}\y$rx$
    or title ~* $rx$\y(fall|autumn)[[:space:]'-]{0,3}(?:20)?[0-9]{2}\y$rx$
    or title ~* $rx$\yspring[[:space:]'-]{0,3}(?:20)?[0-9]{2}\y$rx$
    then 'unspecified'
  when title ~* $rx$\y(?:co-?op|cooperative education)\y$rx$ then 'coop'
  -- bare season word, no year -> the nearest upcoming instance we track
  when title ~* $rx$\ysummer\y$rx$ then 'summer_2027'
  when title ~* $rx$\y(fall|autumn)\y$rx$ then 'fall_2027'
  when title ~* $rx$\yspring\y$rx$ then 'spring_2028'
  -- bare "2027" alongside "intern", no season word at all
  when title ~* $rx$\yintern$rx$ and title ~* $rx$\y2027\y$rx$ then 'summer_2027'
  else 'unspecified'
end
where season = 'unspecified';

update roles
set family = case
  when title ~* $rx$\yquant$rx$ then 'quant'
  when title ~* $rx$machine learning|\yml\y|\yai\y|artificial intelligence|deep learning|\ynlp\y|\yllm\y|generative ai|computer vision|reinforcement learning|research scien|applied scien$rx$ then 'ai_ml'
  when title ~* $rx$data scien|data engineer|data analyst|analytics engineer|business intelligence|\ybi\y|business analyst|business systems analyst$rx$ then 'data'
  when title ~* $rx$security|cyber|appsec|infosec$rx$ then 'security'
  when title ~* $rx$firmware|embedded|fpga|hardware|ic design|robotics|perception|autonomy|autonomous$rx$ then 'hardware'
  when title ~* $rx$\yux\y|\yui\y|user experience|product design|visual design|graphic design$rx$ then 'design'
  when title ~* $rx$product manager|product management|program manager|project manager|associate product manager|\yapm\y|\ytpm\y|technical program manager$rx$ then 'product'
  when title ~* $rx$software|swe|sde|develop(?:er|ment)?|programmer|programming|full[[:space:]-]?stack|back[[:space:]-]?end|front[[:space:]-]?end|engineer|engineering|devops|site reliability|\ysre\y|\yqa\y|\ysdet\y|quality assurance|quality engineer|test engineer|systems|compiler|distributed|network|rendering|graphics|game|gameplay|solutions engineer|sales engineer|forward deployed|field engineer|implementation engineer|developer advocate|developer relations|devrel|architect|technology$rx$ then 'swe'
  else 'other'
end
where family is null;
