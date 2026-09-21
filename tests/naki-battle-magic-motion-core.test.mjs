import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NAKI_BATTLE_MAGIC_MOTION_PROFILES,
  NAKI_BATTLE_MAGIC_MOTION_RUNTIME,
  createNakiBattleMagicMotionController,
  resolveNakiBattleMagicMotionSequence,
  resolveNakiBattleMagicMotionState,
} from '../browser/naki-battle-magic-motion-core.mjs';

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
      removeChild(child) { this.children = this.children.filter((value) => value !== child); child.parentNode = null; return child; },
      setAttribute(name, value) { this[name] = String(value); },
    };
    return node;
  };
  const head = createElement('head');
  const originalAppend = head.appendChild.bind(head);
  head.appendChild = (child) => { if (child.id) ids.set(child.id, child); return originalAppend(child); };
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

function fakeHost(doc) {
  return doc.createElement('div');
}

test('Naki motion keeps Heart primary and limits crescent to slash/post-hit accents', () => {
  const crescentStates = [];
  for (const [state, profile] of Object.entries(NAKI_BATTLE_MAGIC_MOTION_PROFILES)) {
    assert.equal(profile.primaryMotif, 'heart');
    assert.ok(profile.heartIntensity >= profile.crescentIntensity, `${state} must keep heart intensity >= crescent intensity`);
    assert.ok(profile.crescentIntensity <= NAKI_BATTLE_MAGIC_MOTION_RUNTIME.crescentMaxIntensity);
    if (profile.crescentIntensity > 0) crescentStates.push(state);
  }
  assert.deepEqual(crescentStates, ['SLASH_TURN', 'IMPACT_HEART']);
  assert.equal(NAKI_BATTLE_MAGIC_MOTION_PROFILES.MIC_SPELLCAST.crescentIntensity, 0);
  assert.equal(NAKI_BATTLE_MAGIC_MOTION_PROFILES.HEART_RELEASE.crescentIntensity, 0);
});

test('attack source sequence is microphone spellcast then heart release then slash then hit accent', () => {
  const sequence = resolveNakiBattleMagicMotionSequence({ phase: 'attack', role: 'source' });
  assert.deepEqual(sequence.map((item) => item.state), [
    'MIC_SPELLCAST',
    'HEART_RELEASE',
    'SLASH_TURN',
    'IMPACT_HEART',
    'IDLE_HEART_MOON',
  ]);
  assert.equal(sequence[0].voice, true);
  assert.equal(sequence[1].crescentIntensity, 0);
  assert.equal(sequence[2].slash, true);
  assert.equal(sequence[3].impact, true);
  assert.equal(sequence.slice(0, 4).reduce((sum, item) => sum + item.durationMs, 0), 1360);
});

test('ability keeps the crescent out of the pre-attack cast and target reaction does not borrow attacker motifs', () => {
  const source = resolveNakiBattleMagicMotionSequence({ phase: 'ability', role: 'source' });
  assert.deepEqual(source.map((item) => item.state), [
    'MIC_SPELLCAST',
    'HEART_RELEASE',
    'IMPACT_HEART',
    'IDLE_HEART_MOON',
  ]);
  assert.equal(source[0].crescentIntensity, 0);
  assert.equal(source[1].crescentIntensity, 0);

  const target = resolveNakiBattleMagicMotionSequence({ phase: 'attack', role: 'target' });
  assert.deepEqual(target.map((item) => item.state), ['HIT_RECOIL', 'IDLE_HEART_MOON']);
  assert.equal(target[0].crescentIntensity, 0);
});

test('finisher remains Heart-led while allowing a short crescent slash accent', () => {
  const sequence = resolveNakiBattleMagicMotionSequence({ phase: 'finisher', role: 'source' });
  assert.deepEqual(sequence.map((item) => item.state), [
    'MIC_SPELLCAST',
    'HEART_RELEASE',
    'SLASH_TURN',
    'IMPACT_HEART',
    'RESULT_HEART',
  ]);
  assert.equal(sequence[0].voice, true);
  assert.equal(sequence.at(-1).heartIntensity > sequence.at(-1).crescentIntensity, true);
});

