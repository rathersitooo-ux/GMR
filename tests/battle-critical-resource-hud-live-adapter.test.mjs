import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT,
  BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_SCHEMA,
  projectBattleCriticalResourceHudInput,
  syncBattleCriticalResourceHudFromPlayer,
} from '../browser/battle-critical-resource-hud-live-adapter.mjs';

test('projects only explicit caller player Honey and Chip count', () => {
  const player = {
    id: 'P1',
    human: true,
    honey: 7,
    chip: ['CARD-A', 'CARD-B', 'SECRET-CARD-ID'],
  };

  const snapshot = projectBattleCriticalResourceHudInput({ player });
  assert.deepEqual(snapshot, { honey: 7, chipCount: 3 });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(JSON.stringify(snapshot).includes('CARD-A'), false);
  assert.equal(JSON.stringify(snapshot).includes('SECRET-CARD-ID'), false);
});

test('zero resources remain resolved values', () => {
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player: { honey: 0, chip: [] } }),
    { honey: 0, chipCount: 0 },
  );
});

test('invalid or absent caller facts fail closed without choosing another player', () => {
  assert.deepEqual(projectBattleCriticalResourceHudInput(), { honey: null, chipCount: null });
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player: { honey: -1, chip: 'not-an-array' } }),
    { honey: null, chipCount: null },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player: { honey: 2.5, chip: [] } }),
    { honey: null, chipCount: 0 },
  );
});

test('optional Honey delta is forwarded only as a complete caller pair', () => {
  const player = { honey: 8, chip: ['CARD-A'] };
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({
      player,
      honeyDelta: 2,
      honeyDeltaSource: '  順位2位  ',
    }),
    { honey: 8, chipCount: 1, honeyDelta: 2, honeyDeltaSource: '順位2位' },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player, honeyDelta: 2 }),
    { honey: 8, chipCount: 1 },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player, honeyDeltaSource: '順位2位' }),
    { honey: 8, chipCount: 1 },
  );
  assert.deepEqual(
    projectBattleCriticalResourceHudInput({ player, honeyDelta: 0, honeyDeltaSource: '開始時' }),
    { honey: 8, chipCount: 1, honeyDelta: 0, honeyDeltaSource: '開始時' },
  );
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
    player: { honey: 11, chip: ['A', 'B'] },
    honeyDelta: 1,
    honeyDeltaSource: '順位1位',
  });

  assert.equal(actual, result);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    honey: 11,
    chipCount: 2,
    honeyDelta: 1,
    honeyDeltaSource: '順位1位',
  });
  assert.equal(Object.isFrozen(calls[0]), true);
});

test('dedicated sync helper fails closed without a caller-owned resource HUD', () => {
  assert.throws(
    () => syncBattleCriticalResourceHudFromPlayer({ player: { honey: 1, chip: [] } }),
    /BATTLE_RESOURCE_HUD_SYNC_REQUIRED/,
  );
  assert.throws(
    () => syncBattleCriticalResourceHudFromPlayer({ resourceHud: {}, player: { honey: 1, chip: [] } }),
    /BATTLE_RESOURCE_HUD_SYNC_REQUIRED/,
  );
});

test('adapter contract owns no gameplay or resource authority', () => {
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_SCHEMA, 'gameroad.battle-critical-resource-hud-live-adapter.v1');
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.presentationOnly, true);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.playerSelectionAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.resourceCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.resourceStoreAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.chipIdentityProjection, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.rankCalculationAuthority, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.genericHudRenderUsed, false);
  assert.equal(BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT.directSyncTarget, 'CALLER_OWNED_RESOURCE_HUD.sync');
});
