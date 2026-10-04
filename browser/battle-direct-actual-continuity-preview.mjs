const SCHEMA = 'gameroad.battle-direct-actual-continuity-preview.v1';

export const BATTLE_PRESENTATION_STATES = Object.freeze({
  BOARD: 'BOARD',
  CONTEXT_OVERLAY: 'CONTEXT_OVERLAY',
  BATTLE_SCENE: 'BATTLE_SCENE'
});

const STATE_SET = new Set(Object.values(BATTLE_PRESENTATION_STATES));

const ALLOWED_TRANSITIONS = Object.freeze({
  BOARD: Object.freeze(['CONTEXT_OVERLAY', 'BATTLE_SCENE']),
  CONTEXT_OVERLAY: Object.freeze(['BOARD', 'BATTLE_SCENE']),
  BATTLE_SCENE: Object.freeze(['BOARD'])
});

const STATE_DIRECTIVES = Object.freeze({
  BOARD: Object.freeze({
    boardVisible: true,
    contextOverlayVisible: false,
    battleSceneVisible: false,
    boardInteractionEnabled: true
  }),
  CONTEXT_OVERLAY: Object.freeze({
    boardVisible: true,
    contextOverlayVisible: true,
    battleSceneVisible: false,
    boardInteractionEnabled: false
  }),
  BATTLE_SCENE: Object.freeze({
    boardVisible: false,
    contextOverlayVisible: false,
    battleSceneVisible: true,
    boardInteractionEnabled: false
  })
});

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label}_REQUIRED`);
  return value;
}

function normalizeState(value) {
  if (!STATE_SET.has(value)) throw new TypeError(`BATTLE_PRESENTATION_STATE_INVALID:${value}`);
  return value;
}

function transitionRecord(from, to, reason, snapshotCaptured, snapshotRestored) {
  return Object.freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameStateWrite: false,
    from,
    to,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
    snapshotCaptured,
    snapshotRestored,
    directives: STATE_DIRECTIVES[to]
  });
}

export function projectBattleDirectActualPresentationState(state) {
  const normalized = normalizeState(state);
  return Object.freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameStateWrite: false,
    state: normalized,
    ...STATE_DIRECTIVES[normalized]
  });
}

export function createBattleDirectActualContinuityController({
  captureBoardView,
  restoreBoardView,
  onTransition = null
} = {}) {
  const capture = requireFunction(captureBoardView, 'CAPTURE_BOARD_VIEW');
  const restore = requireFunction(restoreBoardView, 'RESTORE_BOARD_VIEW');
  if (onTransition != null && typeof onTransition !== 'function') {
    throw new TypeError('ON_TRANSITION_INVALID');
  }

  let state = BATTLE_PRESENTATION_STATES.BOARD;
  let boardViewSnapshot = null;

  function current() {
    return projectBattleDirectActualPresentationState(state);
  }

  function transition(nextState, { reason = null } = {}) {
    const next = normalizeState(nextState);
    if (next === state) {
      const record = transitionRecord(state, next, reason, false, false);
      if (onTransition) onTransition(record);
      return record;
    }

    if (!ALLOWED_TRANSITIONS[state].includes(next)) {
      throw new TypeError(`BATTLE_PRESENTATION_TRANSITION_FORBIDDEN:${state}->${next}`);
    }

    const previous = state;
    let snapshotCaptured = false;
    let snapshotRestored = false;

    if (previous === BATTLE_PRESENTATION_STATES.BOARD && next !== BATTLE_PRESENTATION_STATES.BOARD) {
      boardViewSnapshot = capture();
      snapshotCaptured = true;
    }

    state = next;

    if (next === BATTLE_PRESENTATION_STATES.BOARD && previous !== BATTLE_PRESENTATION_STATES.BOARD) {
      restore(boardViewSnapshot);
      snapshotRestored = true;
      boardViewSnapshot = null;
    }

    const record = transitionRecord(previous, next, reason, snapshotCaptured, snapshotRestored);
    if (onTransition) onTransition(record);
    return record;
  }

  return Object.freeze({
    current,
    transition,
    openContextOverlay(options) {
      return transition(BATTLE_PRESENTATION_STATES.CONTEXT_OVERLAY, options);
    },
    enterBattleScene(options) {
      return transition(BATTLE_PRESENTATION_STATES.BATTLE_SCENE, options);
    },
    returnToBoard(options) {
      return transition(BATTLE_PRESENTATION_STATES.BOARD, options);
    }
  });
}

export const BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW = Object.freeze({
  schema: SCHEMA,
  authority: 'PRESENTATION_ONLY_NO_GAMEPLAY_AUTHORITY',
  sourceBinding: Object.freeze({
    referenceId: 'GR-USER-ASTRAL-PARTY-VIDEO-20261004',
    source: 'USER_UPLOADED_DIRECT_VIDEO',
    originalDriveFileId: '16ST3f8rkjU8xD7MbeGRjb59BXpT93JN9',
    originalSha256: '690476a68bd0e4ffd612077c2521649cbe65bc188af634694b8edffb42bcd95e',
    keyframeDerivativeFileId: '1P4CmDU_NIWmyDh0B7pwxVar_gJKqblSk',
    transitionDerivativeFileId: '1huL_UQvvDHjgetC3y8jq9HCEYGxk-tjZ',
    bindingMode: 'DIRECT_ACTUAL_MEDIA_FIRST',
    proseOnlyReferenceAccepted: false
  }),
  adoptedAtoms: Object.freeze([
    'BOARD_CONTEXT_PERSISTS_FOR_LIGHT_EVENT',
    'DEDICATED_BATTLE_SCENE_REPLACES_BOARD',
    'SAME_BOARD_VIEW_CONTEXT_RESTORED_AFTER_BATTLE'
  ]),
  rejectedCopy: Object.freeze([
    'characters',
    'board_geometry',
    'icons',
    'cards',
    'ui_chrome',
    'text',
    'palette',
    'animation_artwork',
    'rules',
    'economy',
    'exact_timing'
  ]),
  gameStateWrite: false,
  targetWrite: false,
  winnerWrite: false,
  orderWrite: false,
  saveWrite: false,
  economyWrite: false,
  networkWrite: false,
  cardDataWrite: false,
  characterIdentityWrite: false,
  formalArt: false,
  humanVisualAcceptance: false
});
