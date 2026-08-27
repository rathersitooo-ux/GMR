import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const corePath = process.env.CORE_UNDER_TEST || path.resolve(import.meta.dirname, '../browser/battle-surface-cleanup-contract.mjs');
const { buildBattleSurfaceCleanupPlan, battleSurfaceCleanupContract } = await import(pathToFileURL(corePath).href + `?v=${Date.now()}`);

function plan(screenMode = 'PLAN', overrides = {}) {
  return buildBattleSurfaceCleanupPlan({
    screenMode,
    legacySurface: {
      hasDevPanel: true,
      hasDebugGrid: true,
      hasVisibleBranding: true,
    },
    publicStatus: {
      round: 2,
      phase: 'PLAN',
      quickTimeRemainingMs: 18000,
      hateValue: 235,
      manaPublic: { current: 5, max: 7 },
      handCount: 3,
      deckCount: 24,
      shieldCount: 2,
      laneProgress: [2, 4, 1],
      commitState: 'pending',
      actorId: 'P1',
      targetId: 'P3',
      participantStatus: ['ready', 'waiting', 'ready', 'waiting'],
      honeyCount: 2,
      graveyardCount: 8,
      exileCount: 1,
      chipCount: 3,
      exCount: 2,
      ...overrides,
    },
  });
}

test('hard-omits visible Battle branding in PLAN', () => {
  const out = plan('PLAN');
  assert.equal(out.ok, true);
  assert.equal(out.branding.visibleGameplayLogo, 'omit');
  assert.equal(out.branding.visibleGameplayWordmark, 'omit');
  assert.equal(out.branding.visibleBrandHeader, 'omit');
  assert.equal(out.branding.policy, 'hard-zero-visible-battle-branding');
});

test('retires developer and fossil shell surfaces without deleting gameplay concepts', () => {
  const out = plan('PLAN');
  for (const id of [
    'match-info-dev-panel',
    'debug-coordinate-overlay',
    'debug-position-id-overlay',
    'full-109-cell-debug-grid',
    'fossil-same-field-battle-overlay',
    'raw-state-json-panel',
  ]) {
    assert.ok(out.retire.includes(id), `retire missing: ${id}`);
  }
  for (const concept of ['round', 'phase', 'mana', 'hate', 'shield', 'lane-progress', 'actor-target-relation']) {
    assert.ok(out.preserve.includes(concept), `preserve missing: ${concept}`);
  }
});

test('projects only whitelisted public-safe status fields', () => {
  const out = buildBattleSurfaceCleanupPlan({
    screenMode: 'PLAN',
    publicStatus: {
      round: 3,
      handCount: 3,
      targetId: 'P4',
      hand: ['secret-card-a'],
      privateCards: ['secret-card-b'],
      secretChoice: 'hidden-choice',
      hiddenRoad: 6,
      ownerDeckContents: ['secret-card-c'],
      arbitraryPayload: { secret: true },
    },
  });
  assert.deepEqual(out.publicStatus, { round: 3, handCount: 3, targetId: 'P4' });
  const text = JSON.stringify(out.publicStatus);
  for (const forbidden of ['secret-card-a', 'secret-card-b', 'hidden-choice', 'secret-card-c', 'arbitraryPayload']) {
    assert.equal(text.includes(forbidden), false, `secret/private payload leaked: ${forbidden}`);
  }
});

test('PLAN enables world/status/decision while keeping causal and drawer dormant', () => {
  const out = plan('PLAN');
  assert.equal(out.layers.world.active, true);
  assert.equal(out.layers.status.active, true);
  assert.equal(out.layers.decision.active, true);
  assert.equal(out.layers.causal.active, false);
  assert.equal(out.layers.drawer.active, false);
});

test('BATTLE_PHASE disables PLAN decision shell and only reserves the causal host', () => {
  const out = plan('BATTLE_PHASE');
  assert.equal(out.ok, true);
  assert.equal(out.layers.world.active, true);
  assert.equal(out.layers.status.active, true);
  assert.equal(out.layers.decision.active, false);
  assert.equal(out.layers.causal.active, true);
  assert.equal(out.causalContract.hostReserved, true);
  assert.equal(out.causalContract.effectSemanticsOwnedHere, false);
  assert.equal(out.causalContract.responseRulesOwnedHere, false);
  assert.equal(out.causalContract.priorityRulesOwnedHere, false);
});

test('RESULT removes board decision shell and exposes a drawer/history host', () => {
  const out = plan('RESULT');
  assert.equal(out.ok, true);
  assert.equal(out.layers.world.active, false);
  assert.equal(out.layers.status.active, true);
  assert.equal(out.layers.decision.active, false);
  assert.equal(out.layers.causal.active, false);
  assert.equal(out.layers.drawer.active, true);
});

test('unknown screen mode fails closed into a minimal unbranded status shell', () => {
  const out = plan('SOMETHING_NEW');
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'UNKNOWN_SCREEN_MODE');
  assert.equal(out.mode, 'UNKNOWN');
  assert.equal(out.layers.world.active, false);
  assert.equal(out.layers.status.active, true);
  assert.equal(out.layers.decision.active, false);
  assert.equal(out.layers.causal.active, false);
  assert.equal(out.layers.drawer.active, false);
  assert.equal(out.branding.visibleGameplayLogo, 'omit');
});

test('integration is explicitly owned by branch 9, not this module', () => {
  const out = plan('PLAN');
  assert.equal(out.integration.requiresHtmlMount, true);
  assert.equal(out.integration.ownedByThisModule, false);
  assert.equal(out.integration.htmlPath, 'browser/GAMEROAD.html');
  assert.equal(out.integration.htmlOwner, 'branch-9-integration');
  assert.ok(out.invariants.includes('NO_HTML_OWNERSHIP'));
  assert.ok(out.invariants.includes('NO_GAME_RULE_CALCULATION'));
  assert.ok(out.invariants.includes('NO_STATE_MUTATION'));
});

test('contract exposes a stable explicit cleanup vocabulary', () => {
  assert.equal(battleSurfaceCleanupContract.schema, 'gameroad.battle-surface-cleanup.v1');
  assert.ok(battleSurfaceCleanupContract.retiredSurfaces.includes('visible-gameplay-logo'));
  assert.ok(battleSurfaceCleanupContract.preservedStatusKeys.includes('quickTimeRemainingMs'));
  assert.ok(battleSurfaceCleanupContract.preservedConcepts.includes('participant-status'));
});
