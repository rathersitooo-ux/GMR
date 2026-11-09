import assert from 'node:assert/strict';
import test from 'node:test';

import { FIRST_TIME_GUIDE_STORAGE_KEY } from '../browser/first-time-guide-core.mjs';
import {
  createFirstTimeGuideController,
  readFirstTimeGuideSnapshot,
  readFirstTimeGuideState,
  writeFirstTimeGuideState,
} from '../browser/first-time-guide-runtime.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function fakeClassList(initial = []) {
  const names = new Set(initial);
  return {
    contains: (name) => names.has(name),
    add: (name) => { names.add(name); },
    remove: (name) => { names.delete(name); },
    has: (name) => names.has(name),
  };
}

function fakeElement() {
  const listeners = {};
  return {
    textContent: '',
    hidden: false,
    dataset: {},
    attrs: {},
    classList: fakeClassList(),
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, fn) { (listeners[name] ??= []).push(fn); },
    removeEventListener(name, fn) {
      listeners[name] = (listeners[name] ?? []).filter((item) => item !== fn);
    },
    fire(name) { for (const fn of listeners[name] ?? []) fn(); },
    querySelector: () => null,
    clickCount: 0,
    click() { this.clickCount += 1; },
  };
}

function fakeBar() {
  const bar = fakeElement();
  const message = fakeElement();
  const action = fakeElement();
  const close = fakeElement();
  bar.querySelector = (selector) => {
    if (selector === '[data-role="first-guide-message"]') return message;
    if (selector === '[data-role="first-guide-action"]') return action;
    if (selector === '[data-role="first-guide-close"]') return close;
    return null;
  };
  const afterItemA = fakeElement();
  const afterItemB = fakeElement();
  const afterGuide = fakeElement();
  afterGuide.querySelectorAll = (selector) => {
    if (selector === '[data-role="first-after-guide-item"]') return [afterItemA, afterItemB];
    return [];
  };
  return { bar, message, action, close, afterGuide, afterItemA, afterItemB };
}

test('stored guide state round-trips and rejects bad saved text', () => {
  const storage = memoryStorage();
  assert.deepEqual(readFirstTimeGuideState(storage), { step: null, done: false, dismissed: false });
  assert.equal(writeFirstTimeGuideState(storage, { step: 'mode', done: false, dismissed: false }), true);
  assert.deepEqual(readFirstTimeGuideState(storage), { step: 'mode', done: false, dismissed: false });
  storage.setItem(FIRST_TIME_GUIDE_STORAGE_KEY, 'not-json{');
  assert.deepEqual(readFirstTimeGuideState(storage), { step: null, done: false, dismissed: false });
  assert.deepEqual(readFirstTimeGuideState(null), { step: null, done: false, dismissed: false });
});

test('snapshot reader takes the active screen, the stored step, and deck state from the DOM', () => {
  const storage = memoryStorage();
  writeFirstTimeGuideState(storage, { step: 'ready', done: false, dismissed: false });
  const homeSection = { classList: fakeClassList() };
  const setupSection = { classList: fakeClassList(['active']) };
  const startMatch = { disabled: false };
  const deckNote = { classList: fakeClassList() };
  const doc = {
    querySelector: (selector) => {
      if (selector === 'section[data-screen="home"]') return homeSection;
      if (selector === 'section[data-screen="setup"]') return setupSection;
      if (selector === '#startMatch') return startMatch;
      if (selector === '#setupDeckNote') return deckNote;
      return null;
    },
  };
  const snapshot = readFirstTimeGuideSnapshot(doc, { storage, historyLength: 0 });
  assert.equal(snapshot.screen, 'setup');
  assert.equal(snapshot.step, 'ready');
  assert.equal(snapshot.deckUsable, true);
  assert.equal(snapshot.historyLength, 0);
});

test('snapshot reader reports an unusable deck when the start button is disabled', () => {
  const storage = memoryStorage();
  const setupSection = { classList: fakeClassList(['active']) };
  const doc = {
    querySelector: (selector) => {
      if (selector === 'section[data-screen="home"]') return { classList: fakeClassList() };
      if (selector === 'section[data-screen="setup"]') return setupSection;
      if (selector === '#startMatch') return { disabled: true };
      if (selector === '#setupDeckNote') return { classList: fakeClassList(['bad']) };
      return null;
    },
  };
  assert.equal(readFirstTimeGuideSnapshot(doc, { storage, historyLength: 0 }).deckUsable, false);
});

