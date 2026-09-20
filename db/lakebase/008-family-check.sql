-- 2026-09-20: the all-majors family taxonomy (lib/family.ts, 12 keys) replaces the
-- tech-only 9 keys in the role_corrections CHECK. Old-key rows stay valid so nothing
-- a student already corrected is lost; the app only writes new keys from here on.
alter table role_corrections drop constraint if exists role_corrections_allowed_value_check;
alter table role_corrections add constraint role_corrections_allowed_value_check check (
  (field = 'season' and value in ('summer_2027', 'fall_2027', 'spring_2028', 'summer_2028', 'coop', 'unspecified'))
  or (field = 'family' and value in (
    'engineering', 'software', 'data_ai', 'business_finance', 'consulting', 'sales_marketing',
    'product_design', 'health_science', 'operations_supply', 'people_legal', 'education_research', 'other',
    'swe', 'ai_ml', 'data', 'quant', 'product', 'security', 'hardware', 'design'))
  or (field = 'visa_class' and value in ('clean', 'question', 'no_sponsors', 'citizen_required'))
);
