export const BATTLE_JANKEN_INPUT_MODE_SETTING_SCHEMA =
  'gameroad.battle-janken-input-mode-setting.v1';
export const BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY =
  'gameroad.battle.janken.inputMode.v1';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function resolveStorage(explicitStorage) {
  if (explicitStorage !== undefined) return explicitStorage;
  try {
    return globalThis?.localStorage ?? null;
  } catch {
    return null;
  }
}

function usableStorage(storage) {
  return !!storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function';
}

function normalizeModeAuthority(authority) {
  const modes = authority?.modes;
  const normalize = authority?.normalize;
  const projectOptions = authority?.projectOptions;
  if (!modes || typeof modes !== 'object'
    || typeof normalize !== 'function'
    || typeof projectOptions !== 'function') {
    throw new TypeError('battle janken input-mode authority is required');
  }
  const values = [modes.CARD_PULL, modes.LAUNCHER, modes.PLAIN];
  if (values.some((value) => typeof value !== 'string' || !value.trim())
    || new Set(values).size !== values.length) {
    throw new TypeError('battle janken input-mode authority must expose the existing three modes');
  }
  return Object.freeze({ modes, normalize, projectOptions, values: Object.freeze(values) });
}

export function createBattleJankenInputModeSetting({
  storage,
  storageKey = BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY,
  defaultMode,
  modeAuthority,
} = {}) {
  const authority = normalizeModeAuthority(modeAuthority);
  const launcher = authority.modes.LAUNCHER;
  const fallbackMode = authority.normalize(defaultMode ?? launcher, launcher);
  const modeValues = new Set(authority.values);
  const key = typeof storageKey === 'string' && storageKey.trim()
    ? storageKey.trim()
    : BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY;
  const backing = resolveStorage(storage);
  let storageHealthy = usableStorage(backing);
  let memoryMode = fallbackMode;
  let lastPersistence = storageHealthy ? 'STORAGE_READY' : 'MEMORY_ONLY';

  function persist(mode) {
    if (!storageHealthy) {
      lastPersistence = 'MEMORY_ONLY';
      return false;
    }
    try {
      backing.setItem(key, mode);
      lastPersistence = 'STORAGE';
      return true;
    } catch {
      storageHealthy = false;
      lastPersistence = 'MEMORY_ONLY';
      return false;
    }
  }

  function snapshot(source = 'MEMORY') {
    return freeze({
      schema: BATTLE_JANKEN_INPUT_MODE_SETTING_SCHEMA,
      mode: memoryMode,
      options: authority.projectOptions(memoryMode),
      source,
      storageKey: key,
      persistence: lastPersistence,
      storageHealthy,
      presentationPreferenceOnly: true,
      gameplayAuthority: false,
      cardIdentityAuthority: false,
      targetAuthority: false,
      orderAuthority: false,
      winnerAuthority: false,
      gameStateWrite: false,
    });
  }

  function read() {
    if (!storageHealthy) return snapshot('MEMORY');
    let raw = null;
    try {
      raw = backing.getItem(key);
    } catch {
      storageHealthy = false;
      lastPersistence = 'MEMORY_ONLY';
      return snapshot('MEMORY_AFTER_READ_FAILURE');
    }

    const valid = typeof raw === 'string' && modeValues.has(raw.trim());
    memoryMode = valid ? authority.normalize(raw, fallbackMode) : fallbackMode;

    if (!valid) {
      const repaired = persist(memoryMode);
      return snapshot(repaired ? 'DEFAULT_REPAIRED' : 'MEMORY_DEFAULT');
    }
    lastPersistence = 'STORAGE';
    return snapshot('STORAGE');
  }

  function write(nextMode) {
    memoryMode = authority.normalize(nextMode, fallbackMode);
    const persisted = persist(memoryMode);
    return snapshot(persisted ? 'SETTING_WRITE' : 'MEMORY_WRITE');
  }

  return Object.freeze({
    schema: BATTLE_JANKEN_INPUT_MODE_SETTING_SCHEMA,
    read,
    write,
    snapshot: () => snapshot('MEMORY'),
  });
}

export const BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT = freeze({
  schema: BATTLE_JANKEN_INPUT_MODE_SETTING_SCHEMA,
  reusesModeAuthority: 'battle-janken-slidepad-runtime-mount.mjs',
  modeAuthorityInjectionRequired: true,
  persistenceFailurePolicy: 'FAIL_SOFT_TO_MEMORY',
  invalidOrMissingStoredValuePolicy: 'REPAIR_TO_INJECTED_DEFAULT_WHEN_STORAGE_WRITABLE',
  presentationPreferenceOnly: true,
  gameplayAuthority: false,
  cardIdentityAuthority: false,
  targetAuthority: false,
  orderAuthority: false,
  winnerAuthority: false,
  gameStateWrite: false,
});
