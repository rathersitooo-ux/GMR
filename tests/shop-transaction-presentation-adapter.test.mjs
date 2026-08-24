import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FANART_SHOP_CATALOG_SCHEMA,
  SHOP_TRANSACTION_PRESENTATION_ADAPTER_SCHEMA,
  projectApprovedFanArtShopCatalog,
  projectShopTransactionPresentation,
} from '../browser/shop-transaction-presentation-adapter.mjs';

const config = Object.freeze({holdMs: 420, moveCancelDistance: 18, rightSwipeDistance: 72});
const project = (phase, extra = {}) => projectShopTransactionPresentation({config, phase, ...extra});

function approvedFanArt(overrides = {}) {
  return {
    workId:'FANART-WORK-0001',
    workVersion:'v1',
    title:'Formal approved work',
    creatorDisplayName:'Creator',
    creatorUserId:'user:creator:1',
    submissionRecordId:'SUB-FANART-0001',
    approvalRecordId:'APP-FANART-0001',
    targetCardId:'CARD-CANON-001',
    imageAssetId:'asset:approved:0001',
    formalApprovalState:'APPROVED',
    approvedBy:'HUMAN',
    imageReviewState:'APPROVED',
    gameUseApproved:true,
    shopUseApproved:true,
    acquisition:{state:'READY', productId:'fanart:0001:v1', currency:'HONEY', price:500},
    ...overrides,
  };
}

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

test('fan-art Shop stays hidden with no real formal approved work', () => {
  const out = projectApprovedFanArtShopCatalog();
  assert.equal(out.schema, FANART_SHOP_CATALOG_SCHEMA);
  assert.equal(out.visible, false);
  assert.equal(out.catalogState, 'EMPTY_NO_FORMAL_WORK');
  assert.deepEqual(out.items, []);
});

test('formal approved work projects only public Shop data and view/acquire actions', () => {
  const out = projectApprovedFanArtShopCatalog({works:[approvedFanArt()]});
  assert.equal(out.visible, true);
  assert.equal(out.catalogState, 'READY');
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.items[0].actions, ['VIEW','ACQUIRE']);
  assert.equal(out.items[0].acquisition.currency, 'HONEY');
  assert.equal(Object.hasOwn(out.items[0], 'creatorUserId'), false);
  assert.equal(Object.hasOwn(out.items[0], 'submissionRecordId'), false);
  assert.equal(Object.hasOwn(out.items[0], 'approvalRecordId'), false);
  assert.equal(out.userListingAllowed, false);
  assert.equal(out.tradingAllowed, false);
  assert.equal(out.resaleAllowed, false);
});

test('one inconsistent work stops the whole fan-art catalog instead of partial listing', () => {
  const invalid = approvedFanArt({
    workId:'FANART-WORK-0002',
    approvalRecordId:'APP-FANART-0002',
    acquisition:{state:'READY', productId:'fanart:0002:v1', currency:'COIN', price:500},
  });
  const out = projectApprovedFanArtShopCatalog({works:[approvedFanArt(), invalid]});
  assert.equal(out.visible, false);
  assert.equal(out.catalogState, 'STOPPED_INVALID_CATALOG');
  assert.deepEqual(out.items, []);
  assert.ok(out.reasons.some((reason)=>reason.includes('currency-must-be-honey')));
});

test('duplicate work/version stops the whole fan-art catalog', () => {
  const out = projectApprovedFanArtShopCatalog({works:[approvedFanArt(), approvedFanArt()]});
  assert.equal(out.visible, false);
  assert.deepEqual(out.items, []);
  assert.ok(out.reasons.includes('duplicate-work-version:FANART-WORK-0001@v1'));
});

test('candidate, missing Human approval, image review, use approval, or acquisition authority all fail closed', () => {
  const cases = [
    approvedFanArt({formalApprovalState:'CANDIDATE'}),
    approvedFanArt({approvedBy:'AI'}),
    approvedFanArt({imageReviewState:'PENDING'}),
    approvedFanArt({gameUseApproved:false}),
    approvedFanArt({shopUseApproved:false}),
    approvedFanArt({acquisition:{state:'PENDING', productId:'fanart:0001:v1', currency:'HONEY', price:500}}),
  ];
  for (const work of cases) {
    const out = projectApprovedFanArtShopCatalog({works:[work]});
    assert.equal(out.visible, false);
    assert.deepEqual(out.items, []);
  }
});

test('fan-art catalog cannot smuggle gameplay/card ability changes', () => {
  const out = projectApprovedFanArtShopCatalog({works:[approvedFanArt({ability:'draw 9'})]});
  assert.equal(out.visible, false);
  assert.ok(out.reasons.some((reason)=>reason.includes('gameplay-field-forbidden:ability')));
});
