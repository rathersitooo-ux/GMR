import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPartnerConversationCollectiveContext,
  PARTNER_CONVERSATION_COLLECTIVE_CONTEXT_SCHEMA,
} from '../browser/partner-conversation-collective-context.mjs';

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

function responsePlanSchema() {
  return JSON.parse(readFileSync(new URL('../data/partner-response-plan.schema.json', import.meta.url), 'utf8'));
}

test('PartnerResponsePlan is a character-neutral strict semantic contract', () => {
  const schema = responsePlanSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schemaVersion.const, 'gameroad.partner-response-plan.v1');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.producer.properties.kind.enum, ['advice', 'conversation', 'shared']);
  assert.ok(schema.properties.purpose.enum.includes('advise'));
  assert.ok(schema.properties.purpose.enum.includes('social'));

  const serialized = JSON.stringify(schema.properties);
  for (const forbidden of ['userMessage', 'personaGuidance', 'privateMemory', 'utterance', 'renderedText']) {
    assert.equal(serialized.includes(`\"${forbidden}\"`), false, `${forbidden} must not be part of the shared plan`);
  }
});

test('PartnerResponsePlan scope and authority fail closed before any renderer', () => {
  const schema = responsePlanSchema();
  const scope = schema.properties.scope.properties;
  assert.equal(scope.publicScope.const, true);
  assert.equal(scope.safeForRenderer.const, true);
  assert.equal(scope.containsPrivate.const, false);
  assert.equal(scope.containsRawUserText.const, false);

  const authority = schema.properties.authority.properties;
  assert.equal(authority.mode.const, 'presentation_only');
  assert.equal(authority.autoExecute.const, false);
  assert.equal(authority.automaticCanonMutationAllowed.const, false);
  assert.equal(authority.automaticRelationshipMutationAllowed.const, false);
  assert.equal(authority.automaticGameMutationAllowed.const, false);
  assert.equal(authority.automaticRewardMutationAllowed.const, false);
});

test('PartnerResponsePlan keeps free-form dialogue out while allowing bounded machine semantics', () => {
  const schema = responsePlanSchema();
  const token = new RegExp(schema.$defs.token180.pattern);
  assert.equal(token.test('candidate-A'), true);
  assert.equal(token.test('battle.column:right'), true);
  assert.equal(token.test('PRIVATE RAW USER TEXT'), false);

  assert.equal(schema.properties.semanticArgs.maxItems, 12);
  assert.equal(schema.properties.evidenceRefs.maxItems, 16);
  assert.equal(schema.properties.evidenceRefs.uniqueItems, true);
  assert.equal(schema.properties.target.anyOf[0].type, 'null');
  assert.equal(schema.properties.target.anyOf[1].additionalProperties, false);
});

test('Advice/warn plans require a reason and at least one evidence reference; abstain requires a reason', () => {
  const schema = responsePlanSchema();
  const adviseRule = schema.allOf[0];
  assert.deepEqual(adviseRule.if.properties.purpose.enum, ['advise', 'warn']);
  assert.equal(adviseRule.then.properties.evidenceRefs.minItems, 1);
  assert.equal(adviseRule.then.properties.reasonCode.$ref, '#/$defs/token120');

  const abstainRule = schema.allOf[1];
  assert.equal(abstainRule.if.properties.purpose.const, 'abstain');
  assert.equal(abstainRule.then.properties.reasonCode.$ref, '#/$defs/token120');
});
