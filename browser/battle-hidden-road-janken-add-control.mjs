export const BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_SCHEMA = 'gameroad.battle-hidden-road-janken-add-control.v1';
export const BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_ATTR = 'data-hidden-road-janken-add';
export const BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_STYLE_ID = 'gameroad-battle-hidden-road-janken-add-control-r1-style';

export const BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS = `
[${BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_ATTR}="1"]{
  appearance:none;
  min-width:56px;
  min-height:44px;
  padding:7px 11px;
  border:2px solid white;
  border-radius:44% 56% 52% 48% / 46% 42% 58% 54%;
  background:linear-gradient(145deg,lemonchiffon 0%,gold 34%,goldenrod 70%,darkgoldenrod 100%);
  color:black;
  font:900 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  letter-spacing:.04em;
  text-shadow:0 1px 0 rgba(255,255,255,.35);
  box-shadow:inset 0 2px 0 rgba(255,255,255,.5),inset 0 -5px 12px rgba(92,68,0,.28),0 7px 18px rgba(0,0,0,.32);
  filter:saturate(1.18) brightness(1.02);
  cursor:pointer;
  touch-action:manipulation;
  transition:transform 90ms ease,filter 90ms ease,box-shadow 90ms ease;
}
[${BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_ATTR}="1"]:not(:disabled):active{
  transform:translateY(1px) scale(.97);
  filter:saturate(1.22) brightness(.96);
  box-shadow:inset 0 2px 0 rgba(255,255,255,.36),inset 0 -3px 9px rgba(70,56,0,.34),0 3px 10px rgba(0,0,0,.32);
}
[${BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_ATTR}="1"][data-visual-state="gray"],
[${BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_ATTR}="1"]:disabled{
  background:linear-gradient(145deg,gainsboro 0%,silver 38%,gray 72%,dimgray 100%);
  color:white;
  text-shadow:0 1px 1px black;
  filter:grayscale(1) saturate(0) brightness(.78);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.26),0 4px 12px rgba(0,0,0,.24);
  cursor:default;
  pointer-events:none;
}
@media(prefers-reduced-motion:reduce){
  [${BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_ATTR}="1"]{transition:none!important}
}
`;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalCardId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function projectBattleHiddenRoadJankenAddControl({
  hiddenPrivilegeAvailable = false,
  reservedCardId = null,
  roadJankenCardPresent = false,
  stageAvailable = true,
} = {}) {
  const cardId = canonicalCardId(reservedCardId);
  let disabledReason = null;
  if (hiddenPrivilegeAvailable !== true) disabledReason = 'hidden-privilege-unavailable';
  else if (!cardId) disabledReason = 'reserved-card-unavailable';
  else if (roadJankenCardPresent === true) disabledReason = 'road-card-already-present';
  else if (stageAvailable !== true) disabledReason = 'road-stage-unavailable';

  const enabled = disabledReason === null;
  return deepFreeze({
    schema: BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_SCHEMA,
    cardId,
    enabled,
    disabled: !enabled,
    disabledReason,
    visualState: enabled ? 'deep-lemon-gummy-gold' : 'gray',
    label: '隠し手',
    ariaLabel: enabled
      ? '隠し手のロードカードをじゃんけん手へ追加'
      : '隠し手のロードカードは現在追加できません',
  });
}

export function createBattleHiddenRoadJankenAddController({
  readContext,
  stageReservedRoad,
} = {}) {
  if (typeof readContext !== 'function' || typeof stageReservedRoad !== 'function') return null;
  let inFlight = false;

  function snapshot() {
    let context = null;
    try {
      context = readContext();
    } catch {
      context = null;
    }
    return projectBattleHiddenRoadJankenAddControl(context ?? {});
  }

  async function press() {
    if (inFlight) {
      return deepFreeze({ accepted: false, reason: 'in-flight', projection: snapshot() });
    }
    const before = snapshot();
    if (!before.enabled || !before.cardId) {
      return deepFreeze({ accepted: false, reason: before.disabledReason, projection: before });
    }

    inFlight = true;
    try {
      const delegated = await stageReservedRoad(before.cardId);
      const accepted = delegated !== false;
      return deepFreeze({
        accepted,
        reason: accepted ? 'delegated-existing-road-stage' : 'stage-rejected',
        cardId: before.cardId,
        projection: snapshot(),
      });
    } catch {
      return deepFreeze({
        accepted: false,
        reason: 'stage-error',
        cardId: before.cardId,
        projection: snapshot(),
      });
    } finally {
      inFlight = false;
    }
  }

  return Object.freeze({
    schema: BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_SCHEMA,
    snapshot,
    press,
  });
}

function ensureStyle(documentRef) {
  if (!documentRef?.createElement || !documentRef?.head?.appendChild) return false;
  if (documentRef.getElementById?.(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_STYLE_ID;
  style.textContent = BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_CSS;
  documentRef.head.appendChild(style);
  return true;
}

export function mountBattleHiddenRoadJankenAddControl({
  document: documentRef,
  host,
  controller,
} = {}) {
  if (!documentRef?.createElement || !host?.appendChild || !controller
    || typeof controller.snapshot !== 'function' || typeof controller.press !== 'function') return null;
  ensureStyle(documentRef);

  const button = documentRef.createElement('button');
  button.type = 'button';
  button.setAttribute(BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_ATTR, '1');
  button.textContent = '隠し手';
  host.appendChild(button);
  let destroyed = false;

  function sync() {
    if (destroyed) return null;
    const projection = controller.snapshot();
    button.disabled = projection.enabled !== true;
    button.setAttribute('aria-disabled', String(button.disabled));
    button.setAttribute('aria-label', projection.ariaLabel);
    button.dataset.visualState = projection.visualState;
    button.dataset.disabledReason = projection.disabledReason ?? '';
    return projection;
  }

  async function activate(event) {
    event?.preventDefault?.();
    if (destroyed || button.disabled) return false;
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    const result = await controller.press();
    sync();
    return result?.accepted === true;
  }

  button.addEventListener?.('click', activate);
  sync();

  return Object.freeze({
    schema: BATTLE_HIDDEN_ROAD_JANKEN_ADD_CONTROL_SCHEMA,
    button,
    sync,
    activate,
    snapshot: () => controller.snapshot(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      button.removeEventListener?.('click', activate);
      button.remove?.();
    },
  });
}
