import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRST_TIME_AFTER_GUIDE_ITEM_LIMIT,
  FIRST_TIME_AFTER_GUIDE_ITEMS,
  FIRST_TIME_GUIDE_DECK_NOT_USABLE_EMPHASIS,
  FIRST_TIME_GUIDE_DECK_NOT_USABLE_ICON,
  FIRST_TIME_GUIDE_DECK_NOT_USABLE_MESSAGE,
  FIRST_TIME_GUIDE_SCHEMA,
  FIRST_TIME_GUIDE_SENTENCE_LIMIT,
  FIRST_TIME_GUIDE_STEPS,
  nextFirstTimeGuideStep,
  projectFirstTimeAfterGuide,
  projectFirstTimeGuide,
} from '../browser/first-time-guide-core.mjs';

const FRESH = { screen: 'home', historyLength: 0, dismissed: false, done: false, step: null, deckUsable: true };

test('first visit on home shows one short line and the battle action', () => {
  const guide = projectFirstTimeGuide(FRESH);
  assert.equal(guide.schema, FIRST_TIME_GUIDE_SCHEMA);
  assert.equal(guide.active, true);
  assert.equal(guide.step, 'home');
  assert.equal(guide.message, 'はじめは「バトル」から。いちばん大きなボタンを押すだけ');
  assert.equal(guide.actionLabel, 'バトルへ');
  assert.equal(guide.targetSelector, '.homePadChoice[data-home-target="setup"]');
  assert.equal(guide.icon, 'swords');
  assert.equal(guide.emphasis, '「バトル」');
  assert.equal(guide.message.includes('\n'), false);
  assert.equal(guide.presentationOnly, true);
  assert.equal(guide.autoExecute, false);
});

test('setup walks content, then mode, then ready, one step at a time', () => {
  const content = projectFirstTimeGuide({ ...FRESH, screen: 'setup', step: 'content' });
  assert.equal(content.step, 'content');
  assert.equal(content.message, '遊び方は「ハニーハント」のままでOK。7枚ためると門が開くよ');
  assert.equal(content.actionLabel, 'このままでOK');
  assert.equal(content.targetSelector, '.contentBtn[data-content="honey_hunt"]');
  assert.equal(content.icon, 'check');
  assert.equal(content.emphasis, '7枚');

  const mode = projectFirstTimeGuide({ ...FRESH, screen: 'setup', step: 'mode' });
  assert.equal(mode.step, 'mode');
  assert.equal(mode.message, '人数は「四人」のままでOK。相手はCPUだよ');
  assert.equal(mode.targetSelector, '.modeBtn[data-mode="4p"]');
  assert.equal(mode.icon, 'check');
  assert.equal(mode.emphasis, 'CPU');

  const ready = projectFirstTimeGuide({ ...FRESH, screen: 'setup', step: 'ready' });
  assert.equal(ready.step, 'ready');
  assert.equal(ready.message, '手番はじゃんけんで決まるよ。順番はロードカードの力で決まるよ');
  assert.equal(ready.actionLabel, '対戦開始');
  assert.equal(ready.targetSelector, '#startMatch');
  assert.equal(ready.icon, 'play');
  assert.equal(ready.emphasis, 'じゃんけん');
});

// レビュー51の形：どの文も2文だけ。1文は短く、大事な所は文の中にある。
test('every guide line is two short sentences with its emphasis inside', () => {
  const sentences = (message) => message.split('。').filter((part) => part !== '');
  for (const step of FIRST_TIME_GUIDE_STEPS) {
    const guide = projectFirstTimeGuide({ ...FRESH, screen: step === 'home' ? 'home' : 'setup', step });
    const parts = sentences(guide.message);
    assert.equal(parts.length, 2, `${step} must have exactly two sentences`);
    for (const part of parts) {
      assert.ok(part.length <= FIRST_TIME_GUIDE_SENTENCE_LIMIT, `${step} sentence too long: ${part}`);
    }
    assert.ok(guide.message.includes(guide.emphasis), `${step} emphasis must be in the message`);
    assert.ok(['swords', 'check', 'play', 'cards'].includes(guide.icon), `${step} icon must be a known kind`);
  }
  const deckParts = sentences(FIRST_TIME_GUIDE_DECK_NOT_USABLE_MESSAGE);
  assert.equal(deckParts.length, 2);
  for (const part of deckParts) {
    assert.ok(part.length <= FIRST_TIME_GUIDE_SENTENCE_LIMIT);
  }
  assert.ok(FIRST_TIME_GUIDE_DECK_NOT_USABLE_MESSAGE.includes(FIRST_TIME_GUIDE_DECK_NOT_USABLE_EMPHASIS));
  assert.equal(FIRST_TIME_GUIDE_DECK_NOT_USABLE_ICON, 'cards');
});

