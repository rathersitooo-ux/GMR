import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerConversationCollectiveContext,
  COLLECTIVE_EVIDENCE_LINEAGE_SCHEMA,
  normalizeCollectiveEvidenceLineage,
  PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
} from '../browser/partner-conversation-collective-context.mjs';
import { buildPartnerAdviceEvidenceLineage } from '../tools/partner-advice-decision-product.mjs';

function evidence(overrides = {}) {
  return {
    evidenceId: 'evidence-1',
    sourceId: 'collective-source-1',
    sourceVersion: 'v1',
    provenance: 'server_verified',
    authorityRef: 'owner:collective-current',
    observedAt: '2026-08-29T01:00:00+09:00',
    freshness: 'current',
    counterevidenceState: 'NONE_FOUND',
    useSite: 'partner-conversation',
    summary: '同条件で候補Aの満足度が候補Bより高かった。',
    confidence: 'bounded',
    ...overrides,
  };
}

test('projects only current authority/provenance-bound evidence for Partner conversation', () => {
  const output = buildPartnerConversationCollectiveContext({
    partnerId: 'partner.saasuna',
    evidenceItems: [evidence()],
  });
  assert.equal(output.ok, true);
  assert.equal(output.schemaVersion, PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA);
  assert.equal(output.lineageSchemaVersion, COLLECTIVE_EVIDENCE_LINEAGE_SCHEMA);
  assert.equal(output.useSite, 'partner-conversation');
  assert.equal(output.acceptedCount, 1);
  assert.equal(output.rejectedCount, 0);
  assert.equal(output.safeForPrompt, true);
  assert.equal(output.containsPrivate, false);
  assert.equal(output.containsRawUserText, false);
  assert.equal(output.secondRecorderCreated, false);
});

test('lower-grade fixture/synthetic/prototype evidence is excluded from prompt context', () => {
  const evidenceItems = ['fixture', 'synthetic', 'prototype_local'].map((provenance, index) =>
    evidence({ evidenceId: `low-${index}`, provenance }),
  );
  const output = buildPartnerConversationCollectiveContext({ partnerId: 'partner.saasuna', evidenceItems });
  assert.equal(output.ok, true);
  assert.equal(output.acceptedCount, 0);
  assert.equal(output.rejectedCount, 3);
  assert.deepEqual(output.items, []);
  assert.deepEqual(output.lineage, []);
});

test('unknown/stale authority state and unknown counterevidence fail closed', () => {
  const bad = [
    evidence({ evidenceId: 'stale', freshness: 'stale' }),
    evidence({ evidenceId: 'unknown-counter', counterevidenceState: 'UNKNOWN' }),
    evidence({ evidenceId: 'unknown-provenance', provenance: 'unknown' }),
    evidence({ evidenceId: 'wrong-use', useSite: 'battle-advice' }),
    evidence({ evidenceId: 'missing-authority', authorityRef: '' }),
  ];
  const output = buildPartnerConversationCollectiveContext({ partnerId: 'partner.saasuna', evidenceItems: bad });
  assert.equal(output.acceptedCount, 0);
  assert.equal(output.rejectedCount, bad.length);
});

test('private/raw/free-text unexpected payload fields are rejected rather than copied', () => {
  const secret = 'PRIVATE RAW USER TEXT';
  const bad = evidence({ rawUserText: secret, privateMemory: 'secret memory', notes: 'free text' });
  const output = buildPartnerConversationCollectiveContext({
    partnerId: 'partner.saasuna',
    evidenceItems: [bad, evidence({ evidenceId: 'safe-2' })],
  });
  assert.equal(output.acceptedCount, 1);
  assert.equal(output.rejectedCount, 1);
  assert.equal(JSON.stringify(output).includes(secret), false);
  assert.equal(JSON.stringify(output).includes('secret memory'), false);
  assert.equal(JSON.stringify(output).includes('free text'), false);
});

