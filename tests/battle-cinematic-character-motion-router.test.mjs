import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CINEMATIC_CHARACTER_MOTION_ROUTER_RUNTIME,
  createBattleCinematicCharacterMotionRouter,
  resolveSaasunaBattleCausalMotionState,
} from '../browser/battle-cinematic-character-motion-router.mjs';

function createHost() {
  return { dataset: {} };
}

test('runtime contract is presentation-only and reuses merged character runtimes', () => {
  const runtime = BATTLE_CINEMATIC_CHARACTER_MOTION_ROUTER_RUNTIME;
  assert.equal(runtime.schema, 'gameroad.battle-cinematic-character-motion-router.v1');
  assert.equal(runtime.routing, 'NAKI_EXACT_ID_FIRST_THEN_SAASUNA_EXACT_CONTROLLER');
  assert.equal(runtime.identityInference, false);
  assert.equal(runtime.trimsOrNormalizesCharacterIdentity, false);
  assert.equal(runtime.presentationOnly, true);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.boardAuthority, false);
  assert.equal(runtime.saveAuthority, false);
  assert.equal(runtime.networkAuthority, false);
  assert.equal(runtime.nakiRuntime, 'gameroad.naki-battle-magic-live-adapter.v1');
  assert.equal(runtime.saasunaRuntime, 'gameroad.saasuna-battle-motion-core.v1');
  assert.equal(runtime.causalTimelineCompatible, true);
  assert.deepEqual(runtime.causalPhaseOrder, [
    'stance',
    'anticipation',
    'release',
    'impact',
    'reaction',
    'return',
  ]);
  assert.equal(runtime.unknownCharacterFallback, 'null_no_motion_controller');
});

test('Saasuna causal mapping reuses existing motion states', () => {
  assert.equal(resolveSaasunaBattleCausalMotionState({ causalPhase: 'stance' }), 'IDLE_GENTLE');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'anticipation',
    actionPhase: 'attack',
  }), 'IDLE_GENTLE');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'anticipation',
    actionPhase: 'ability',
  }), 'STAFF_FREEZE');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'release',
    actionPhase: 'attack',
  }), 'MAGIC_RELEASE');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'release',
    actionPhase: 'ability',
  }), 'ICE_SLIDE_LOW');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'impact',
    role: 'source',
  }), 'WIND_CUT');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'impact',
    role: 'target',
  }), 'HIT_RECOIL');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'reaction',
    role: 'target',
  }), 'HIT_RECOIL');
  assert.equal(resolveSaasunaBattleCausalMotionState({
    causalPhase: 'return',
    role: 'target',
  }), 'IDLE_GENTLE');
  assert.equal(resolveSaasunaBattleCausalMotionState({ causalPhase: 'unknown' }), null);
});

test('Naki path is attempted first and keeps caller explicit identity unchanged', () => {
  const host = createHost();
  const calls = [];
  const nakiController = {
    applyCausalPhase(input) {
      calls.push(['naki-phase', input]);
      return { route: 'naki', input };
    },
    snapshot() {
      return { state: 'MIC_SPELLCAST' };
    },
    destroy() {
      calls.push(['naki-destroy']);
    },
  };

  const router = createBattleCinematicCharacterMotionRouter({
    doc: {},
    host,
    characterId: 'naki.current',
    nakiCharacterId: 'naki.current',
    role: 'source',
    phase: 'ability',
    createNakiAdapter(input) {
      calls.push(['naki-create', input]);
      return nakiController;
    },
    createSaasunaController() {
      calls.push(['saasuna-create']);
      return null;
    },
  });

  assert.ok(router);
  assert.equal(router.route, 'naki');
  assert.equal(calls[0][0], 'naki-create');
  assert.equal(calls[0][1].characterId, 'naki.current');
  assert.equal(calls[0][1].nakiCharacterId, 'naki.current');
  assert.equal(calls.some(([type]) => type === 'saasuna-create'), false);
  assert.equal(host.dataset.battleCinematicMotionRoute, 'naki');
  assert.equal(host.dataset.battleCinematicMotionCharacterId, 'naki.current');
  assert.equal(host.dataset.battleCinematicMotionAuthority, 'presentation-only');

  assert.deepEqual(router.applyCausalPhase({
    causalPhase: 'release',
    actionPhase: 'ability',
  }), {
    route: 'naki',
    input: {
      causalPhase: 'release',
      actionPhase: 'ability',
    },
  });

  assert.deepEqual(router.receipt(), {
    route: 'naki',
    characterId: 'naki.current',
    identityVerified: true,
    identitySource: 'caller-explicit-exact-naki-id-match',
    presentationOnly: true,
    gameplayAuthority: false,
    boardAuthority: false,
    saveAuthority: false,
    networkAuthority: false,
  });
  assert.equal(router.snapshot().state, 'MIC_SPELLCAST');
  assert.equal(router.snapshot().route, 'naki');

  router.destroy();
  assert.equal(calls.some(([type]) => type === 'naki-destroy'), true);
  assert.equal(host.dataset.battleCinematicMotionRouter, undefined);
  assert.equal(host.dataset.battleCinematicMotionRoute, undefined);
  assert.equal(host.dataset.battleCinematicMotionCharacterId, undefined);
  assert.equal(host.dataset.battleCinematicMotionAuthority, undefined);
});

