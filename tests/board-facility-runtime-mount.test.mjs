import test from 'node:test';
import assert from 'node:assert/strict';

import { mountBoardFacilityRuntime } from '../browser/board-facility-runtime-mount.mjs';

test('fails closed when the classic bridge is missing', async () => {
  await assert.rejects(
    () => mountBoardFacilityRuntime({}),
    /BOARD_FACILITY_CLASSIC_BRIDGE_MISSING/,
  );
});

test('waits for bridge.ready before crossing the synchronous proxy', async () => {
  let releaseReady;
  let readyResolved = false;
  let syncReads = 0;
  const ready = new Promise(resolve => {
    releaseReady = () => {
      readyResolved = true;
      resolve();
    };
  });
  const contract = Object.freeze({ version: 'fixture.contract.v1' });
  const bridge = { ready };
  Object.defineProperty(bridge, 'BOARD_FACILITY_STATE_CORE', {
    enumerable: true,
    get() {
      syncReads += 1;
      if (!readyResolved) throw new Error('SYNC_PROXY_READ_BEFORE_READY');
      return contract;
    },
  });
  const global = { GAMEROAD_BOARD_FACILITY_STATE_CORE: bridge };

  const mounting = mountBoardFacilityRuntime(global);
  await Promise.resolve();
  assert.equal(syncReads, 0);

  releaseReady();
  const runtime = await mounting;

  assert.equal(syncReads, 1);
  assert.equal(runtime.bridge, bridge);
  assert.equal(runtime.contract, contract);
  assert.equal(global.GAMEROAD_BOARD_FACILITY_RUNTIME, runtime);
  assert.equal(Object.isFrozen(runtime), true);

  const second = await mountBoardFacilityRuntime(global);
  assert.equal(second, runtime);
});

test('rejects an incompatible occupied runtime global', async () => {
  const contract = Object.freeze({ version: 'fixture.contract.v1' });
  const bridge = {
    ready: Promise.resolve(),
    get BOARD_FACILITY_STATE_CORE() {
      return contract;
    },
  };
  const global = {
    GAMEROAD_BOARD_FACILITY_STATE_CORE: bridge,
    GAMEROAD_BOARD_FACILITY_RUNTIME: Object.freeze({ version: 'foreign.runtime' }),
  };

  await assert.rejects(
    () => mountBoardFacilityRuntime(global),
    /BOARD_FACILITY_RUNTIME_GLOBAL_COLLISION/,
  );
});
