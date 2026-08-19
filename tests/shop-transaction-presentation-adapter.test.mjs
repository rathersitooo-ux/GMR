import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_TRANSACTION_PRESENTATION_ADAPTER_SCHEMA,
  projectShopTransactionPresentation,
} from '../browser/shop-transaction-presentation-adapter.mjs';

const config = Object.freeze({holdMs: 420, moveCancelDistance: 18, rightSwipeDistance: 72});
const project = (phase, extra = {}) => projectShopTransactionPresentation({config, phase, ...extra});

test('projects selected, confirm, and return without inventing transaction truth', () => {
  const selected = project('SELECTED');
  assert.equal(selected.schema, SHOP_TRANSACTION_PRESENTATION_ADAPTER_SCHEMA);
  assert.equal(selected.feedback.feedback, 'selected');
  assert.equal(selected.feedback.pending, false);
  assert.equal(selected.requestId, null);
  const confirm = project('CONFIRM_OPEN');
  assert.equal(confirm.feedback.feedback, 'selected');
  assert.equal(confirm.feedback.reason, 'shop_confirm_open');
  const returned = project('RETURN');
  assert.equal(returned.feedback.feedback, 'normal');
  assert.equal(returned.feedback.selected, false);
});

test('pending or unknown never projects success', () => {
  const out = project('PENDING_OR_UNKNOWN', {requestId: 'shop:req:17', currentRequestId: 'shop:req:17'});
  assert.equal(out.requestId, 'shop:req:17');
  assert.equal(out.feedback.feedback, 'pending');
  assert.equal(out.feedback.pending, true);
  assert.notEqual(out.feedback.feedback, 'confirmed');
});

test('success and failure are projected only for the current authoritative request', () => {
  const success = project('SUCCESS', {requestId: 'shop:req:21', currentRequestId: 'shop:req:21'});
  assert.equal(success.feedback.feedback, 'confirmed');
  assert.equal(success.feedback.reason, 'shop_success_confirmed');
  assert.equal(success.feedback.pending, false);
  const failure = project('FAILURE', {requestId: 'shop:req:22', currentRequestId: 'shop:req:22'});
  assert.equal(failure.feedback.feedback, 'failed');
  assert.equal(failure.feedback.reason, 'shop_failure_confirmed');
  assert.equal(failure.feedback.pending, false);
});

test('stale, mismatched, and missing request identities fail closed', () => {
  assert.throws(() => project('SUCCESS', {requestId: 'shop:req:old', currentRequestId: 'shop:req:new'}), /stale or mismatched Shop request identity/);
  assert.throws(() => project('FAILURE', {requestId: 'shop:req:old', currentRequestId: 'shop:req:new'}), /stale or mismatched Shop request identity/);
  assert.throws(() => project('PENDING_OR_UNKNOWN', {currentRequestId: 'shop:req:23'}), /requestId must be a non-empty string/);
});

test('rapid-repeat late success cannot overtake the current request', () => {
  const latestPending = project('PENDING_OR_UNKNOWN', {requestId: 'shop:req:31', currentRequestId: 'shop:req:31'});
  assert.equal(latestPending.feedback.feedback, 'pending');
  assert.throws(() => project('SUCCESS', {requestId: 'shop:req:30', currentRequestId: 'shop:req:31'}), /stale or mismatched Shop request identity/);
});

test('shared reduced-motion and low-performance projection remains intact', () => {
  assert.equal(project('CONFIRM_OPEN', {reducedMotion: true}).feedback.motion, 'none');
  assert.equal(project('CONFIRM_OPEN', {lowPerf: true}).feedback.motion, 'reduced');
});

test('adapter rejects unsupported phases and does not expose economy fields', () => {
  assert.throws(() => project('PURCHASED'), /unsupported Shop presentation phase/);
  const out = project('SUCCESS', {requestId: 'shop:req:41', currentRequestId: 'shop:req:41'});
  for (const forbidden of ['price', 'currency', 'productId', 'ownership', 'reward']) assert.equal(Object.hasOwn(out, forbidden), false);
});