test('router does not trim or normalize Naki identity before the existing adapter', () => {
  const seen = [];
  const router = createBattleCinematicCharacterMotionRouter({
    doc: {},
    host: createHost(),
    characterId: ' naki.current ',
    nakiCharacterId: 'naki.current',
    createNakiAdapter(input) {
      seen.push(input);
      return null;
    },
    createSaasunaController() {
      return null;
    },
  });

  assert.equal(router, null);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].characterId, ' naki.current ');
  assert.equal(seen[0].nakiCharacterId, 'naki.current');
});

test('Saasuna fallback is used only after Naki adapter declines the exact character', () => {
  const host = createHost();
  const calls = [];
  const stateInputs = [];
  const controller = {
    setState(input) {
      stateInputs.push(input);
      return { state: input.motionState };
    },
    snapshot() {
      return { state: stateInputs.at(-1)?.motionState ?? 'IDLE_GENTLE' };
    },
    clear() {
      calls.push(['saasuna-clear']);
    },
  };

  const router = createBattleCinematicCharacterMotionRouter({
    doc: {},
    host,
    characterId: 'partner.saasuna',
    nakiCharacterId: 'naki.current',
    role: 'source',
    phase: 'attack',
    createNakiAdapter(input) {
      calls.push(['naki-create', input.characterId]);
      return null;
    },
    createSaasunaController(input) {
      calls.push(['saasuna-create', input.characterId]);
      return controller;
    },
  });

  assert.ok(router);
  assert.equal(router.route, 'saasuna');
  assert.deepEqual(calls.slice(0, 2), [
    ['naki-create', 'partner.saasuna'],
    ['saasuna-create', 'partner.saasuna'],
  ]);
  assert.equal(host.dataset.battleCinematicMotionRoute, 'saasuna');

  assert.deepEqual(router.applyCausalPhase({
    causalPhase: 'anticipation',
    actionPhase: 'ability',
  }), { state: 'STAFF_FREEZE' });
  assert.deepEqual(router.applyCausalPhase({
    causalPhase: 'release',
    actionPhase: 'ability',
  }), { state: 'ICE_SLIDE_LOW' });
  assert.deepEqual(router.applyCausalPhase({
    causalPhase: 'impact',
    role: 'source',
  }), { state: 'WIND_CUT' });
  assert.deepEqual(router.applyCausalPhase({
    causalPhase: 'reaction',
    role: 'target',
  }), { state: 'HIT_RECOIL' });

  assert.deepEqual(stateInputs.map((input) => input.motionState), [
    'STAFF_FREEZE',
    'ICE_SLIDE_LOW',
    'WIND_CUT',
    'HIT_RECOIL',
  ]);
  assert.equal(router.receipt().identitySource, 'saasuna-controller-exact-character-rejection');

  router.clear();
  assert.equal(calls.some(([type]) => type === 'saasuna-clear'), true);
  assert.equal(host.dataset.battleCinematicMotionRoute, undefined);
});

test('unknown characters fail closed with no controller receipt', () => {
  const host = createHost();
  const router = createBattleCinematicCharacterMotionRouter({
    doc: {},
    host,
    characterId: 'character.unknown',
    nakiCharacterId: 'naki.current',
    createNakiAdapter() {
      return null;
    },
    createSaasunaController() {
      return null;
    },
  });

  assert.equal(router, null);
  assert.deepEqual(host.dataset, {});
});

test('missing document, host, or exact character id fails closed', () => {
  const factory = () => {
    throw new Error('must not invoke controller factory');
  };
  assert.equal(createBattleCinematicCharacterMotionRouter({
    doc: null,
    host: createHost(),
    characterId: 'x',
    createNakiAdapter: factory,
    createSaasunaController: factory,
  }), null);
  assert.equal(createBattleCinematicCharacterMotionRouter({
    doc: {},
    host: null,
    characterId: 'x',
    createNakiAdapter: factory,
    createSaasunaController: factory,
  }), null);
  assert.equal(createBattleCinematicCharacterMotionRouter({
    doc: {},
    host: createHost(),
    characterId: '',
    createNakiAdapter: factory,
    createSaasunaController: factory,
  }), null);
});

console.log('battle-cinematic-character-motion-router tests passed');
