import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runSaasunaConversationTurn,
  createSaasunaConversationEntry,
  PARTNER_CONVERSATION_CORE_ID,
  PARTNER_CONVERSATION_ENTRY_SCREEN_ID,
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

test('source-bound knowledge context reaches the provider without becoming Partner memory', async () => {
  let seen = null;
  const knowledgeContext = {
    schemaVersion: 'gameroad.partner-knowledge-context.v1',
    partnerId: SAASUNA_PARTNER_ID,
    useSite: 'partner-conversation',
    safeForPrompt: true,
    containsPrivate: false,
    containsRawUserText: false,
    items: [{ evidenceId: 'k-1', summary: 'カードXの現行説明は公式仕様A。', confidence: 'bounded' }],
    lineage: [{
      evidenceId: 'k-1',
      sourceId: 'official-card-spec',
      sourceVersion: '2026-08-29',
      provenance: 'internal_authority',
      authorityRef: 'GAMEROAD_CURRENT_CARD_SPEC',
      observedAt: '2026-08-29T03:00:00+09:00',
      freshness: 'current',
    }],
  };
  const output = await runSaasunaConversationTurn(base({ knowledgeContext }), {
    provider: {
      async sendMessage(request) {
        seen = request.knowledgeContext;
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '根拠は確認できています。',
        };
      },
    },
  });
  assert.equal(output.ok, true);
  assert.equal(seen.schemaVersion, knowledgeContext.schemaVersion);
  assert.deepEqual(seen.items, knowledgeContext.items);
  assert.deepEqual(seen.lineage, knowledgeContext.lineage);
  assert.equal(JSON.stringify(output).includes('カードXの現行説明'), false);
});