// 説明が終わったあとは、短い案内を2つだけ残す。
test('after the guide ends, only two short guides remain until the first match ends', () => {
  assert.equal(FIRST_TIME_AFTER_GUIDE_ITEMS.length, 2);
  for (const item of FIRST_TIME_AFTER_GUIDE_ITEMS) {
    assert.ok(item.text.length <= FIRST_TIME_AFTER_GUIDE_ITEM_LIMIT, `after-guide item too long: ${item.text}`);
  }
  assert.deepEqual(
    FIRST_TIME_AFTER_GUIDE_ITEMS.map((item) => item.text),
    ['7枚ためると門が開く', '手番はじゃんけんで決まる'],
  );

  const done = { screen: 'home', historyLength: 0, dismissed: false, done: true, step: null, deckUsable: true };
  const after = projectFirstTimeAfterGuide(done);
  assert.equal(after.active, true);
  assert.deepEqual(after.items, FIRST_TIME_AFTER_GUIDE_ITEMS);

  const setupDone = projectFirstTimeAfterGuide({ ...done, screen: 'setup' });
  assert.equal(setupDone.active, true);

  assert.equal(projectFirstTimeAfterGuide({ ...done, done: false }).active, false);
  assert.equal(projectFirstTimeAfterGuide({ ...done, dismissed: true }).active, false);
  assert.equal(projectFirstTimeAfterGuide({ ...done, historyLength: 1 }).reason, 'ALREADY_PLAYED');
  assert.equal(projectFirstTimeAfterGuide({ ...done, screen: 'battle' }).active, false);
  assert.equal(projectFirstTimeAfterGuide(null).reason, 'SNAPSHOT_REQUIRED');
});

test('setup ready with an unusable deck points at the deck fix instead', () => {
  const guide = projectFirstTimeGuide({ ...FRESH, screen: 'setup', step: 'ready', deckUsable: false });
  assert.equal(guide.active, true);
  assert.equal(guide.step, 'ready');
  assert.equal(guide.message, FIRST_TIME_GUIDE_DECK_NOT_USABLE_MESSAGE);
  assert.equal(guide.actionLabel, 'デッキへ');
  assert.equal(guide.targetSelector, '#fixDeckFromSetup');
  assert.equal(guide.icon, FIRST_TIME_GUIDE_DECK_NOT_USABLE_ICON);
  assert.equal(guide.emphasis, FIRST_TIME_GUIDE_DECK_NOT_USABLE_EMPHASIS);
});

test('the guide stays hidden once played, done, dismissed, or off home and setup', () => {
  assert.equal(projectFirstTimeGuide({ ...FRESH, historyLength: 1 }).active, false);
  assert.equal(projectFirstTimeGuide({ ...FRESH, historyLength: 1 }).reason, 'ALREADY_PLAYED');
  assert.equal(projectFirstTimeGuide({ ...FRESH, done: true }).reason, 'ALREADY_DONE');
  assert.equal(projectFirstTimeGuide({ ...FRESH, dismissed: true }).reason, 'DISMISSED');
  assert.equal(projectFirstTimeGuide({ ...FRESH, screen: 'battle' }).reason, 'GUIDE_CONTEXT_REQUIRED');
  assert.equal(projectFirstTimeGuide({ ...FRESH, screen: 'cards' }).active, false);
  assert.equal(projectFirstTimeGuide(null).reason, 'SNAPSHOT_REQUIRED');
});

test('a mismatched screen and step restarts from that screen first step', () => {
  assert.equal(projectFirstTimeGuide({ ...FRESH, screen: 'home', step: 'mode' }).step, 'home');
  assert.equal(projectFirstTimeGuide({ ...FRESH, screen: 'setup', step: 'home' }).step, 'content');
  assert.equal(projectFirstTimeGuide({ ...FRESH, screen: 'setup', step: 'unknown' }).step, 'content');
});

test('next step walks home, content, mode, ready, then ends', () => {
  assert.deepEqual(FIRST_TIME_GUIDE_STEPS, ['home', 'content', 'mode', 'ready']);
  assert.equal(nextFirstTimeGuideStep('home'), 'content');
  assert.equal(nextFirstTimeGuideStep('content'), 'mode');
  assert.equal(nextFirstTimeGuideStep('mode'), 'ready');
  assert.equal(nextFirstTimeGuideStep('ready'), null);
  assert.equal(nextFirstTimeGuideStep('unknown'), null);
});
