export const SLAYKIA_VOICE_PREVIEW = Object.freeze({
  displayName: 'スレイキア',
  language: 'ja-JP',
  canonicalVoice: false,
  productionRuntime: false,
});

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max, fallback) {
  return Math.min(max, Math.max(min, finiteOr(value, fallback)));
}

export function createSlaykiaPreviewRequest(options = {}) {
  return Object.freeze({
    text: SLAYKIA_VOICE_PREVIEW.displayName,
    lang: SLAYKIA_VOICE_PREVIEW.language,
    rate: clamp(options.rate, 0.1, 10, 1),
    pitch: clamp(options.pitch, 0, 2, 1),
    volume: clamp(options.volume, 0, 1, 1),
    cancelQueuedBeforeSpeak: true,
    canonicalVoice: false,
  });
}

function setStatus(statusNode, text, state) {
  if (!statusNode) return;
  statusNode.textContent = text;
  if (statusNode.dataset) statusNode.dataset.state = state;
}

export function mountSlaykiaVoicePreview({
  button,
  status,
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  request = createSlaykiaPreviewRequest(),
} = {}) {
  if (!button || typeof button.addEventListener !== 'function') {
    throw new TypeError('Slaykia voice preview requires an explicit-action button');
  }

  const supported = Boolean(
    synth && typeof synth.speak === 'function' && typeof Utterance === 'function',
  );

  if (!supported) {
    button.disabled = true;
    setStatus(status, 'この端末ではブラウザ音声合成を利用できません。', 'unsupported');
    return Object.freeze({ supported: false, dispose() {} });
  }

  setStatus(status, '再生ボタンで端末のシステム音声を試聴できます。', 'ready');

  const onClick = () => {
    if (request.cancelQueuedBeforeSpeak && typeof synth.cancel === 'function') synth.cancel();
    const utterance = new Utterance(request.text);
    utterance.lang = request.lang;
    utterance.rate = request.rate;
    utterance.pitch = request.pitch;
    utterance.volume = request.volume;
    utterance.onstart = () => setStatus(status, 'システム音声を再生中…', 'speaking');
    utterance.onend = () => setStatus(status, '試聴が終了しました。', 'ended');
    utterance.onerror = () => setStatus(status, '音声合成を再生できませんでした。', 'error');
    try {
      synth.speak(utterance);
    } catch {
      setStatus(status, '音声合成を再生できませんでした。', 'error');
    }
  };

  button.addEventListener('click', onClick);

  return Object.freeze({
    supported: true,
    dispose() {
      button.removeEventListener?.('click', onClick);
      if (typeof synth.cancel === 'function') synth.cancel();
      setStatus(status, '試聴を停止しました。', 'disposed');
    },
  });
}
