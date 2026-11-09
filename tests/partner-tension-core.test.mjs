import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEVELS,
  LEVEL_LABELS,
  DEFAULT_LEVEL,
  GATES,
  normalizeTensionLevel,
  classifyOpportunity,
  isTensionControlled,
  createTensionState,
  decideSpeech,
  nextTensionLevel,
  loadTensionLevel,
  saveTensionLevel,
} from '../browser/partner-tension-core.mjs';

function memoryStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value); },
  };
}

test('levels are three stages with Japanese labels and normal as default', () => {
  assert.deepEqual([...LEVELS], ['quiet', 'normal', 'chatty']);
  assert.equal(LEVEL_LABELS.quiet, '静か');
  assert.equal(LEVEL_LABELS.normal, 'ふつう');
  assert.equal(LEVEL_LABELS.chatty, 'よく話す');
  assert.equal(DEFAULT_LEVEL, 'normal');
});

test('unknown or empty level falls back to normal', () => {
  assert.equal(normalizeTensionLevel('loud'), 'normal');
  assert.equal(normalizeTensionLevel(''), 'normal');
  assert.equal(normalizeTensionLevel(null), 'normal');
  assert.equal(normalizeTensionLevel('quiet'), 'quiet');
});

test('opportunity classes cover the 14 battle trigger kinds plus idle chat', () => {
  assert.equal(classifyOpportunity('battle_start'), 'milestone');
  assert.equal(classifyOpportunity('game_result_first'), 'milestone');
  assert.equal(classifyOpportunity('attack_side_win'), 'milestone');
  assert.equal(classifyOpportunity('defense_side_win'), 'milestone');
  assert.equal(classifyOpportunity('load_submit'), 'flow');
  assert.equal(classifyOpportunity('effect_activation'), 'flow');
  assert.equal(classifyOpportunity('idle_chat'), 'chat');
  assert.equal(classifyOpportunity('no_such_kind'), null);
});

test('essential information is never a dialogue opportunity', () => {
  for (const kind of ['match_state', 'required_action', 'rejection_reason']) {
    assert.equal(classifyOpportunity(kind), 'essential');
    assert.equal(isTensionControlled(kind), false);
  }
  assert.equal(isTensionControlled('load_submit'), true);
  assert.equal(isTensionControlled('idle_chat'), true);
});

test('quiet speaks only milestones', () => {
  const state = createTensionState();
  assert.equal(decideSpeech(state, { level: 'quiet', kind: 'battle_start', text: 'a' }).speak, true);
  assert.equal(decideSpeech(state, { level: 'quiet', kind: 'load_submit', text: 'b' }).reason, 'TENSION_DENSITY');
  assert.equal(decideSpeech(state, { level: 'quiet', kind: 'idle_chat', text: 'c' }).reason, 'TENSION_DENSITY');
});

test('normal speaks milestones and flow but not idle chat', () => {
  const state = createTensionState();
  assert.equal(decideSpeech(state, { level: 'normal', kind: 'load_submit', text: 'a' }).speak, true);
  assert.equal(decideSpeech(state, { level: 'normal', kind: 'game_result_first', text: 'b' }).speak, true);
  assert.equal(decideSpeech(state, { level: 'normal', kind: 'idle_chat', text: 'c' }).reason, 'TENSION_DENSITY');
});

test('chatty speaks idle chat too', () => {
  const state = createTensionState();
  assert.equal(decideSpeech(state, { level: 'chatty', kind: 'idle_chat', text: 'a' }).speak, true);
});

test('busy context suppresses even a milestone line', () => {
  const state = createTensionState();
  const result = decideSpeech(state, { level: 'chatty', kind: 'battle_start', text: 'a', busy: true });
  assert.equal(result.speak, false);
  assert.equal(result.reason, 'BUSY_CONTEXT');
});

test('the same line is not repeated within recent history', () => {
  const state = createTensionState();
  assert.equal(decideSpeech(state, { level: 'chatty', kind: 'idle_chat', text: 'same' }).speak, true);
  const repeated = decideSpeech(state, { level: 'chatty', kind: 'idle_chat', text: 'same' });
  assert.equal(repeated.speak, false);
  assert.equal(repeated.reason, 'REPEAT_HISTORY');
});

