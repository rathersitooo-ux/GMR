import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PROFILE_PRESENTATION_CONTRACT,
  PROFILE_RECORDS_SELECTION_SWEEP_ASSET,
  dismissRecordsMatchDetail,
  projectHistoricalDeckText,
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
  assert.match(source, /row\.__gameroadHistoryEntry/);
  assert.match(source, /deckStartSnapshot/);
  assert.match(source, /使用デッキ：この対戦履歴では未記録です。/);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|__GAMEROAD_TEST__/);
});

test('Historical record deck text uses the frozen match-start snapshot with exact multiplicity', () => {
  const historyEntry = {
    deckStartSnapshot: {
      deckRef: { deckSlotId: 'deck-1', deckSlotName: '森のデッキ' },
      deck: {
        main: ['A', 'B', 'A'],
        ex: ['EX1'],
      },
    },
  };
  const fakeWindow = {
    __CARD_DATA__: {
      A: { name: '森の札' },
      B: { name: '音の札' },
      EX1: { name: 'EX札' },
    },
  };

  assert.equal(
    projectHistoricalDeckText(historyEntry, fakeWindow),
    '使用デッキ「森のデッキ」\nメイン 3枚：森の札（A） ×2 / 音の札（B）\nEX 1枚：EX札（EX1）',
  );
});

test('Historical record deck text resolves the live Array card-data shape and keeps unknown IDs as fallback', () => {
  const historyEntry = {
    deckStartSnapshot: {
      deckRef: { deckSlotId: 'deck-live' },
      deck: {
        main: ['A', 'UNKNOWN'],
        ex: ['EX1'],
      },
    },
  };
  const fakeWindow = {
    __CARD_DATA__: [
      { id: 'A', name: '森の札' },
      { id: 'EX1', name: 'EX札' },
    ],
  };

  assert.equal(
    projectHistoricalDeckText(historyEntry, fakeWindow),
    '使用デッキ（deck-live）\nメイン 2枚：森の札（A） / UNKNOWN\nEX 1枚：EX札（EX1）',
  );
});

test('Historical record deck text prefers the current production display_name field', () => {
  const historyEntry = {
    deckStartSnapshot: {
      deckRef: { deckSlotId: 'deck-current' },
      deck: { main: ['SP_A'], ex: [] },
    },
  };
  const fakeWindow = {
    __CARD_DATA__: [
      { id: 'SP_A', display_name: 'スペードA' },
    ],
  };

  assert.equal(
    projectHistoricalDeckText(historyEntry, fakeWindow),
    '使用デッキ（deck-current）\nメイン 1枚：スペードA（SP_A）\nEX 0枚：なし',
  );
});

test('Historical record deck text keeps legacy entries explicitly unrecorded', () => {
  assert.equal(projectHistoricalDeckText(null), '使用デッキ：この対戦履歴では未記録です。');
  assert.equal(projectHistoricalDeckText({ deckStartSnapshot: {} }), '使用デッキ：この対戦履歴では未記録です。');
});

