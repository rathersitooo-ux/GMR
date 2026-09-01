import { auditBattleScreenModel } from './battle-screen-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.battle-screen-runtime-mount.v1';
const STYLE_ID = 'gameroad-battle-screen-runtime-r1-style';
const SHELL_ATTR = 'data-gr-battle-screen';
const GRID_ATTR = 'data-battle-screen-causal-grid';
const PLAN_SLOT_ATTR = 'data-battle-plan-slot';
const LANE_ATTR = 'data-battle-screen-lane';
const PLAYER_ROLE_LABELS = Object.freeze({
  source: '攻撃',
  target: '対象'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireDocument(global) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('BATTLE_SCREEN_DOCUMENT_REQUIRED');
  }
  return document;
}

function createNode(document, tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null) delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function addStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = createNode(document, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[${SHELL_ATTR}="1"]{position:relative;isolation:isolate;width:100%;height:100%;min-height:0;overflow:hidden;background:linear-gradient(180deg,#0b1215 0%,#101a1d 46%,#071011 100%);color:#f7fbfa;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${SHELL_ATTR}="1"] .grBattleScreenTop{position:absolute;z-index:8;top:0;left:0;right:0;height:clamp(38px,8vh,66px);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 clamp(10px,2.2vw,24px);pointer-events:none;background:linear-gradient(180deg,rgba(4,10,11,.78),rgba(4,10,11,0));text-shadow:0 2px 10px rgba(0,0,0,.75)}
[${SHELL_ATTR}="1"] .grBattleScreenPhase{font-size:clamp(10px,1.4vw,15px);font-weight:800;letter-spacing:.12em;text-transform:uppercase}
[${SHELL_ATTR}="1"] .grBattleScreenReturn{font-size:clamp(8px,1vw,11px);opacity:.72}
[${SHELL_ATTR}="1"] [${PLAN_SLOT_ATTR}]{position:absolute;inset:0;z-index:2;min-width:0;min-height:0}
[${SHELL_ATTR}="1"] #battlePhaseSurface{position:absolute;inset:0;z-index:3;overflow:hidden;background:radial-gradient(ellipse at 50% 13%,rgba(90,177,157,.15),transparent 36%),linear-gradient(180deg,rgba(8,20,21,.2),rgba(4,12,13,.72))}
[${SHELL_ATTR}="1"] #battlePhaseSurface::before{content:"";position:absolute;z-index:-2;left:14%;right:14%;top:10%;bottom:-22%;clip-path:polygon(39% 0,61% 0,100% 100%,0 100%);background:linear-gradient(180deg,rgba(167,232,213,.08),rgba(75,138,118,.14) 46%,rgba(18,44,38,.34));border-left:1px solid rgba(210,255,239,.08);border-right:1px solid rgba(210,255,239,.08);transform:perspective(480px) rotateX(5deg);transform-origin:50% 0}
[${SHELL_ATTR}="1"] [${GRID_ATTR}]{position:absolute;z-index:4;inset:clamp(44px,10vh,78px) clamp(6px,1.5vw,18px) clamp(48px,9vh,78px);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(4px,1vw,14px);align-items:stretch;pointer-events:none}
[${SHELL_ATTR}="1"] [${LANE_ATTR}]{position:relative;min-width:0;overflow:hidden;display:grid;grid-template-rows:auto 1fr auto;gap:8px;padding:clamp(7px,1.1vw,13px);border:1px solid rgba(196,231,221,.13);border-radius:clamp(9px,1.4vw,16px);background:linear-gradient(180deg,rgba(17,34,35,.46),rgba(5,14,15,.2));box-shadow:inset 0 0 0 1px rgba(255,255,255,.018);transition:transform 180ms ease,opacity 180ms ease,border-color 180ms ease,background 180ms ease}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="source"]{transform:translateY(-1.4%);border-color:rgba(165,230,213,.42);background:linear-gradient(180deg,rgba(32,72,65,.62),rgba(5,14,15,.26))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="target"]{border-color:rgba(239,183,142,.4);background:linear-gradient(180deg,rgba(83,52,36,.52),rgba(5,14,15,.26))}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="winner"]{transform:translateY(-2.2%);border-color:rgba(255,225,139,.64);background:linear-gradient(180deg,rgba(101,81,34,.58),rgba(5,14,15,.24));box-shadow:0 0 28px rgba(237,202,102,.13),inset 0 0 0 1px rgba(255,245,196,.08)}
[${SHELL_ATTR}="1"] [${LANE_ATTR}][data-role="loser"]{opacity:.56;transform:translateY(1.8%)}
[${SHELL_ATTR}="1"] .grBattleLaneIdentity{min-width:0}.grBattleLaneIdentity b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(9px,1.25vw,15px);letter-spacing:.04em}.grBattleLaneIdentity small{display:block;margin-top:2px;opacity:.55;font-size:clamp(7px,.8vw,10px)}
[${SHELL_ATTR}="1"] .grBattleLaneRole{align-self:center;justify-self:center;padding:5px 7px;border-radius:999px;border:1px solid rgba(220,242,235,.16);background:rgba(3,9,10,.42);font-size:clamp(7px,.8vw,10px);font-weight:800;letter-spacing:.1em;text-transform:uppercase}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate{align-self:end;display:grid;gap:4px;min-height:20px;font-size:clamp(7px,.82vw,10px);line-height:1.25;color:#dce9e5}
[${SHELL_ATTR}="1"] .grBattleLaneAfterstate span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 5px;border-radius:6px;background:rgba(2,8,9,.52);border:1px solid rgba(214,241,231,.08)}
[${SHELL_ATTR}="1"] #battleResolution{position:absolute;z-index:7;left:50%;bottom:clamp(8px,2vh,18px);transform:translateX(-50%);max-width:min(72vw,760px);min-height:24px;pointer-events:none;text-align:center}
[${SHELL_ATTR}="1"][data-motion="static_only"] [${LANE_ATTR}]{transition:none!important;transform:none!important}
@media(max-width:540px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{left:4px;right:4px;gap:3px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}[${SHELL_ATTR}="1"] [${LANE_ATTR}]{padding:6px 4px;border-radius:8px}.grBattleLaneRole{max-width:100%;overflow:hidden;text-overflow:ellipsis}}
@media(max-height:420px){[${SHELL_ATTR}="1"] [${GRID_ATTR}]{top:36px;bottom:34px}[${SHELL_ATTR}="1"] .grBattleScreenTop{height:36px}.grBattleLaneAfterstate{gap:2px}}
@media(prefers-reduced-motion:reduce){[${SHELL_ATTR}="1"] [${LANE_ATTR}]{transition:none!important;transform:none!important}}
`;
  document.head?.appendChild(style);
}

function ensureAnchor(document, root, explicit, id, tag = 'section') {
  if (explicit) {
    if (explicit.id && explicit.id !== id) throw new TypeError(`BATTLE_SCREEN_ANCHOR_ID_MISMATCH:${id}`);
    if (!explicit.id) explicit.id = id;
    return { node: explicit, created: false };
  }
  const existing = document.getElementById?.(id);
  if (existing) return { node: existing, created: false };
  if (!root || typeof root.appendChild !== 'function') throw new TypeError(`BATTLE_SCREEN_ANCHOR_ROOT_REQUIRED:${id}`);
  const node = createNode(document, tag);
  node.id = id;
  root.appendChild(node);
  return { node, created: true };
}

function createLane(document, participantIndex) {
  const lane = createNode(document, 'article', 'grBattleLane');
  lane.setAttribute?.(LANE_ATTR, String(participantIndex + 1));
  lane.dataset.role = 'idle';
  const identity = createNode(document, 'div', 'grBattleLaneIdentity');
  const name = createNode(document, 'b');
  const team = createNode(document, 'small');
  identity.appendChild(name);
  identity.appendChild(team);
  const role = createNode(document, 'div', 'grBattleLaneRole');
  role.hidden = true;
  const afterstate = createNode(document, 'div', 'grBattleLaneAfterstate');
  lane.appendChild(identity);
  lane.appendChild(role);
  lane.appendChild(afterstate);
  return { lane, name, team, role, afterstate };
}

function clearChildren(node) {
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
  else {
    while (node.firstChild) node.removeChild(node.firstChild);
    if (Array.isArray(node.children)) node.children.length = 0;
  }
}

function writeAfterstate(document, host, rows) {
  clearChildren(host);
  for (const row of rows) {
    const item = createNode(document, 'span', '', row.text);
    item.dataset.afterstateId = row.id;
    host.appendChild(item);
  }
}

function validRoot(root) {
  return root && typeof root.appendChild === 'function';
}

export function mountBattleScreenExternalSurface(global = globalThis, options = {}) {
  const document = requireDocument(global);
  const providedPhase = options.phaseSurface ?? null;
  const providedResolution = options.resolutionSurface ?? null;
  let root = options.root ?? null;
  if (!root && providedPhase?.parentNode) root = providedPhase.parentNode;
  if (!root && typeof document.querySelector === 'function') {
    root = document.querySelector('[data-gr-battle-screen-root]');
  }
  if (!validRoot(root) && !providedPhase) throw new TypeError('BATTLE_SCREEN_ROOT_REQUIRED');

  addStyle(document);

  let shell = options.shell ?? null;
  let shellCreated = false;
  if (!shell) {
    shell = createNode(document, 'section', 'grBattleScreenShell');
    shell.setAttribute?.(SHELL_ATTR, '1');
    if (validRoot(root)) root.appendChild(shell);
    shellCreated = true;
  } else {
    shell.setAttribute?.(SHELL_ATTR, '1');
  }

  let planSlot = null;
  if (shellCreated) {
    planSlot = createNode(document, 'div', 'grBattlePlanSlot');
    planSlot.setAttribute?.(PLAN_SLOT_ATTR, '');
    planSlot.dataset.owner = 'caller';
    shell.appendChild(planSlot);
  }

  const phaseAnchor = ensureAnchor(document, shell, providedPhase, 'battlePhaseSurface', 'section');
  const phaseSurface = phaseAnchor.node;
  phaseSurface.dataset.battleScreenPresentationOnly = 'true';
  phaseSurface.dataset.battleScreenBoardInteraction = 'forbidden';
  if (phaseAnchor.created) phaseSurface.hidden = true;

  let grid = createNode(document, 'div', 'grBattleCausalGrid');
  grid.setAttribute?.(GRID_ATTR, '');
  grid.setAttribute?.('aria-label', '4人バトル比較');
  phaseSurface.appendChild(grid);
  const lanes = Array.from({ length: 4 }, (_, index) => createLane(document, index));
  for (const lane of lanes) grid.appendChild(lane.lane);

  const resolutionAnchor = ensureAnchor(document, phaseSurface, providedResolution, 'battleResolution', 'div');
  const resolutionSurface = resolutionAnchor.node;
  resolutionSurface.dataset.battleScreenResolutionAuthority = 'external_existing_presentation_consumer';

  let destroyed = false;
  function render(model) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    const audit = auditBattleScreenModel(model);
    if (!audit.ok) throw new TypeError(`BATTLE_SCREEN_MODEL_REJECTED:${audit.defects.join(',')}`);

    setData(shell, 'mode', model.screenMode);
    setData(shell, 'eventId', model.eventId);
    setData(shell, 'phase', model.phase);
    setData(shell, 'transition', model.transition);
    setData(shell, 'motion', model.motion);
    setData(shell, 'returnIntent', model.returnIntent);
    setData(phaseSurface, 'battleScreenEventId', model.eventId);
    setData(phaseSurface, 'battleScreenPhase', model.phase);
    setData(phaseSurface, 'battleScreenInput', model.battlePhaseInputPolicy.join('|'));
    setData(resolutionSurface, 'battleScreenEventId', model.eventId);

    const battle = model.screenMode === 'BATTLE_PHASE';
    const resultExit = !battle && model.returnIntent === 'RESULT';
    if (shellCreated) shell.hidden = resultExit;
    phaseSurface.hidden = !battle;
    if (planSlot) planSlot.hidden = battle || resultExit;

    for (let index = 0; index < lanes.length; index += 1) {
      const view = lanes[index];
      const lane = model.lanes[index];
      view.lane.dataset.participantId = lane.id;
      view.lane.dataset.role = lane.role;
      view.name.textContent = lane.label;
      view.team.textContent = lane.team ? `TEAM ${lane.team}` : '';
      const playerRoleLabel = PLAYER_ROLE_LABELS[lane.role] || '';
      view.role.hidden = !playerRoleLabel;
      view.role.textContent = playerRoleLabel;
      writeAfterstate(document, view.afterstate, lane.afterstate);
    }
    return model;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    if (grid?.parentNode && typeof grid.parentNode.removeChild === 'function') grid.parentNode.removeChild(grid);
    if (shellCreated && shell?.parentNode && typeof shell.parentNode.removeChild === 'function') shell.parentNode.removeChild(shell);
    return true;
  }

  const runtime = {
    schema: RUNTIME_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    adoptedPhaseSurface: phaseAnchor.created === false,
    adoptedResolutionSurface: resolutionAnchor.created === false,
    shell,
    planSlot,
    phaseSurface,
    resolutionSurface,
    grid,
    laneSurfaces: lanes.map(view => view.lane),
    render,
    destroy
  };
  return Object.freeze(runtime);
}

export const BATTLE_SCREEN_RUNTIME = deepFreeze({
  schema: RUNTIME_SCHEMA,
  mount: 'explicit_caller_mount_only',
  presentationOnly: true,
  authority: 'NONE',
  existingAnchorPolicy: 'ADOPT_IF_EXPLICIT_OR_PRESENT__NEVER_DUPLICATE_ID',
  planSurfaceOwner: 'CALLER',
  laneCount: 4,
  productionHtmlMutationOwnedHere: false,
  formalArtOwnedHere: false
});