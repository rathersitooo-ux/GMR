import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as directCore from '../browser/board-facility-state-core.mjs';
import '../browser/board-facility-state-core.classic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const bridge = globalThis.GAMEROAD_BOARD_FACILITY_STATE_CORE;

function stableJson(value) {
  return JSON.stringify(value);
}

test('classic bridge is generated from the current ESM export surface', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-board-facility-classic.mjs'), '--check'], {
    cwd: ROOT,
    stdio: 'pipe',
  });
  assert.ok(bridge);
  assert.equal(bridge.bridgeVersion, 'gameroad.board-facility-classic-bridge.v1');
  assert.deepEqual([...bridge.expectedExports].sort(), Object.keys(directCore).sort());
  assert.equal(Object.isFrozen(bridge), true);
});

test('classic bridge becomes synchronously callable after ready without duplicating facility logic', async () => {
  const readyValue = await bridge.ready;
  assert.equal(readyValue, bridge);
  assert.equal(bridge.isReady(), true);
  assert.equal(bridge.BOARD_FACILITY_STATE_CORE.schema, directCore.BOARD_FACILITY_STATE_CORE.schema);

  const input = {
    playerId: 'p1',
    round: 4,
    honey: 10,
    permanent: { unlockIds: ['unlock-a'] },
    cards: [{ id: 'card-a', ownerId: 'p1' }],
    reservations: {},
    shopCatalogRevision: 'shop-r7',
    shopProducts: {
      itemA: { cost: 3, grantCard: { id: 'shop-card-a', ownerId: 'p1' } },
    },
    arenaCatalogRevision: 'arena-r9',
  };

  const directState = directCore.createBoardFacilityState(input);
  const bridgedState = bridge.createBoardFacilityState(input);
  assert.equal(stableJson(bridgedState), stableJson(directState));

  const request = { requestId: 'shop-req-1', catalogRevision: 'shop-r7', productId: 'itemA' };
  const directPurchase = directCore.purchaseShopProduct(directState, request);
  const bridgedPurchase = bridge.purchaseShopProduct(bridgedState, request);
  assert.equal(stableJson(bridgedPurchase), stableJson(directPurchase));
});
