import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NAKI_BATTLE_MAGIC_LIVE_ADAPTER_RUNTIME,
  createNakiBattleMagicLiveAdapter,
  isExactNakiBattleCharacterMatch,
  resolveNakiBattleMagicCausalState,
} from '../browser/naki-battle-magic-live-adapter.mjs';

function fakeDocument({ reducedMotion = false } = {}) {
  const ids = new Map();
  const createElement = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      dataset: {},
      style: {
        values: {},
        setProperty(name, value) { this.values[name] = String(value); },
      },
      children: [],
      hidden: false,
      textContent: '',
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) {
        this.children = this.children.filter((value) => value !== child);
        child.parentNode = null;
        return child;
      },
      setAttribute(name, value) { this[name] = String(value); },
    };
    return node;
  };
  const head = createElement('head');
  const originalAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    if (child.id) ids.set(child.id, child);
    return originalAppend(child);
  };
  return {
    head,
    createElement,
    getElementById(id) { return ids.get(id) ?? null; },
    defaultView: {
      matchMedia() { return { matches: reducedMotion }; },
      setTimeout() { return 1; },
      clearTimeout() {},
    },
  };
}

test('identity match is caller-explicit and exact with no normalization', () => {
  assert.equal(isExactNakiBattleCharacterMatch('naki.live', 'naki.live'), true);
  assert.equal(isExactNakiBattleCharacterMatch('naki.live', ' Naki.live '), false);
  assert.equal(isExactNakiBattleCharacterMatch('NAKI.LIVE', 'naki.live'), false);
  assert.equal(isExactNakiBattleCharacterMatch('', ''), false);
  assert.equal(isExactNakiBattleCharacterMatch(null, 'naki.live'), false);
});

test('adapter fails closed before invoking motion controller when identity is missing or mismatched', () => {
  let calls = 0;
  const createMotionController = () => {
    calls += 1;
    return {};
  };
  assert.equal(createNakiBattleMagicLiveAdapter({
    characterId: 'other',
    nakiCharacterId: 'naki',
    createMotionController,
  }), null);
  assert.equal(createNakiBattleMagicLiveAdapter({
    characterId: 'naki',
    nakiCharacterId: null,
    createMotionController,
  }), null);
  assert.equal(calls, 0);
});

test('adapter forwards cinematic motion context and forces verified identity only after exact match', () => {
  const doc = {};
  const host = { dataset: {} };
  const characterHost = { dataset: {} };
  const timer = () => 1;
  const clearTimer = () => {};
  let received = null;

  const adapter = createNakiBattleMagicLiveAdapter({
    doc,
    host,
    characterHost,
    characterId: 'chosen-naki-id',
    nakiCharacterId: 'chosen-naki-id',
    role: 'target',
    motion: 'static_only',
    phase: 'ability',
    transition: 'CONTINUE',
    motionState: 'HIT_RECOIL',
    setTimeoutFn: timer,
    clearTimeoutFn: clearTimer,
    createMotionController: (input) => {
      received = input;
      return {
        setState: (value) => value,
        playSequence: (value) => value,
        snapshot: () => ({ state: 'HIT_RECOIL' }),
        destroy() {},
        clear() {},
      };
    },
  });

  assert.ok(adapter);
  assert.deepEqual(received, {
    doc,
    host,
    characterHost,
    characterIdentityVerified: true,
    role: 'target',
    motion: 'static_only',
    phase: 'ability',
    transition: 'CONTINUE',
    motionState: 'HIT_RECOIL',
    setTimeoutFn: timer,
    clearTimeoutFn: clearTimer,
  });
  assert.equal(host.dataset.nakiBattleLiveAdapter, 'true');
  assert.equal(host.dataset.nakiBattleCharacterId, 'chosen-naki-id');
  assert.equal(host.dataset.nakiBattleLiveAuthority, 'presentation-only');
});

test('snapshot carries explicit identity receipt without changing motion state', () => {
  const host = { dataset: {} };
  const adapter = createNakiBattleMagicLiveAdapter({
    host,
    characterId: 'naki-explicit',
    nakiCharacterId: 'naki-explicit',
    createMotionController: () => ({
      snapshot: () => ({ state: 'MIC_SPELLCAST', reducedMotion: false }),
      destroy() {},
    }),
  });
  assert.deepEqual(adapter.snapshot(), {
    state: 'MIC_SPELLCAST',
    reducedMotion: false,
    characterId: 'naki-explicit',
    nakiCharacterId: 'naki-explicit',
    identityVerified: true,
    presentationOnly: true,
  });
});

test('destroy delegates to motion controller and removes adapter metadata', () => {
  const host = { dataset: {} };
  let destroyed = 0;
  const adapter = createNakiBattleMagicLiveAdapter({
    host,
    characterId: 'naki',
    nakiCharacterId: 'naki',
    createMotionController: () => ({
      destroy() { destroyed += 1; },
    }),
  });
  adapter.destroy();
  assert.equal(destroyed, 1);
  assert.equal(host.dataset.nakiBattleLiveAdapter, undefined);
  assert.equal(host.dataset.nakiBattleCharacterId, undefined);
  assert.equal(host.dataset.nakiBattleLiveAuthority, undefined);
});

