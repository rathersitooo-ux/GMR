import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerDialogueFeedbackIdempotencyKey,
  buildPartnerDialogueFeedbackSubmission,
  normalizePartnerVoiceTuning,
  submitPartnerDialogueFeedback,
} from '../browser/partner-dialogue-feedback-core.mjs';

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
