import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBattleContextualTutorialReplayControl,
  createPartnerAdviceReplayBridge,
  createPartnerAdviceRuntimeControl,
  createTutorialPartnerGuideControl,
  isPartnerAdviceQuickReplyAvailable,
  projectBattleContextualTutorialReplay,
  projectPartnerAdviceBoardEmphasis,
} from '../browser/partner-advice-runtime-mount.mjs';

const V = Object.freeze({ rulesVersion: 'rules-r1', cardVersion: 'cards-r1', stateVersion: 'state-r1' });
const RUNTIME_STATE = Object.freeze({ phase: 'plan', turnBand: 'early', pressureBand: 'low', manaBand: 'mid', handBand: 'three' });
const FINGERPRINT = 'rules=rules-r1|cards=cards-r1|state=state-r1|phase=plan|turnBand=early|pressureBand=low|manaBand=mid|handBand=three';

function candidate(candidateId, positionOrder, comparisonValue, payload = { label: candidateId }) {
  return { candidateId, kind: 'card', positionOrder, comparisonValue, legal: true, publicScope: true, assetAction: 'NONE', payload };
}

function legacyReplay({ rule, candidates }) {
  const legal = candidates.filter((x) => x.legal !== false);
  const ordered = [...legal].sort((a, b) => {
    if (rule === 'left') return a.positionOrder - b.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'right') return b.positionOrder - a.positionOrder || a.candidateId.localeCompare(b.candidateId);
    if (rule === 'max') return b.comparisonValue - a.comparisonValue || a.candidateId.localeCompare(b.candidateId);
    return a.comparisonValue - b.comparisonValue || a.candidateId.localeCompare(b.candidateId);
  });
  return { ok: true, selected: ordered[0] ?? null, ordered: ordered.map((x) => x.candidateId), source: 'legacy' };
}

test('missing formal version tuple keeps the exact legacy production path', () => {
  const rows = [candidate('b', 1, 5), candidate('a', 0, 3)];
  let calls = 0;
  const bridge = createPartnerAdviceReplayBridge({ legacyReplay: (input) => { calls++; return legacyReplay(input); } });
  const result = bridge(rows, 'left');
  assert.equal(calls, 1);
  assert.equal(result.source, 'legacy');
  assert.equal(result.selected.candidateId, 'a');
});

test('formal versions activate shared legal-action core without changing deterministic rule choice', () => {
  const rows = [candidate('b', 1, 5), candidate('a', 0, 3, { label: 'public-a' })];
  const bridge = createPartnerAdviceReplayBridge({ legacyReplay, getVersions: () => V });
  const result = bridge(rows, 'left');
  assert.equal(result.source, 'shared-legal-action-core');
  assert.equal(result.selected.candidateId, 'a');
  assert.deepEqual(result.selected.payload, { label: 'public-a' });
  assert.deepEqual(result.ordered, ['a', 'b']);
});

test('approved manifest can override the rule only inside current legal public candidates', () => {
  const rows = [candidate('heuristic', 0, 3), candidate('learned', 1, 5)];
  const manifest = {
    schema: 'gameroad.partner-advice-runtime-manifest.v1',
    targetVersions: { ...V },
    approval: { gateId: 'HUMAN-HOLDOUT-ACCEPTANCE', approvalId: 'approval-r4', humanGate: 'approved', privacyScope: 'shared' },
    promotionSafe: true,
    defaultActionId: 'heuristic',
    minContextSupport: 8,
    contexts: [{ fingerprint: FINGERPRINT, actionId: 'learned', support: 12 }],
    sourceEvidence: 'offline-approved-aggregate-only',
    containsRawEvents: false,
    containsPrivate: false,
    livePlayerPerformanceProven: false,
  };
  const bridge = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getManifest: () => manifest,
    getRuntimeState: () => RUNTIME_STATE,
  });
  const result = bridge(rows, 'left');
  assert.equal(result.source, 'approved-runtime-manifest');
  assert.equal(result.manifestUsed, true);
  assert.equal(result.selected.candidateId, 'learned');
});