test('clear delegates to core clear and also removes adapter metadata', () => {
  const host = { dataset: {} };
  let cleared = 0;
  const adapter = createNakiBattleMagicLiveAdapter({
    host,
    characterId: 'naki',
    nakiCharacterId: 'naki',
    createMotionController: () => ({
      clear() { cleared += 1; },
    }),
  });
  adapter.clear();
  assert.equal(cleared, 1);
  assert.equal(host.dataset.nakiBattleLiveAdapter, undefined);
});

test('default adapter composes with the merged Naki motion core in reduced-motion mode', () => {
  const doc = fakeDocument({ reducedMotion: true });
  const host = doc.createElement('div');
  const characterHost = doc.createElement('div');
  const adapter = createNakiBattleMagicLiveAdapter({
    doc,
    host,
    characterHost,
    characterId: 'current-naki-id',
    nakiCharacterId: 'current-naki-id',
    role: 'source',
    motion: 'static_only',
    phase: 'attack',
  });
  assert.ok(adapter);
  assert.equal(adapter.snapshot().state, 'MIC_SPELLCAST');
  assert.equal(adapter.snapshot().reducedMotion, true);
  assert.equal(host.dataset.nakiBattlePrimaryMotif, 'heart');
  assert.equal(host.dataset.nakiBattleSpellcasting, 'microphone-singing');
  assert.equal(host.dataset.nakiBattleGameplayAuthority, 'false');
  adapter.destroy();
});


test('causal timeline phases map to Naki-specific source and target motion states', () => {
  assert.equal(resolveNakiBattleMagicCausalState({ causalPhase: 'stance', role: 'source', actionPhase: 'attack' }), 'IDLE_HEART_MOON');
  assert.equal(resolveNakiBattleMagicCausalState({ causalPhase: 'anticipation', role: 'source', actionPhase: 'attack' }), 'MIC_SPELLCAST');
  assert.equal(resolveNakiBattleMagicCausalState({ causalPhase: 'release', role: 'source', actionPhase: 'attack' }), 'SLASH_TURN');
  assert.equal(resolveNakiBattleMagicCausalState({ causalPhase: 'release', role: 'source', actionPhase: 'ability' }), 'HEART_RELEASE');
  assert.equal(resolveNakiBattleMagicCausalState({ causalPhase: 'impact', role: 'source', actionPhase: 'attack' }), 'IMPACT_HEART');
  assert.equal(resolveNakiBattleMagicCausalState({ causalPhase: 'reaction', role: 'target', actionPhase: 'attack' }), 'HIT_RECOIL');
  assert.equal(resolveNakiBattleMagicCausalState({ causalPhase: 'return', role: 'target', actionPhase: 'attack' }), 'IDLE_HEART_MOON');
});

test('adapter exposes causal-phase application without re-running gameplay logic', () => {
  const calls = [];
  const adapter = createNakiBattleMagicLiveAdapter({
    host: { dataset: {} },
    characterId: 'naki-current',
    nakiCharacterId: 'naki-current',
    role: 'source',
    phase: 'attack',
    createMotionController: () => ({
      setState(input) {
        calls.push(input);
        return input;
      },
      destroy() {},
    }),
  });
  assert.deepEqual(adapter.applyCausalPhase({ causalPhase: 'anticipation' }), {
    role: 'source',
    phase: 'attack',
    motionState: 'MIC_SPELLCAST',
  });
  assert.deepEqual(adapter.applyCausalPhase({ causalPhase: 'release' }), {
    role: 'source',
    phase: 'attack',
    motionState: 'SLASH_TURN',
  });
  assert.deepEqual(adapter.applyCausalPhase({ causalPhase: 'impact' }), {
    role: 'source',
    phase: 'attack',
    motionState: 'IMPACT_HEART',
  });
  assert.equal(calls.length, 3);
});

test('runtime contract keeps adapter presentation-only and independent of Saasuna', () => {
  const runtime = NAKI_BATTLE_MAGIC_LIVE_ADAPTER_RUNTIME;
  assert.equal(runtime.identityPolicy, 'CALLER_EXPLICIT_EXACT_CHARACTER_ID_MATCH_ONLY');
  assert.equal(runtime.identityInference, false);
  assert.equal(runtime.trimsOrNormalizesIdentity, false);
  assert.equal(runtime.presentationOnly, true);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.boardAuthority, false);
  assert.equal(runtime.saveAuthority, false);
  assert.equal(runtime.networkAuthority, false);
  assert.equal(runtime.saasunaMotionReuse, false);
  assert.equal(runtime.motionRuntime, 'gameroad.naki-battle-magic-motion-core.v1');
  assert.equal(runtime.causalTimelineCompatible, true);
  assert.deepEqual(runtime.causalPhaseOrder, ['stance', 'anticipation', 'release', 'impact', 'reaction', 'return']);
  assert.deepEqual(runtime.passthrough, [
    'role',
    'motion',
    'phase',
    'transition',
    'motionState',
    'setTimeoutFn',
    'clearTimeoutFn',
  ]);
});
