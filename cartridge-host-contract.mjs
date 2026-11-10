export const CARTRIDGE_HOST_API_VERSION = 'gameroad.cartridge-host.v1';
export const CARTRIDGE_MANIFEST_SCHEMA_VERSION = 'gameroad.cartridge-manifest.v1';

export const CARTRIDGE_LIFECYCLE_STATES = Object.freeze([
  'catalog',
  'installed',
  'mounted',
]);

export const CARTRIDGE_CAPABILITIES = Object.freeze([
  'ui.surface',
  'input.pointer',
  'input.keyboard',
  'audio.playback',
  'storage.local',
  'gameroad.cards.read',
  'gameroad.activity.report',
]);

const CAPABILITY_SET = new Set(CARTRIDGE_CAPABILITIES);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function isKnownCartridgeCapability(value) {
  return typeof value === 'string' && CAPABILITY_SET.has(value);
}

export function validateCartridgeHostCompatibility(hostApi) {
  const requested = typeof hostApi === 'string' ? hostApi : '';
  const compatible = requested === CARTRIDGE_HOST_API_VERSION;
  return deepFreeze({
    compatible,
    requestedHostApi: requested || null,
    supportedHostApi: CARTRIDGE_HOST_API_VERSION,
    reason: compatible ? 'exact_host_api_match' : 'host_api_mismatch',
  });
}

export function assertCartridgeHostCompatibility(hostApi) {
  const result = validateCartridgeHostCompatibility(hostApi);
  if (!result.compatible) throw new Error('CARTRIDGE_HOST_API_INCOMPATIBLE');
  return result;
}

export function cartridgeHostContractSnapshot() {
  return deepFreeze({
    hostApi: CARTRIDGE_HOST_API_VERSION,
    manifestSchema: CARTRIDGE_MANIFEST_SCHEMA_VERSION,
    lifecycleStates: [...CARTRIDGE_LIFECYCLE_STATES],
    capabilities: [...CARTRIDGE_CAPABILITIES],
    policy: {
      exactHostApiMatchRequired: true,
      manifestCapabilityIsRequestOnly: true,
      implicitCapabilityGrantAllowed: false,
      gameContentSchemaOwnedByHost: false,
      productionMountProvidedByWaveA: false,
    },
  });
}
