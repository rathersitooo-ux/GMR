import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_LEARNING_ARTIFACT_PROJECTION_ID,
  projectLearningArtifactForSaasuna,
} from '../browser/partner-learning-artifact-core.mjs';

function base(overrides = {}) {
  return {
    lessonType: 'bug_debug',
    outputGoal: 'bug_report_candidate',
    material: {
      kind: 'image',
      displayRef: 'artifact:bug-shot-001',
      label: '短横画面のバグ再現スクリーンショット',
    },
    evidence: {
      evidenceId: 'ev-001',
      sourceId: 'gameroad.current-bug-evidence',
      sourceVersion: 'build-abc123',
      provenance: 'internal_authority',
      authorityRef: 'github:rathersitooo-ux/GMR/issues/123',
      observedAt: '2026-08-29T19:20:00+09:00',
      freshness: 'current',
    },
    summary: '現行ビルドで再現したUI不具合の証拠。画像そのものではなく、検証済み要約だけをサースナー推論へ渡す。',
    confidence: 'high',
    skillTags: ['bug_reproduction', 'logic', 'debug_math'],
    ...overrides,
  };
}

test('projects a bug screenshot into visible material plus existing Saasuna knowledgeContext', () => {
  const result = projectLearningArtifactForSaasuna(base());
  assert.equal(result.ok, true);
  assert.equal(result.projectionId, PARTNER_LEARNING_ARTIFACT_PROJECTION_ID);
  assert.deepEqual(result.material, {
    kind: 'image',
    displayRef: 'artifact:bug-shot-001',
    label: '短横画面のバグ再現スクリーンショット',
  });
  assert.deepEqual(result.knowledgeContext, {
    schemaVersion: 'gameroad.partner-knowledge-context.v1',
    partnerId: 'partner.saasuna',
    useSite: 'partner-conversation',
    safeForPrompt: true,
    containsPrivate: false,
    containsRawUserText: false,
    items: [{
      evidenceId: 'ev-001',
      summary: '現行ビルドで再現したUI不具合の証拠。画像そのものではなく、検証済み要約だけをサースナー推論へ渡す。',
      confidence: 'high',
    }],
    lineage: [{
      evidenceId: 'ev-001',
      sourceId: 'gameroad.current-bug-evidence',
      sourceVersion: 'build-abc123',
      provenance: 'internal_authority',
      authorityRef: 'github:rathersitooo-ux/GMR/issues/123',
      observedAt: '2026-08-29T19:20:00+09:00',
      freshness: 'current',
    }],
  });
});

test('supports story/language output without making it canon', () => {
  const result = projectLearningArtifactForSaasuna(base({
    lessonType: 'story_language',
    outputGoal: 'story_revision_candidate',
    material: { kind: 'text', displayRef: 'drive:story-draft-17', label: '第3話 現在稿' },
    skillTags: ['reading_comprehension', 'revision'],
  }));
  assert.equal(result.ok, true);
  assert.equal(result.authority.automaticCanonMutationAllowed, false);
  assert.equal(result.authority.automaticPublishAllowed, false);
});

test('supports programming source and patch candidate', () => {
  const result = projectLearningArtifactForSaasuna(base({
    lessonType: 'programming',
    outputGoal: 'patch_candidate',
    material: { kind: 'code', displayRef: 'github:rathersitooo-ux/GMR@abc123:browser/foo.mjs', label: '現在の対象コード' },
    skillTags: ['programming', 'logic'],
  }));
  assert.equal(result.ok, true);
  assert.equal(result.authority.automaticMergeAllowed, false);
});

test('supports programming English as a GAMEROAD-specific skill', () => {
  const result = projectLearningArtifactForSaasuna(base({
    lessonType: 'programming_english',
    outputGoal: 'code_glossary_candidate',
    material: { kind: 'code', displayRef: 'github:rathersitooo-ux/GMR@abc123:tests/foo.test.mjs', label: 'エラーと識別子の教材' },
    skillTags: ['programming_english', 'programming'],
  }));
  assert.equal(result.ok, true);
});

test('rejects a lesson/output combination that would route to the wrong product artifact', () => {
  const result = projectLearningArtifactForSaasuna(base({
    lessonType: 'story_language',
    outputGoal: 'patch_candidate',
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'OUTPUT_GOAL_NOT_ALLOWED_FOR_LESSON');
});

test('rejects raw URL and data URI transport so the projection stays reference-only', () => {
  for (const displayRef of ['https://example.com/image.png', 'data:image/png;base64,AAAA']) {
    const result = projectLearningArtifactForSaasuna(base({
      material: { kind: 'image', displayRef, label: 'bad' },
    }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'MATERIAL_REFERENCE_INVALID');
  }
});

test('rejects raw source bytes or extra free-text payload fields', () => {
  const result = projectLearningArtifactForSaasuna({
    ...base(),
    rawSource: 'full manuscript or source bytes',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INPUT_BOUNDARY_INVALID');
});

test('rejects extra material payload such as embedded image bytes', () => {
  const result = projectLearningArtifactForSaasuna(base({
    material: {
      kind: 'image',
      displayRef: 'artifact:shot-1',
      label: 'shot',
      base64: 'AAAA',
    },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'MATERIAL_BOUNDARY_INVALID');
});

test('requires versioned evidence identity and authority reference', () => {
  for (const key of ['evidenceId', 'sourceId', 'sourceVersion', 'authorityRef', 'observedAt']) {
    const evidence = { ...base().evidence };
    delete evidence[key];
    const result = projectLearningArtifactForSaasuna(base({ evidence }));
    assert.equal(result.ok, false, key);
    assert.equal(result.reason, 'EVIDENCE_IDENTITY_INVALID');
  }
});

test('rejects unapproved provenance and stale/unknown freshness', () => {
  let result = projectLearningArtifactForSaasuna(base({
    evidence: { ...base().evidence, provenance: 'model_guess' },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EVIDENCE_PROVENANCE_INVALID');

  result = projectLearningArtifactForSaasuna(base({
    evidence: { ...base().evidence, freshness: 'stale' },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EVIDENCE_PROVENANCE_INVALID');
});

test('rejects oversized summaries rather than copying a source document into the prompt', () => {
  const result = projectLearningArtifactForSaasuna(base({ summary: 'x'.repeat(601) }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SUMMARY_INVALID');
});

test('deduplicates bounded skill tags', () => {
  const result = projectLearningArtifactForSaasuna(base({
    skillTags: ['logic', 'logic', 'debug_math'],
  }));
  assert.deepEqual(result.skillTags, ['logic', 'debug_math']);
});

test('rejects unknown skill tags instead of inventing curriculum taxonomy', () => {
  const result = projectLearningArtifactForSaasuna(base({
    skillTags: ['generic_school_score'],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SKILL_TAG_INVALID');
});

test('never grants automatic product, relationship, reward, merge or publish authority', () => {
  const result = projectLearningArtifactForSaasuna(base());
  assert.deepEqual(result.authority, {
    mode: 'candidate_output_only',
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    automaticRewardMutationAllowed: false,
    automaticMergeAllowed: false,
    automaticPublishAllowed: false,
  });
});

test('successful projection is deeply immutable', () => {
  const result = projectLearningArtifactForSaasuna(base());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.material), true);
  assert.equal(Object.isFrozen(result.knowledgeContext), true);
  assert.equal(Object.isFrozen(result.knowledgeContext.items[0]), true);
});
