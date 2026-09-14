import { mountBattleCurrentPlayerUi } from './battle-current-player-ui-runtime.mjs';
import { projectBattleCurrentActionContext } from './battle-current-action-context-presentation-core.mjs';

export const BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA = 'gameroad.battle-current-player-ui-live-adapter.v1';
const ROOT_RUNTIME_PROP = '__gameroadCurrentPlayerUiLiveAdapter';
const GLOBAL_RUNTIME_PROP = '__GAMEROAD_BATTLE_CURRENT_PLAYER_UI_LIVE__';
const CURRENT_ACTION_ATTR = 'data-battle-current-action';
const CURRENT_ACTION_STYLE_ID = 'gameroad-battle-current-action-live-r2-style';
const AUTHORITY_BOUNDARY = 'caller_authoritative_public_state';

function resolveBattleRoot(documentRef) {
  return documentRef?.querySelector?.('section.screen.battle[data-screen="battle"]')
    ?? documentRef?.querySelector?.('.screen.battle')
    ?? documentRef?.querySelector?.('section[data-screen="battle"]')
    ?? null;
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function playerIdOf(node) {
  return nonEmptyText(node?.dataset?.player ?? node?.dataset?.playerId);
}

function hasClass(node, name) {
  return Boolean(node?.classList?.contains?.(name));
}

function list(root, selector) {
  const rows = root?.querySelectorAll?.(selector);
  return rows ? Array.from(rows) : [];
}

function findByPlayerId(rows, playerId) {
  return rows.find((node) => playerIdOf(node) === playerId) ?? null;
}

/**
 * Reads only facts that the existing live Battle UI has already projected from
 * its authoritative state. This adapter never derives legality, turn order,
 * targets, or a wait reason from gameplay rules.
 *
 * Input ownership is recognized only where the live UI already proves a
 * participant-owned input surface:
 * - plan: the local Ready control is enabled -> viewer owns the input;
 * - target: the existing active-player board token identifies the owner.
 * Other phases stay unresolved instead of treating the attacker/active token as
 * an input owner when the screen is only resolving presentation.
 */
export function readBattleCurrentActionPublicDomFacts(root) {
  if (!root) return null;
  const boardTokens = list(root, '#boardPlayers .boardPlayerToken');
  const participants = [];
  const seen = new Set();
  for (const token of boardTokens) {
    const id = playerIdOf(token);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    participants.push({ id, label: id });
  }
  const viewerTokens = boardTokens.filter((node) => hasClass(node, 'human') && playerIdOf(node));
  if (participants.length === 0 || viewerTokens.length !== 1) return null;
  const viewerParticipantId = playerIdOf(viewerTokens[0]);
  if (!viewerParticipantId || !seen.has(viewerParticipantId)) return null;

  const currentAction = nonEmptyText(root.querySelector?.('#phaseTitle')?.textContent);
  const activePhase = nonEmptyText(root.querySelector?.('#phaseBar [data-ph].on')?.dataset?.ph);
  const readyPlan = root.querySelector?.('#readyPlan') ?? null;
  const targetBox = root.querySelector?.('#targetBox') ?? null;
  const activeTokens = boardTokens.filter((node) => hasClass(node, 'active') && playerIdOf(node));

  let inputOwnerParticipantId = null;
  if (activePhase === 'plan' && readyPlan && readyPlan.disabled === false) {
    inputOwnerParticipantId = viewerParticipantId;
  } else if (activePhase === 'target' && activeTokens.length === 1) {
    const activeId = playerIdOf(activeTokens[0]);
    if (activeId && seen.has(activeId)) {
      // When the viewer owns target input, the existing target surface must be
      // open. A peer owner is public through the exact active-player token.
      if (activeId !== viewerParticipantId || hasClass(targetBox, 'on')) {
        inputOwnerParticipantId = activeId;
      }
    }
  }

  let waitReason = null;
  if (inputOwnerParticipantId && inputOwnerParticipantId !== viewerParticipantId) {
    const publicChips = list(root, '#publicPlayerStrip .publicPlayerChip');
    const ownerChip = findByPlayerId(publicChips, inputOwnerParticipantId);
    // Use the existing public state verbatim. Do not rewrite it into a guessed
    // gameplay reason.
    waitReason = nonEmptyText(ownerChip?.dataset?.publicState);
  }

  return Object.freeze({
    authorityBoundary: AUTHORITY_BOUNDARY,
    participants: Object.freeze(participants.map((row) => Object.freeze({ ...row }))),
    viewerParticipantId,
    inputOwnerParticipantId,
    currentAction,
    waitReason,
  });
}

export function projectBattleCurrentActionLiveDom(root) {
  const facts = readBattleCurrentActionPublicDomFacts(root);
  if (!facts) return null;
  try {
    return projectBattleCurrentActionContext(facts);
  } catch {
    return null;
  }
}

function ensureCurrentActionStyle(documentRef) {
  if (!documentRef?.createElement) return { node: null, created: false };
  const prior = documentRef.getElementById?.(CURRENT_ACTION_STYLE_ID);
  if (prior) return { node: prior, created: false };
  const style = documentRef.createElement('style');
  style.id = CURRENT_ACTION_STYLE_ID;
  style.textContent = `
[${CURRENT_ACTION_ATTR}="1"].grBattleCurrentActionLive{display:block;box-sizing:border-box;padding:5px 8px;border:1px solid rgba(235,247,238,.42);border-radius:9px;background:rgba(4,28,24,.82);box-shadow:0 5px 14px rgba(0,0,0,.22);color:#f8fbeb;text-shadow:0 1px 6px rgba(0,0,0,.72);font-size:clamp(9px,.95vw,12px);font-weight:900;line-height:1.28;white-space:normal;pointer-events:none}
[${CURRENT_ACTION_ATTR}="1"].grBattleCurrentActionLive[hidden]{display:none!important}
@media (max-width:500px) and (orientation:portrait){
[${CURRENT_ACTION_ATTR}="1"].grBattleCurrentActionLive{transform:translateY(6px)}
}
`;
  (documentRef.head ?? documentRef.documentElement)?.appendChild?.(style);
  return { node: style, created: true };
}

function ensureCurrentActionSurface(documentRef, root) {
  const prior = root?.querySelector?.(`[${CURRENT_ACTION_ATTR}="1"]`) ?? null;
  if (prior) return { node: prior, created: false };
  if (!documentRef?.createElement || typeof root?.appendChild !== 'function') return { node: null, created: false };
  const node = documentRef.createElement('div');
  node.className = 'grBattleCurrentActionLive';
  node.setAttribute?.(CURRENT_ACTION_ATTR, '1');
  node.setAttribute?.('role', 'status');
  node.setAttribute?.('aria-live', 'polite');
  node.setAttribute?.('aria-atomic', 'true');
  if (node.dataset) {
    node.dataset.presentationOnly = 'true';
    node.dataset.authority = 'existing-public-live-dom-or-explicit-caller';
  }
  node.hidden = true;
  root.appendChild(node);
  return { node, created: true };
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null || value === '') delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function clearCurrentActionSurface(node) {
  if (!node) return null;
  node.textContent = '';
  node.hidden = true;
  node.removeAttribute?.('aria-label');
  for (const key of ['ownerRelation', 'inputOwnerParticipantId', 'waitingForParticipantId', 'currentActionSource']) setData(node, key, null);
  return null;
}

function renderCurrentActionSurface(node, model, source) {
  if (!node || !model?.visible) return clearCurrentActionSurface(node);
  node.textContent = model.text;
  node.hidden = false;
  node.setAttribute?.('aria-label', model.text);
  setData(node, 'ownerRelation', model.ownerRelation);
  setData(node, 'inputOwnerParticipantId', model.inputOwner?.participantId ?? null);
  setData(node, 'waitingForParticipantId', model.waitingFor?.participantId ?? null);
  setData(node, 'currentActionSource', source);
  return model;
}

function projectExplicitContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  try {
    return projectBattleCurrentActionContext(raw);
  } catch {
    return null;
  }
}

