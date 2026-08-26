function cloneDeck(savedDeck = {}) {
  return {
    main: Array.isArray(savedDeck.main) ? [...savedDeck.main] : [],
    ex: Array.isArray(savedDeck.ex) ? [...savedDeck.ex] : [],
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createBattleStartSnapshot(state, { validateDeck } = {}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('MATCH_START_STATE_REQUIRED');
  }
  if (typeof validateDeck !== 'function') {
    throw new TypeError('MATCH_START_VALIDATE_DECK_REQUIRED');
  }

  const deck = cloneDeck(state.savedDeck);
  const validation = validateDeck(deck, { forBattle: true });
  if (!validation || validation.ok !== true) {
    const reason = validation?.reason ?? validation?.errors?.[0] ?? 'INVALID_DECK';
    throw new Error(`MATCH_START_DECK_INVALID:${reason}`);
  }

  if (!nonEmptyString(state.setupMode) || !nonEmptyString(state.setupContent)) {
    throw new Error('MATCH_START_SETUP_REQUIRED');
  }

  const rule = state.savedDeckRule && typeof state.savedDeckRule === 'object'
    ? state.savedDeckRule
    : {};

  return deepFreeze({
    schema: 'gameroad.browser.match-start-snapshot.v1',
    deck: {
      main: deck.main,
      ex: deck.ex,
      ruleId: rule.id ?? null,
      ruleRevision: rule.revision ?? null,
    },
    setup: {
      mode: state.setupMode,
      content: state.setupContent,
    },
    selection: {
      playerCharacterId: state.playerCharacterId ?? null,
      selectedPartnerId: state.selectedPartnerId ?? null,
    },
  });
}

export function createLobbyDeckBattleConnection({ getState, validateDeck, startMatch } = {}) {
  if (typeof getState !== 'function') throw new TypeError('MATCH_START_GET_STATE_REQUIRED');
  if (typeof validateDeck !== 'function') throw new TypeError('MATCH_START_VALIDATE_DECK_REQUIRED');
  if (typeof startMatch !== 'function') throw new TypeError('MATCH_START_EXECUTOR_REQUIRED');

  return Object.freeze({
    snapshot() {
      return createBattleStartSnapshot(getState(), { validateDeck });
    },
    start() {
      const snapshot = createBattleStartSnapshot(getState(), { validateDeck });
      startMatch(snapshot);
      return snapshot;
    },
  });
}