test('formal partner identity can resolve an existing saved strategy without changing legality', () => {
  const bridge = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getPartnerId: () => 'partner.saasuna',
    getStrategyPreference: (partnerId) => {
      assert.equal(partnerId, 'partner.saasuna');
      return 'right';
    },
  });

  const result = bridge([
    candidate('left-card', 0, 3),
    candidate('right-card', 1, 5),
  ], 'left');

  assert.equal(result.source, 'shared-legal-action-core');
  assert.equal(result.selected.candidateId, 'right-card');
});

test('different formal partner identities may resolve different existing strategy preferences', () => {
  let currentPartnerId = 'partner.alpha';
  const bridge = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getPartnerId: () => currentPartnerId,
    getStrategyPreference: (partnerId) => ({
      'partner.alpha': 'min',
      'partner.beta': 'max',
    })[partnerId] ?? null,
  });
  const candidates = [candidate('low', 0, 1), candidate('high', 1, 9)];

  assert.equal(bridge(candidates, 'left').selected.candidateId, 'low');
  currentPartnerId = 'partner.beta';
  assert.equal(bridge(candidates, 'left').selected.candidateId, 'high');
});

test('missing invalid or failed preference authority never invents a default strategy', () => {
  const candidates = [candidate('left-card', 0, 9), candidate('right-card', 1, 1)];

  for (const getStrategyPreference of [
    () => null,
    () => 'balanced',
    () => { throw new Error('save unavailable'); },
  ]) {
    const bridge = createPartnerAdviceReplayBridge({
      legacyReplay,
      getVersions: () => V,
      getPartnerId: () => 'partner.saasuna',
      getStrategyPreference,
    });
    assert.equal(bridge(candidates, 'left').selected.candidateId, 'left-card');
  }

  let calls = 0;
  const noIdentity = createPartnerAdviceReplayBridge({
    legacyReplay,
    getVersions: () => V,
    getPartnerId: () => null,
    getStrategyPreference: () => { calls += 1; return 'right'; },
  });
  assert.equal(noIdentity(candidates, 'left').selected.candidateId, 'left-card');
  assert.equal(calls, 0);
});

test('runtime control rejects invented/partial versions and exposes activation status', () => {
  const control = createPartnerAdviceRuntimeControl();
  assert.deepEqual(control.status(), { versionReady: false, manifestReady: false, runtimeStateReady: false, mode: 'legacy-fallback' });
  assert.equal(control.setVersions({ rulesVersion: 'rules-r1' }), false);
  assert.equal(control.setVersions(V), true);
  assert.equal(control.status().mode, 'shared-rule');
  assert.equal(control.setManifest({ schema: 'x' }), true);
  assert.equal(control.status().mode, 'manifest-or-rule');
  control.clearManifest();
  assert.equal(control.status().mode, 'shared-rule');
});

test('current public advice projects one caller-resolved board target without owning board semantics', () => {
  let resolverCalls = 0;
  const projection = projectPartnerAdviceBoardEmphasis({
    adviceResult: {
      ok: true,
      containsPrivate: false,
      selected: { candidateId: 'card-a' },
      next: 'card-b',
      source: 'shared-legal-action-core',
    },
    isCurrent: () => true,
    resolveTarget: (candidateId) => {
      resolverCalls += 1;
      assert.equal(candidateId, 'card-a');
      return { targetId: 'battle-target-07' };
    },
  });

  assert.equal(resolverCalls, 1);
  assert.deepEqual(projection, {
    schema: 'gameroad.partner-advice-board-projection.v1',
    active: true,
    clear: false,
    reason: null,
    candidateId: 'card-a',
    targetId: 'battle-target-07',
    alternativeCandidateId: 'card-b',
    source: 'shared-legal-action-core',
    presentationRole: 'partner-recommendation',
    autoExecute: false,
  });
  assert.equal(Object.isFrozen(projection), true);
});