test('lineage preserves exact identity/version/provenance/counterevidence without raw source payload', () => {
  const output = buildPartnerConversationCollectiveContext({
    partnerId: 'partner.saasuna',
    evidenceItems: [evidence({ counterevidenceState: 'PRESENT' })],
  });
  assert.deepEqual(output.lineage[0], {
    evidenceId: 'evidence-1',
    sourceId: 'collective-source-1',
    sourceVersion: 'v1',
    provenance: 'server_verified',
    authorityRef: 'owner:collective-current',
    observedAt: '2026-08-29T01:00:00+09:00',
    freshness: 'current',
    counterevidenceState: 'PRESENT',
  });
  assert.equal(output.items[0].counterevidenceState, 'PRESENT');
});

test('shared neutral lineage is reusable by Advice while each consumer keeps its own gate', () => {
  const versions = {
    releaseVersion: 'release-r2',
    rulesVersion: 'rules-r1',
    contentVersion: 'content-r3',
    cardVersion: 'cards-r1',
    stateVersion: 'state-r1',
  };
  const adviceEvidence = {
    evidenceId: 'shared-evidence-1',
    ownerId: 'owner-advice-eval',
    digest: 'sha256-private-to-lineage',
    acquiredAt: '2026-08-29T17:40:00+09:00',
    authorityLevel: 'L2',
    provenance: 'synthetic',
    cohortId: 'cohort-a',
    versions,
    summaryRef: 'summary-private-to-lineage',
  };
  const adviceLineage = buildPartnerAdviceEvidenceLineage(adviceEvidence, 'NONE_FOUND');
  assert.deepEqual(adviceLineage, {
    evidenceId: 'shared-evidence-1',
    sourceId: 'owner-advice-eval',
    sourceVersion: 'releaseVersion=release-r2|rulesVersion=rules-r1|contentVersion=content-r3|cardVersion=cards-r1|stateVersion=state-r1|cohortId=cohort-a',
    provenance: 'synthetic',
    authorityRef: 'evidence-grade:L2',
    observedAt: '2026-08-29T17:40:00+09:00',
    freshness: 'current_bounded',
    counterevidenceState: 'NONE_FOUND',
  });
  assert.equal(JSON.stringify(adviceLineage).includes(adviceEvidence.digest), false);
  assert.equal(JSON.stringify(adviceLineage).includes(adviceEvidence.summaryRef), false);

  const neutral = normalizeCollectiveEvidenceLineage({
    ...adviceLineage,
    rawPrivatePayload: 'must-not-cross-lineage',
  }, { allowedProvenance: ['synthetic'] });
  assert.deepEqual(neutral, adviceLineage);
  assert.equal(JSON.stringify(neutral).includes('must-not-cross-lineage'), false);

  const conversation = buildPartnerConversationCollectiveContext({
    partnerId: 'partner.saasuna',
    evidenceItems: [evidence({ evidenceId: 'same-grade', provenance: 'synthetic' })],
  });
  assert.equal(conversation.acceptedCount, 0);
  assert.equal(conversation.rejectedCount, 1);
});

test('duplicate evidence IDs collapse to one prompt item', () => {
  const output = buildPartnerConversationCollectiveContext({
    partnerId: 'partner.saasuna',
    evidenceItems: [evidence(), evidence({ summary: 'duplicate copy' })],
  });
  assert.equal(output.acceptedCount, 1);
  assert.equal(output.items.length, 1);
  assert.equal(output.lineage.length, 1);
});

test('output is immutable and exposes no mutation authority', () => {
  const input = { partnerId: 'partner.saasuna', evidenceItems: [evidence()] };
  const before = structuredClone(input);
  const output = buildPartnerConversationCollectiveContext(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.items), true);
  assert.equal(output.automaticCanonMutationAllowed, false);
  assert.equal(output.automaticRelationshipMutationAllowed, false);
  assert.equal(output.automaticGameMutationAllowed, false);
});