test('repeat history keeps only the last three spoken lines', () => {
  const state = createTensionState();
  for (const text of ['one', 'two', 'three', 'four']) {
    decideSpeech(state, { level: 'chatty', kind: 'idle_chat', text });
  }
  // 'one' has fallen out of the last three, so it may speak again.
  assert.equal(decideSpeech(state, { level: 'chatty', kind: 'idle_chat', text: 'one' }).speak, true);
  assert.equal(decideSpeech(state, { level: 'chatty', kind: 'idle_chat', text: 'four' }).reason, 'REPEAT_HISTORY');
});

test('essential info is kept out of dialogue with its own reason', () => {
  const state = createTensionState();
  const result = decideSpeech(state, { level: 'chatty', kind: 'required_action', text: 'x' });
  assert.equal(result.speak, false);
  assert.equal(result.reason, 'ESSENTIAL_NOT_DIALOGUE');
});

test('unknown kinds are suppressed instead of spoken', () => {
  const state = createTensionState();
  const result = decideSpeech(state, { level: 'chatty', kind: 'mystery', text: 'x' });
  assert.equal(result.speak, false);
  assert.equal(result.reason, 'UNKNOWN_KIND');
});

test('state counts opportunities, spoken lines and suppressions by reason', () => {
  const state = createTensionState();
  decideSpeech(state, { level: 'quiet', kind: 'battle_start', text: 'a' });
  decideSpeech(state, { level: 'quiet', kind: 'idle_chat', text: 'b' });
  decideSpeech(state, { level: 'quiet', kind: 'idle_chat', text: 'c' });
  assert.equal(state.opportunities, 3);
  assert.equal(state.spoken, 1);
  assert.equal(state.suppressedByReason.TENSION_DENSITY, 2);
});

test('plus and minus step through the three stages and stop at the ends', () => {
  assert.equal(nextTensionLevel('quiet', 'up'), 'normal');
  assert.equal(nextTensionLevel('normal', 'up'), 'chatty');
  assert.equal(nextTensionLevel('chatty', 'up'), 'chatty');
  assert.equal(nextTensionLevel('chatty', 'down'), 'normal');
  assert.equal(nextTensionLevel('normal', 'down'), 'quiet');
  assert.equal(nextTensionLevel('quiet', 'down'), 'quiet');
  assert.equal(nextTensionLevel('broken', 'up'), 'chatty');
  assert.equal(nextTensionLevel('broken', 'down'), 'quiet');
  assert.equal(nextTensionLevel('broken'), 'normal');
});

test('level persists through storage and invalid stored values fall back to normal', () => {
  const storage = memoryStorage({ GAMEROAD_PARTNER_TENSION: 'chatty' });
  assert.equal(loadTensionLevel(storage), 'chatty');
  assert.equal(saveTensionLevel(storage, 'quiet'), 'quiet');
  assert.equal(loadTensionLevel(storage), 'quiet');
  assert.equal(saveTensionLevel(storage, 'loud'), 'normal');
  assert.equal(loadTensionLevel(memoryStorage({ GAMEROAD_PARTNER_TENSION: 'loud' })), 'normal');
  assert.equal(loadTensionLevel(memoryStorage({})), 'normal');
  assert.equal(loadTensionLevel(null), 'normal');
});

test('the five gates are named with only density, repeat and context implemented', () => {
  assert.deepEqual(GATES.map((gate) => gate.id), [
    'context_attention',
    'meaning_freshness',
    'repeat_history',
    'interruption_resume',
    'tension_density',
  ]);
  assert.equal(GATES.find((gate) => gate.id === 'tension_density').implemented, true);
  assert.equal(GATES.find((gate) => gate.id === 'meaning_freshness').implemented, false);
  assert.equal(GATES.find((gate) => gate.id === 'interruption_resume').implemented, false);
});
