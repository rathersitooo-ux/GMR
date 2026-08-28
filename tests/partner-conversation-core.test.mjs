import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runSaasunaConversationTurn,
  PARTNER_CONVERSATION_CORE_ID,
} from '../browser/partner-conversation-core.mjs';
import {
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
} from '../browser/partner-saasuna-conversation-source.mjs';

function base(overrides = {}) {
  return {
    partnerId: SAASUNA_PARTNER_ID,
    sessionId: 'session-1',
    turnId: 'turn-1',
    userMessage: '今日は何をする？',
    ...overrides,
  };
}

function provider(text = '今日は作戦を詰めましょう。') {
  return {
    async sendMessage(request) {
      return {
        kind: 'utterance_candidate',
        partnerId: request.partnerId,
        dialogueVersion: request.dialogueVersion,
        sourceId: request.sourceId,
        text,
      };
    },
  };
}

test('current Saasuna turn accepts injected provider and stays ephemeral', async () => {
  const output = await runSaasunaConversationTurn(base(), { provider: provider() });
  assert.equal(output.ok, true);
  assert.equal(output.coreId, PARTNER_CONVERSATION_CORE_ID);
  assert.equal(output.partnerId, SAASUNA_PARTNER_ID);
  assert.equal(output.dialogueVersion, SAASUNA_DIALOGUE_VERSION);
  assert.equal(output.sourceId, SAASUNA_DIALOGUE_SOURCE_ID);
  assert.equal(output.responseOrigin, 'provider_candidate');
  assert.equal(output.canonStatus, 'ephemeral_candidate');
  assert.equal(output.automaticCanonMutationAllowed, false);
  assert.equal(output.automaticRelationshipMutationAllowed, false);
  assert.equal(output.automaticGameMutationAllowed, false);
  assert.equal(output.highIntimacyEnabled, false);
});

test('conversation entry is Saasuna-fixed and rejects a picker-style partner override', async () => {
  const output = await runSaasunaConversationTurn(base({ partnerId: 'partner.someone-else' }), { provider: provider() });
  assert.equal(output.ok, false);
  assert.equal(output.reason, 'PARTNER_NOT_SAASUNA');
  assert.equal(output.containsCharacterText, false);
});

test('source/version mismatch fails closed instead of silently switching persona', async () => {
  for (const overrides of [
    { dialogueVersion: 'old.dialogue' },
    { sourceId: 'SOURCE-OTHER' },
  ]) {
    const output = await runSaasunaConversationTurn(base(overrides), { provider: provider() });
    assert.equal(output.ok, false);
    assert.equal(output.reason, 'SOURCE_NOT_CURRENT');
  }
});

test('provider diagnostics or wrong identity never become character speech', async () => {
  const cases = [
    { diagnostic: 'MODEL FAILED: SECRET', text: 'internal failure' },
    { kind: 'diagnostic', partnerId: SAASUNA_PARTNER_ID, dialogueVersion: SAASUNA_DIALOGUE_VERSION, sourceId: SAASUNA_DIALOGUE_SOURCE_ID, text: 'internal failure' },
    { kind: 'utterance_candidate', partnerId: 'partner.other', dialogueVersion: SAASUNA_DIALOGUE_VERSION, sourceId: SAASUNA_DIALOGUE_SOURCE_ID, text: 'wrong person' },
  ];
  for (const value of cases) {
    const output = await runSaasunaConversationTurn(base(), { provider: { async sendMessage() { return value; } } });
    assert.equal(output.ok, true);
    assert.equal(output.responseOrigin, 'approved_fallback');
    assert.equal(JSON.stringify(output).includes('MODEL FAILED: SECRET'), false);
    assert.equal(JSON.stringify(output).includes('internal failure'), false);
    assert.equal(JSON.stringify(output).includes('wrong person'), false);
  }
});

test('provider exception fail-softs to approved Saasuna fallback without diagnostic echo', async () => {
  const output = await runSaasunaConversationTurn(base(), {
    provider: { async sendMessage() { throw new Error('SECRET PROVIDER TRACE'); } },
  });
  assert.equal(output.ok, true);
  assert.equal(output.responseOrigin, 'approved_fallback');
  assert.equal(output.evidence.providerAttempted, true);
  assert.equal(JSON.stringify(output).includes('SECRET PROVIDER TRACE'), false);
});

test('privacy-safe evidence excludes raw user message and provider payload', async () => {
  const secret = 'PRIVATE USER MESSAGE 7fbc';
  const output = await runSaasunaConversationTurn(base({ userMessage: secret }), { provider: provider('候補返答') });
  const serialized = JSON.stringify(output.evidence);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('候補返答'), false);
  assert.equal(output.evidence.rawUserTextStored, false);
  assert.equal(output.evidence.rawProviderPayloadStored, false);
  assert.equal(output.evidence.automaticCanonMutation, false);
  assert.equal(output.evidence.automaticRelationshipMutation, false);
  assert.equal(output.evidence.automaticGameMutation, false);
});

test('bounded collective context is forwarded only when explicitly privacy-safe and identity-matched', async () => {
  let seen = null;
  const safeContext = Object.freeze({
    schemaVersion: 'gameroad.partner-conversation-collective-context.v1',
    partnerId: SAASUNA_PARTNER_ID,
    useSite: 'partner-conversation',
    safeForPrompt: true,
    containsPrivate: false,
    containsRawUserText: false,
    items: Object.freeze([{ evidenceId: 'e-1', summary: '同条件で候補Aの評価が高かった。', confidence: 'bounded' }]),
    lineage: Object.freeze([{ evidenceId: 'e-1', sourceId: 'source-1', sourceVersion: 'v1', provenance: 'server_verified' }]),
  });
  const output = await runSaasunaConversationTurn(base({ collectiveContext: safeContext }), {
    provider: {
      async sendMessage(request) {
        seen = request.collectiveContext;
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '集合知は参考にしますが、決めつけません。',
        };
      },
    },
  });
  assert.equal(output.ok, true);
  assert.equal(seen.schemaVersion, safeContext.schemaVersion);
  assert.deepEqual(output.evidence.collectiveEvidenceIds, ['e-1']);
});

test('unsafe collective context is silently excluded from provider request and evidence', async () => {
  let seen = 'not-called';
  const output = await runSaasunaConversationTurn(base({
    collectiveContext: {
      schemaVersion: 'gameroad.partner-conversation-collective-context.v1',
      partnerId: SAASUNA_PARTNER_ID,
      useSite: 'partner-conversation',
      safeForPrompt: true,
      containsPrivate: true,
      containsRawUserText: true,
      items: [{ rawUserText: 'SECRET' }],
      lineage: [{ evidenceId: 'private-1' }],
    },
  }), {
    provider: {
      async sendMessage(request) {
        seen = request.collectiveContext;
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '通常返答',
        };
      },
    },
  });
  assert.equal(seen, null);
  assert.deepEqual(output.evidence.collectiveEvidenceIds, []);
  assert.equal(JSON.stringify(output).includes('SECRET'), false);
});

test('output is deterministic/frozen at the boundary and does not mutate input', async () => {
  const input = base({ userMessage: '同じ質問' });
  const before = structuredClone(input);
  const first = await runSaasunaConversationTurn(input, {});
  const second = await runSaasunaConversationTurn(structuredClone(input), {});
  assert.deepEqual(input, before);
  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.evidence), true);
});
