import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SLAYKIA_VOICE_PREVIEW,
  createSlaykiaPreviewRequest,
  mountSlaykiaVoicePreview,
} from '../browser/slaykia-voice-preview.mjs';

function fakeButton() {
  const listeners = new Map();
  return {
    disabled: false,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    click() { listeners.get('click')?.(); },
    listenerCount() { return listeners.size; },
  };
}

function fakeStatus() {
  return { textContent: '', dataset: {} };
}

class FakeUtterance {
  constructor(text) { this.text = text; }
}

test('request is explicitly noncanonical and speaks only the formal display name', () => {
  const request = createSlaykiaPreviewRequest();
  assert.equal(SLAYKIA_VOICE_PREVIEW.displayName, 'スレイキア');
  assert.deepEqual(request, {
    text: 'スレイキア', lang: 'ja-JP', rate: 1, pitch: 1, volume: 1,
    cancelQueuedBeforeSpeak: true, canonicalVoice: false,
  });
  assert.equal(Object.isFrozen(request), true);
});

test('numeric preview controls fail closed to Web Speech API ranges', () => {
  assert.deepEqual(createSlaykiaPreviewRequest({ rate: -3, pitch: 8, volume: 2 }), {
    text: 'スレイキア', lang: 'ja-JP', rate: 0.1, pitch: 2, volume: 1,
    cancelQueuedBeforeSpeak: true, canonicalVoice: false,
  });
  assert.equal(createSlaykiaPreviewRequest({ rate: Number.NaN }).rate, 1);
});

test('unsupported synthesis disables explicit preview without throwing', () => {
  const button = fakeButton();
  const status = fakeStatus();
  const mounted = mountSlaykiaVoicePreview({ button, status, synth: null, Utterance: null });
  assert.equal(mounted.supported, false);
  assert.equal(button.disabled, true);
  assert.equal(button.listenerCount(), 0);
  assert.equal(status.dataset.state, 'unsupported');
});

test('speech is never queued before explicit click and repeated click cancels prior queue', () => {
  const calls = [];
  const synth = {
    cancel() { calls.push(['cancel']); },
    speak(utterance) { calls.push(['speak', utterance]); utterance.onstart?.(); },
  };
  const button = fakeButton();
  const status = fakeStatus();
  const mounted = mountSlaykiaVoicePreview({ button, status, synth, Utterance: FakeUtterance });
  assert.equal(mounted.supported, true);
  assert.deepEqual(calls, []);
  button.click();
  button.click();
  assert.equal(calls.filter(([kind]) => kind === 'cancel').length, 2);
  const spoken = calls.filter(([kind]) => kind === 'speak');
  assert.equal(spoken.length, 2);
  assert.equal(spoken[0][1].text, 'スレイキア');
  assert.equal(spoken[0][1].lang, 'ja-JP');
  assert.equal(status.dataset.state, 'speaking');
});

test('speak exceptions become visible failure state and never escape into game state', () => {
  const button = fakeButton();
  const status = fakeStatus();
  const synth = { cancel() {}, speak() { throw new Error('device failure'); } };
  mountSlaykiaVoicePreview({ button, status, synth, Utterance: FakeUtterance });
  assert.doesNotThrow(() => button.click());
  assert.equal(status.dataset.state, 'error');
});

test('dispose removes the only activation listener and cancels queued preview', () => {
  let cancels = 0;
  const synth = { cancel() { cancels += 1; }, speak() {} };
  const button = fakeButton();
  const status = fakeStatus();
  const mounted = mountSlaykiaVoicePreview({ button, status, synth, Utterance: FakeUtterance });
  assert.equal(button.listenerCount(), 1);
  mounted.dispose();
  assert.equal(button.listenerCount(), 0);
  assert.equal(cancels, 1);
  assert.equal(status.dataset.state, 'disposed');
});

test('HTML harness requires explicit button activation and labels the preview noncanonical', async () => {
  const html = await readFile(new URL('../browser/slaykia-voice-preview.html', import.meta.url), 'utf8');
  assert.match(html, /id="playVoice"/);
  assert.match(html, /mountSlaykiaVoicePreview/);
  assert.match(html, /非canonical試聴/);
  assert.match(html, /正式キャラクターボイス/);
  assert.doesNotMatch(html, /autoplay/i);
  assert.doesNotMatch(html, /\.speak\s*\(/);
});
