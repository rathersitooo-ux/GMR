const CANONICAL_FIELDS = Object.freeze(new Set([
  'currentPath',
  'focusedRoadCard',
  'boardVersion',
]));

const DERIVED_FIELDS = Object.freeze(new Set([
  'compatibleRoadCards',
  'validity',
]));

function pathOf(value) {
  if (!Array.isArray(value)) throw new TypeError('CURRENT_PATH_INVALID');
  return Object.freeze([...value]);
}

function canonicalOf(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('DRAFT_MOVE_INVALID');
  }
  return {
    currentPath: pathOf(value.currentPath ?? []),
    focusedRoadCard: value.focusedRoadCard ?? null,
    boardVersion: value.boardVersion ?? null,
  };
}

function contextOf(context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new TypeError('DRAFT_MOVE_CONTEXT_INVALID');
  }
  if (typeof context.deriveCompatibleRoadCards !== 'function') {
    throw new TypeError('COMPATIBLE_DERIVER_REQUIRED');
  }
  if (context.deriveValidity != null && typeof context.deriveValidity !== 'function') {
    throw new TypeError('VALIDITY_DERIVER_INVALID');
  }
  if (context.handRoadCards != null && !Array.isArray(context.handRoadCards)) {
    throw new TypeError('HAND_ROAD_CARDS_INVALID');
  }
  return {
    handRoadCards: Object.freeze([...(context.handRoadCards ?? [])]),
    boardState: context.boardState ?? null,
    deriveCompatibleRoadCards: context.deriveCompatibleRoadCards,
    deriveValidity: context.deriveValidity ?? null,
  };
}

function freezeValidity(value) {
  if (Array.isArray(value)) return Object.freeze([...value]);
  if (value && typeof value === 'object') return Object.freeze({ ...value });
  return value;
}

function reconcile(canonical, rawContext) {
  const context = contextOf(rawContext);
  const derivationInput = Object.freeze({
    currentPath: canonical.currentPath,
    focusedRoadCard: canonical.focusedRoadCard,
    boardVersion: canonical.boardVersion,
    handRoadCards: context.handRoadCards,
    boardState: context.boardState,
  });

  const compatibleRoadCards = context.deriveCompatibleRoadCards(derivationInput);
  if (!Array.isArray(compatibleRoadCards)) {
    throw new TypeError('COMPATIBLE_ROAD_CARDS_INVALID');
  }
  const frozenCompatibleRoadCards = Object.freeze([...compatibleRoadCards]);
  const validity = context.deriveValidity
    ? context.deriveValidity(Object.freeze({
        ...derivationInput,
        compatibleRoadCards: frozenCompatibleRoadCards,
      }))
    : null;

  return Object.freeze({
    currentPath: canonical.currentPath,
    focusedRoadCard: canonical.focusedRoadCard,
    compatibleRoadCards: frozenCompatibleRoadCards,
    boardVersion: canonical.boardVersion,
    validity: freezeValidity(validity),
  });
}

function assertPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError('DRAFT_MOVE_PATCH_INVALID');
  }
  for (const key of Object.keys(patch)) {
    if (DERIVED_FIELDS.has(key)) throw new TypeError('DERIVED_FIELD_WRITE_FORBIDDEN');
    if (!CANONICAL_FIELDS.has(key)) throw new TypeError('DRAFT_MOVE_FIELD_INVALID');
  }
}

export function createDraftMove(initial = {}, context) {
  return reconcile(canonicalOf(initial), context);
}

export function updateDraftMove(draft, patch, context) {
  assertPatch(patch);
  const current = canonicalOf(draft);
  const next = {
    currentPath: Object.prototype.hasOwnProperty.call(patch, 'currentPath')
      ? pathOf(patch.currentPath)
      : current.currentPath,
    focusedRoadCard: Object.prototype.hasOwnProperty.call(patch, 'focusedRoadCard')
      ? (patch.focusedRoadCard ?? null)
      : current.focusedRoadCard,
    boardVersion: Object.prototype.hasOwnProperty.call(patch, 'boardVersion')
      ? (patch.boardVersion ?? null)
      : current.boardVersion,
  };
  return reconcile(next, context);
}
