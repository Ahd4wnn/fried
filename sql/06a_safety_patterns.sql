-- ============================================================================
-- Hovio · 06a_safety_patterns.sql  (SAFETY HOTFIX)
-- Expands crisis-detection tripwire patterns. The starter set missed passive
-- ideation ("feel like dying", "wish I was dead", etc.). This activates a new
-- safety_config version with broader, intent-level (never method-specific)
-- patterns. Idempotent.
--
-- CLINICAL REVIEW REQUIRED: this list is a safety-expanded STARTER. A qualified
-- mental-health professional must review/extend it and tune severities before
-- launch. Patterns lean PROTECTIVE on purpose: surfacing warm support to a
-- hyperbolic user is low-cost; missing real ideation is catastrophic.
-- ============================================================================

begin;

-- Deactivate any other active config (partial unique index allows one active).
update public.safety_config set is_active = false where version <> 2;

insert into public.safety_config (version, is_active, notes, tripwire_patterns, classifier_config)
values (
  2,
  true,
  'Safety hotfix: added passive ideation + broader phrasings. CLINICAL REVIEW REQUIRED. Patterns intent-level only, never method-specific.',
  jsonb_build_array(
    -- suicidal ideation (active + passive) -> crisis
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\b(kill|killing)\s+myself\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\bsuicid(e|al)\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\b(want|wanna|wish|like)\s+(to\s+|i\s+was\s+|i\s+were\s+)?(die|be\s+dead|dying)\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\bfeel\s+like\s+dying\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\bbetter\s+off\s+(dead|without\s+me)\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\bdon.?t\s+want\s+to\s+(live|be\s+alive|be\s+here|exist|wake\s+up)\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\b(no\s+(reason|point)\s+to\s+live|nothing\s+to\s+live\s+for|can.?t\s+go\s+on)\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\bend\s+(it\s+all|my\s+life|everything)\b'),
    jsonb_build_object('category','suicidal_ideation','severity','crisis','lang','en','pattern','(?i)\b(want|going)\s+to\s+end\s+it\b'),
    -- self harm -> crisis
    jsonb_build_object('category','self_harm','severity','crisis','lang','en','pattern','(?i)\b(hurt|harm|cut|cutting)\s+(myself|my\s+self)\b'),
    jsonb_build_object('category','self_harm','severity','crisis','lang','en','pattern','(?i)\bself[\s-]?harm(ing)?\b'),
    -- harm to others -> crisis
    jsonb_build_object('category','harm_to_others','severity','crisis','lang','en','pattern','(?i)\b(want|going|am\s+going)\s+to\s+(kill|hurt|harm)\s+(him|her|them|someone|people|everyone)\b'),
    -- abuse -> concern (stay present, surface support)
    jsonb_build_object('category','abuse','severity','concern','lang','en','pattern','(?i)\b(is\s+)?(hitting|abusing|hurting|assaulting)\s+me\b'),
    jsonb_build_object('category','abuse','severity','concern','lang','en','pattern','(?i)\b(being\s+)?(abused|assaulted|raped)\b')
  ),
  jsonb_build_object(
    'model','gpt-4o-mini',
    'categories', jsonb_build_array('suicidal_ideation','self_harm','abuse','harm_to_others'),
    'thresholds', jsonb_build_object('crisis',0.5,'concern',0.35),
    'note','Thresholds lowered slightly to bias protective. Clinical review required.'
  )
)
on conflict (version) do update
  set is_active = true,
      notes = excluded.notes,
      tripwire_patterns = excluded.tripwire_patterns,
      classifier_config = excluded.classifier_config;

commit;

-- ============================================================================
-- End 06a_safety_patterns.sql
-- ============================================================================
