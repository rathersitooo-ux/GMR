import { projectBattleBoardVisualExplanation } from './battle-board-visual-explanation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.battle-board-visible-explanation-runtime.v1';
const STYLE_ID = 'gameroad-board109-visible-explanation-style';
const BOARD_SELECTOR = '#board';
const NODE_SELECTOR = '.node[data-pos]';
const ROLES_ATTR = 'data-board-visual-roles';
const ACTIVE_ATTR = 'data-board-visual-explanation';

function uniquePositionIds(nodes) {
  const ids = [];
  const seen = new Set();
  for (const node of nodes) {
    const id = String(node?.dataset?.pos ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function nodesWithClass(nodes, className) {
  return nodes.filter((node) => node?.classList?.contains?.(className));
}

function installStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
${BOARD_SELECTOR}[${ACTIVE_ATTR}="1"] ${NODE_SELECTOR}[${ROLES_ATTR}~="reachable"]{position:relative;isolation:isolate;border-color:rgba(213,255,178,.96)!important;box-shadow:0 0 0 2px rgba(174,235,126,.34),0 0 18px rgba(173,236,123,.50),inset 0 0 10px rgba(216,255,190,.18)}
${BOARD_SELECTOR}[${ACTIVE_ATTR}="1"] ${NODE_SELECTOR}[${ROLES_ATTR}~="reachable"]::after{content:"";position:absolute;z-index:8;inset:-5px;border-radius:inherit;border:1px solid rgba(227,255,202,.78);box-shadow:0 0 12px rgba(177,238,126,.40);pointer-events:none}
@media(prefers-reduced-motion:reduce){${BOARD_SELECTOR}[${ACTIVE_ATTR}="1"] ${NODE_SELECTOR}[${ROLES_ATTR}~="reachable"]{transition:none!important}}
`;
  documentRef.head.appendChild(style);
  return true;
}

export function projectCurrentBoardDomExplanation(boardRoot) {
  if (!boardRoot || typeof boardRoot.querySelectorAll !== 'function') return null;
  const nodes = Array.from(boardRoot.querySelectorAll(NODE_SELECTOR));
  const validPositionIds = uniquePositionIds(nodes);
  if (!validPositionIds.length) return null;
  const reachablePositionIds = uniquePositionIds(nodesWithClass(nodes, 'reachable'));
  const projection = projectBattleBoardVisualExplanation({
    validPositionIds,
    reachablePositionIds,
  });
  return Object.freeze({ projection, nodes });
}

export function applyCurrentBoardDomExplanation(boardRoot) {
  const current = projectCurrentBoardDomExplanation(boardRoot);
  if (!current?.projection?.ok) {
    boardRoot?.setAttribute?.(ACTIVE_ATTR, '0');
    return Object.freeze({ active: false, reason: current?.projection?.reason ?? 'BOARD_UNAVAILABLE', reachableCount: 0 });
  }

  const byId = new Map();
  for (const node of current.nodes) {
    const id = String(node?.dataset?.pos ?? '').trim();
    if (id && !byId.has(id)) byId.set(id, node);
    node.removeAttribute?.(ROLES_ATTR);
  }
  for (const [positionId, roles] of Object.entries(current.projection.rolesByPosition)) {
    const node = byId.get(positionId);
    if (!node || !roles.length) continue;
    node.setAttribute?.(ROLES_ATTR, roles.join(' '));
  }
  boardRoot.setAttribute?.(ACTIVE_ATTR, '1');
  boardRoot.dataset.boardVisualExplanationAuthority = 'authoritative-existing-board-dom';
  boardRoot.dataset.boardVisualExplanationGameplayAuthority = 'false';
  boardRoot.dataset.boardVisualExplanationStateWrite = 'false';
  boardRoot.dataset.boardVisualExplanationReachableCount = String(current.projection.channels.reachable.length);
  return Object.freeze({
    active: true,
    reason: null,
    reachableCount: current.projection.channels.reachable.length,
    validPositionCount: Object.keys(current.projection.rolesByPosition).length || current.nodes.length,
  });
}

export function installBattleBoardVisibleExplanation(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  if (!documentRef || typeof documentRef.querySelector !== 'function') return null;
  const boardRoot = documentRef.querySelector(BOARD_SELECTOR);
  if (!boardRoot) return null;
  installStyle(documentRef);
  let destroyed = false;
  let queued = false;

  function sync() {
    queued = false;
    if (destroyed) return Object.freeze({ active: false, reason: 'DESTROYED', reachableCount: 0 });
    return applyCurrentBoardDomExplanation(boardRoot);
  }

  function queueSync() {
    if (destroyed || queued) return;
    queued = true;
    if (typeof globalRef.queueMicrotask === 'function') globalRef.queueMicrotask(sync);
    else Promise.resolve().then(sync);
  }

  const observer = typeof globalRef.MutationObserver === 'function'
    ? new globalRef.MutationObserver(queueSync)
    : null;
  observer?.observe?.(boardRoot, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-pos', 'data-move-distance'],
  });
  const initial = sync();
  const controller = Object.freeze({
    schema: RUNTIME_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    sync,
    snapshot: sync,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      boardRoot.setAttribute?.(ACTIVE_ATTR, '0');
      for (const node of Array.from(boardRoot.querySelectorAll?.(NODE_SELECTOR) || [])) node.removeAttribute?.(ROLES_ATTR);
      return true;
    },
  });
  globalRef.__GAMEROAD_BOARD109_VISIBLE_EXPLANATION__ = controller;
  globalRef.__GAMEROAD_BOARD109_VISIBLE_EXPLANATION_INITIAL__ = initial;
  return controller;
}

function autoInstall(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  if (!documentRef) return;
  const install = () => {
    if (!globalRef.__GAMEROAD_BOARD109_VISIBLE_EXPLANATION__) installBattleBoardVisibleExplanation(globalRef);
  };
  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

autoInstall();

export const BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME = Object.freeze({
  schema: RUNTIME_SCHEMA,
  boardSelector: BOARD_SELECTOR,
  nodeSelector: NODE_SELECTOR,
  directEvidenceRoles: Object.freeze(['reachable']),
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  sourceAuthority: 'EXISTING_BOARD_DOM_ONLY',
  topologyInference: false,
  rulesInference: false,
});
