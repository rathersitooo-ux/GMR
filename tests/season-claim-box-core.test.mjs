import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claimBoxSummary,
  claimFromBox,
  createClaimBox,
  grantToClaimBox,
  listClaimable,
  listExpired,
} from '../browser/season-claim-box-core.mjs';

const today = { month: 1, day: 20 };

test('grant and claim once; second claim is refused', () => {
  let box = createClaimBox();
  const granted = grantToClaimBox(box, { id: 'catalog-1', reward: { kind: 'manny', amount: 100 }, expiresDay: 60 });
  assert.equal(granted.granted, true);
  box = granted.box;
  assert.equal(grantToClaimBox(box, { id: 'catalog-1', reward: { kind: 'manny', amount: 100 } }).granted, false);
  const first = claimFromBox(box, 'catalog-1', today);
  assert.equal(first.claimed, true);
  assert.equal(first.reward.amount, 100);
  assert.equal(claimFromBox(first.box, 'catalog-1', today).reason, 'ALREADY_CLAIMED');
  assert.equal(claimFromBox(first.box, 'missing', today).reason, 'NOT_FOUND');
});

test('expiry: claimable before the deadline, expired after it', () => {
  const box = createClaimBox({
    grants: [
      { id: 'a', reward: { kind: 'manny', amount: 10 }, expiresDay: 20 },
      { id: 'b', reward: { kind: 'manny', amount: 10 }, expiresDay: 19 },
    ],
  });
  assert.equal(listClaimable(box, today).length, 1);
  assert.equal(listClaimable(box, today)[0].id, 'a');
  assert.equal(listExpired(box, today).length, 1);
  assert.equal(claimFromBox(box, 'b', today).reason, 'EXPIRED');
  assert.deepEqual(claimBoxSummary(box, today), { total: 2, claimed: 0, claimable: 1, expired: 1 });
});