test('private, missing, or failed advice never reaches the board target resolver', () => {
  let resolverCalls = 0;
  const resolveTarget = () => { resolverCalls += 1; return 'should-not-run'; };
  const isCurrent = () => true;

  for (const adviceResult of [
    { ok: false, containsPrivate: false, selected: { candidateId: 'a' } },
    { ok: true, containsPrivate: true, selected: { candidateId: 'a' } },
    { ok: true, selected: { candidateId: 'a' } },
    { ok: true, containsPrivate: false, selected: null },
  ]) {
    const projection = projectPartnerAdviceBoardEmphasis({ adviceResult, isCurrent, resolveTarget });
    assert.equal(projection.active, false);
    assert.equal(projection.clear, true);
    assert.equal(projection.targetId, null);
  }
  assert.equal(resolverCalls, 0);
});

test('stale advice clears presentation before any target resolution', () => {
  let resolverCalls = 0;
  const projection = projectPartnerAdviceBoardEmphasis({
    adviceResult: { ok: true, containsPrivate: false, selected: { candidateId: 'card-a' } },
    isCurrent: () => false,
    resolveTarget: () => { resolverCalls += 1; return 'battle-target-07'; },
  });

  assert.equal(resolverCalls, 0);
  assert.equal(projection.active, false);
  assert.equal(projection.clear, true);
  assert.equal(projection.reason, 'STALE_ADVICE');
});

test('currentness and target resolver failures fail closed with no lingering active target', () => {
  const result = { ok: true, containsPrivate: false, selected: { candidateId: 'card-a' } };

  const currentnessFailure = projectPartnerAdviceBoardEmphasis({
    adviceResult: result,
    isCurrent: () => { throw new Error('stale state provider'); },
    resolveTarget: () => 'battle-target-07',
  });
  assert.equal(currentnessFailure.active, false);
  assert.equal(currentnessFailure.clear, true);
  assert.equal(currentnessFailure.reason, 'CURRENTNESS_CHECK_FAILED');

  const resolverFailure = projectPartnerAdviceBoardEmphasis({
    adviceResult: result,
    isCurrent: () => true,
    resolveTarget: () => { throw new Error('board unavailable'); },
  });
  assert.equal(resolverFailure.active, false);
  assert.equal(resolverFailure.clear, true);
  assert.equal(resolverFailure.reason, 'TARGET_RESOLUTION_FAILED');

  const unmapped = projectPartnerAdviceBoardEmphasis({
    adviceResult: result,
    isCurrent: () => true,
    resolveTarget: () => null,
  });
  assert.equal(unmapped.active, false);
  assert.equal(unmapped.clear, true);
  assert.equal(unmapped.reason, 'TARGET_UNMAPPED');
});

test('projection gate is mandatory and never implies automatic execution', () => {
  const result = { ok: true, containsPrivate: false, selected: { candidateId: 'card-a' } };
  const projection = projectPartnerAdviceBoardEmphasis({ adviceResult: result });
  assert.equal(projection.active, false);
  assert.equal(projection.clear, true);
  assert.equal(projection.reason, 'PROJECTION_GATE_REQUIRED');
  assert.equal(projection.autoExecute, false);
});

test('battle quick reply is available only for Saasuna with an exact current match id', () => {
  assert.equal(isPartnerAdviceQuickReplyAvailable({ partnerId: 'partner.saasuna', matchId: 'match-42' }), true);
  for (const input of [
    { partnerId: 'partner.other', matchId: 'match-42' },
    { partnerId: 'partner.saasuna', matchId: null },
    { partnerId: 'partner.saasuna', matchId: '' },
    { partnerId: 'partner.saasuna', matchId: ' match-42' },
    { partnerId: 'partner.saasuna', matchId: 'match-42 ' },
  ]) {
    assert.equal(isPartnerAdviceQuickReplyAvailable(input), false);
  }
});

