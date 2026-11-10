import {
  createBattleJankenCompoundAttackPackage,
  projectBattleJankenCompoundAttackPreview,
} from './battle-janken-compound-attack-package-core.mjs';

export const BATTLE_JANKEN_FOCUS_PRESENTATION_SCHEMA = 'gameroad.battle-janken-focus-presentation.v1';

export const BATTLE_JANKEN_FOCUS_SURFACE = Object.freeze({
  JANKEN_FOCUS: 'JANKEN_FOCUS',
  BOARD_PEEK: 'BOARD_PEEK',
  LOAD_FOCUS: 'LOAD_FOCUS',
  COMMITTING: 'COMMITTING',
  UNAVAILABLE: 'UNAVAILABLE',
});

const HAND_ORDER = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function unavailable(reason, { generationId = null, reducedMotion = false, lowPerf = false } = {}) {
  return freeze({
    schema: BATTLE_JANKEN_FOCUS_PRESENTATION_SCHEMA,
    surface: BATTLE_JANKEN_FOCUS_SURFACE.UNAVAILABLE,
    available: false,
    reason,
    generationId,
    choices: [],
    focusedHand: null,
    focusedPackage: null,
    focusedPreview: null,
    focusedLock: null,
    previewReady: false,
    boardPeek: false,
    peekReturnSurface: null,
    loadFocus: false,
    committing: false,
    motionMode: reducedMotion || lowPerf ? 'STATIC' : 'FULL',
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

function canonicalChoices(packages) {
  if (!Array.isArray(packages) || packages.length !== 3) return null;
  const byHand = new Map();
  try {
    for (const candidate of packages) {
      const pkg = createBattleJankenCompoundAttackPackage(candidate);
      if (byHand.has(pkg.jankenHand)) return null;
      byHand.set(pkg.jankenHand, pkg);
    }
  } catch {
    return null;
  }
  if (!HAND_ORDER.every((hand) => byHand.has(hand))) return null;
  return HAND_ORDER.map((jankenHand) => {
    const pkg = byHand.get(jankenHand);
    return freeze({
      jankenHand,
      package: pkg,
      preview: projectBattleJankenCompoundAttackPreview(pkg),
    });
  });
}

function projectFocusedLock(focusedChoice) {
  if (!focusedChoice?.preview) return null;
  const { preview } = focusedChoice;
  return freeze({
    jankenHand: focusedChoice.jankenHand,
    cardId: preview.cardId,
    opponentId: preview.opponentId,
    shieldLane: preview.shieldLane,
    shieldRef: preview.shieldRef,
    route: preview.route,
  });
}

function project({
  choices,
  surface,
  generationId,
  focusedHand = null,
  previewReady = false,
  peekReturnSurface = null,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const focusedChoice = focusedHand
    ? choices.find((choice) => choice.jankenHand === focusedHand) ?? null
    : null;
  const loadSurface = surface === BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS
    || surface === BATTLE_JANKEN_FOCUS_SURFACE.COMMITTING;
  const boardPeek = surface === BATTLE_JANKEN_FOCUS_SURFACE.BOARD_PEEK;
  const returnSurface = boardPeek && peekReturnSurface === BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS
    ? BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS
    : boardPeek
      ? BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS
      : null;
  return freeze({
    schema: BATTLE_JANKEN_FOCUS_PRESENTATION_SCHEMA,
    surface,
    available: true,
    reason: null,
    generationId: generationId ?? null,
    choices,
    focusedHand: focusedChoice?.jankenHand ?? null,
    focusedPackage: focusedChoice?.package ?? null,
    focusedPreview: focusedChoice?.preview ?? null,
    focusedLock: projectFocusedLock(focusedChoice),
    previewReady: focusedChoice ? previewReady === true : false,
    boardPeek,
    peekReturnSurface: returnSurface,
    loadFocus: loadSurface,
    committing: surface === BATTLE_JANKEN_FOCUS_SURFACE.COMMITTING,
    motionMode: reducedMotion || lowPerf ? 'STATIC' : 'FULL',
    presentationOnly: true,
    gameplayAuthority: false,
    targetInference: false,
    legalTargetRecompute: false,
    routeRecompute: false,
    shieldMappingAuthority: false,
    handAssignmentAuthority: false,
    commitTransport: false,
    gameStateWrite: false,
  });
}

export function createBattleJankenFocusPresentation({
  packages,
  generationId = null,
  focusedHand = null,
  previewReady = false,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const choices = canonicalChoices(packages);
  if (!choices) {
    return unavailable('EXACT_ROCK_SCISSORS_PAPER_PACKAGES_REQUIRED', {
      generationId,
      reducedMotion,
      lowPerf,
    });
  }
  const focusExists = focusedHand == null || choices.some((choice) => choice.jankenHand === focusedHand);
  if (!focusExists) {
    return unavailable('FOCUS_PACKAGE_NOT_IN_AUTHORITATIVE_THREE', {
      generationId,
      reducedMotion,
      lowPerf,
    });
  }
  return project({
    choices,
    surface: BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS,
    generationId,
    focusedHand,
    previewReady,
    reducedMotion,
    lowPerf,
  });
}

export function focusBattleJankenPackage(state, jankenHand, { previewReady = false } = {}) {
  if (!state?.available || state.surface === BATTLE_JANKEN_FOCUS_SURFACE.UNAVAILABLE) {
    return unavailable('FOCUS_STATE_UNAVAILABLE', state ?? {});
  }
  if (state.surface !== BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS) return state;
  if (!state.choices.some((choice) => choice.jankenHand === jankenHand)) {
    return unavailable('FOCUS_PACKAGE_NOT_IN_AUTHORITATIVE_THREE', state);
  }
  return project({
    ...state,
    surface: BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS,
    focusedHand: jankenHand,
    previewReady,
    peekReturnSurface: null,
    reducedMotion: state.motionMode === 'STATIC',
  });
}

export function enterBattleJankenBoardPeek(state) {
  if (!state?.available) return state;
  if (state.surface !== BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS
    && state.surface !== BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS) return state;
  return project({
    ...state,
    surface: BATTLE_JANKEN_FOCUS_SURFACE.BOARD_PEEK,
    focusedHand: state.focusedHand,
    previewReady: state.previewReady,
    peekReturnSurface: state.surface,
    reducedMotion: state.motionMode === 'STATIC',
  });
}

export function returnBattleJankenFocus(state) {
  if (!state?.available || state.surface !== BATTLE_JANKEN_FOCUS_SURFACE.BOARD_PEEK) return state;
  const returnSurface = state.peekReturnSurface === BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS
    ? BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS
    : BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS;
  return project({
    ...state,
    surface: returnSurface,
    focusedHand: state.focusedHand,
    previewReady: state.previewReady,
    peekReturnSurface: null,
    reducedMotion: state.motionMode === 'STATIC',
  });
}

export function enterBattleLoadFocus(state) {
  if (!state?.available || state.surface !== BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS) return state;
  if (!state.focusedHand || state.previewReady !== true) return state;
  return project({
    ...state,
    surface: BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS,
    focusedHand: state.focusedHand,
    previewReady: true,
    peekReturnSurface: null,
    reducedMotion: state.motionMode === 'STATIC',
  });
}

export function beginBattleJankenCommitPresentation(state) {
  if (!state?.available || state.surface !== BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS) return state;
  if (!state.focusedHand || state.previewReady !== true) return state;
  return project({
    ...state,
    surface: BATTLE_JANKEN_FOCUS_SURFACE.COMMITTING,
    focusedHand: state.focusedHand,
    previewReady: true,
    peekReturnSurface: null,
    reducedMotion: state.motionMode === 'STATIC',
  });
}

export function invalidateBattleJankenFocusPresentation(state, reason = 'STALE_OR_VERSION_MISMATCH') {
  return unavailable(reason, {
    generationId: state?.generationId ?? null,
    reducedMotion: state?.motionMode === 'STATIC',
  });
}

export const BATTLE_JANKEN_FOCUS_PRESENTATION_CONTRACT = freeze({
  schema: BATTLE_JANKEN_FOCUS_PRESENTATION_SCHEMA,
  authority: 'NONE',
  source: 'CALLER_SUPPLIED_EXISTING_COMPOUND_ATTACK_PACKAGES_ONLY',
  exactThreeChoices: true,
  surfaces: Object.freeze([
    BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS,
    BATTLE_JANKEN_FOCUS_SURFACE.BOARD_PEEK,
    BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS,
    BATTLE_JANKEN_FOCUS_SURFACE.COMMITTING,
  ]),
  lockProjectionFromExistingPreviewOnly: true,
  boardPeekPreservesFocusedPackage: true,
  boardPeekReturnsToOriginFocusSurface: true,
  boardPeekAllowedFrom: Object.freeze([
    BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS,
    BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS,
  ]),
  loadFocusRequiresExistingVisiblePreview: true,
  commitTransportDelegatedToExistingLiveStack: true,
  freeTargetPicker: false,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesShieldMapping: false,
  computesHandAssignment: false,
  mutatesGameplayState: false,
  mutatesDom: false,
  mutatesProductionRuntime: false,
  reducedMotionSemanticParity: true,
  lowPerfSemanticParity: true,
});