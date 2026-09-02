export const UI_MOTION_ROLE = Object.freeze({
  ROUTE: 'route',
  TAB: 'tab',
  DETAIL: 'detail',
  BACK: 'back',
  CONFIRM: 'confirm',
  TOGGLE: 'toggle',
  SELECT: 'select',
  DRAG: 'drag',
  MODAL: 'modal',
  PHASE: 'phase',
  RESULT: 'result'
});

export const UI_MOTION_FAMILY = Object.freeze({
  ROUTE: 'route',
  CARDS: 'cards',
  CHARACTER: 'character',
  ECONOMY: 'economy',
  BATTLE: 'battle',
  UTILITY: 'utility'
});

const FAMILY_BY_SCREEN = Object.freeze({
  cards: UI_MOTION_FAMILY.CARDS,
  deck: UI_MOTION_FAMILY.CARDS,
  characters: UI_MOTION_FAMILY.CHARACTER,
  partner: UI_MOTION_FAMILY.CHARACTER,
  shop: UI_MOTION_FAMILY.ECONOMY,
  gacha: UI_MOTION_FAMILY.ECONOMY,
  setup: UI_MOTION_FAMILY.BATTLE,
  battle: UI_MOTION_FAMILY.BATTLE,
  result: UI_MOTION_FAMILY.BATTLE,
  missions: UI_MOTION_FAMILY.UTILITY,
  profile: UI_MOTION_FAMILY.UTILITY,
  records: UI_MOTION_FAMILY.UTILITY,
  settings: UI_MOTION_FAMILY.UTILITY
});

const FAMILY_KINETICS = Object.freeze({
  [UI_MOTION_FAMILY.ROUTE]: Object.freeze({axis: 'y', enterSign: 1, scaleFrom: 0.995, rotateDeg: 0}),
  [UI_MOTION_FAMILY.CARDS]: Object.freeze({axis: 'x', enterSign: 1, scaleFrom: 0.985, rotateDeg: -0.7}),
  [UI_MOTION_FAMILY.CHARACTER]: Object.freeze({axis: 'y', enterSign: 1, scaleFrom: 1.015, rotateDeg: 0}),
  [UI_MOTION_FAMILY.ECONOMY]: Object.freeze({axis: 'x', enterSign: 1, scaleFrom: 0.992, rotateDeg: 0}),
  [UI_MOTION_FAMILY.BATTLE]: Object.freeze({axis: 'y', enterSign: -1, scaleFrom: 1.01, rotateDeg: 0}),
  [UI_MOTION_FAMILY.UTILITY]: Object.freeze({axis: 'x', enterSign: -1, scaleFrom: 0.995, rotateDeg: 0})
});

function freezePlan(plan) {
  return Object.freeze({
    ...plan,
    kinetics: Object.freeze({...plan.kinetics}),
    choreography: Object.freeze([...plan.choreography])
  });
}

export function resolveMotionFamily(screen) {
  const key = String(screen || '').trim().toLowerCase();
  return FAMILY_BY_SCREEN[key] || UI_MOTION_FAMILY.ROUTE;
}

export function resolveControlMotionRole(control) {
  const explicit = String(control?.dataset?.motionRole || '').trim().toLowerCase();
  if (Object.values(UI_MOTION_ROLE).includes(explicit)) return explicit;
  if (control?.dataset?.homeTarget != null || control?.dataset?.screenTarget != null || control?.dataset?.navTarget != null) {
    return UI_MOTION_ROLE.ROUTE;
  }
  if (control?.getAttribute?.('aria-haspopup') === 'dialog') return UI_MOTION_ROLE.MODAL;
  if (control?.getAttribute?.('aria-pressed') != null) return UI_MOTION_ROLE.TOGGLE;
  return UI_MOTION_ROLE.SELECT;
}

export function resolveContinuityKey(control) {
  const explicit = String(control?.dataset?.motionKey || '').trim();
  if (explicit) return explicit;
  for (const candidate of [control?.dataset?.homeTarget, control?.dataset?.screenTarget, control?.dataset?.navTarget]) {
    const value = String(candidate || '').trim();
    if (value) return `route:${value}`;
  }
  return null;
}

export function resolveMenuMotionIntent({
  from,
  to,
  reason = 'navigation',
  controlRole = UI_MOTION_ROLE.ROUTE,
  continuityKey = null,
  destinationHasContinuity = false
} = {}) {
  const family = resolveMotionFamily(to);
  const back = reason === 'back' || String(to || '').toLowerCase() === 'home';
  const base = FAMILY_KINETICS[family] || FAMILY_KINETICS[UI_MOTION_FAMILY.ROUTE];
  const bridge = continuityKey && destinationHasContinuity
    ? 'shared-element'
    : `${family}-bridge`;
  const kinetics = {
    ...base,
    enterSign: back ? -base.enterSign : base.enterSign,
    rotateDeg: back ? -base.rotateDeg : base.rotateDeg
  };
  const primary = bridge === 'shared-element' ? 'carry-selected-object' : `recompose-${family}`;
  const support = back ? 'collapse-to-parent-anchor' : 'quiet-sibling-surfaces';

  return freezePlan({
    from,
    to,
    reason,
    controlRole,
    family,
    bridge,
    continuityKey,
    reverseSemantic: back,
    kinetics,
    choreography: [primary, support]
  });
}

export function motionTransform({axis = 'y', distance = 0, scale = 1, rotateDeg = 0} = {}) {
  const numericDistance = Number(distance) || 0;
  const numericScale = Number(scale) || 1;
  const numericRotate = Number(rotateDeg) || 0;
  const translate = axis === 'x'
    ? `translate3d(${numericDistance}px,0,0)`
    : `translate3d(0,${numericDistance}px,0)`;
  const rotate = numericRotate === 0 ? '' : ` rotate(${numericRotate}deg)`;
  const scalePart = numericScale === 1 ? '' : ` scale(${numericScale})`;
  return `${translate}${rotate}${scalePart}`;
}
