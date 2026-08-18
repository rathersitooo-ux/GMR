const CLASSIC_BRIDGE_NAME = 'GAMEROAD_BOARD_FACILITY_STATE_CORE';
const RUNTIME_NAME = 'GAMEROAD_BOARD_FACILITY_RUNTIME';
const RUNTIME_VERSION = 'gameroad.board-facility-runtime-mount.v1';

function requireObject(value, code) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new Error(code);
  }
  return value;
}

export async function mountBoardFacilityRuntime(global = globalThis) {
  requireObject(global, 'BOARD_FACILITY_RUNTIME_GLOBAL_REQUIRED');

  const bridge = requireObject(
    global[CLASSIC_BRIDGE_NAME],
    'BOARD_FACILITY_CLASSIC_BRIDGE_MISSING',
  );
  if (!bridge.ready || typeof bridge.ready.then !== 'function') {
    throw new Error('BOARD_FACILITY_CLASSIC_READY_PROMISE_REQUIRED');
  }

  await bridge.ready;

  // Intentionally cross the synchronous proxy only after ready resolves.
  // This is the production host seam promised by the R20 classic bridge.
  const contract = requireObject(
    bridge.BOARD_FACILITY_STATE_CORE,
    'BOARD_FACILITY_SYNC_PROXY_UNAVAILABLE',
  );

  const existing = global[RUNTIME_NAME];
  if (existing) {
    if (
      existing.version === RUNTIME_VERSION &&
      existing.bridge === bridge &&
      existing.contract === contract
    ) {
      return existing;
    }
    throw new Error('BOARD_FACILITY_RUNTIME_GLOBAL_COLLISION');
  }

  const runtime = Object.freeze({
    version: RUNTIME_VERSION,
    bridge,
    contract,
  });

  Object.defineProperty(global, RUNTIME_NAME, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: runtime,
  });

  return runtime;
}

export const BOARD_FACILITY_RUNTIME_MOUNT = Object.freeze({
  classicBridgeName: CLASSIC_BRIDGE_NAME,
  runtimeName: RUNTIME_NAME,
  version: RUNTIME_VERSION,
  mount: mountBoardFacilityRuntime,
});