test('stale, unknown-authority or unsupported-provenance knowledge is excluded', async () => {
  for (const lineageOverride of [
    { freshness: 'stale' },
    { authorityRef: '' },
    { provenance: 'persona_memory' },
  ]) {
    let seen = 'not-called';
    const output = await runSaasunaConversationTurn(base({
      knowledgeContext: {
        schemaVersion: 'gameroad.partner-knowledge-context.v1',
        partnerId: SAASUNA_PARTNER_ID,
        useSite: 'partner-conversation',
        safeForPrompt: true,
        containsPrivate: false,
        containsRawUserText: false,
        items: [{ evidenceId: 'k-1', summary: '候補知識' }],
        lineage: [{
          evidenceId: 'k-1',
          sourceId: 'source-1',
          sourceVersion: 'v1',
          provenance: 'external_primary',
          authorityRef: 'source:official',
          observedAt: '2026-08-29T03:00:00+09:00',
          freshness: 'current',
          ...lineageOverride,
        }],
      },
    }), {
      provider: {
        async sendMessage(request) {
          seen = request.knowledgeContext;
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
    assert.equal(output.ok, true);
    assert.equal(seen, null);
  }
});

test('private, raw, persona or relationship fields cannot enter factual grounding', async () => {
  for (const forbidden of [
    { rawUserText: 'SECRET RAW' },
    { privateMemory: 'SECRET PRIVATE' },
    { personaMemory: 'SECRET PERSONA' },
    { relationshipMemory: 'SECRET RELATIONSHIP' },
  ]) {
    let seen = 'not-called';
    const output = await runSaasunaConversationTurn(base({
      knowledgeContext: {
        schemaVersion: 'gameroad.partner-knowledge-context.v1',
        partnerId: SAASUNA_PARTNER_ID,
        useSite: 'partner-conversation',
        safeForPrompt: true,
        containsPrivate: false,
        containsRawUserText: false,
        items: [{ evidenceId: 'k-1', summary: '安全な要約', ...forbidden }],
        lineage: [{
          evidenceId: 'k-1',
          sourceId: 'source-1',
          sourceVersion: 'v1',
          provenance: 'external_primary',
          authorityRef: 'source:official',
          observedAt: '2026-08-29T03:00:00+09:00',
          freshness: 'current',
        }],
      },
    }), {
      provider: {
        async sendMessage(request) {
          seen = request.knowledgeContext;
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
    assert.equal(output.ok, true);
    assert.equal(seen, null);
    assert.equal(JSON.stringify(output).includes('SECRET'), false);
  }
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

test('entry opens directly on Saasuna without a partner picker', () => {
  const entry = createSaasunaConversationEntry({ createSessionId: () => 'session-entry' });
  const state = entry.open();
  assert.equal(state.screenId, PARTNER_CONVERSATION_ENTRY_SCREEN_ID);
  assert.equal(state.partnerId, SAASUNA_PARTNER_ID);
  assert.equal(state.pickerRequired, false);
  assert.equal(state.switchPartnerAllowedHere, false);
});

test('entry send reuses one session and increments turn ids through existing core', async () => {
  const seen = [];
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-entry',
    provider: {
      async sendMessage(request) {
        seen.push(request);
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: `返答${seen.length}`,
        };
      },
    },
  });
  const first = await entry.send('一つ目');
  const second = await entry.send('二つ目');
  assert.equal(seen[0].sessionId, 'session-entry');
  assert.equal(seen[1].sessionId, 'session-entry');
  assert.equal(seen[0].turnId, 'turn-1');
  assert.equal(seen[1].turnId, 'turn-2');
  assert.equal(first.turn.utterance, '返答1');
  assert.equal(second.turn.utterance, '返答2');
  assert.equal(entry.status().turnSequence, 2);
});

test('entry without provider returns the existing approved Saasuna fallback', async () => {
  const entry = createSaasunaConversationEntry({ createSessionId: () => 'session-entry' });
  const output = await entry.send('話そう');
  assert.equal(output.turn.ok, true);
  assert.equal(output.turn.partnerId, SAASUNA_PARTNER_ID);
  assert.equal(output.turn.responseOrigin, 'approved_fallback');
});

test('entry provider failure falls back without exposing provider diagnostics', async () => {
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-entry',
    provider: {
      async sendMessage() {
        throw new Error('SECRET PROVIDER TRACE');
      },
    },
  });
  const output = await entry.send('大丈夫？');
  assert.equal(output.turn.responseOrigin, 'approved_fallback');
  assert.equal(JSON.stringify(output).includes('SECRET PROVIDER TRACE'), false);
});

test('entry wrapper does not duplicate raw user message', async () => {
  const secret = 'PRIVATE ENTRY MESSAGE';
  const entry = createSaasunaConversationEntry({ createSessionId: () => 'session-entry' });
  const output = await entry.send(secret);
  assert.equal(JSON.stringify(output).includes(secret), false);
  assert.equal(output.turn.evidence.rawUserTextStored, false);
});

test('entry can pass one turn of source-bound knowledge into the existing conversation core', async () => {
  let seen = null;
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-entry',
    provider: {
      async sendMessage(request) {
        seen = request.knowledgeContext;
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '確認済みの根拠を使います。',
        };
      },
    },
  });
  await entry.send('現行仕様は？', {
    knowledgeContext: {
      schemaVersion: 'gameroad.partner-knowledge-context.v1',
      partnerId: SAASUNA_PARTNER_ID,
      useSite: 'partner-conversation',
      safeForPrompt: true,
      containsPrivate: false,
      containsRawUserText: false,
      items: [{ evidenceId: 'k-entry', summary: '現行仕様の確認済み要約。' }],
      lineage: [{
        evidenceId: 'k-entry',
        sourceId: 'current-spec',
        sourceVersion: 'v1',
        provenance: 'internal_authority',
        authorityRef: 'CURRENT',
        observedAt: '2026-08-29T03:00:00+09:00',
        freshness: 'current',
      }],
    },
  });
  assert.equal(seen.items[0].evidenceId, 'k-entry');
});

test('entry passes bounded collective context into the existing conversation core', async () => {
  let seen = null;
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-collective-entry',
    provider: {
      async sendMessage(request) {
        seen = request.collectiveContext;
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '集合知は補助情報として扱います。',
        };
      },
    },
  });
  const output = await entry.send('みんなの傾向は？', {
    collectiveContext: {
      schemaVersion: 'gameroad.partner-conversation-collective-context.v1',
      partnerId: SAASUNA_PARTNER_ID,
      useSite: 'partner-conversation',
      safeForPrompt: true,
      containsPrivate: false,
      containsRawUserText: false,
      items: [{ evidenceId: 'e-entry', summary: '同条件の確認済み集合傾向。', confidence: 'bounded' }],
      lineage: [{
        evidenceId: 'e-entry',
        sourceId: 'collective-current',
        sourceVersion: 'v1',
        provenance: 'server_verified',
        authorityRef: 'COLLECTIVE_CURRENT',
        observedAt: '2026-08-29T17:40:00+09:00',
        freshness: 'current',
        counterevidenceState: 'NONE_FOUND',
      }],
    },
  });
  assert.equal(seen.items[0].evidenceId, 'e-entry');
  assert.deepEqual(output.turn.evidence.collectiveEvidenceIds, ['e-entry']);
  assert.equal(JSON.stringify(output).includes('同条件の確認済み集合傾向'), false);
});

test('entry session context starts empty and carries only completed prior turns', async () => {
  const seen = [];
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-context',
    provider: {
      async sendMessage(request) {
        seen.push(request);
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: `返答${seen.length}`,
        };
      },
    },
  });
  await entry.send('最初の話');
  await entry.send('その続き');
  assert.equal(seen[0].sessionContext, null);
  assert.deepEqual(seen[1].sessionContext.turns, [{
    turnId: 'turn-1',
    userMessage: '最初の話',
    assistantUtterance: '返答1',
    responseOrigin: 'provider_candidate',
  }]);
});

