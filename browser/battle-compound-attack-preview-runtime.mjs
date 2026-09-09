import { projectBattleJankenCompoundAttackPreview } from './battle-janken-compound-attack-package-core.mjs';
import {
  getBattlePlayerIdentityPresentation,
  getBattleStatePresentation,
  projectAuthoritativeCompoundTarget,
} from './battle-color-identity-presentation-core.mjs';

const PREVIEW_SCHEMA = 'gameroad.battle-compound-attack-preview-runtime.v1';
const STYLE_ID = 'gameroad-battle-compound-attack-preview-r1-style';
const CUE_ATTR = 'data-battle-compound-preview-cue';
const TARGET_ATTR = 'data-compound-preview-target';
const SHIELD_SLOTS = Object.freeze(['L', 'C', 'R']);
const TARGET_IDENTITY_DATA_KEYS = Object.freeze([
  'compoundPreviewPlayerLabel',
  'compoundPreviewPlayerNotchCount',
  'compoundPreviewPlayerStrokePattern',
  'compoundPreviewStateOutline',
  'compoundPreviewStateDepth',
  'compoundPreviewStateLuminance',
  'compoundPreviewStateMotion',
]);

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

function playerIndexFromParticipantId(value) {
  const text = readString(value);
  const match = /^P([1-4])$/.exec(text) ?? /^([1-4])P$/.exec(text);
  return match ? Number(match[1]) : null;
}

function clearTargetIdentity(node) {
  for (const key of TARGET_IDENTITY_DATA_KEYS) setData(node, key, null);
}

function applyTargetIdentity(node, identity) {
  if (!node || !identity) return;
  setData(node, 'compoundPreviewPlayerLabel', identity.player?.label ?? null);
  setData(node, 'compoundPreviewPlayerNotchCount', identity.player?.notchCount ?? null);
  setData(node, 'compoundPreviewPlayerStrokePattern', identity.player?.strokePattern ?? null);
  setData(node, 'compoundPreviewStateOutline', identity.interaction?.outlineRole ?? null);
  setData(node, 'compoundPreviewStateDepth', identity.interaction?.depthRole ?? null);
  setData(node, 'compoundPreviewStateLuminance', identity.interaction?.luminanceRole ?? null);
  setData(node, 'compoundPreviewStateMotion', identity.interaction?.motionRole ?? null);
}

