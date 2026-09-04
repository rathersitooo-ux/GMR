import assert from 'node:assert/strict';
import test from 'node:test';
import { mountPartnerShellRuntime } from '../browser/partner-shell-runtime-mount.mjs';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.value = '';
    this.disabled = false;
    this.listeners = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  click() { return this.listeners.get('click')?.(); }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function makeRoot() {
  const doc = new FakeDocument();
  return new FakeElement('div', doc);
}

function allNodes(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

const input = {
  activePartnerId: 'partner.saasuna',
  roster: [{ partnerId: 'partner.saasuna', displayName: 'サースナー' }],
  view: 'dialogue_feedback',
  postBattleLine: {
    sourceLineId: 'post.win.001',
    text: '勝てましたね。',
    sourceStateIdentity: 'match-42:result',
    versions: { rules: 'r1', content: 'c2', state: 's3' },
  },
  partnerVoiceTuning: { rate: 1.1, pitch: 0.9, volume: 0.8, pauseMs: 180, voiceURI: 'jp-a' },
};

test('Partner mode renders post-battle line editor plus detailed Saasuna voice controls', () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => input,
    canDispatch: (action) => action === 'BACK_HUB',
    listVoices: () => [{ voiceURI: 'jp-a', name: 'JP A', lang: 'ja-JP' }],
    previewVoice: () => ({ ok: true }),
    submitFeedback: async () => ({ ok: true, reportId: 'r-1', disposition: 'accepted_unique' }),
  });
  assert.equal(runtime.render().ok, true);
  const nodes = allNodes(root);
  assert.equal(nodes.some((node) => node.dataset.partnerDialogueEditor === 'proposedText'), true);
  assert.deepEqual(nodes.filter((node) => node.dataset.partnerVoiceValue).map((node) => node.dataset.partnerVoiceValue), [
    'rate', 'pitch', 'volume', 'pauseMs', 'voiceURI',
  ]);
  assert.equal(nodes.some((node) => node.textContent.includes('正式音声アセットではありません')), true);
});

test('preview uses edited text and current tuning while submit stores the proposal as feedback', async () => {
  const root = makeRoot();
  let previewed = null;
  let submitted = null;
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => input,
    canDispatch: () => true,
    listVoices: () => [],
    previewVoice: (payload) => { previewed = payload; return { ok: true }; },
    submitFeedback: async (payload) => { submitted = payload; return { ok: true, reportId: 'r-1', disposition: 'accepted_unique' }; },
  });
  runtime.render();
  const nodes = allNodes(root);
  const editor = nodes.find((node) => node.dataset.partnerDialogueEditor === 'proposedText');
  editor.value = '勝てましたね。次はもっと速く決められます。';
  nodes.find((node) => node.dataset.partnerDialogueAction === 'preview').click();
  assert.equal(previewed.text, editor.value);
  assert.equal(previewed.tuning.rate, 1.1);

  await nodes.find((node) => node.dataset.partnerDialogueAction === 'submit').click();
  assert.equal(submitted.partnerId, 'partner.saasuna');
  assert.equal(submitted.originalText, '勝てましたね。');
  assert.equal(submitted.proposedText, editor.value);
  assert.equal(submitted.sourceLineId, 'post.win.001');
  assert.equal(nodes.find((node) => node.dataset.partnerDialogueStatus === 'true').textContent, '改善要望として蓄積しました');
});

test('without a post-battle line the editor fail-closes instead of inventing dialogue', () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ ...input, postBattleLine: null }),
    canDispatch: () => true,
    listVoices: () => [],
    previewVoice: () => ({ ok: true }),
    submitFeedback: async () => ({ ok: true }),
  });
  runtime.render();
  const nodes = allNodes(root);
  assert.equal(nodes.some((node) => node.dataset.partnerDialogueEditor === 'proposedText'), false);
  assert.equal(nodes.some((node) => node.textContent.includes('編集できるバトル後セリフがまだありません')), true);
});