test('Tutorial Battle starts Saasuna auto guide on and disabling it never disables on-demand conversation', () => {
  const control = createTutorialPartnerGuideControl();
  assert.equal(control.begin('tutorial-run-1'), true);
  assert.equal(control.shouldAutoGuide(), true);
  assert.equal(control.status().autoGuideEnabled, true);
  assert.equal(control.status().userCanDisableAutoGuide, true);
  assert.equal(control.allowsOnDemandConversation(), true);

  assert.equal(control.disableAutoGuide(), true);
  assert.equal(control.shouldAutoGuide(), false);
  assert.equal(control.status().autoGuideEnabled, false);
  assert.equal(control.status().userCanDisableAutoGuide, false);
  assert.equal(control.allowsOnDemandConversation(), true);
});

test('Tutorial completion uses caller save authority and prevents same-session replay', async () => {
  const receipts = [];
  const control = createTutorialPartnerGuideControl({
    commitTutorialCompletion: async (receipt) => {
      receipts.push(receipt);
      return true;
    },
  });

  assert.equal(control.begin('tutorial-run-1'), true);
  assert.equal(control.disableAutoGuide(), true);
  assert.equal(await control.complete(), true);
  assert.deepEqual(receipts, [{
    tutorialId: 'tutorial.first-battle',
    runId: 'tutorial-run-1',
  }]);
  assert.equal(control.status().completed, true);
  assert.equal(control.status().active, false);
  assert.equal(control.begin('tutorial-run-2'), false);
  assert.equal(control.allowsOnDemandConversation(), true);
});

test('missing or failed Tutorial completion authority never fakes one-time completion', async () => {
  const noCommit = createTutorialPartnerGuideControl();
  assert.equal(noCommit.begin('tutorial-run-1'), true);
  assert.equal(await noCommit.complete(), false);
  assert.equal(noCommit.status().active, true);
  assert.equal(noCommit.status().completed, false);

  assert.equal(noCommit.abort(), true);
  assert.equal(noCommit.begin('tutorial-run-2'), true);

  const refused = createTutorialPartnerGuideControl({
    commitTutorialCompletion: () => false,
  });
  assert.equal(refused.begin('tutorial-run-1'), true);
  assert.equal(await refused.complete(), false);
  assert.equal(refused.status().active, true);
  assert.equal(refused.status().completed, false);
});

test('saved or unreadable Tutorial completion state fails closed before a new tutorial run', () => {
  const saved = createTutorialPartnerGuideControl({
    isTutorialCompleted: () => true,
  });
  assert.equal(saved.begin('tutorial-run-1'), false);

  const unknown = createTutorialPartnerGuideControl({
    isTutorialCompleted: () => { throw new Error('save unavailable'); },
  });
  assert.equal(unknown.begin('tutorial-run-1'), false);
});

test('aborting Tutorial does not consume it and the next run starts Saasuna auto guide on again', () => {
  const control = createTutorialPartnerGuideControl();
  assert.equal(control.begin('tutorial-run-1'), true);
  assert.equal(control.disableAutoGuide(), true);
  assert.equal(control.abort(), true);
  assert.equal(control.status().completed, false);

  assert.equal(control.begin('tutorial-run-2'), true);
  assert.equal(control.shouldAutoGuide('tutorial-run-2'), true);
  assert.equal(control.allowsOnDemandConversation(), true);
});

