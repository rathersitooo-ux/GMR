import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_PRESENTATION_CONTRACT,
  projectProfilePresentation,
  readCurrentProfileAuthority,
} from '../browser/profile-presentation-runtime-mount.mjs';

test('Profile projects current player and partner identity without local-history stats', () => {
  const projection = projectProfilePresentation({
    player: { id: 'partner.naki', name: '緋累ナキ' },
    partner: { id: 'partner.saasuna', name: 'サースナー' },
    publicFields: {
      matches: 50,
      wins: 40,
      averageRounds: 7,
      rank: 'A',
      rating: '1200',
      publicPlayerId: 'PLAYER-7',
      mode: '二人',
    },
  });

  assert.deepEqual(projection.identities.player, { id: 'partner.naki', name: '緋累ナキ' });
  assert.deepEqual(projection.identities.partner, { id: 'partner.saasuna', name: 'サースナー' });
  assert.deepEqual(projection.publicFields, {
    rank: 'A',
    rating: '1200',
    publicPlayerId: 'PLAYER-7',
    mode: '二人',
  });
  assert.equal('matches' in projection.publicFields, false);
  assert.equal('wins' in projection.publicFields, false);
  assert.equal('averageRounds' in projection.publicFields, false);
  assert.equal(projection.detailedRecordsRoute, 'records');
});

test('Favorite cards remain hidden without authoritative ownership', () => {
  const proposed = [
    { id: 'A', name: 'A', owned: true },
    { id: 'B', name: 'B', owned: true },
  ];
  assert.deepEqual(projectProfilePresentation({ favoriteCards: proposed }).favoriteCards, []);
});

test('Authority-gated favorite projection keeps only owned unique cards and caps at three', () => {
  const projection = projectProfilePresentation({
    ownershipAuthoritative: true,
    favoriteCards: [
      { id: 'A', name: 'A', owned: true },
      { id: 'B', name: 'B', owned: false },
      { id: 'C', name: 'C', owned: true },
      { id: 'A', name: 'A duplicate', owned: true },
      { id: 'D', name: 'D', owned: true },
      { id: 'E', name: 'E', owned: true },
    ],
  });
  assert.deepEqual(projection.favoriteCards, [
    { id: 'A', name: 'A' },
    { id: 'C', name: 'C' },
    { id: 'D', name: 'D' },
  ]);
});

test('Runtime authority read uses the existing player/partner state only', () => {
  const fakeWindow = {
    GAMEROAD_PARTNER_STATE: {
      player: () => ({ id: 'player.current', name: '操作人物' }),
      partner: () => ({ id: 'partner.current', name: '相棒' }),
    },
  };
  const projection = readCurrentProfileAuthority(fakeWindow);
  assert.equal(projection.identities.player.id, 'player.current');
  assert.equal(projection.identities.partner.id, 'partner.current');
  assert.deepEqual(projection.publicFields, {});
  assert.deepEqual(projection.favoriteCards, []);
});

test('Profile presentation contract forbids new deck/comment/persistence authority', () => {
  assert.equal(PROFILE_PRESENTATION_CONTRACT.publicDeck, false);
  assert.equal(PROFILE_PRESENTATION_CONTRACT.freeComment, false);
  assert.equal(PROFILE_PRESENTATION_CONTRACT.persistence, 'none');
  assert.equal(PROFILE_PRESENTATION_CONTRACT.favoriteCardsRequireOwnershipAuthority, true);
  assert.equal(PROFILE_PRESENTATION_CONTRACT.maxFavoriteCards, 3);
  assert.equal(PROFILE_PRESENTATION_CONTRACT.detailedRecordsRoute, 'records');
});
