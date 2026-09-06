function fail(message) {
  throw new TypeError(message);
}

function requirePlayerId(playerId) {
  if (typeof playerId !== 'string' || playerId.length === 0) {
    fail('playerId must be a non-empty string');
  }
  return playerId;
}

function requireLoadNumber(loadNumber) {
  if (typeof loadNumber !== 'number' || !Number.isFinite(loadNumber)) {
    fail('loadNumber must be a finite number');
  }
  return loadNumber;
}

function normalizeAscendingSelections(orderedSelections) {
  if (!Array.isArray(orderedSelections)) fail('orderedSelections must be an array');
  if (orderedSelections.length !== 4) fail('orderedSelections must contain exactly four Load selections');

  const seen = new Set();
  let previousLoadNumber = -Infinity;
  return orderedSelections.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('selection must be an object');
    const playerId = requirePlayerId(entry.playerId);
    if (seen.has(playerId)) fail(`duplicate playerId: ${playerId}`);
    seen.add(playerId);
    const loadNumber = requireLoadNumber(entry.loadNumber);
    if (loadNumber < previousLoadNumber) {
      fail('orderedSelections must already be in authoritative ascending Load-number order');
    }
    previousLoadNumber = loadNumber;
    return Object.freeze({ ...entry, playerId, loadNumber });
  });
}

/**
 * Applies the current attacker privilege before FIRST_WIN_LOCK janken resolution.
 *
 * The caller remains authoritative for Load reveal timing and for ordering equal
 * Load numbers. This function accepts an already-authoritatively-ordered set of
 * four revealed selections and deliberately never invents an equal-value tie
 * breaker.
 *
 * When the largest Load number is unique, that last card immediately earns the
 * local attacker win presentation and is removed from the later janken pool.
 * The remaining three cards retain their exact supplied order and can be passed
 * unchanged to resolveCyclicTriadByProcessingOrder.
 *
 * When the largest Load number is tied, no attacker is invented. The complete
 * four-card ordered set is returned for the existing legacy path until a formal
 * equal-max attacker authority exists.
 */
export function applyUniqueMaxLoadAttackerPrivilege(orderedSelections) {
  const normalized = normalizeAscendingSelections(orderedSelections);
  const maxLoadNumber = normalized.at(-1).loadNumber;
  const maxEntries = normalized.filter((entry) => entry.loadNumber === maxLoadNumber);

  if (maxEntries.length !== 1) {
    return Object.freeze({
      status: 'MAX_TIE_LEGACY_FALLBACK',
      attacker: null,
      attackerPlayerId: null,
      attackerOutcome: null,
      presentationCue: null,
      matchTerminal: false,
      attackerExcludedFromJanken: false,
      maxLoadNumber,
      tiedMaxPlayerIds: Object.freeze(maxEntries.map((entry) => entry.playerId)),
      jankenSelections: Object.freeze(normalized),
    });
  }

  const attacker = maxEntries[0];
  return Object.freeze({
    status: 'ATTACKER_SELECTED',
    attacker,
    attackerPlayerId: attacker.playerId,
    attackerOutcome: 'LOCAL_WIN',
    presentationCue: 'ATTACKER_WIN',
    matchTerminal: false,
    attackerExcludedFromJanken: true,
    maxLoadNumber,
    tiedMaxPlayerIds: Object.freeze([]),
    jankenSelections: Object.freeze(normalized.slice(0, -1)),
  });
}
