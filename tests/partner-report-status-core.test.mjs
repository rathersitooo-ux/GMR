import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_REPORT_STATUS,
  PARTNER_REPORT_NEXT_ACTION,
  normalizePartnerReportStatus,
  projectPartnerReportStatus,
} from '../browser/partner-report-status-core.mjs';

const authoritative = (status, extra = {}) => projectPartnerReportStatus({
  status,
  authoritative: true,
  ...extra,
});

test('accepted report produces neutral accessible receipt without character dialogue', () => {
  const model = authoritative('accepted');
  assert.equal(model.status, PARTNER_REPORT_STATUS.ACCEPTED);
  assert.equal(model.kind, 'status');
  assert.equal(model.speakerId, 'system');
  assert.equal(model.level, 'success');
  assert.equal(model.role, 'status');
  assert.equal(model.ariaLive, 'polite');
  assert.equal(model.message, '報告を受け付けました。');
  assert.equal(model.nextAction, PARTNER_REPORT_NEXT_ACTION.NONE);
  assert.equal(model.authoritative, true);
  assert.equal('utterance' in model, false);
  assert.equal('characterId' in model, false);
});

test('duplicate is explicit but never represented as a new contribution', () => {
  const model = authoritative('duplicate');
  assert.equal(model.status, PARTNER_REPORT_STATUS.DUPLICATE);
  assert.equal(model.level, 'info');
  assert.match(model.message, /すでに受け付け/);
  assert.equal('affinityDelta' in model, false);
  assert.equal('contributionDelta' in model, false);
});

test('reviewing and pending aliases converge to the same status', () => {
  assert.equal(normalizePartnerReportStatus('reviewing'), PARTNER_REPORT_STATUS.REVIEWING);
  assert.equal(normalizePartnerReportStatus('pending'), PARTNER_REPORT_STATUS.REVIEWING);
  assert.deepEqual(authoritative('reviewing'), authoritative('pending'));
});

test('needs-info returns an explicit next action and only allowlisted detail', () => {
  const known = authoritative('needs_info', { reasonCode: 'insufficient_information' });
  assert.equal(known.status, PARTNER_REPORT_STATUS.NEEDS_INFO);
  assert.equal(known.nextAction, PARTNER_REPORT_NEXT_ACTION.ADD_INFO);
  assert.match(known.detail, /情報が不足/);

  const raw = authoritative('needs_info', {
    reasonCode: 'user supplied raw report text must never echo',
    reportText: 'private raw report body',
  });
  assert.equal(raw.detail, null);
  assert.equal(JSON.stringify(raw).includes('private raw report body'), false);
});

test('resolved returns verify-resolution instead of claiming a new reward', () => {
  const model = authoritative('resolved');
  assert.equal(model.status, PARTNER_REPORT_STATUS.RESOLVED);
  assert.equal(model.nextAction, PARTNER_REPORT_NEXT_ACTION.VERIFY_RESOLUTION);
  assert.match(model.message, /対応が完了/);
  assert.equal('reward' in model, false);
  assert.equal('affinityDelta' in model, false);
});

test('rejected conflict and failed are assertive and never silent', () => {
  for (const status of ['rejected', 'conflict', 'failed']) {
    const model = authoritative(status);
    assert.equal(model.role, 'alert');
    assert.equal(model.ariaLive, 'assertive');
    assert.equal(model.level, 'error');
    assert.ok(model.message.length > 0);
  }
  assert.equal(authoritative('failed').nextAction, PARTNER_REPORT_NEXT_ACTION.RETRY_STATUS);
});

test('unknown authoritative status still returns a visible neutral status', () => {
  const model = authoritative('brand_new_provider_state');
  assert.equal(model.status, PARTNER_REPORT_STATUS.UNKNOWN);
  assert.equal(model.key, 'partner_report_unknown');
  assert.equal(model.role, 'status');
  assert.equal(model.ariaLive, 'polite');
  assert.ok(model.message.length > 0);
  assert.equal(model.nextAction, PARTNER_REPORT_NEXT_ACTION.RETRY_STATUS);
});

test('non-authoritative client claims fail closed to unknown and cannot leak reason', () => {
  const model = projectPartnerReportStatus({
    status: 'accepted',
    authoritative: false,
    reasonCode: 'content_conflict',
    affinityDelta: 999,
  });
  assert.equal(model.status, PARTNER_REPORT_STATUS.UNKNOWN);
  assert.equal(model.authoritative, false);
  assert.equal(model.detail, null);
  assert.equal('affinityDelta' in model, false);
  assert.match(model.message, /まだ確認できません/);
});

test('missing or malformed input never becomes a silent no-op', () => {
  for (const input of [undefined, null, {}, { authoritative: true }, { authoritative: true, status: 42 }]) {
    const model = projectPartnerReportStatus(input);
    assert.equal(model.status, PARTNER_REPORT_STATUS.UNKNOWN);
    assert.equal(model.kind, 'status');
    assert.ok(model.message.length > 0);
    assert.ok(['polite', 'assertive'].includes(model.ariaLive));
  }
});

test('status model is deterministic immutable presentation data', () => {
  const a = authoritative('received_unique');
  const b = authoritative('accepted');
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a));
});