test('entry session context is bounded to the four most recent completed turns', async () => {
  const seen = [];
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-bounded',
    provider: {
      async sendMessage(request) {
        seen.push(request);
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: `r${seen.length}`,
        };
      },
    },
  });
  for (let index = 1; index <= 6; index += 1) await entry.send(`u${index}`);
  assert.equal(seen[5].sessionContext.turns.length, 4);
  assert.deepEqual(seen[5].sessionContext.turns.map((turn) => turn.turnId), ['turn-2', 'turn-3', 'turn-4', 'turn-5']);
  assert.deepEqual(seen[5].sessionContext.turns.map((turn) => turn.userMessage), ['u2', 'u3', 'u4', 'u5']);
});

test('session context does not persist across entries or leak through returned state', async () => {
  const firstSeen = [];
  const first = createSaasunaConversationEntry({
    createSessionId: () => 'session-a',
    provider: {
      async sendMessage(request) {
        firstSeen.push(request);
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '一つ目の返答',
        };
      },
    },
  });
  const secret = 'SESSION ONLY SECRET';
  const returned = await first.send(secret);
  assert.equal(JSON.stringify(returned).includes(secret), false);
  assert.equal(JSON.stringify(first.status()).includes(secret), false);

  const secondSeen = [];
  const second = createSaasunaConversationEntry({
    createSessionId: () => 'session-b',
    provider: {
      async sendMessage(request) {
        secondSeen.push(request);
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '別セッション',
        };
      },
    },
  });
  await second.send('新規');
  assert.equal(secondSeen[0].sessionContext, null);
});

test('approved fallback remains usable as ephemeral context on the next turn', async () => {
  const seen = [];
  let calls = 0;
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-fallback-context',
    provider: {
      async sendMessage(request) {
        seen.push(request);
        calls += 1;
        if (calls === 1) throw new Error('provider temporarily unavailable');
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '復帰しました。',
        };
      },
    },
  });
  const first = await entry.send('一つ目');
  assert.equal(first.turn.responseOrigin, 'approved_fallback');
  await entry.send('二つ目');
  assert.equal(seen[1].sessionContext.turns[0].assistantUtterance, first.turn.utterance);
  assert.equal(seen[1].sessionContext.turns[0].responseOrigin, 'approved_fallback');
});

test('provider-candidate Good feedback stays local, private, and non-mutating', async () => {
  const userText = 'PRIVATE FEEDBACK USER TEXT';
  const assistantText = 'PRIVATE FEEDBACK ASSISTANT TEXT';
  const entry = createSaasunaConversationEntry({
    createSessionId: () => 'session-feedback-good',
    provider: provider(assistantText),
  });
  await entry.send(userText);
  const feedback = entry.feedback('turn-1', 'good');
  assert.equal(feedback.ok, true);
  assert.equal(feedback.schemaVersion, 'gameroad.partner-conversation-quality-feedback.v1');
  assert.equal(feedback.partnerId, SAASUNA_PARTNER_ID);
  assert.equal(feedback.turnId, 'turn-1');
  assert.equal(feedback.rating, 'good');
  assert.equal(feedback.responseOrigin, 'provider_candidate');
  assert.equal(feedback.canonStatus, 'ephemeral_candidate');
  assert.equal(feedback.acknowledgement, 'heart');
  assert.equal(feedback.badDetailDeferred, false);
  assert.equal(feedback.localOnly, true);
  assert.equal(feedback.rawTextStored, false);
  assert.equal(feedback.automaticCanonMutation, false);
  assert.equal(feedback.automaticRelationshipMutation, false);
  assert.equal(feedback.automaticRewardMutation, false);
  assert.equal(feedback.automaticLearning, false);
  assert.equal(JSON.stringify(feedback).includes(userText), false);
  assert.equal(JSON.stringify(feedback).includes(assistantText), false);
});

test('rerating one response replaces the prior local rating instead of double-counting', async () => {
  const entry = createSaasunaConversationEntry({ createSessionId: () => 'session-feedback-replace' });
  await entry.send('評価対象');
  const first = entry.feedback('turn-1', 'good');
  const second = entry.feedback('turn-1', 'bad');
  assert.equal(first.replacedPrevious, false);
  assert.equal(second.ok, true);
  assert.equal(second.rating, 'bad');
  assert.equal(second.acknowledgement, 'recorded');
  assert.equal(second.badDetailDeferred, true);
  assert.equal(second.replacedPrevious, true);
});

test('feedback rejects unknown turns, invalid ratings, and cross-session targets', async () => {
  const first = createSaasunaConversationEntry({ createSessionId: () => 'session-feedback-a' });
  await first.send('一つ目');
  assert.deepEqual(first.feedback('turn-999', 'good'), { ok: false, reason: 'FEEDBACK_TARGET_NOT_FOUND' });
  assert.deepEqual(first.feedback('turn-1', 'love'), { ok: false, reason: 'FEEDBACK_INPUT_INVALID' });

  const second = createSaasunaConversationEntry({ createSessionId: () => 'session-feedback-b' });
  assert.deepEqual(second.feedback('turn-1', 'good'), { ok: false, reason: 'FEEDBACK_TARGET_NOT_FOUND' });
});
