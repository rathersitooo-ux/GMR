import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExternalCreativeSubmission } from '../tools/external-creative-submission.mjs';

function validIdea(overrides = {}) {
  return {
    submissionId: 'SUB-20260819-0001',
    contentKind: 'IDEA',
    source: {
      kind: 'X',
      url: 'https://x.com/example/status/1234567890',
      externalPostId: '1234567890',
    },
    campaignId: 'CAMPAIGN-IDEA-01',
    submittedAt: '2026-08-19T13:56:00Z',
    contentRef: 'ugc://idea/SUB-20260819-0001',
    contentDigest: 'a'.repeat(64),
    declaredOrigin: 'HUMAN',
    consentUseScope: 'ANALYSIS_ONLY',
    containsPrivate: false,
    containsCredentials: false,
    ...overrides,
  };
}

test('normalizes a public idea while keeping GAMEROAD submissionId authoritative', () => {
  const result = normalizeExternalCreativeSubmission(validIdea());
  assert.equal(result.ok, true);
  assert.equal(result.candidate.submissionId, 'SUB-20260819-0001');
  assert.equal(result.candidate.identityAuthority, 'GAMEROAD_SUBMISSION_ID');
  assert.equal(result.candidate.source.authority, 'PROVENANCE_ONLY');
  assert.equal(result.candidate.reward.automaticGrantAllowed, false);
  assert.equal(result.candidate.formalWork.approved, false);
  assert.equal(result.candidate.automaticMutationAllowed, false);
});

test('fan art is candidate evidence and never becomes a formal work by normalization', () => {
  const result = normalizeExternalCreativeSubmission(validIdea({
    submissionId: 'SUB-FANART-0001',
    contentKind: 'FAN_ART',
    source: { kind: 'BLUESKY', url: 'https://bsky.app/profile/example.test/post/abc' },
    contentRef: 'ugc://fanart/SUB-FANART-0001',
    contentDigest: 'b'.repeat(64),
    declaredOrigin: 'AI_ASSISTED',
    consentUseScope: 'ELIGIBLE_FOR_HUMAN_FORMAL_REVIEW',
  }));
  assert.equal(result.ok, true);
  assert.equal(result.candidate.evidenceState, 'CANDIDATE_ONLY');
  assert.equal(result.candidate.formalWork.approved, false);
  assert.equal(result.candidate.formalWork.humanApprovalRequired, true);
  assert.deepEqual(result.candidate.declaredOrigin, {
    value: 'AI_ASSISTED',
    authority: 'SELF_DECLARED_NOT_VERIFIED',
  });
});

test('a social URL cannot replace a missing canonical submissionId', () => {
  const input = validIdea();
  delete input.submissionId;
  const result = normalizeExternalCreativeSubmission(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('submissionId-invalid'));
});

test('non-form social sources require an HTTPS provenance URL', () => {
  const result = normalizeExternalCreativeSubmission(validIdea({
    source: { kind: 'X' },
  }));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('source-url-required'));

  const insecure = normalizeExternalCreativeSubmission(validIdea({
    source: { kind: 'OTHER_PUBLIC', url: 'http://example.com/post/1' },
  }));
  assert.equal(insecure.ok, false);
  assert.ok(insecure.reasons.includes('source-url-invalid'));
});

test('GAMEROAD form submissions may omit an external source URL', () => {
  const result = normalizeExternalCreativeSubmission(validIdea({
    source: { kind: 'GAMEROAD_FORM' },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.candidate.source.url, null);
});

test('private or credential-bearing input fails closed', () => {
  const privateResult = normalizeExternalCreativeSubmission(validIdea({ containsPrivate: true }));
  assert.equal(privateResult.ok, false);
  assert.ok(privateResult.reasons.includes('private-data-not-explicitly-false'));

  const credentialResult = normalizeExternalCreativeSubmission(validIdea({ containsCredentials: true }));
  assert.equal(credentialResult.ok, false);
  assert.ok(credentialResult.reasons.includes('credential-data-not-explicitly-false'));
});

test('reward, AI score, and formal approval claims are rejected as unexpected authority', () => {
  const result = normalizeExternalCreativeSubmission({
    ...validIdea(),
    rewardAmount: 1,
    aiScore: 0.99,
    formalApproved: true,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons.filter((reason) => reason.startsWith('unexpected-field:')), [
    'unexpected-field:aiScore',
    'unexpected-field:formalApproved',
    'unexpected-field:rewardAmount',
  ]);
});

test('canonical identity is never derived from or deduplicated by the social URL', () => {
  const first = normalizeExternalCreativeSubmission(validIdea({ submissionId: 'SUB-A' }));
  const second = normalizeExternalCreativeSubmission(validIdea({ submissionId: 'SUB-B' }));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.candidate.source.url, second.candidate.source.url);
  assert.notEqual(first.candidate.submissionId, second.candidate.submissionId);
});

test('invalid timestamp, digest, and unknown source/origin/consent values fail closed', () => {
  const result = normalizeExternalCreativeSubmission(validIdea({
    submittedAt: 'not-a-date',
    contentDigest: 'not-sha256',
    source: { kind: 'SCRAPER', url: 'https://example.com/post/1' },
    declaredOrigin: 'VERIFIED_HUMAN',
    consentUseScope: 'TRAIN_ANY_MODEL',
  }));
  assert.equal(result.ok, false);
  for (const reason of [
    'submittedAt-invalid',
    'contentDigest-invalid',
    'source-kind-invalid',
    'declaredOrigin-invalid',
    'consentUseScope-invalid',
  ]) assert.ok(result.reasons.includes(reason), reason);
});