test('explicit state and phase resolver stay presentation-only and deterministic', () => {
  assert.equal(resolveNakiBattleMagicMotionState({ motionState: 'slash-turn' }), 'SLASH_TURN');
  assert.equal(resolveNakiBattleMagicMotionState({ phase: 'result' }), 'RESULT_HEART');
  assert.equal(resolveNakiBattleMagicMotionState({ transition: 'entry' }), 'ENTRY_MIC');
  assert.equal(resolveNakiBattleMagicMotionState({}), 'IDLE_HEART_MOON');
});

test('controller fails closed until the caller explicitly verifies Naki identity', () => {
  const doc = fakeDocument();
  const host = fakeHost(doc);
  assert.equal(createNakiBattleMagicMotionController({ doc, host, characterIdentityVerified: false }), null);

  const verified = createNakiBattleMagicMotionController({
    doc,
    host,
    characterIdentityVerified: true,
    phase: 'attack',
    role: 'source',
    setTimeoutFn: () => 42,
    clearTimeoutFn: () => {},
  });
  assert.ok(verified);
  assert.equal(host.dataset.nakiBattlePrimaryMotif, 'heart');
  assert.equal(host.dataset.nakiBattleSpellcasting, 'microphone-singing');
  assert.equal(host.dataset.nakiBattleGameplayAuthority, 'false');
  assert.equal(verified.snapshot().state, 'MIC_SPELLCAST');
  verified.destroy();
});

test('Reduced Motion preserves semantic state but schedules no spatial sequence timers', () => {
  const doc = fakeDocument({ reducedMotion: true });
  const host = fakeHost(doc);
  let scheduled = 0;
  const controller = createNakiBattleMagicMotionController({
    doc,
    host,
    characterIdentityVerified: true,
    phase: 'attack',
    role: 'source',
    setTimeoutFn: () => { scheduled += 1; return scheduled; },
    clearTimeoutFn: () => {},
  });
  assert.ok(controller);
  assert.equal(controller.snapshot().reducedMotion, true);
  assert.equal(controller.snapshot().state, 'MIC_SPELLCAST');
  assert.equal(scheduled, 0);
});

test('runtime contract forbids identity inference, Saasuna reuse, gameplay authority, and dominant crescent', () => {
  const runtime = NAKI_BATTLE_MAGIC_MOTION_RUNTIME;
  assert.equal(runtime.characterIdentityInference, false);
  assert.equal(runtime.characterIdentityPolicy, 'CALLER_EXPLICIT_NAKI_IDENTITY_VERIFICATION_REQUIRED');
  assert.equal(runtime.primaryMotif, 'heart');
  assert.equal(runtime.spellcasting, 'microphone-singing');
  assert.equal(runtime.secondaryMotif, 'moonlight');
  assert.equal(runtime.crescentPolicy, 'SUBORDINATE_SLASH_OR_POST_HIT_ACCENT_ONLY');
  assert.equal(runtime.preAttackCrescentIntensity, 0);
  assert.equal(runtime.crescentMaxIntensity, 0.18);
  assert.equal(runtime.presentationOnly, true);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.boardAuthority, false);
  assert.equal(runtime.formalArt, false);
  assert.equal(runtime.saasunaMotionReuse, false);
});

test('source stays isolated from Saasuna motion and does not import gameplay authority', () => {
  const source = readFileSync(new URL('../browser/naki-battle-magic-motion-core.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*saasuna-battle-motion-core/);
  assert.doesNotMatch(source, /resolveBattle|winner|mana|save|network/i);
  assert.match(source, /characterIdentityVerified !== true/);
  assert.match(source, /SUBORDINATE_SLASH_OR_POST_HIT_ACCENT_ONLY/);
});
