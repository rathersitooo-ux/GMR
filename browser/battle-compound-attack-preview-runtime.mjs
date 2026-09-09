const PREVIEW_SCHEMA = 'gameroad.battle-compound-attack-preview-runtime.v1';
const STYLE_ID = 'gameroad-battle-compound-attack-preview-r1-style';
const CUE_ATTR = 'data-battle-compound-preview-cue';
const TARGET_ATTR = 'data-compound-preview-target';
const ACTIVE_ATTR = 'data-compound-preview-active';
const SHIELD_SLOTS = Object.freeze(['L', 'C', 'R']);

function readString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value === null || value === undefined || value === '') delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function setAttr(node, name, value) {
  if (!node) return;
  if (value === null || value === undefined || value === false) node.removeAttribute?.(name);
  else node.setAttribute?.(name, String(value));
}

function childrenOf(node) {
  return Array.from(node?.children ?? []);
}

function shieldSlotOf(link) {
  return readString(link?.getAttribute?.('data-battle-shield-slot'))
    || readString(link?.dataset?.roadLane)
    || readString(link?.dataset?.battleShieldSlot);
}

function ensureStyle(document, shell) {
  if (!document?.createElement) return null;
  const existing = document.getElementById?.(STYLE_ID);
  if (existing) return existing;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${CUE_ATTR}="1"]{
  position:absolute; left:50%; bottom:max(12px,2.2vh); z-index:18;
  transform:translateX(-50%); pointer-events:none;
  display:flex; align-items:center; gap:.55em; max-width:min(78vw,680px);
  padding:.48em .78em; border:1px solid rgba(255,255,255,.56); border-radius:999px;
  background:rgba(8,14,20,.84); color:#fff; box-shadow:0 8px 26px rgba(0,0,0,.28);
  font:700 clamp(11px,1.45vw,15px)/1.2 system-ui,sans-serif; letter-spacing:.02em;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
[${CUE_ATTR}="1"][hidden]{display:none!important}
[data-battle-screen-lane][${TARGET_ATTR}="true"]{
  outline:2px solid rgba(255,225,70,.92); outline-offset:3px;
  box-shadow:0 0 0 5px rgba(255,225,70,.12),0 10px 30px rgba(0,0,0,.16);
}
[data-battle-shield-slot][${TARGET_ATTR}="true"]{
  transform:translateY(-3px) scale(1.06);
  filter:drop-shadow(0 0 8px rgba(255,225,70,.75));
}
[data-battle-shield-slot][${TARGET_ATTR}="true"] .grBattleShieldToken{
  box-shadow:0 0 0 3px rgba(255,225,70,.26),0 0 18px rgba(255,225,70,.68);
}
[data-battle-shield-slot][${TARGET_ATTR}="true"] .grBattleShieldTrack{
  opacity:1; filter:drop-shadow(0 0 5px rgba(255,225,70,.85));
  animation:grBattleCompoundPreviewPulse 780ms ease-in-out infinite alternate;
}
@keyframes grBattleCompoundPreviewPulse{from{transform:scaleX(.94);opacity:.68}to{transform:scaleX(1.04);opacity:1}}
@media (prefers-reduced-motion:reduce){
  [data-battle-shield-slot][${TARGET_ATTR}="true"] .grBattleShieldTrack{animation:none}
  [data-battle-shield-slot][${TARGET_ATTR}="true"]{transform:none}
}
`;
  const host = document.head ?? document.body ?? shell;
  host?.appendChild?.(style);
  return style;
}

function createCue(document, shell) {
  const cue = document?.createElement?.('div');
  if (!cue) return null;
  cue.setAttribute?.(CUE_ATTR, '1');
  cue.setAttribute?.('role', 'status');
  cue.setAttribute?.('aria-live', 'polite');
  cue.setAttribute?.('aria-atomic', 'true');
  cue.dataset.presentationOnly = 'true';
  cue.dataset.authority = 'caller-supplied-compound-attack-package-only';
  cue.hidden = true;
  shell?.appendChild?.(cue);
  return cue;
}

export function normalizeCompoundAttackPreviewPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const jankenHand = readString(value.jankenHand);
  const cardId = readString(value.cardId);
  const route = readString(value.route);
  const direction = readString(value.direction);
  const opponentId = readString(value.opponentId);
  const shieldLane = readString(value.shieldLane).toUpperCase();
  if (!jankenHand || !cardId || !opponentId || !SHIELD_SLOTS.includes(shieldLane)) return null;
  if (!route && !direction) return null;
  return Object.freeze({
    jankenHand,
    cardId,
    route: route || null,
    direction: direction || null,
    opponentId,
    shieldLane
  });
}

export function mountBattleCompoundAttackPreview({ document = globalThis.document, battleScreenRuntime } = {}) {
  const runtime = battleScreenRuntime;
  const shell = runtime?.shell;
  const lanes = Array.from(runtime?.laneSurfaces ?? []);
  const rails = Array.from(runtime?.shieldRails ?? []);
  if (!document?.createElement || !shell?.appendChild || lanes.length !== 4 || rails.length !== lanes.length) {
    throw new TypeError('BATTLE_COMPOUND_PREVIEW_RUNTIME_SURFACE_REQUIRED');
  }

  const style = ensureStyle(document, shell);
  const cue = createCue(document, shell);
  let destroyed = false;
  let currentPackage = null;

  function clearMarks() {
    setData(shell, 'compoundPreviewActive', null);
    for (const key of ['compoundPreviewHand', 'compoundPreviewCardId', 'compoundPreviewRoute', 'compoundPreviewDirection', 'compoundPreviewOpponentId', 'compoundPreviewShieldLane']) {
      setData(shell, key, null);
    }
    for (let index = 0; index < lanes.length; index += 1) {
      setData(lanes[index], 'compoundPreviewTarget', null);
      setData(rails[index], 'compoundPreviewTarget', null);
      for (const link of childrenOf(rails[index])) {
        setData(link, 'compoundPreviewTarget', null);
        setAttr(link, 'aria-current', null);
      }
    }
    if (cue) {
      cue.textContent = '';
      cue.hidden = true;
    }
  }

  function clear() {
    if (destroyed) return false;
    currentPackage = null;
    clearMarks();
    return true;
  }

  function render(packageValue) {
    if (destroyed) return Object.freeze({ active: false, reason: 'destroyed', package: null });
    const packageSnapshot = normalizeCompoundAttackPreviewPackage(packageValue);
    clearMarks();
    if (!packageSnapshot) {
      currentPackage = null;
      return Object.freeze({ active: false, reason: 'invalid_or_incomplete_package', package: null });
    }

    const targetIndex = lanes.findIndex((lane) => readString(lane?.dataset?.participantId) === packageSnapshot.opponentId);
    if (targetIndex < 0) {
      currentPackage = null;
      return Object.freeze({ active: false, reason: 'opponent_surface_not_found', package: null });
    }
    const targetRail = rails[targetIndex];
    const targetLink = childrenOf(targetRail).find((link) => shieldSlotOf(link) === packageSnapshot.shieldLane);
    if (!targetLink) {
      currentPackage = null;
      return Object.freeze({ active: false, reason: 'shield_surface_not_found', package: null });
    }

    currentPackage = packageSnapshot;
    setData(shell, 'compoundPreviewActive', 'true');
    setData(shell, 'compoundPreviewHand', packageSnapshot.jankenHand);
    setData(shell, 'compoundPreviewCardId', packageSnapshot.cardId);
    setData(shell, 'compoundPreviewRoute', packageSnapshot.route);
    setData(shell, 'compoundPreviewDirection', packageSnapshot.direction);
    setData(shell, 'compoundPreviewOpponentId', packageSnapshot.opponentId);
    setData(shell, 'compoundPreviewShieldLane', packageSnapshot.shieldLane);
    setData(lanes[targetIndex], 'compoundPreviewTarget', 'true');
    setData(targetRail, 'compoundPreviewTarget', 'true');
    setData(targetLink, 'compoundPreviewTarget', 'true');
    setAttr(targetLink, 'aria-current', 'true');

    if (cue) {
      const routeLabel = packageSnapshot.route || packageSnapshot.direction;
      cue.textContent = `${packageSnapshot.jankenHand} / ${packageSnapshot.cardId} → ${packageSnapshot.opponentId} / Shield ${packageSnapshot.shieldLane} / 経路 ${routeLabel}`;
      cue.hidden = false;
    }

    return Object.freeze({ active: true, reason: 'caller_package_projected', package: packageSnapshot });
  }

  function refresh() {
    if (!currentPackage) return Object.freeze({ active: false, reason: 'no_current_package', package: null });
    return render(currentPackage);
  }

  function destroy() {
    if (destroyed) return false;
    clearMarks();
    currentPackage = null;
    destroyed = true;
    if (cue?.parentNode?.removeChild) cue.parentNode.removeChild(cue);
    return true;
  }

  return Object.freeze({
    schema: PREVIEW_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    legalTargetRecompute: false,
    gameStateWrite: false,
    targetSource: 'CALLER_SUPPLIED_COMPOUND_ATTACK_PACKAGE_ONLY',
    shieldSlots: SHIELD_SLOTS,
    style,
    cue,
    render,
    refresh,
    clear,
    destroy
  });
}

export const BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME = Object.freeze({
  schema: PREVIEW_SCHEMA,
  presentationOnly: true,
  authority: 'NONE',
  packageAuthority: 'CALLER_SUPPLIED_COMPOUND_ATTACK_PACKAGE_ONLY',
  legalTargetRecompute: false,
  targetInference: false,
  gameStateWrite: false,
  invalidPackagePolicy: 'FAIL_CLOSED_CLEAR_ALL',
  opponentLookup: 'EXACT_PARTICIPANT_ID_ONLY',
  shieldLookup: 'EXACT_CALLER_SHIELD_L_C_R_ONLY',
  routePresentation: 'OPAQUE_CALLER_TOKEN_PLUS_EXISTING_SHIELD_LINKED_ROAD_TRACK',
  productionHtmlMutationOwnedHere: false,
  jankenInputMutationOwnedHere: false
});
