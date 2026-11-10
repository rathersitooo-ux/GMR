import { projectBattleJankenCompoundAttackPreview } from './battle-janken-compound-attack-package-core.mjs';

export const BATTLE_THUMB_CLUSTER_PRESENTATION_SCHEMA = 'gameroad.battle-thumb-cluster-presentation.v1';

export const BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE = Object.freeze({
  LANDSCAPE: 'LANDSCAPE',
  SHORT_LANDSCAPE: 'SHORT_LANDSCAPE',
  PORTRAIT: 'PORTRAIT',
});

export const BATTLE_THUMB_CLUSTER_VISUAL_STATE = Object.freeze({
  STOWED: 'STOWED',
  OPEN: 'OPEN',
  FOCUSED: 'FOCUSED',
  STAGED: 'STAGED',
  COMMITTED: 'COMMITTED',
  RESOLVING: 'RESOLVING',
  DISABLED: 'DISABLED',
});

const HANDS = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);
const HAND_SET = new Set(HANDS);
const PACKAGE_PHASES = new Set(['STAGED', 'COMMITTED', 'RESOLVING']);

const GEOMETRY = Object.freeze({
  LANDSCAPE: Object.freeze({
    host: Object.freeze({ width: 248, height: 196, right: 12, bottom: 12 }),
    handle: Object.freeze({ width: 68, height: 68 }),
    slot: Object.freeze({ width: 82, height: 112, right: 2, bottom: 2 }),
    offsets: Object.freeze({
      ROCK: Object.freeze({ x: -162, y: 15, rotateDeg: -18 }),
      SCISSORS: Object.freeze({ x: -124, y: -55, rotateDeg: -8 }),
      PAPER: Object.freeze({ x: -48, y: -92, rotateDeg: 5 }),
    }),
    preview: Object.freeze({ width: 106, height: 142, left: 8, top: 8 }),
  }),
  SHORT_LANDSCAPE: Object.freeze({
    host: Object.freeze({ width: 188, height: 146, right: 7, bottom: 7 }),
    handle: Object.freeze({ width: 58, height: 58 }),
    slot: Object.freeze({ width: 60, height: 80, right: 2, bottom: 2 }),
    offsets: Object.freeze({
      ROCK: Object.freeze({ x: -124, y: 10, rotateDeg: -16 }),
      SCISSORS: Object.freeze({ x: -92, y: -40, rotateDeg: -7 }),
      PAPER: Object.freeze({ x: -48, y: -62, rotateDeg: 4 }),
    }),
    preview: Object.freeze({ width: 82, height: 108, left: 2, top: 2 }),
  }),
  PORTRAIT: Object.freeze({
    host: Object.freeze({ width: 248, height: 196, right: 12, bottom: 185 }),
    handle: Object.freeze({ width: 68, height: 68 }),
    slot: Object.freeze({ width: 64, height: 88, right: 2, bottom: 2 }),
    offsets: Object.freeze({
      ROCK: Object.freeze({ x: -126, y: 12, rotateDeg: -15 }),
      SCISSORS: Object.freeze({ x: -96, y: -43, rotateDeg: -7 }),
      PAPER: Object.freeze({ x: -38, y: -72, rotateDeg: 4 }),
    }),
    preview: Object.freeze({ width: 98, height: 132, left: 8, top: 8 }),
  }),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function finitePositive(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${field} must be a positive finite number`);
  return number;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function resolveBattleThumbClusterViewportProfile({ width, height } = {}) {
  const w = finitePositive(width, 'width');
  const h = finitePositive(height, 'height');
  if (w < h && w <= 540) return BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE.PORTRAIT;
  if (w > h && h <= 430) return BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE.SHORT_LANDSCAPE;
  return BATTLE_THUMB_CLUSTER_VIEWPORT_PROFILE.LANDSCAPE;
}

function slotRectsFor(viewport, geometry) {
  const hostLeft = viewport.width - geometry.host.right - geometry.host.width;
  const hostTop = viewport.height - geometry.host.bottom - geometry.host.height;
  const baseLeft = hostLeft + geometry.host.width - geometry.slot.right - geometry.slot.width;
  const baseTop = hostTop + geometry.host.height - geometry.slot.bottom - geometry.slot.height;
  return HANDS.map((hand) => {
    const offset = geometry.offsets[hand];
    return Object.freeze({
      hand,
      left: baseLeft + offset.x,
      top: baseTop + offset.y,
      width: geometry.slot.width,
      height: geometry.slot.height,
      rotateDeg: offset.rotateDeg,
    });
  });
}

export function projectBattleThumbClusterGeometry({ width, height, safeArea = {} } = {}) {
  const viewport = {
    width: finitePositive(width, 'width'),
    height: finitePositive(height, 'height'),
  };
  const profile = resolveBattleThumbClusterViewportProfile(viewport);
  const source = GEOMETRY[profile];
  const safeRight = finiteNonNegative(safeArea.right);
  const safeBottom = finiteNonNegative(safeArea.bottom);
  const geometry = {
    host: {
      ...source.host,
      right: Math.max(source.host.right, safeRight),
      bottom: Math.max(source.host.bottom, safeBottom),
    },
    handle: { ...source.handle },
    slot: { ...source.slot },
    offsets: Object.fromEntries(HANDS.map((hand) => [hand, { ...source.offsets[hand] }])),
    preview: { ...source.preview },
  };
  const slotRects = slotRectsFor(viewport, geometry);
  return deepFreeze({
    schema: BATTLE_THUMB_CLUSTER_PRESENTATION_SCHEMA,
    profile,
    viewport,
    geometry,
    slotRects,
  });
}

function normalizeSlots(slots) {
  const byHand = new Map();
  for (const raw of Array.isArray(slots) ? slots : []) {
    const hand = typeof raw?.jankenHand === 'string' ? raw.jankenHand : '';
    if (!HAND_SET.has(hand) || byHand.has(hand)) continue;
    const cardId = typeof raw?.cardId === 'string' && raw.cardId.trim() ? raw.cardId.trim() : null;
    byHand.set(hand, Object.freeze({
      jankenHand: hand,
      cardId,
      selectable: raw?.selectable === true && !!cardId,
    }));
  }
  return Object.freeze(HANDS.map((hand) => byHand.get(hand) ?? Object.freeze({
    jankenHand: hand,
    cardId: null,
    selectable: false,
  })));
}

function selectableSlot(slots, hand) {
  return slots.find((slot) => slot.jankenHand === hand && slot.selectable) ?? null;
}

function normalizePackage(packageValue) {
  if (!packageValue) return null;
  const candidate = packageValue?.status === 'STAGED' && packageValue?.package
    ? packageValue.package
    : packageValue;
  try {
    return projectBattleJankenCompoundAttackPreview(candidate);
  } catch {
    return null;
  }
}

function resolveVisualState({ disabled, expanded, focusedSlot, packagePhase, packagePreview, packageMatches }) {
  if (disabled) return BATTLE_THUMB_CLUSTER_VISUAL_STATE.DISABLED;
  if (packagePreview && packageMatches && packagePhase === 'RESOLVING') return BATTLE_THUMB_CLUSTER_VISUAL_STATE.RESOLVING;
  if (packagePreview && packageMatches && packagePhase === 'COMMITTED') return BATTLE_THUMB_CLUSTER_VISUAL_STATE.COMMITTED;
  if (packagePreview && packageMatches && packagePhase === 'STAGED') return BATTLE_THUMB_CLUSTER_VISUAL_STATE.STAGED;
  if (focusedSlot) return BATTLE_THUMB_CLUSTER_VISUAL_STATE.FOCUSED;
  return expanded ? BATTLE_THUMB_CLUSTER_VISUAL_STATE.OPEN : BATTLE_THUMB_CLUSTER_VISUAL_STATE.STOWED;
}

function motionProjection({ reducedMotion, lowPerf, visualState }) {
  if (reducedMotion) {
    return Object.freeze({
      bloomDurationMs: 0,
      acknowledgementDurationMs: 0,
      compoundPulse: false,
      depthMotion: false,
      filterEffects: false,
    });
  }
  return Object.freeze({
    bloomDurationMs: 190,
    acknowledgementDurationMs: 110,
    compoundPulse: visualState === BATTLE_THUMB_CLUSTER_VISUAL_STATE.STAGED && !lowPerf,
    depthMotion: true,
    filterEffects: !lowPerf,
  });
}

export function projectBattleThumbClusterPresentation({
  viewport,
  safeArea = {},
  expanded = false,
  slots = [],
  focusedHand = null,
  compoundAttack = null,
  compoundPhase = null,
  disabled = false,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const layout = projectBattleThumbClusterGeometry({ ...viewport, safeArea });
  const normalizedSlots = normalizeSlots(slots);
  const focusedSlot = selectableSlot(normalizedSlots, focusedHand);
  const packagePreview = normalizePackage(compoundAttack);
  const phase = PACKAGE_PHASES.has(compoundPhase) ? compoundPhase : null;
  const packageSlot = packagePreview ? selectableSlot(normalizedSlots, packagePreview.jankenHand) : null;
  const packageMatches = !!packageSlot && packageSlot.cardId === packagePreview?.cardId;
  const visualState = resolveVisualState({
    disabled: disabled === true,
    expanded: expanded === true,
    focusedSlot,
    packagePhase: phase,
    packagePreview,
    packageMatches,
  });
  const activeHand = packageMatches && phase ? packagePreview.jankenHand : focusedSlot?.jankenHand ?? null;
  const previewVisible = visualState === BATTLE_THUMB_CLUSTER_VISUAL_STATE.STAGED;
  const lockedVisual = [
    BATTLE_THUMB_CLUSTER_VISUAL_STATE.COMMITTED,
    BATTLE_THUMB_CLUSTER_VISUAL_STATE.RESOLVING,
    BATTLE_THUMB_CLUSTER_VISUAL_STATE.DISABLED,
  ].includes(visualState);
  return deepFreeze({
    schema: BATTLE_THUMB_CLUSTER_PRESENTATION_SCHEMA,
    presentationOnly: true,
    gameStateWrite: false,
    legalTargetRecompute: false,
    commitTransport: false,
    visualState,
    activeHand,
    expandedVisual: visualState !== BATTLE_THUMB_CLUSTER_VISUAL_STATE.STOWED,
    lockedVisual,
    slots: normalizedSlots,
    compound: packageMatches && phase ? {
      phase,
      jankenHand: packagePreview.jankenHand,
      cardId: packagePreview.cardId,
      opponentId: packagePreview.opponentId,
      shieldLane: packagePreview.shieldLane,
      shieldRef: packagePreview.shieldRef,
      route: packagePreview.route,
      previewVisible,
    } : null,
    failClosedReason: packagePreview && phase && !packageMatches
      ? 'PACKAGE_DOES_NOT_MATCH_CURRENT_SELECTABLE_SLOT'
      : (!packagePreview && compoundAttack && phase ? 'INVALID_COMPOUND_ATTACK_PACKAGE' : null),
    layout,
    motion: motionProjection({
      reducedMotion: reducedMotion === true,
      lowPerf: lowPerf === true,
      visualState,
    }),
  });
}

export const BATTLE_THUMB_CLUSTER_PRESENTATION_CONTRACT = deepFreeze({
  schema: BATTLE_THUMB_CLUSTER_PRESENTATION_SCHEMA,
  hands: HANDS,
  presentationOnly: true,
  authority: 'NONE',
  gameplayStateWrite: false,
  legalTargetRecompute: false,
  targetInference: false,
  commitTransport: false,
  compoundPackageSource: 'BATTLE_JANKEN_COMPOUND_ATTACK_PACKAGE_CORE',
  liveSlidePadMutationOwnedHere: false,
});
