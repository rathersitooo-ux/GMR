import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_ACCESS_ENTITLEMENT_CONTRACT,
  CARD_ACCESS_STATUS,
  evaluateDeckCardAccess,
  resolveCardAccess,
} from '../browser/card-access-entitlement-core.mjs';

test('permanent ownership grants battle use without temporary grants', () => {
  const access = resolveCardAccess('CARD_A', {
    ownedCardIds: ['CARD_A'],
    seasonPass: { active: false, cardIds: [] },
    freeTrial: { active: false, allCards: false, cardIds: [] },
  });

  assert.equal(access.status, CARD_ACCESS_STATUS.OWNED);
  assert.equal(access.usableForBattle, true);
  assert.equal(access.permanentOwnership, true);
  assert.equal(access.temporaryAccess, false);
});

test('season pass grants only caller-supplied season card membership while active', () => {
  const policy = {
    ownedCardIds: [],
    seasonPass: { active: true, cardIds: ['CARD_SEASON'] },
    freeTrial: { active: false, allCards: false, cardIds: [] },
  };

  assert.equal(resolveCardAccess('CARD_SEASON', policy).status, CARD_ACCESS_STATUS.SEASON_PASS);
  assert.equal(resolveCardAccess('CARD_OTHER', policy).status, CARD_ACCESS_STATUS.LOCKED);

  const inactive = {
    ...policy,
    seasonPass: { active: false, cardIds: ['CARD_SEASON'] },
  };
  assert.equal(resolveCardAccess('CARD_SEASON', inactive).status, CARD_ACCESS_STATUS.LOCKED);
});

test('active all-card free trial grants non-owned cards without changing ownership', () => {
  const access = resolveCardAccess('CARD_ANY', {
    ownedCardIds: [],
    seasonPass: { active: false, cardIds: [] },
    freeTrial: { active: true, allCards: true, cardIds: [] },
  });

  assert.equal(access.status, CARD_ACCESS_STATUS.FREE_TRIAL);
  assert.equal(access.usableForBattle, true);
  assert.equal(access.permanentOwnership, false);
  assert.equal(access.temporaryAccess, true);
});

test('permanent ownership has precedence over temporary access', () => {
  const access = resolveCardAccess('CARD_A', {
    ownedCardIds: ['CARD_A'],
    seasonPass: { active: true, cardIds: ['CARD_A'] },
    freeTrial: { active: true, allCards: true, cardIds: [] },
  });

  assert.equal(access.status, CARD_ACCESS_STATUS.OWNED);
});

test('deck evaluation preserves every saved card position and reports locked cards without deleting them', () => {
  const deck = {
    main: ['OWNED', 'PASS', 'LOCKED', 'LOCKED'],
    ex: ['TRIAL'],
  };
  const result = evaluateDeckCardAccess(deck, {
    ownedCardIds: ['OWNED'],
    seasonPass: { active: true, cardIds: ['PASS'] },
    freeTrial: { active: true, allCards: false, cardIds: ['TRIAL'] },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.entries.map(({ zone, index, cardId, status }) => ({
    zone,
    index,
    cardId,
    status,
  })), [
    { zone: 'main', index: 0, cardId: 'OWNED', status: 'OWNED' },
    { zone: 'main', index: 1, cardId: 'PASS', status: 'SEASON_PASS' },
    { zone: 'main', index: 2, cardId: 'LOCKED', status: 'LOCKED' },
    { zone: 'main', index: 3, cardId: 'LOCKED', status: 'LOCKED' },
    { zone: 'ex', index: 0, cardId: 'TRIAL', status: 'FREE_TRIAL' },
  ]);
  assert.deepEqual(result.lockedCardIds, ['LOCKED']);
  assert.equal(result.lockedEntries.length, 2);
  assert.deepEqual(deck, {
    main: ['OWNED', 'PASS', 'LOCKED', 'LOCKED'],
    ex: ['TRIAL'],
  });
  assert.equal(result.savedDeckMutationAllowed, false);
});

test('all-card free trial makes an otherwise locked saved deck battle-usable', () => {
  const result = evaluateDeckCardAccess({
    main: ['A', 'B'],
    ex: ['C'],
  }, {
    ownedCardIds: [],
    seasonPass: { active: false, cardIds: [] },
    freeTrial: { active: true, allCards: true, cardIds: [] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.lockedCardIds, []);
  assert.equal(result.entries.every((entry) => entry.status === 'FREE_TRIAL'), true);
});

test('entitlement core has no purchase, ownership, save, or clock authority', () => {
  assert.equal(CARD_ACCESS_ENTITLEMENT_CONTRACT.purchaseAuthority, false);
  assert.equal(CARD_ACCESS_ENTITLEMENT_CONTRACT.ownershipMutationAllowed, false);
  assert.equal(CARD_ACCESS_ENTITLEMENT_CONTRACT.saveMutationAllowed, false);
  assert.equal(CARD_ACCESS_ENTITLEMENT_CONTRACT.savedDeckMutationAllowed, false);
  assert.equal(CARD_ACCESS_ENTITLEMENT_CONTRACT.activeWindowAuthority, 'CALLER');
});

test('invalid grants fail closed instead of inferring access', () => {
  assert.throws(
    () => resolveCardAccess('CARD_A', {
      seasonPass: { active: true, allCards: true, cardIds: [] },
    }),
    /SEASON_PASS_ALLCARDS_FORBIDDEN/,
  );
  assert.throws(
    () => evaluateDeckCardAccess({ main: [''], ex: [] }, {}),
    /MAIN_CARDID_INVALID/,
  );
});
