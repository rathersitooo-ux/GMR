import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readStoredPartnerReport,
  submitStoredPartnerReport,
} from '../relay/src/partner-report-store.mjs';

class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined; }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async transaction(fn) { return fn(this); }
}

function feedback(overrides = {}) {
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

test('dialogue proposal text and tuning are stored as candidate evidence and projected for big-data/ChatGPT review', async () => {
  const storage = new FakeStorage();
  const saved = await submitStoredPartnerReport(storage, feedback(), { reportId: 'r-dialogue', nowMs: 100 });
  assert.equal(saved.ok, true);
  assert.equal(saved.report.feedback.proposedText, '勝てましたね。次も行きましょう。');
  assert.equal(saved.report.feedback.voiceTuning.rate, 1.1);
  assert.equal(saved.report.feedback.candidateOnly, true);
  assert.equal(saved.report.feedback.canonicalWrite, false);
  assert.equal(saved.report.feedback.chatgptOpinionInput, true);
  const reread = await readStoredPartnerReport(storage, { reportId: 'r-dialogue' });
  assert.deepEqual(reread.report.feedback, saved.report.feedback);
});

test('exact same feedback gets duplicate disposition while a changed proposed text is unique', async () => {
  const storage = new FakeStorage();
  const first = await submitStoredPartnerReport(storage, feedback(), { reportId: 'r-one' });
  const duplicate = await submitStoredPartnerReport(storage, feedback({ idempotencyKey: 'dialogue-feedback-bbbbbbbb' }), { reportId: 'r-two' });
  const changed = await submitStoredPartnerReport(storage, feedback({
    idempotencyKey: 'dialogue-feedback-cccccccc',
    feedback: { ...feedback().feedback, proposedText: '勝てました。次はもっと速く。' },
  }), { reportId: 'r-three' });
  assert.equal(first.report.disposition, 'accepted_unique');
  assert.equal(duplicate.report.disposition, 'duplicate');
  assert.equal(changed.report.disposition, 'accepted_unique');
});

test('feedback cannot claim canonical write or smuggle non-request report type', async () => {
  const storage = new FakeStorage();
  assert.deepEqual(await submitStoredPartnerReport(storage, feedback({
    feedback: { ...feedback().feedback, canonicalWrite: true },
  }), { reportId: 'r-bad' }), { ok: false, reason: 'report_request_invalid' });
  assert.deepEqual(await submitStoredPartnerReport(storage, feedback({ reportType: 'bug' }), { reportId: 'r-bad-2' }), {
    ok: false,
    reason: 'report_request_invalid',
  });
});