test('controller shows the line, highlights the target, and the action advances a step', () => {
  const storage = memoryStorage();
  const { bar, message, action, close, afterGuide } = fakeBar();
  const reopenButton = fakeElement();
  const setupRoute = fakeElement();
  const doc = { querySelector: (selector) => (selector === '.homePadChoice[data-home-target="setup"]' ? setupRoute : null) };
  let snapshot = { screen: 'home', historyLength: 0, dismissed: false, done: false, step: null, deckUsable: true };
  const controller = createFirstTimeGuideController({
    bar, reopenButton, afterGuide, doc, storage, readSnapshot: () => snapshot,
  });

  const home = controller.update();
  assert.equal(home.active, true);
  assert.equal(home.step, 'home');
  assert.equal(message.textContent, 'はじめは「バトル」から。いちばん大きなボタンを押すだけ');
  assert.equal(action.textContent, 'バトルへ');
  // ボタンには絵が入り、文の大事な所には色が付く（レビュー51の形）。
  assert.ok(action.innerHTML.includes('<svg'), 'action button must carry a picture');
  assert.ok(action.innerHTML.includes('バトルへ'));
  assert.ok(message.innerHTML.includes('firstGuideEmphasis'), 'message must colour its key part');
  assert.ok(message.innerHTML.includes('「バトル」'));
  assert.equal(bar.hidden, false);
  assert.equal(setupRoute.classList.has('firstGuideTarget'), true);
  assert.equal(bar.dataset.firstGuideStep, 'home');
  // 案内のバーが出ている間は、終わったあとに残す案内は出さない。
  assert.equal(afterGuide.hidden, true);

  action.fire('click');
  assert.equal(setupRoute.clickCount, 1);
  assert.deepEqual(readFirstTimeGuideState(storage), { step: 'content', done: false, dismissed: false });

  // 準備へ行ったあとは遊び方の段が出る。
  snapshot = { screen: 'setup', historyLength: 0, dismissed: false, done: false, step: 'content', deckUsable: true };
  assert.equal(controller.update().step, 'content');
  assert.equal(message.textContent, '遊び方は「ハニーハント」のままでOK。7枚ためると門が開くよ');

  action.fire('click');
  assert.deepEqual(readFirstTimeGuideState(storage), { step: 'mode', done: false, dismissed: false });

  close.fire('click');
  assert.deepEqual(readFirstTimeGuideState(storage), { step: 'mode', done: false, dismissed: true });
  // 実際の取り付けでは読み取りが保存から「閉じた」を読む。検査でも同じ形にする。
  snapshot = { ...snapshot, step: 'mode', dismissed: true };
  controller.update();
  assert.equal(bar.hidden, true);
  assert.equal(reopenButton.hidden, false);

  reopenButton.fire('click');
  assert.deepEqual(readFirstTimeGuideState(storage), { step: null, done: false, dismissed: false });

  controller.destroy();
  assert.equal(controller.update(), null);
});

test('controller hides the guide once the player has played before', () => {
  const storage = memoryStorage();
  const { bar, message, action } = fakeBar();
  const reopenButton = fakeElement();
  const snapshot = { screen: 'home', historyLength: 2, dismissed: false, done: false, step: null, deckUsable: true };
  const controller = createFirstTimeGuideController({
    bar, reopenButton, doc: { querySelector: () => null }, storage, readSnapshot: () => snapshot,
  });
  const guide = controller.update();
  assert.equal(guide.active, false);
  assert.equal(bar.hidden, true);
  assert.equal(message.textContent, '');
  assert.equal(action.hidden, true);
  assert.equal(reopenButton.hidden, true);
  controller.destroy();
});

test('controller leaves only two short guides after the guide ends', () => {
  const storage = memoryStorage();
  const { bar, message, afterGuide, afterItemA, afterItemB } = fakeBar();
  const reopenButton = fakeElement();
  let snapshot = { screen: 'home', historyLength: 0, dismissed: false, done: true, step: null, deckUsable: true };
  const controller = createFirstTimeGuideController({
    bar, reopenButton, afterGuide, doc: { querySelector: () => null }, storage, readSnapshot: () => snapshot,
  });

  const after = controller.update();
  assert.equal(after.active, false);
  assert.equal(bar.hidden, true);
  assert.equal(controller.afterGuide.active, true);
  assert.equal(afterGuide.hidden, false);
  assert.equal(afterItemA.textContent, '7枚ためると門が開く');
  assert.equal(afterItemB.textContent, '手番はじゃんけんで決まる');

  // 初めての対戦が終わったら、残す案内も出さない。
  snapshot = { ...snapshot, historyLength: 1 };
  controller.update();
  assert.equal(controller.afterGuide.active, false);
  assert.equal(afterGuide.hidden, true);

  controller.destroy();
});