test('contextual Battle replay reuses the current FIRST10 wording without owning gameplay state', () => {
  const road = projectBattleContextualTutorialReplay({ screen: 'battle', phase: 'plan', busy: false, roadId: null, battleId: null });
  assert.equal(road.message, '手札からロードカードを1枚選ぶ');
  assert.equal(road.focusRole, 'road');
  assert.equal(road.presentationOnly, true);
  assert.equal(road.autoExecute, false);

  const battle = projectBattleContextualTutorialReplay({ screen: 'battle', phase: 'plan', busy: false, roadId: 'road-a', battleId: null });
  assert.equal(battle.message, '次に、別のバトルカードを1枚選ぶ');
  assert.equal(battle.focusRole, 'battle');

  const ready = projectBattleContextualTutorialReplay({ screen: 'battle', phase: 'plan', busy: false, roadId: 'road-a', battleId: 'battle-b' });
  assert.equal(ready.message, '予約内容を確認して準備完了');
  assert.equal(ready.focusRole, 'ready');

  const outside = projectBattleContextualTutorialReplay({ screen: 'home', phase: 'plan' });
  assert.equal(outside.active, false);
  assert.equal(outside.reason, 'BATTLE_CONTEXT_REQUIRED');
});

test('contextual Battle replay opens and closes through presentation callbacks only', () => {
  let snapshot = { screen: 'battle', phase: 'plan', busy: false, roadId: null, battleId: null };
  const shown = [];
  const cleared = [];
  const focused = [];
  const control = createBattleContextualTutorialReplayControl({
    getSnapshot: () => snapshot,
    showHelp: (payload) => { shown.push(payload); return true; },
    clearHelp: (code) => { cleared.push(code); return true; },
    setFocus: (role) => { focused.push(role); return true; },
  });

  assert.equal(control.open(), true);
  assert.deepEqual(shown, [{ code: 'BATTLE_CONTEXTUAL_REPLAY', message: '手札からロードカードを1枚選ぶ', kind: 'ok', ttl: 0 }]);
  assert.deepEqual(focused, ['road']);
  assert.deepEqual(control.status(), {
    schema: 'gameroad.tutorial-contextual-replay-control.v1',
    available: true,
    active: true,
    message: '手札からロードカードを1枚選ぶ',
    focusRole: 'road',
    returnContext: 'same-battle',
    presentationOnly: true,
    firstTutorialCompletionMutated: false,
    rewardMutated: false,
    saveMutated: false,
    gameplayAuthorityMutated: false,
    autoExecute: false,
  });

  snapshot = { ...snapshot, roadId: 'road-a' };
  assert.equal(control.refresh().message, '次に、別のバトルカードを1枚選ぶ');
  assert.equal(focused.at(-1), 'battle');

  assert.equal(control.close(), true);
  assert.equal(control.status().active, false);
  assert.equal(focused.at(-1), null);
  assert.ok(cleared.every((code) => code === 'BATTLE_CONTEXTUAL_REPLAY'));
});

test('contextual Battle replay fails closed without current Battle or existing help display authority', () => {
  const outside = createBattleContextualTutorialReplayControl({
    getSnapshot: () => ({ screen: 'home', phase: 'plan' }),
    showHelp: () => true,
    clearHelp: () => true,
  });
  assert.equal(outside.status().available, false);
  assert.equal(outside.open(), false);

  const missingHelp = createBattleContextualTutorialReplayControl({
    getSnapshot: () => ({ screen: 'battle', phase: 'plan', roadId: null, battleId: null }),
  });
  assert.equal(missingHelp.status().available, false);
  assert.equal(missingHelp.open(), false);
});

test('contextual Battle replay aborts its presentation when the caller leaves Battle', () => {
  let snapshot = { screen: 'battle', phase: 'plan', busy: false, roadId: 'road-a', battleId: 'battle-b' };
  const focused = [];
  const control = createBattleContextualTutorialReplayControl({
    getSnapshot: () => snapshot,
    showHelp: () => true,
    clearHelp: () => true,
    setFocus: (role) => { focused.push(role); return true; },
  });
  assert.equal(control.open(), true);
  assert.equal(control.status().active, true);

  snapshot = { screen: 'home', phase: null };
  const status = control.refresh();
  assert.equal(status.active, false);
  assert.equal(status.available, false);
  assert.equal(focused.at(-1), null);
});
