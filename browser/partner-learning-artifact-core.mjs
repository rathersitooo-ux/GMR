const PROJECTION_ID = 'gameroad.partner-learning-artifact-projection.v1';
const KNOWLEDGE_SCHEMA = 'gameroad.partner-knowledge-context.v1';
const PARTNER_ID = 'partner.saasuna';
const USE_SITE = 'partner-conversation';

const LESSON_GOALS = Object.freeze({
  story_language: new Set(['story_revision_candidate', 'synopsis_candidate', 'flavor_text_candidate']),
  bug_debug: new Set(['bug_report_candidate', 'test_case_candidate']),
  programming: new Set(['patch_candidate', 'test_case_candidate', 'code_explanation_candidate']),
  programming_english: new Set(['code_glossary_candidate', 'error_explanation_candidate', 'naming_candidate']),
});

const MATERIAL_KINDS = new Set(['image', 'code', 'text']);
const PROVENANCE = new Set(['internal_authority', 'external_primary']);
const FRESHNESS = new Set(['current', 'stable_verified']);
const SKILL_TAGS = new Set([
  'reading_comprehension',
  'revision',
  'bug_reproduction',
  'logic',
  'debug_math',
  'programming',
  'programming_english',
]);
const INPUT_KEYS = new Set(['lessonType', 'outputGoal', 'material', 'evidence', 'summary', 'confidence', 'skillTags']);
const MATERIAL_KEYS = new Set(['kind', 'displayRef', 'label']);
const EVIDENCE_KEYS = new Set([
  'evidenceId',
  'sourceId',
  'sourceVersion',
  'provenance',
  'authorityRef',
  'observedAt',
  'freshness',
]);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function onlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.has(key));
}

function token(value, max = 180) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) return null;
  return value;
}

function displayLabel(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 120) return null;
  return text;
}

function summaryText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 600) return null;
  return text;
}

function displayRef(value) {
  const ref = token(value, 240);
  if (!ref || /^(?:data|https?):/i.test(ref)) return null;
  if (!/^(?:drive|github|asset|artifact):[A-Za-z0-9][A-Za-z0-9._:/@#-]*$/.test(ref)) return null;
  return ref;
}

function normalizeSkillTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 6) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (!SKILL_TAGS.has(item)) return null;
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function fail(reason) {
  return freezeDeep({
    ok: false,
    projectionId: PROJECTION_ID,
    reason,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    automaticRewardMutationAllowed: false,
  });
}

export function projectLearningArtifactForSaasuna(input = {}) {
  if (!onlyKeys(input, INPUT_KEYS)) return fail('INPUT_BOUNDARY_INVALID');

  const goals = LESSON_GOALS[input.lessonType];
  if (!goals) return fail('LESSON_TYPE_UNSUPPORTED');
  if (!goals.has(input.outputGoal)) return fail('OUTPUT_GOAL_NOT_ALLOWED_FOR_LESSON');

  if (!onlyKeys(input.material, MATERIAL_KEYS)) return fail('MATERIAL_BOUNDARY_INVALID');
  if (!MATERIAL_KINDS.has(input.material.kind)) return fail('MATERIAL_KIND_UNSUPPORTED');
  const ref = displayRef(input.material.displayRef);
  const label = displayLabel(input.material.label);
  if (!ref || !label) return fail('MATERIAL_REFERENCE_INVALID');

  if (!onlyKeys(input.evidence, EVIDENCE_KEYS)) return fail('EVIDENCE_BOUNDARY_INVALID');
  const evidenceId = token(input.evidence.evidenceId);
  const sourceId = token(input.evidence.sourceId, 220);
  const sourceVersion = token(input.evidence.sourceVersion);
  const provenance = token(input.evidence.provenance);
  const authorityRef = token(input.evidence.authorityRef, 240);
  const observedAt = token(input.evidence.observedAt, 80);
  const freshness = token(input.evidence.freshness);
  if (!evidenceId || !sourceId || !sourceVersion || !authorityRef || !observedAt) {
    return fail('EVIDENCE_IDENTITY_INVALID');
  }
  if (!PROVENANCE.has(provenance) || !FRESHNESS.has(freshness)) {
    return fail('EVIDENCE_PROVENANCE_INVALID');
  }

  const summary = summaryText(input.summary);
  if (!summary) return fail('SUMMARY_INVALID');
  const confidence = input.confidence === undefined ? null : token(input.confidence);
  if (input.confidence !== undefined && !confidence) return fail('CONFIDENCE_INVALID');

  const skillTags = normalizeSkillTags(input.skillTags);
  if (!skillTags) return fail('SKILL_TAG_INVALID');

  const lineage = freezeDeep({
    evidenceId,
    sourceId,
    sourceVersion,
    provenance,
    authorityRef,
    observedAt,
    freshness,
  });
  const knowledgeItem = freezeDeep({
    evidenceId,
    summary,
    ...(confidence ? { confidence } : {}),
  });

  return freezeDeep({
    ok: true,
    projectionId: PROJECTION_ID,
    lessonType: input.lessonType,
    outputGoal: input.outputGoal,
    skillTags,
    material: {
      kind: input.material.kind,
      displayRef: ref,
      label,
    },
    knowledgeContext: {
      schemaVersion: KNOWLEDGE_SCHEMA,
      partnerId: PARTNER_ID,
      useSite: USE_SITE,
      safeForPrompt: true,
      containsPrivate: false,
      containsRawUserText: false,
      items: [knowledgeItem],
      lineage: [lineage],
    },
    authority: {
      mode: 'candidate_output_only',
      automaticCanonMutationAllowed: false,
      automaticRelationshipMutationAllowed: false,
      automaticGameMutationAllowed: false,
      automaticRewardMutationAllowed: false,
      automaticMergeAllowed: false,
      automaticPublishAllowed: false,
    },
  });
}

export const PARTNER_LEARNING_ARTIFACT_PROJECTION_ID = PROJECTION_ID;