export function projectCompoundAttackPreviewIdentity(packageSnapshot, participantId) {
  if (!packageSnapshot || typeof packageSnapshot !== 'object') return null;
  const target = projectAuthoritativeCompoundTarget(packageSnapshot);
  if (!target || target.package !== packageSnapshot) return null;
  const playerIndex = playerIndexFromParticipantId(participantId);
  const player = playerIndex == null ? null : getBattlePlayerIdentityPresentation(playerIndex);
  const interaction = getBattleStatePresentation('FOCUS');
  return Object.freeze({
    target,
    player,
    interaction,
    colorOnlyIdentity: false,
    strongHueOwner: 'SUIT_ONLY',
  });
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
  padding:.48em .78em; border:1px solid rgba(255,255,255,.64); border-radius:999px;
  background:rgba(8,14,20,.88); color:#fff; box-shadow:0 8px 26px rgba(0,0,0,.28);
  font:700 clamp(11px,1.45vw,15px)/1.2 system-ui,sans-serif; letter-spacing:.02em;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
[${CUE_ATTR}="1"][hidden]{display:none!important}
[data-battle-screen-lane][${TARGET_ATTR}="true"]{
  position:relative;
  outline:3px solid rgba(248,252,255,.94); outline-offset:4px;
  box-shadow:0 0 0 1px rgba(4,8,12,.9),0 0 0 6px rgba(248,252,255,.16),0 10px 30px rgba(0,0,0,.2);
  filter:brightness(1.08) contrast(1.04);
}
[data-battle-screen-lane][${TARGET_ATTR}="true"][data-compound-preview-player-stroke-pattern="DOUBLE"]{outline-style:double;outline-width:5px}
[data-battle-screen-lane][${TARGET_ATTR}="true"][data-compound-preview-player-stroke-pattern="DASHED"]{outline-style:dashed}
[data-battle-screen-lane][${TARGET_ATTR}="true"][data-compound-preview-player-stroke-pattern="DASH_DOT"]{outline-style:dotted}
[data-battle-screen-lane][${TARGET_ATTR}="true"]::after{
  content:attr(data-compound-preview-player-label);
  position:absolute; right:6px; top:6px; z-index:2; min-width:2.1em; min-height:2.1em;
  display:grid; place-items:center; padding:.15em .35em; box-sizing:border-box;
  border:2px solid rgba(255,255,255,.9); border-radius:7px;
  background:rgba(6,10,15,.86); color:#fff; font:900 11px/1 system-ui,sans-serif;
  box-shadow:0 2px 9px rgba(0,0,0,.28); letter-spacing:.03em;
}
[data-battle-screen-lane][${TARGET_ATTR}="true"][data-compound-preview-player-stroke-pattern="DOUBLE"]::after{border-style:double;border-width:4px}
[data-battle-screen-lane][${TARGET_ATTR}="true"][data-compound-preview-player-stroke-pattern="DASHED"]::after{border-style:dashed}
[data-battle-screen-lane][${TARGET_ATTR}="true"][data-compound-preview-player-stroke-pattern="DASH_DOT"]::after{border-style:dashed dotted dashed dotted}
[data-battle-shield-slot][${TARGET_ATTR}="true"]{
  transform:translateY(-3px) scale(1.06);
  filter:brightness(1.18) contrast(1.08) drop-shadow(0 0 7px rgba(255,255,255,.72));
}
[data-battle-shield-slot][${TARGET_ATTR}="true"] .grBattleShieldToken{
  box-shadow:0 0 0 2px rgba(5,8,12,.9),0 0 0 5px rgba(255,255,255,.72),0 0 16px rgba(255,255,255,.36);
}
[data-battle-shield-slot][${TARGET_ATTR}="true"] .grBattleShieldTrack{
  opacity:1; filter:brightness(1.3) contrast(1.08) drop-shadow(0 0 5px rgba(255,255,255,.64));
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
  cue.dataset.colorOnlyIdentity = 'false';
  cue.dataset.strongHueOwner = 'suit-only';
  cue.hidden = true;
  shell?.appendChild?.(cue);
  return cue;
}

export function normalizeCompoundAttackPreviewPackage(value) {
  try {
    const preview = projectBattleJankenCompoundAttackPreview(value);
    if (!SHIELD_SLOTS.includes(preview.shieldLane)) return null;
    return preview;
  } catch {
    return null;
  }
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
    for (const key of ['compoundPreviewHand', 'compoundPreviewCardId', 'compoundPreviewPath', 'compoundPreviewDirection', 'compoundPreviewRoadId', 'compoundPreviewBattleId', 'compoundPreviewOpponentId', 'compoundPreviewShieldLane', 'compoundPreviewShieldRef']) {
      setData(shell, key, null);
    }
    clearTargetIdentity(shell);
    for (let index = 0; index < lanes.length; index += 1) {
      setData(lanes[index], 'compoundPreviewTarget', null);
      setData(rails[index], 'compoundPreviewTarget', null);
      clearTargetIdentity(lanes[index]);
      clearTargetIdentity(rails[index]);
      for (const link of childrenOf(rails[index])) {
        setData(link, 'compoundPreviewTarget', null);
        clearTargetIdentity(link);
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

  function projectNormalizedPreview(packageSnapshot) {
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

    const participantId = readString(lanes[targetIndex]?.dataset?.participantId);
    const identity = projectCompoundAttackPreviewIdentity(packageSnapshot, participantId);
    currentPackage = packageSnapshot;
    setData(shell, 'compoundPreviewActive', 'true');
    setData(shell, 'compoundPreviewHand', packageSnapshot.jankenHand);
    setData(shell, 'compoundPreviewCardId', packageSnapshot.cardId);
    setData(shell, 'compoundPreviewPath', JSON.stringify(packageSnapshot.route.path));
    setData(shell, 'compoundPreviewDirection', packageSnapshot.route.direction);
    setData(shell, 'compoundPreviewRoadId', packageSnapshot.route.roadId);
    setData(shell, 'compoundPreviewBattleId', packageSnapshot.route.battleId);
    setData(shell, 'compoundPreviewOpponentId', packageSnapshot.opponentId);
    setData(shell, 'compoundPreviewShieldLane', packageSnapshot.shieldLane);
    setData(shell, 'compoundPreviewShieldRef', packageSnapshot.shieldRef);
    applyTargetIdentity(shell, identity);
    setData(lanes[targetIndex], 'compoundPreviewTarget', 'true');
    setData(targetRail, 'compoundPreviewTarget', 'true');
    setData(targetLink, 'compoundPreviewTarget', 'true');
    applyTargetIdentity(lanes[targetIndex], identity);
    applyTargetIdentity(targetRail, identity);
    applyTargetIdentity(targetLink, identity);
    setAttr(targetLink, 'aria-current', 'true');

    if (cue) {
      const routeBits = [
        packageSnapshot.route.roadId ? `ROAD ${packageSnapshot.route.roadId}` : '',
        packageSnapshot.route.direction || '',
        `経路 ${packageSnapshot.route.path.length}点`
      ].filter(Boolean);
      const targetLabel = identity?.player?.label
        ? `${identity.player.label} (${packageSnapshot.opponentId})`
        : packageSnapshot.opponentId;
      cue.textContent = `${packageSnapshot.jankenHand} / ${packageSnapshot.cardId} → ${targetLabel} / Shield ${packageSnapshot.shieldLane} / ${routeBits.join(' / ')}`;
      cue.setAttribute?.('title', JSON.stringify(packageSnapshot.route.path));
      cue.hidden = false;
    }

    return Object.freeze({ active: true, reason: 'package_core_preview_projected', package: packageSnapshot, identity });
  }

  function render(packageValue) {
    if (destroyed) return Object.freeze({ active: false, reason: 'destroyed', package: null });
    const packageSnapshot = normalizeCompoundAttackPreviewPackage(packageValue);
    clearMarks();
    if (!packageSnapshot) {
      currentPackage = null;
      return Object.freeze({ active: false, reason: 'invalid_or_incomplete_package', package: null });
    }
    return projectNormalizedPreview(packageSnapshot);
  }

  function refresh() {
    if (!currentPackage) return Object.freeze({ active: false, reason: 'no_current_package', package: null });
    const packageSnapshot = currentPackage;
    clearMarks();
    return projectNormalizedPreview(packageSnapshot);
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
    targetSource: 'BATTLE_JANKEN_COMPOUND_ATTACK_PACKAGE_CORE_PREVIEW_ONLY',
    colorSemanticNamespace: 'BATTLE_COLOR_IDENTITY_PRESENTATION_CORE',
    colorOnlyIdentity: false,
    strongHueOwner: 'SUIT_ONLY',
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
  packageAuthority: 'BATTLE_JANKEN_COMPOUND_ATTACK_PACKAGE_CORE_PREVIEW_ONLY',
  legalTargetRecompute: false,
  targetInference: false,
  gameStateWrite: false,
  invalidPackagePolicy: 'FAIL_CLOSED_CLEAR_ALL',
  opponentLookup: 'EXACT_PARTICIPANT_ID_ONLY',
  shieldLookup: 'EXACT_CALLER_SHIELD_L_C_R_ONLY',
  routePresentation: 'AUTHORITY_PATH_EXPOSED_UNCHANGED_PLUS_EXISTING_SHIELD_LINKED_ROAD_TRACK',
  colorSemanticNamespace: 'BATTLE_COLOR_IDENTITY_PRESENTATION_CORE',
  targetIdentity: 'AUTHORITATIVE_SPATIAL_PACKAGE_PLUS_PLAYER_NUMBER_SHAPE_PATTERN_AND_INTERACTION_STATE',
  strongHueOwner: 'SUIT_ONLY',
  colorOnlyIdentity: false,
  productionHtmlMutationOwnedHere: false,
  jankenInputMutationOwnedHere: false
});
