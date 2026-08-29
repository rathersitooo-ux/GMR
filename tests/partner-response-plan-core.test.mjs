import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerResponsePlan,
  isPartnerResponsePlan,
  PARTNER_RESPONSE_PLAN_SCHEMA_VERSION,
} from '../browser/partner-response-plan-core.mjs';

function authority(overrides = {}) {
  return {
    mode: 'presentation_only',
    autoExecute: false,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
    automaticRewardMutationAllowed: false,
    ...overrides,
  };
}

function base(overrides = {}) {
  return {
    schemaVersion: PARTNER_RESPONSE_PLAN_SCHEMA_VERSION,
    planId: 'plan-1',
    partnerId: 'partner.saasuna',
    purpose: 'conversation_utterance',
    scope: {
      useSite: 'partner-conversation',
      publicScope: true,
      safeForRender: true,
      containsPrivate: false,
      containsRawUserText: false,
    },
    source: {
      sourceId: 'SOURCE-DIALOGUE-SAASUNA-20260810',
      sourceVersion: 'saasuna.dialogue.current.r1.20260810',
      origin: 'approved_source',
    },
    presentation: {
      kind: 'utterance',
      text: '優秀なんですよ、私。',
    },
    evidence: {
      evidenceIds: [],
    },
    authority: authority(),
    ...overrides,
  };
}

test('builds one immutable character-neutral conversation response plan', () => {
  const input = base();
  const before = structuredClone(input);
  const output = buildPartnerResponsePlan(input);

  assert.equal(output.ok, true);
  assert.equal(output.schemaVersion, PARTNER_RESPONSE_PLAN_SCHEMA_VERSION);
  assert.equal(output.partnerId, 'partner.saasuna');
  assert.equal(output.purpose, 'conversation_utterance');
  assert.deepEqual(output.presentation, { kind: 'utterance', text: '優秀なんですよ、私。' });
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.presentation), true);
  assert.equal(isPartnerResponsePlan(output), true);
});

test('preserves advice candidate/target semantics without execution authority', () => {
  const output = buildPartnerResponsePlan(base({
    planId: 'plan-advice-1',
    partnerId: 'partner.future',
    purpose: 'advice_recommendation',
    scope: {
      useSite: 'battle-advice',
      publicScope: true,
      safeForRender: true,
      containsPrivate: false,
      containsRawUserText: false,
    },
    source: {
      sourceId: 'partner-advice-current',
      sourceVersion: 'rules-42',
      origin: 'derived_projection',
    },
    presentation: {
      kind: 'candidate_emphasis',
      candidateId: 'candidate-A',
      targetId: 'board-target-A',
      alternativeCandidateId: 'candidate-B',
    },
    evidence: { evidenceIds: ['evidence-1', 'evidence-2'] },
  }));

  assert.equal(output.ok, true);
  assert.equal(output.partnerId, 'partner.future');
  assert.deepEqual(output.presentation, {
    kind: 'candidate_emphasis',
    candidateId: 'candidate-A',
    targetId: 'board-target-A',
    alternativeCandidateId: 'candidate-B',
  });
  assert.deepEqual(output.evidence.evidenceIds, ['evidence-1', 'evidence-2']);
  assert.equal(output.authority.mode, 'presentation_only');
  assert.equal(output.authority.autoExecute, false);
  assert.equal(output.authority.automaticGameMutationAllowed, false);
});

test('unknown fields including private/raw/persona payload fail closed and are never echoed', () => {
  const secret = 'PRIVATE RAW USER TEXT';
  const output = buildPartnerResponsePlan({
    ...base(),
    rawUserText: secret,
    privateMemory: 'secret memory',
    personaGuidance: ['do something'],
  });

  assert.equal(output.ok, false);
  assert.equal(output.reason, 'UNEXPECTED_FIELD');
  assert.equal(output.safeForRender, false);
  assert.equal(JSON.stringify(output).includes(secret), false);
  assert.equal(JSON.stringify(output).includes('secret memory'), false);
  assert.equal(JSON.stringify(output).includes('personaGuidance'), false);
});

test('private/raw scope or any automatic authority fails closed', () => {
  const cases = [
    base({ scope: { ...base().scope, containsPrivate: true } }),
    base({ scope: { ...base().scope, containsRawUserText: true } }),
    base({ authority: authority({ autoExecute: true }) }),
    base({ authority: authority({ automaticCanonMutationAllowed: true }) }),
    base({ authority: authority({ automaticRelationshipMutationAllowed: true }) }),
    base({ authority: authority({ automaticGameMutationAllowed: true }) }),
    base({ authority: authority({ automaticRewardMutationAllowed: true }) }),
  ];

  for (const input of cases) {
    const output = buildPartnerResponsePlan(input);
    assert.equal(output.ok, false);
    assert.equal(output.safeForRender, false);
    assert.equal(output.autoExecute, false);
  }
});

test('nested free-form fields are rejected instead of silently stripped', () => {
  const output = buildPartnerResponsePlan(base({
    presentation: {
      kind: 'utterance',
      text: '公開してよい返答',
      debugPrompt: 'hidden prompt',
    },
  }));
  assert.equal(output.ok, false);
  assert.equal(output.reason, 'PRESENTATION_INVALID');
  assert.equal(JSON.stringify(output).includes('hidden prompt'), false);
});

test('evidence identity is explicit, bounded and duplicate IDs are invalid', () => {
  const duplicate = buildPartnerResponsePlan(base({
    evidence: { evidenceIds: ['same-id', 'same-id'] },
  }));
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'EVIDENCE_INVALID');

  const tooMany = buildPartnerResponsePlan(base({
    evidence: { evidenceIds: Array.from({ length: 17 }, (_, index) => `e-${index}`) },
  }));
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.reason, 'EVIDENCE_INVALID');
});

test('purpose and presentation kind cannot drift apart', () => {
  const output = buildPartnerResponsePlan(base({
    purpose: 'advice_recommendation',
    presentation: { kind: 'utterance', text: 'wrong semantic shape' },
  }));
  assert.equal(output.ok, false);
  assert.equal(output.reason, 'PRESENTATION_INVALID');
});

test('serialized plan validation rejects tampering with safety flags', () => {
  const plan = buildPartnerResponsePlan(base());
  assert.equal(isPartnerResponsePlan(plan), true);

  const tampered = structuredClone(plan);
  tampered.authority.autoExecute = true;
  assert.equal(isPartnerResponsePlan(tampered), false);
});
