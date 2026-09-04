import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerDialogueFeedbackIdempotencyKey,
  buildPartnerDialogueFeedbackSubmission,
  normalizePartnerVoiceTuning,
  submitPartnerDialogueFeedback,
} from '../browser/partner-dialogue-feedback-core.mjs';
import { mountPartnerShellRuntime } from '../browser/partner-shell-runtime-mount.mjs';
import {
  readStoredPartnerReport,
  submitStoredPartnerReport,
} from '../deploy/cloudflare/relay/src/partner-report-store.mjs';

const base = {
  partnerId: 'partner.saasuna',
  sourceLineId: 'post-battle.win.001',
  sourceStateIdentity: 'match-42:result:win',
  versions: { rules: 'r1', content: 'c2', state: 's3' },
  originalText: '勝てましたね。',
  proposedText: '勝てましたね。次はもっと早く決められます。',
  voiceTuning: { rate: 1.1, pitch: 0.95, volume: 0.9, pauseMs: 180, voiceURI: '' },
};

test('voice tuning is bounded and deterministic', () => {
  assert.deepEqual(normalizePartnerVoiceTuning({ rate: 9, pitch: -2, volume: 2, pauseMs: 9999 }), {
    rate: 2, pitch: 0, volume: 1, pauseMs: 1000, voiceURI: '',
  });
});

test('post-battle dialogue edit becomes candidate-only request evidence, never a canonical write', () => {
  const submission = buildPartnerDialogueFeedbackSubmission(base);
  assert.equal(submission.reportType, 'request');
  assert.equal(submission.sourceUseSite, 'partner_post_battle_dialogue_editor');
  assert.equal(submission.feedback.kind, 'dialogue_edit');
  assert.equal(submission.feedback.proposedText, base.proposedText);
  assert.equal(submission.feedback.candidateOnly, true);
  assert.equal(submission.feedback.canonicalWrite, false);
  assert.equal(submission.feedback.chatgptOpinionInput, true);
  assert.equal('originalText' in submission.feedback, false);
});

test('unchanged text is rejected instead of producing empty big-data noise', () => {
  assert.equal(buildPartnerDialogueFeedbackSubmission({ ...base, proposedText: base.originalText }), null);
});

test('generated idempotency key is stable for identical proposal and changes with tuning/text', () => {
  const a = buildPartnerDialogueFeedbackIdempotencyKey(base);
  const b = buildPartnerDialogueFeedbackIdempotencyKey(base);
  const c = buildPartnerDialogueFeedbackIdempotencyKey({ ...base, proposedText: `${base.proposedText}！` });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^dialogue-feedback-[0-9a-f]{8}$/);
});

test('transport submits only normalized candidate data and returns authoritative report result', async () => {
  let sent = null;
  const result = await submitPartnerDialogueFeedback(base, {
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        reportId: 'r-dialogue-1',
        disposition: 'accepted_unique',
        feedback: { candidateOnly: true },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(sent.feedback.proposedText, base.proposedText);
  assert.equal(sent.feedback.canonicalWrite, false);
  assert.deepEqual(result, {
    ok: true,
    reportId: 'r-dialogue-1',
    disposition: 'accepted_unique',
    candidateOnly: true,
    canonicalWrite: false,
  });
});

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

const runtimeInput = {
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
    getInput: () => runtimeInput,
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

test('runtime preview and submit use edited text without mutating canonical dialogue', async () => {
  const root = makeRoot();
  let previewed = null;
  let submitted = null;
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => runtimeInput,
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
  await nodes.find((node) => node.dataset.partnerDialogueAction === 'submit').listeners.get('click')();
  assert.equal(submitted.originalText, '勝てましたね。');
  assert.equal(submitted.proposedText, editor.value);
  assert.equal(submitted.sourceLineId, 'post.win.001');
  assert.equal(nodes.find((node) => node.dataset.partnerDialogueStatus === 'true').textContent, '改善要望として蓄積しました');
});

test('without a post-battle line the runtime fail-closes instead of inventing dialogue', () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ ...runtimeInput, postBattleLine: null }),
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

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async transaction(fn) { return fn(this); }
}

function storedFeedback(overrides = {}) {
  return {
    idempotencyKey: 'dialogue-feedback-deadbeef',
    partnerId: 'partner.saasuna',
    reportType: 'request',
    sourceUseSite: 'partner_post_battle_dialogue_editor',
    sourceStateIdentity: 'match-42:result',
    versions: { rules: 'r1', content: 'c2', state: 's3' },
    feedback: {
      kind: 'dialogue_edit',
      sourceLineId: 'post.win.001',
      proposedText: '勝てましたね。次も行きましょう。',
      voiceTuning: { rate: 1.1, pitch: 0.9, volume: 0.8, pauseMs: 180, voiceURI: '' },
      candidateOnly: true,
      canonicalWrite: false,
      chatgptOpinionInput: true,
    },
    ...overrides,
  };
}

test('report authority stores dialogue proposal text and tuning as candidate review evidence', async () => {
  const storage = new FakeStorage();
  const saved = await submitStoredPartnerReport(storage, storedFeedback(), { reportId: 'r-dialogue', nowMs: 100 });
  assert.equal(saved.ok, true);
  assert.equal(saved.report.feedback.proposedText, '勝てましたね。次も行きましょう。');
  assert.equal(saved.report.feedback.voiceTuning.rate, 1.1);
  assert.equal(saved.report.feedback.candidateOnly, true);
  assert.equal(saved.report.feedback.canonicalWrite, false);
  assert.equal(saved.report.feedback.chatgptOpinionInput, true);
  const reread = await readStoredPartnerReport(storage, { reportId: 'r-dialogue' });
  assert.deepEqual(reread.report.feedback, saved.report.feedback);
});

test('exact same dialogue feedback dedupes while changed proposal remains unique', async () => {
  const storage = new FakeStorage();
  const first = await submitStoredPartnerReport(storage, storedFeedback(), { reportId: 'r-one' });
  const duplicate = await submitStoredPartnerReport(storage, storedFeedback({ idempotencyKey: 'dialogue-feedback-bbbbbbbb' }), { reportId: 'r-two' });
  const changed = await submitStoredPartnerReport(storage, storedFeedback({
    idempotencyKey: 'dialogue-feedback-cccccccc',
    feedback: { ...storedFeedback().feedback, proposedText: '勝てました。次はもっと速く。' },
  }), { reportId: 'r-three' });
  assert.equal(first.report.disposition, 'accepted_unique');
  assert.equal(duplicate.report.disposition, 'duplicate');
  assert.equal(changed.report.disposition, 'accepted_unique');
});

test('feedback cannot claim canonical write or use a non-request report type', async () => {
  const storage = new FakeStorage();
  assert.deepEqual(await submitStoredPartnerReport(storage, storedFeedback({
    feedback: { ...storedFeedback().feedback, canonicalWrite: true },
  }), { reportId: 'r-bad' }), { ok: false, reason: 'report_request_invalid' });
  assert.deepEqual(await submitStoredPartnerReport(storage, storedFeedback({ reportType: 'bug' }), { reportId: 'r-bad-2' }), {
    ok: false,
    reason: 'report_request_invalid',
  });
});
