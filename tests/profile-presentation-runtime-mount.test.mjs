import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PROFILE_PRESENTATION_CONTRACT,
  dismissRecordsMatchDetail,
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
  assert.equal(PROFILE_PRESENTATION_CONTRACT.recordsSurfaceSource, '#recordsList .record');
  assert.equal(PROFILE_PRESENTATION_CONTRACT.recordsPersistence, 'existing-history-only');
});

test('Records enhancement stays on the current rendered history and does not add storage authority', () => {
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /querySelector\('section\[data-screen="records"\]'\)/);
  assert.match(source, /querySelectorAll\('\.record'\)/);
  assert.match(source, /setAttribute\('role', 'button'\)/);
  assert.match(source, /setAttribute\('aria-expanded', selected \? 'true' : 'false'\)/);
  assert.match(source, /使用デッキ：この対戦履歴では未記録です。/);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|__GAMEROAD_TEST__/);
});

test('Profile secondary copy keeps the bounded phone legibility floor', () => {
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /\.profileIdentityCopy span\{[^}]*font-size:11px;[^}]*line-height:1\.35/);
  assert.match(source, /\.profileRecordsNote\{[^}]*font-size:12px;line-height:1\.45/);
  assert.match(source, /@media\(max-height:470px\)[\s\S]*?\.profileRecordsNote\{[^}]*font-size:10px;line-height:1\.35/);
});


test('Records detail dismiss clears transient selection and restores its opener focus', () => {
  const focusCalls = [];
  const opener = { focus: (options) => focusCalls.push(options) };
  const rows = [
    { dataset: { recordsSelected: 'true' }, setAttribute(name, value) { this[name] = value; } },
    { dataset: { recordsSelected: 'false' }, setAttribute(name, value) { this[name] = value; } },
  ];
  const list = { querySelectorAll: () => rows };
  const panel = { hidden: false, __gameroadRecordsOpener: opener };

  assert.equal(dismissRecordsMatchDetail(list, panel), true);
  assert.equal(panel.hidden, true);
  assert.equal(panel.__gameroadRecordsOpener, null);
  assert.deepEqual(rows.map((row) => row.dataset.recordsSelected), ['false', 'false']);
  assert.deepEqual(rows.map((row) => row['aria-expanded']), ['false', 'false']);
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
  assert.equal(dismissRecordsMatchDetail(list, panel), false);
});

test('Records detail consumes safe outside click and Escape without a second state authority', () => {
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /doc\.addEventListener\('click',[\s\S]*?panel\.contains\(event\.target\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?dismissRecordsMatchDetail\(list, panel\);[\s\S]*?}, true\);/);
  assert.match(source, /doc\.addEventListener\('keydown',[\s\S]*?event\.key !== 'Escape'[\s\S]*?dismissRecordsMatchDetail\(list, panel\);[\s\S]*?}, true\);/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
