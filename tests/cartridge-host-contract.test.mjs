import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARTRIDGE_CAPABILITIES,
  CARTRIDGE_HOST_API_VERSION,
  cartridgeHostContractSnapshot,
  isKnownCartridgeCapability,
  validateCartridgeHostCompatibility,
} from '../browser/cartridge-host-contract.mjs';

test('host compatibility is exact, not implicit forward compatibility', () => {
  assert.equal(validateCartridgeHostCompatibility(CARTRIDGE_HOST_API_VERSION).compatible, true);
  assert.deepEqual(validateCartridgeHostCompatibility('gameroad.cartridge-host.v2'), {
    compatible: false,
    requestedHostApi: 'gameroad.cartridge-host.v2',
    supportedHostApi: CARTRIDGE_HOST_API_VERSION,
    reason: 'host_api_mismatch',
  });
});

test('host exposes only the bounded Wave A capability vocabulary', () => {
  assert.equal(isKnownCartridgeCapability('storage.local'), true);
  assert.equal(isKnownCartridgeCapability('gameroad.economy.write'), false);
  assert.equal(isKnownCartridgeCapability('gameroad.battle.write'), false);
  assert.equal(new Set(CARTRIDGE_CAPABILITIES).size, CARTRIDGE_CAPABILITIES.length);
});

test('contract snapshot is deeply immutable and says declarations are requests only', () => {
  const snapshot = cartridgeHostContractSnapshot();
  assert.equal(snapshot.policy.manifestCapabilityIsRequestOnly, true);
  assert.equal(snapshot.policy.implicitCapabilityGrantAllowed, false);
  assert.equal(snapshot.policy.productionMountProvidedByWaveA, false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.policy), true);
  assert.equal(Object.isFrozen(snapshot.capabilities), true);
});