test('Profile hierarchy keeps identity emphasis, Records priority, and bounded phone legibility', () => {
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /\.profileIdentityCopy span\{[^}]*font-size:11px;[^}]*line-height:1\.35/);
  assert.match(source, /\.profileRecordsNote\{[^}]*font-size:12px;line-height:1\.5/);
  assert.match(source, /\.profileIdentityCard\[data-role="player"\]\{[^}]*min-height:116px/);
  assert.match(source, /kicker\.textContent = '本人情報'/);
  assert.match(source, /recordsButton\.classList\.add\('primary'\);[\s\S]*?actions\?\.prepend\(recordsButton\);/);
  assert.match(source, /partnerButton\?\.classList\.remove\('primary'\)/);
  assert.match(source, /\.profileIdentityCopy b\{[^}]*overflow-wrap:anywhere;[^}]*-webkit-line-clamp:2/);
  assert.match(source, /\.profileLayout\{grid-template-columns:minmax\(280px,\.9fr\) minmax\(360px,1\.35fr\);gap:14px/);
  assert.match(source, /@media\(max-height:470px\)[\s\S]*?\.profileLayout\{grid-template-columns:minmax\(180px,\.72fr\) minmax\(0,1\.45fr\);gap:7px/);
  assert.match(source, /@media\(max-height:470px\)[\s\S]*?\.profileRecordsNote\{[^}]*font-size:9px;line-height:1\.3/);
  assert.match(source, /@media\(max-width:540px\)[\s\S]*?\.profileLayout\{grid-template-columns:1fr;grid-template-rows:minmax\(220px,30vh\) auto/);
  assert.match(source, /@media\(max-width:540px\)[\s\S]*?\.profileActions \[data-go="records"\]\{grid-column:1\/-1\}/);
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

test('Records detail lets another rendered row switch directly while outside click and Escape still dismiss', () => {
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /doc\.addEventListener\('click',[\s\S]*?panel\.contains\(event\.target\)[\s\S]*?const row = event\.target\?\.closest\?\.\('\.record'\);[\s\S]*?if \(row && list\.contains\(row\)\) return;[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?dismissRecordsMatchDetail\(list, panel\);[\s\S]*?}, true\);/);
  assert.match(source, /doc\.addEventListener\('keydown',[\s\S]*?event\.key !== 'Escape'[\s\S]*?dismissRecordsMatchDetail\(list, panel\);[\s\S]*?}, true\);/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});


test('Records selectable rows give a short active press response without changing handlers', () => {
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /record\[data-records-selectable="true"\]:active\{transform:translateY\(1px\) scale\(\.992\);filter:brightness\(\.94\)/);
  assert.match(source, /transition-duration:\.06s/);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?record\[data-records-selectable="true"\]:active\{transform:none;filter:brightness\(\.94\)\}/);
  assert.doesNotMatch(source, /records-row-press-listener/);
});

test('Records detail panel uses a short reveal and keeps Reduced Motion opacity-only', () => {
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /recordsMatchDetail\{[^}]*animation:gameroadRecordsDetailReveal \.18s/);
  assert.match(source, /@keyframes gameroadRecordsDetailReveal\{0%\{opacity:\.08;transform:translateY\(5px\) scale\(\.995\)\}/);
  assert.match(source, /@keyframes gameroadRecordsDetailFade\{0%\{opacity:\.12\}100%\{opacity:1\}\}/);
  assert.match(source, /html\.r10LowPerf \[data-screen="records"\] \.recordsMatchDetail,html\.r10Reduced \[data-screen="records"\] \.recordsMatchDetail\{animation:gameroadRecordsDetailFade \.1s linear both\}/);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?recordsMatchDetail\{animation:gameroadRecordsDetailFade \.09s linear both;transform:none\}/);
});

test('Records selection feedback uses the generated four-frame effect without changing selection authority', () => {
  assert.deepEqual(PROFILE_RECORDS_SELECTION_SWEEP_ASSET, {
    id: 'records-selection-sweep-sprite-v1',
    sourcePath: 'assets/visual/effects/records-selection-sweep-sprite-v1.png',
    runtimePath: '../assets/visual/effects/records-selection-sweep-sprite-v1.png',
    formal: true,
    presentationOnly: true,
    frameCount: 4,
    frameLayout: 'horizontal-4-up',
  });
  const source = readFileSync(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /data-records-selected="true"]::after/);
  assert.match(source, /pointer-events:none/);
  assert.match(source, /background-image:url\('\$\{PROFILE_RECORDS_SELECTION_SWEEP_URL\}'\)/);
  assert.match(source, /animation:gameroadRecordsSelectionSweep/);
  assert.match(source, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(source, /background-position:50% 50%;opacity:\.18/);
  assert.match(source, /html\.r10LowPerf\{--records-selection-sweep-alpha:\.44\}/);
  assert.match(source, /html\.r10Reduced\{--records-selection-sweep-alpha:\.26\}/);
  assert.match(source, /data-records-selectable="true"]\{position:relative/);
});
