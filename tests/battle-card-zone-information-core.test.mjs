import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CARD_ZONE_INFORMATION_SCHEMA,
  projectBattleCardZoneInformation,
  requestBattleCardZoneDetail,
} from '../browser/battle-card-zone-information-core.mjs';

const fullSnapshot = () => ({
  viewerSafe: true,
  zoneId: 'battle-zone:self:discard',
  generation: 'match-7:turn-4:rev-12',
  permissions: { count: true, recent: true, list: true, detail: true },
  count: 3,
  recentCardId: 'CARD-C',
  cardIds: ['CARD-A', 'CARD-B', 'CARD-C'],
});

test('full authorized projection exposes only caller supplied information', () => {
  const model = projectBattleCardZoneInformation(fullSnapshot());
  assert.equal(model.schema, BATTLE_CARD_ZONE_INFORMATION_SCHEMA);
  assert.equal(model.visible, true);
  assert.equal(model.entryVisible, true);
  assert.equal(model.countVisible, true);
  assert.equal(model.count, 3);
  assert.equal(model.recentVisible, true);
  assert.equal(model.recentCardId, 'CARD-C');
  assert.equal(model.listVisible, true);
  assert.deepEqual(model.cardIds, ['CARD-A', 'CARD-B', 'CARD-C']);
  assert.equal(model.detailEnabled, true);
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.gameStateWrite, false);
});

test('count-only authorization does not leak recent, contents or detail', () => {
  const model = projectBattleCardZoneInformation({
    viewerSafe: true,
    zoneId: 'battle-zone:other:discard',
    generation: 'match-7:turn-4:rev-12',
    permissions: { count: true, recent: false, list: false, detail: false },
    count: 5,
    recentCardId: 'SECRET',
    cardIds: ['SECRET'],
  });
  assert.equal(model.visible, true);
  assert.equal(model.count, 5);
  assert.equal(model.recentVisible, false);
  assert.equal(model.recentCardId, null);
  assert.equal(model.listVisible, false);
  assert.deepEqual(model.cardIds, []);
  assert.equal(model.detailEnabled, false);
  assert.equal(requestBattleCardZoneDetail(model, 'SECRET'), null);
});

test('viewerSafe false fails closed', () => {
  const model = projectBattleCardZoneInformation({ ...fullSnapshot(), viewerSafe: false });
  assert.equal(model.visible, false);
  assert.equal(model.entryVisible, false);
  assert.equal(model.count, null);
  assert.deepEqual(model.cardIds, []);
});

test('missing identity and invalid count fail closed without throwing', () => {
  assert.equal(projectBattleCardZoneInformation({ ...fullSnapshot(), generation: '' }).visible, false);
  assert.equal(projectBattleCardZoneInformation({ ...fullSnapshot(), zoneId: '' }).visible, false);
  assert.equal(projectBattleCardZoneInformation({ ...fullSnapshot(), count: -1 }).visible, false);
  assert.equal(projectBattleCardZoneInformation({ ...fullSnapshot(), count: 1.5 }).visible, false);
});

test('inconsistent complete contents and duplicate IDs fail closed', () => {
  assert.equal(projectBattleCardZoneInformation({ ...fullSnapshot(), count: 4 }).visible, false);
  assert.equal(projectBattleCardZoneInformation({ ...fullSnapshot(), cardIds: ['CARD-A', 'CARD-A', 'CARD-C'] }).visible, false);
  assert.equal(projectBattleCardZoneInformation({ ...fullSnapshot(), recentCardId: 'NOT-IN-LIST' }).visible, false);
});

test('detail handoff accepts only a currently authorized visible member', () => {
  const model = projectBattleCardZoneInformation(fullSnapshot());
  assert.equal(requestBattleCardZoneDetail(model, 'CARD-B'), 'CARD-B');
  assert.equal(requestBattleCardZoneDetail(model, 'CARD-X'), null);
  assert.equal(requestBattleCardZoneDetail(model, ''), null);

  const noDetail = projectBattleCardZoneInformation({
    ...fullSnapshot(),
    permissions: { count: true, recent: true, list: true, detail: false },
  });
  assert.equal(requestBattleCardZoneDetail(noDetail, 'CARD-B'), null);
});

test('no visible permission means no entry rather than an invented empty zone', () => {
  const model = projectBattleCardZoneInformation({
    viewerSafe: true,
    zoneId: 'battle-zone:self:discard',
    generation: 'match-7:turn-4:rev-12',
    permissions: { count: false, recent: false, list: false, detail: false },
  });
  assert.equal(model.visible, false);
  assert.equal(model.entryVisible, false);
});
