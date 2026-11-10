export const BATTLE_COLOR_IDENTITY_PRESENTATION_SCHEMA = 'gameroad.battle-color-identity-presentation.v1';

const SUIT_PRESENTATION = Object.freeze({
  SPADE: Object.freeze({ suit: 'SPADE', symbol: '♠', hueRole: 'BLUE', role: '剣', cssToken: '--gr-suit-spade' }),
  CLUB: Object.freeze({ suit: 'CLUB', symbol: '♣', hueRole: 'GREEN', role: '斧', cssToken: '--gr-suit-club' }),
  DIAMOND: Object.freeze({ suit: 'DIAMOND', symbol: '♦', hueRole: 'YELLOW', role: '槍', cssToken: '--gr-suit-diamond' }),
  HEART: Object.freeze({ suit: 'HEART', symbol: '♥', hueRole: 'RED', role: '回復', cssToken: '--gr-suit-heart' }),
});

const JANKEN_PRESENTATION = Object.freeze([
  Object.freeze({ jankenHand: 'ROCK', symbol: '✊', label: 'グー', position: 'LEFT' }),
  Object.freeze({ jankenHand: 'SCISSORS', symbol: '✌', label: 'チョキ', position: 'CENTER' }),
  Object.freeze({ jankenHand: 'PAPER', symbol: '✋', label: 'パー', position: 'RIGHT' }),
]);

const PLAYER_STROKE_PATTERNS = Object.freeze([
  'SOLID',
  'DOUBLE',
  'DASHED',
  'DASH_DOT',
]);

const STATE_PRESENTATION = Object.freeze({
  IDLE: Object.freeze({ outlineRole: 'QUIET', depthRole: 'BASE', luminanceRole: 'BASE', motionRole: 'NONE' }),
  FOCUS: Object.freeze({ outlineRole: 'FOCUS', depthRole: 'RAISED', luminanceRole: 'BRIGHTER', motionRole: 'ACKNOWLEDGE' }),
  STAGED: Object.freeze({ outlineRole: 'DOUBLE', depthRole: 'RAISED', luminanceRole: 'BRIGHTER', motionRole: 'STEADY' }),
  COMMITTED: Object.freeze({ outlineRole: 'LOCKED', depthRole: 'SETTLED', luminanceRole: 'HIGH_CONTRAST', motionRole: 'LOCK' }),
  PUBLIC: Object.freeze({ outlineRole: 'REVEALED', depthRole: 'BASE', luminanceRole: 'HIGH_CONTRAST', motionRole: 'REVEAL' }),
  RESOLVED: Object.freeze({ outlineRole: 'RESOLVED', depthRole: 'SETTLED', luminanceRole: 'BASE', motionRole: 'SETTLE' }),
  INVALIDATED: Object.freeze({ outlineRole: 'BROKEN', depthRole: 'RECESSED', luminanceRole: 'DIMMED', motionRole: 'FADE' }),
  DISABLED: Object.freeze({ outlineRole: 'QUIET', depthRole: 'RECESSED', luminanceRole: 'DIMMED', motionRole: 'NONE' }),
});

function canonicalPlayerIndex(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 4 ? number : null;
}

export function getBattleSuitPresentation(suit) {
  const key = typeof suit === 'string' ? suit.trim().toUpperCase() : '';
  return SUIT_PRESENTATION[key] ?? null;
}

export function getBattleJankenPresentation() {
  return JANKEN_PRESENTATION;
}

export function getBattlePlayerIdentityPresentation(playerIndex) {
  const index = canonicalPlayerIndex(playerIndex);
  if (index == null) return null;
  return Object.freeze({
    schema: BATTLE_COLOR_IDENTITY_PRESENTATION_SCHEMA,
    playerIndex: index,
    label: `${index}P`,
    notchCount: index,
    strokePattern: PLAYER_STROKE_PATTERNS[index - 1],
    hueRole: null,
  });
}

export function getBattleStatePresentation(state) {
  const key = typeof state === 'string' ? state.trim().toUpperCase() : '';
  return STATE_PRESENTATION[key] ?? null;
}

export function projectAuthoritativeCompoundTarget(packageValue) {
  if (!packageValue || typeof packageValue !== 'object') return null;
  return Object.freeze({
    schema: BATTLE_COLOR_IDENTITY_PRESENTATION_SCHEMA,
    jankenHand: packageValue.jankenHand ?? null,
    opponentId: packageValue.opponentId ?? null,
    shieldLane: packageValue.shieldLane ?? null,
    route: packageValue.route ?? packageValue.direction ?? null,
    package: packageValue,
  });
}

export function selectTwoOpponentCenterPackage({
  direction,
  leftPackage,
  rightPackage,
} = {}) {
  const side = typeof direction === 'string' ? direction.trim().toUpperCase() : '';
  if (side === 'LEFT' && leftPackage && typeof leftPackage === 'object') {
    return Object.freeze({ direction: 'LEFT', package: leftPackage });
  }
  if (side === 'RIGHT' && rightPackage && typeof rightPackage === 'object') {
    return Object.freeze({ direction: 'RIGHT', package: rightPackage });
  }
  return null;
}

export function createBattleColorIdentityPolicy() {
  return Object.freeze({
    schema: BATTLE_COLOR_IDENTITY_PRESENTATION_SCHEMA,
    semanticChannels: Object.freeze({
      suit: 'HUE_AND_SYMBOL',
      janken: 'FIXED_POSITION_AND_HAND_SYMBOL',
      target: 'AUTHORITATIVE_SPATIAL_PACKAGE',
      player: 'NUMBER_SHAPE_PATTERN',
      interactionState: 'OUTLINE_DEPTH_LUMINANCE_MOTION',
    }),
    suits: SUIT_PRESENTATION,
    janken: JANKEN_PRESENTATION,
    playerCount: 4,
    statePresentation: STATE_PRESENTATION,
    trafficLightStateHue: false,
    colorOnlyIdentityAllowed: false,
    targetRandomizationAllowed: false,
    presentationLegalityRecalculationAllowed: false,
  });
}
