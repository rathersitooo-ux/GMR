import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT,
  BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_SCHEMA,
  projectBattleCriticalResourceHudInput,
  syncBattleCriticalResourceHudFromPlayer,
} from '../browser/battle-critical-resource-hud-live-adapter.mjs';

// Exercise the collector that animateResolvedPath actually calls, rather than a
// duplicate reward implementation or a source-replacement fixture.
const honeyLiveHtml = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
function honeyLiveCase({ count = 3, contentId = 'honey_hunt', honey = 2, mana = 4 } = {}) {
  const player = { id: 'P1', name: 'あなた', human: true, position: 'R:P1:L:1', honey, manaCurrent: mana, manaMax: 10, chip: [] };
  const state = { match: { id: 'HONEY-LIVE-TEST', round: 1, contentId, honey: { byNode: { [player.position]: count }, receipts: new Set() } } };
  const lines = honeyLiveHtml.split('\n');
  const helper = lines.find(line => /^function (?:awakeManaFromHoney|creditCollectedHoney)\(/.test(line));
  const collector = lines.find(line => line.startsWith('function collectEndpointHoney('));
  assert.ok(helper && collector, 'live Honey collector and helper must exist');
  const logs = [], comments = [];
  const collect = new Function('state', 'window', 'log', `${helper}\n${collector}\nreturn collectEndpointHoney`)(
    state, { GAMEROAD_PARTNER_COMMENT: { emit: value => comments.push(value) } }, value => logs.push(value),
  );
  return { player, state, collect, logs, comments };
}

test('live endpoint pickup credits all Honey to the player without waking Mana', () => {
  const x = honeyLiveCase();
  const receipt = x.collect(x.player);
  assert.equal(x.player.honey, 5);
  assert.equal(x.player.manaCurrent, 4);
  assert.deepEqual(receipt, { status: 'collected-all', count: 3, honeyBefore: 2, honeyGained: 3, honeyAfter: 5 });
  assert.equal(x.state.match.honey.byNode[x.player.position], 0);
  assert.deepEqual(projectBattleCriticalResourceHudInput({ player: x.player }), { manaCurrent: 4, manaMax: 10, honey: 5, chipCount: 0 });
  assert.match(x.logs[0], /所持ハニー5個/);
  assert.doesNotMatch(x.logs[0], /マナ/);
  assert.equal(x.comments.length, 1);
  assert.equal(x.comments[0].count, 3);
});

test('live Honey receipt prevents a duplicate pickup but permits newly generated Honey next round', () => {
  const x = honeyLiveCase({ count: 9 });
  x.collect(x.player);
  assert.equal(x.player.honey, 11);
  assert.deepEqual(x.collect(x.player), { status: 'duplicate', count: 0 });
  assert.equal(x.player.honey, 11);
  assert.equal(x.comments.length, 1);
  x.state.match.round++;
  x.state.match.honey.byNode[x.player.position] = 4;
  assert.equal(x.collect(x.player).honeyAfter, 15);
  assert.equal(x.player.manaCurrent, 4);
  assert.equal(x.comments.length, 2);
});

test('full Mana never caps or discards a live Honey pickup', () => {
  const x = honeyLiveCase({ count: 11, honey: 0, mana: 10 });
  x.collect(x.player);
  assert.equal(x.player.honey, 11);
  assert.equal(x.player.manaCurrent, 10);
});

test('empty endpoint and non-Honey matches preserve resources and emit no reward', () => {
  for (const options of [{ count: 0 }, { count: 3, contentId: 'road_shield' }]) {
    const x = honeyLiveCase(options);
    const before = structuredClone(x.player);
    x.collect(x.player);
    assert.deepEqual(x.player, before);
    assert.equal(x.logs.length, 0);
    assert.equal(x.comments.length, 0);
  }
});

test('retained Setup copy branch describes Honey inventory and no Mana recovery when mounted', () => {
  const source = honeyLiveHtml.match(/setText\('#contentNote',[^\n]*?\)/)?.[0];
  assert.ok(source, 'existing content explanation must be present');
  const notes = [];
  new Function('setText', 'state', source)((selector, value) => notes.push(value), { setupContent: 'honey_hunt' });
  assert.match(notes[0], /所持ハニー/);
  assert.match(notes[0], /マナは回復しません/);
});

test('existing live Honey meter distinguishes carried stock from board stock', () => {
  const source = honeyLiveHtml.match(/hm\.textContent=`[^`]+`/)?.[0];
  assert.ok(source, 'existing Honey meter renderer must be present');
  const render = new Function('hm', 'me', 'boardHoney', source);
  const meter = { textContent: '' };
  render(meter, { honey: 5 }, 7);
  assert.equal(meter.textContent, 'ハニー5／盤面7');
  render(meter, { honey: 0 }, 0);
  assert.equal(meter.textContent, 'ハニー0／盤面0');
});

test('live startup field exports resolve to declared functions after the Honey helper changes', () => {
  const start = honeyLiveHtml.indexOf('window.__V106_FIELD_TEST__={');
  const end = honeyLiveHtml.indexOf('honeySourceContract:', start);
  assert.ok(start >= 0 && end > start);
  const names = honeyLiveHtml.slice(start + 'window.__V106_FIELD_TEST__={'.length, end).split(',').filter(Boolean);
  const declared = new Set([...honeyLiveHtml.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)].map(match => match[1]));
  for (const name of names) assert.ok(declared.has(name), `startup references undeclared function ${name}`);
});

test('projects only explicit caller numeric Mana, Honey and Chip count', () => {
  const player = {
    id: 'P1',
    human: true,
    manaCurrent: 7,
    manaMax: 10,
    mana: ['legacy-physical-mana-card'],
    honey: 7,
    chip: ['CARD-A', 'CARD-B', 'SECRET-CARD-ID'],
  };

  const snapshot = projectBattleCriticalResourceHudInput({ player });
  assert.deepEqual(snapshot, { manaCurrent: 7, manaMax: 10, honey: 7, chipCount: 3 });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(JSON.stringify(snapshot).includes('legacy-physical-mana-card'), false);
  assert.equal(JSON.stringify(snapshot).includes('CARD-A'), false);
  assert.equal(JSON.stringify(snapshot).includes('SECRET-CARD-ID'), false);
});

test('zero resources remain resolved values', () => {
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player: { manaCurrent: 0, manaMax: 10, honey: 0, chip: [] } }),
    { manaCurrent: 0, manaMax: 10, honey: 0, chipCount: 0 },
  );
});

test('invalid or absent caller facts fail closed without choosing another player', () => {
  assert.deepEqual(projectBattleCriticalResourceHudInput(), { manaCurrent: null, manaMax: null, honey: null, chipCount: null });
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player: { manaCurrent: 11, manaMax: 10, honey: -1, chip: 'not-an-array' } }),
    { manaCurrent: null, manaMax: null, honey: null, chipCount: null },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player: { manaCurrent: 7, manaMax: 10, honey: 2.5, chip: [] } }),
    { manaCurrent: 7, manaMax: 10, honey: null, chipCount: 0 },
  );
});

test('optional Honey delta is forwarded only as a complete caller pair', () => {
  const player = { manaCurrent: 6, manaMax: 10, honey: 8, chip: ['CARD-A'] };
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({
      player,
      honeyDelta: 2,
      honeyDeltaSource: '  順位2位  ',
    }),
    { manaCurrent: 6, manaMax: 10, honey: 8, chipCount: 1, honeyDelta: 2, honeyDeltaSource: '順位2位' },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player, honeyDelta: 2 }),
    { manaCurrent: 6, manaMax: 10, honey: 8, chipCount: 1 },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player, honeyDeltaSource: '順位2位' }),
    { manaCurrent: 6, manaMax: 10, honey: 8, chipCount: 1 },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player, honeyDelta: 0, honeyDeltaSource: '開始時' }),
    { manaCurrent: 6, manaMax: 10, honey: 8, chipCount: 1, honeyDelta: 0, honeyDeltaSource: '開始時' },
  );
});

test('forwards only a complete current Mana-first then Honey payment receipt', () => {
  const player = { manaCurrent: 0, manaMax: 10, honey: 5, chip: ['CARD-A'] };
  const paymentReceipt = {
    cost: 6,
    manaPaid: 4,
    honeyPaid: 2,
    manaAfter: 0,
    honeyAfter: 5,
    source: '  戦闘札6  ',
    hiddenCardId: 'DO-NOT-PROJECT',
  };
  const snapshot = projectBattleCriticalResourceHudInput({ player, paymentReceipt });
  assert.deepEqual(snapshot, {
    manaCurrent: 0,
    manaMax: 10,
    honey: 5,
    chipCount: 1,
    paymentReceipt: {
      cost: 6,
      manaPaid: 4,
      honeyPaid: 2,
      manaAfter: 0,
      honeyAfter: 5,
      source: '戦闘札6',
    },
  });
  assert.equal(JSON.stringify(snapshot).includes('DO-NOT-PROJECT'), false);
  assert.equal(Object.isFrozen(snapshot.paymentReceipt), true);
});

test('drops partial, inconsistent, non-Mana-first, or stale payment receipts', () => {
  const player = { manaCurrent: 0, manaMax: 10, honey: 5, chip: [] };
  for (const paymentReceipt of [
    { cost: 6, manaPaid: 4, honeyPaid: 2, manaAfter: 0, honeyAfter: 5 },
    { cost: 7, manaPaid: 4, honeyPaid: 2, manaAfter: 0, honeyAfter: 5, source: '戦闘札6' },
    { cost: 6, manaPaid: 4, honeyPaid: 2, manaAfter: 1, honeyAfter: 5, source: '戦闘札6' },
    { cost: 6, manaPaid: 4, honeyPaid: 2, manaAfter: 0, honeyAfter: 4, source: '戦闘札6' },
  ]) {
    assert.deepEqual(
      projectBattleCriticalResourceHudInput({ player, paymentReceipt }),
      { manaCurrent: 0, manaMax: 10, honey: 5, chipCount: 0 },
    );
  }
});

test('dedicated sync helper calls only caller resourceHud.sync exactly once', () => {
  const calls = [];
  const result = Object.freeze({ ok: true, source: 'resourceHud.sync' });
  const resourceHud = {
    sync(snapshot) {
      calls.push(snapshot);
      return result;
    },
  };
  const screenRuntime = {
    resourceHud,
    renderHud() {
      throw new Error('generic renderHud must not be used');
    },
  };

  const actual = syncBattleCriticalResourceHudFromPlayer({
    resourceHud: screenRuntime.resourceHud,
    player: { manaCurrent: 0, manaMax: 10, honey: 5, chip: ['A', 'B'] },
    honeyDelta: 1,
    honeyDeltaSource: '順位1位',
    paymentReceipt: {
      cost: 6,
      manaPaid: 4,
      honeyPaid: 2,
      manaAfter: 0,
      honeyAfter: 5,
      source: '戦闘札6',
    },
  });

  assert.equal(actual, result);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    manaCurrent: 0,
    manaMax: 10,
    honey: 5,
    chipCount: 2,
    honeyDelta: 1,
    honeyDeltaSource: '順位1位',
    paymentReceipt: {
      cost: 6,
      manaPaid: 4,
      honeyPaid: 2,
      manaAfter: 0,
      honeyAfter: 5,
      source: '戦闘札6',
    },
  });
  assert.equal(Object.isFrozen(calls[0]), true);
});

test('dedicated sync helper fails closed without a caller-owned resource HUD', () => {
  assert.throws(
    () => syncBattleCriticalResourceHudFromPlayer({ player: { manaCurrent: 7, manaMax: 10, honey: 1, chip: [] } }),
    /BATTLE_RESOURCE_HUD_SYNC_REQUIRED/,
  );
  assert.throws(
    () => syncBattleCriticalResourceHudFromPlayer({ resourceHud: {}, player: { manaCurrent: 7, manaMax: 10, honey: 1, chip: [] } }),
    /BATTLE_RESOURCE_HUD_SYNC_REQUIRED/,
  );
});

test('adapter contract owns no gameplay or resource authority', () => {
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_SCHEMA, 'gameroad.battle-critical-resource-hud-live-adapter.v1');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.presentationOnly, true);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.playerSelectionAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.resourceCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.resourceStoreAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.source.physicalManaCardIdentity, 'NOT_PROJECTED');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.source.paymentReceipt, 'EXPLICIT_CALLER_OPTIONAL_ATOMIC');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.chipIdentityProjection, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.rankCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.paymentCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.paymentChoiceAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.genericHudRenderUsed, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.directSyncTarget, 'CALLER_OWNED_RESOURCE_HUD.sync');
});