export function mountBattleCurrentPlayerUiLiveAdapter(globalRef = globalThis, {
  mountUi = mountBattleCurrentPlayerUi,
} = {}) {
  const documentRef = globalRef?.document;
  const root = resolveBattleRoot(documentRef);
  if (!documentRef || !root || typeof mountUi !== 'function') return null;
  if (root[ROOT_RUNTIME_PROP]) return root[ROOT_RUNTIME_PROP];

  const style = ensureCurrentActionStyle(documentRef);
  const actionSurface = ensureCurrentActionSurface(documentRef, root);
  if (!actionSurface.node) {
    if (style.created && style.node?.parentNode?.removeChild) style.node.parentNode.removeChild(style.node);
    return null;
  }

  let compositor = null;
  try { compositor = mountUi(globalRef, { root }); } catch {
    if (actionSurface.created && actionSurface.node?.parentNode?.removeChild) actionSurface.node.parentNode.removeChild(actionSurface.node);
    if (style.created && style.node?.parentNode?.removeChild) style.node.parentNode.removeChild(style.node);
    return null;
  }
  if (!compositor) return null;

  let destroyed = false;
  let runtime = null;
  let explicitCurrentActionContext = null;
  let lastCurrentAction = null;
  let scheduled = false;

  function refreshCurrentAction() {
    if (destroyed) return null;
    const model = explicitCurrentActionContext
      ? projectExplicitContext(explicitCurrentActionContext)
      : projectBattleCurrentActionLiveDom(root);
    lastCurrentAction = renderCurrentActionSurface(
      actionSurface.node,
      model,
      explicitCurrentActionContext ? 'explicit-caller' : 'existing-public-live-dom',
    );
    return lastCurrentAction;
  }

  function scheduleCurrentActionRefresh() {
    if (destroyed || explicitCurrentActionContext || scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      if (!destroyed && !explicitCurrentActionContext) refreshCurrentAction();
    };
    if (typeof globalRef.queueMicrotask === 'function') globalRef.queueMicrotask(run);
    else Promise.resolve().then(run);
  }

  const Observer = globalRef.MutationObserver;
  let observer = null;
  if (typeof Observer === 'function') {
    observer = new Observer(scheduleCurrentActionRefresh);
    const observe = (node, options) => {
      if (!node || typeof observer.observe !== 'function') return;
      try { observer.observe(node, options); } catch {}
    };
    observe(root.querySelector?.('#phaseTitle'), { childList: true, characterData: true, subtree: true });
    observe(root.querySelector?.('#phaseBar'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    observe(root.querySelector?.('#readyPlan'), { attributes: true, attributeFilter: ['disabled'] });
    observe(root.querySelector?.('#targetBox'), { attributes: true, attributeFilter: ['class'] });
    observe(root.querySelector?.('#boardPlayers'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-player'] });
    observe(root.querySelector?.('#publicPlayerStrip'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-player-id', 'data-public-state'] });
  }

  refreshCurrentAction();

  runtime = Object.freeze({
    schema: BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA,
    root,
    compositor,
    currentActionSurface: actionSurface.node,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    mounted: () => !destroyed && root[ROOT_RUNTIME_PROP] === runtime,
    inspect: () => compositor.inspect?.() ?? null,
    currentAction: () => lastCurrentAction,
    refreshCurrentAction,
    syncCurrentActionContext(raw = null) {
      explicitCurrentActionContext = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
      return refreshCurrentAction();
    },
    sync(snapshot = {}) {
      const compositorResult = compositor.sync?.(snapshot) ?? null;
      if (snapshot && typeof snapshot === 'object' && Object.prototype.hasOwnProperty.call(snapshot, 'currentActionContext')) {
        explicitCurrentActionContext = snapshot.currentActionContext && typeof snapshot.currentActionContext === 'object'
          ? snapshot.currentActionContext
          : null;
      }
      refreshCurrentAction();
      return compositorResult;
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      try { observer?.disconnect?.(); } catch {}
      try { compositor.destroy?.(); } catch {}
      if (actionSurface.created && actionSurface.node?.parentNode?.removeChild) actionSurface.node.parentNode.removeChild(actionSurface.node);
      if (style.created && style.node?.parentNode?.removeChild) style.node.parentNode.removeChild(style.node);
      if (root[ROOT_RUNTIME_PROP] === runtime) delete root[ROOT_RUNTIME_PROP];
      if (globalRef[GLOBAL_RUNTIME_PROP] === runtime) delete globalRef[GLOBAL_RUNTIME_PROP];
      return true;
    },
  });
  root[ROOT_RUNTIME_PROP] = runtime;
  globalRef[GLOBAL_RUNTIME_PROP] = runtime;
  return runtime;
}

function autoMount() {
  if (typeof globalThis !== 'object' || !globalThis.document) return null;
  return mountBattleCurrentPlayerUiLiveAdapter(globalThis);
}

if (typeof globalThis === 'object' && globalThis.document) {
  if (globalThis.document.readyState === 'loading') {
    globalThis.document.addEventListener?.('DOMContentLoaded', autoMount, { once: true });
  } else if (typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(autoMount);
  } else {
    Promise.resolve().then(autoMount);
  }
}
