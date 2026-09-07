import {
  createBattleHandRouletteState,
  resolveBattleHandRouletteCommit,
  stepBattleHandRouletteState,
} from './battle-hand-roulette-core.mjs';

export const BATTLE_HAND_ROULETTE_RUNTIME_SCHEMA = 'gameroad.battle-hand-roulette-runtime.v1';
const HOST_ATTR = 'data-battle-hand-roulette';
const STYLE_ID = 'gameroad-battle-hand-roulette-runtime-v1-style';
const CANDIDATE_SELECTOR = '#hand .handCard.grPlayableHandCandidate[data-card-id]';

function normalizeCardId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function candidateNodes(battleRoot) {
  return [...(battleRoot?.querySelectorAll?.(CANDIDATE_SELECTOR) ?? [])]
    .filter((node) => {
      const id = normalizeCardId(node?.dataset?.cardId);
      return id && !node?.disabled && node?.getAttribute?.('aria-disabled') !== 'true';
    });
}

export function collectBattleHandRouletteCandidateCardIds(battleRoot) {
  const seen = new Set();
  return Object.freeze(candidateNodes(battleRoot).flatMap((node) => {
    const id = normalizeCardId(node?.dataset?.cardId);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [id];
  }));
}

export function resolveBattleHandRouletteNode(battleRoot, cardId) {
  const id = normalizeCardId(cardId);
  if (!id) return null;
  return candidateNodes(battleRoot).find((node) => normalizeCardId(node?.dataset?.cardId) === id) ?? null;
}

function fingerprint(ids) {
  return ids.join('\u001f');
}

function cardLabel(node, fallback) {
  const text = node?.getAttribute?.('aria-label') || node?.textContent?.trim?.();
  return String(text || fallback || '').replace(/\s+/g, ' ').trim();
}

function installStyle(documentRef) {
  if (!documentRef?.head || documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${HOST_ATTR}="1"]{position:absolute;right:max(86px,calc(env(safe-area-inset-right) + 78px));bottom:max(15px,env(safe-area-inset-bottom));z-index:41;width:174px;height:174px;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${HOST_ATTR}="1"][data-empty="true"]{display:none}
[${HOST_ATTR}="1"] .grRouletteRing{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,224,91,.58);background:radial-gradient(circle,rgba(21,29,51,.86) 0 33%,rgba(36,39,76,.68) 34% 61%,rgba(255,215,70,.13) 62% 66%,rgba(15,20,43,.82) 67%);box-shadow:0 10px 28px rgba(0,0,0,.38),0 0 22px rgba(255,215,70,.12);pointer-events:auto;touch-action:manipulation}
[${HOST_ATTR}="1"] .grRouletteCard{position:absolute;left:50%;top:50%;width:54px;height:31px;margin:-15px -27px;border:1px solid rgba(255,255,255,.38);border-radius:8px;background:rgba(28,34,66,.94);color:#f7f9ff;font-size:9px;font-weight:850;line-height:1.05;overflow:hidden;text-overflow:ellipsis;padding:3px;box-shadow:0 4px 10px rgba(0,0,0,.28);transform:rotate(var(--angle)) translateY(-66px) rotate(calc(-1 * var(--angle)));transition:filter 90ms ease,box-shadow 90ms ease,opacity 90ms ease;touch-action:manipulation}
[${HOST_ATTR}="1"] .grRouletteCard[data-selected="true"]{filter:brightness(1.35);border-color:#ffe15a;box-shadow:0 0 0 2px rgba(255,225,90,.28),0 0 18px rgba(255,213,55,.35)}
[${HOST_ATTR}="1"] .grRouletteCommit{position:absolute;left:50%;top:50%;width:70px;height:70px;margin:-35px;border-radius:50%;border:2px solid rgba(255,239,154,.86);background:radial-gradient(circle at 36% 28%,#fff3aa 0 8%,#f0b52c 24%,#b05d23 55%,#432846 82%,#15172e 100%);color:#fff;font-size:11px;font-weight:950;line-height:1.05;text-shadow:0 1px 3px rgba(0,0,0,.8);box-shadow:0 7px 18px rgba(0,0,0,.35),0 0 20px rgba(255,205,72,.22);pointer-events:auto;touch-action:manipulation}
[${HOST_ATTR}="1"] .grRoulettePending{position:absolute;right:-3px;top:-3px;min-width:21px;height:21px;padding:0 5px;box-sizing:border-box;border-radius:999px;display:grid;place-items:center;background:#fff2a4;color:#322416;font-size:10px;font-weight:950;box-shadow:0 3px 10px rgba(0,0,0,.32);pointer-events:none}
[${HOST_ATTR}="1"][data-waiting="true"] .grRouletteCommit{filter:saturate(.72) brightness(.92)}
@media(max-height:430px) and (orientation:landscape){[${HOST_ATTR}="1"]{width:138px;height:138px;right:68px;bottom:5px}[${HOST_ATTR}="1"] .grRouletteCard{width:45px;height:27px;margin:-13px -22px;transform:rotate(var(--angle)) translateY(-52px) rotate(calc(-1 * var(--angle)));font-size:8px}[${HOST_ATTR}="1"] .grRouletteCommit{width:58px;height:58px;margin:-29px;font-size:9px}}
@media(prefers-reduced-motion:reduce){[${HOST_ATTR}="1"] .grRouletteCard,[${HOST_ATTR}="1"] .grRouletteCommit{transition:none!important}}
`;
  documentRef.head.appendChild(style);
}

export function mountBattleHandRouletteRuntime(globalRef = globalThis, { battleRoot = null } = {}) {
  const documentRef = globalRef?.document;
  const root = battleRoot ?? documentRef?.querySelector?.('section[data-screen="battle"]');
  if (!documentRef || !root) return null;
  const existing = root.querySelector?.(`[${HOST_ATTR}="1"]`);
  if (existing?.__gameroadRuntime) return existing.__gameroadRuntime;
  installStyle(documentRef);

  const host = documentRef.createElement('aside');
  host.setAttribute(HOST_ATTR, '1');
  host.dataset.empty = 'true';
  host.dataset.waiting = 'false';
  host.setAttribute('aria-label', '手札ルーレット');
  const ring = documentRef.createElement('div');
  ring.className = 'grRouletteRing';
  const commitButton = documentRef.createElement('button');
  commitButton.type = 'button';
  commitButton.className = 'grRouletteCommit';
  commitButton.textContent = 'ルーレット';
  commitButton.setAttribute('aria-label', '選択中の手札をルーレットから使う');
  const pendingBadge = documentRef.createElement('span');
  pendingBadge.className = 'grRoulettePending';
  pendingBadge.hidden = true;
  commitButton.appendChild(pendingBadge);
  host.append(ring, commitButton);
  root.appendChild(host);

  let state = createBattleHandRouletteState({ candidateCardIds: [] });
  let lastFingerprint = '';
  let waitingForCandidateChange = false;
  let pendingTapCount = 0;
  let preferredNextCardId = null;
  let destroyed = false;
  let syncTimer = null;

  function render(ids) {
    const selected = state?.selectedCardId ?? null;
    ring.replaceChildren?.();
    ids.forEach((id, index) => {
      const node = resolveBattleHandRouletteNode(root, id);
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'grRouletteCard';
      button.dataset.cardId = id;
      button.dataset.selected = String(id === selected);
      button.style.setProperty('--angle', `${(360 * index) / Math.max(1, ids.length)}deg`);
      button.textContent = cardLabel(node, id);
      button.setAttribute('aria-label', `${cardLabel(node, id)}をルーレットの始点にする`);
      button.onclick = () => {
        if (waitingForCandidateChange) return;
        state = createBattleHandRouletteState({ candidateCardIds: ids, anchorCardId: id });
        render(ids);
      };
      ring.appendChild(button);
    });
    host.dataset.empty = String(ids.length === 0);
    host.dataset.waiting = String(waitingForCandidateChange);
    pendingBadge.hidden = pendingTapCount <= 0;
    pendingBadge.textContent = pendingTapCount > 9 ? '9+' : String(pendingTapCount);
    commitButton.disabled = ids.length === 0;
    const selectedNode = selected ? resolveBattleHandRouletteNode(root, selected) : null;
    commitButton.title = selected ? cardLabel(selectedNode, selected) : '';
  }

  function sync({ force = false } = {}) {
    if (destroyed) return Object.freeze([]);
    const ids = collectBattleHandRouletteCandidateCardIds(root);
    const nextFingerprint = fingerprint(ids);
    const changed = nextFingerprint !== lastFingerprint;
    if (changed || force) {
      const anchor = preferredNextCardId && ids.includes(preferredNextCardId)
        ? preferredNextCardId
        : (state?.selectedCardId && ids.includes(state.selectedCardId) ? state.selectedCardId : ids[0] ?? null);
      state = createBattleHandRouletteState({ candidateCardIds: ids, anchorCardId: anchor });
      lastFingerprint = nextFingerprint;
      if (changed) waitingForCandidateChange = false;
      if (!waitingForCandidateChange) preferredNextCardId = null;
    }
    render(ids);
    if (!waitingForCandidateChange && pendingTapCount > 0) queueMicrotask(drainOneTap);
    return ids;
  }

  function scheduleSync() {
    if (destroyed) return;
    if (syncTimer !== null) globalRef.clearTimeout?.(syncTimer);
    syncTimer = globalRef.setTimeout?.(() => {
      syncTimer = null;
      sync();
    }, 0) ?? null;
  }

  function drainOneTap() {
    if (destroyed || waitingForCandidateChange || pendingTapCount <= 0) return false;
    const ids = collectBattleHandRouletteCandidateCardIds(root);
    if (!ids.length) {
      sync({ force: true });
      return false;
    }
    if (!state?.selectedCardId || !ids.includes(state.selectedCardId)) {
      state = createBattleHandRouletteState({ candidateCardIds: ids, anchorCardId: preferredNextCardId });
    }
    const selectedCardId = resolveBattleHandRouletteCommit(state, { currentCandidateCardIds: ids });
    const node = selectedCardId ? resolveBattleHandRouletteNode(root, selectedCardId) : null;
    if (!node || typeof node.click !== 'function') {
      sync({ force: true });
      return false;
    }
    const nextState = stepBattleHandRouletteState(state, { steps: 1, direction: 1 });
    preferredNextCardId = nextState.selectedCardId;
    pendingTapCount -= 1;
    waitingForCandidateChange = true;
    host.dataset.waiting = 'true';
    render(ids);
    node.click();
    return true;
  }

  function queueTap() {
    if (destroyed) return;
    const ids = collectBattleHandRouletteCandidateCardIds(root);
    if (!ids.length) {
      sync({ force: true });
      return;
    }
    if (!state?.selectedCardId || !ids.includes(state.selectedCardId)) {
      state = createBattleHandRouletteState({ candidateCardIds: ids, anchorCardId: ids[0] });
    }
    pendingTapCount += 1;
    render(ids);
    drainOneTap();
  }

  commitButton.addEventListener('click', queueTap);

  const Observer = globalRef.MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(scheduleSync) : null;
  observer?.observe?.(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-card-id', 'aria-disabled', 'disabled'],
  });
  sync({ force: true });

  const runtime = Object.freeze({
    schema: BATTLE_HAND_ROULETTE_RUNTIME_SCHEMA,
    sync,
    queueTap,
    snapshot: () => Object.freeze({
      schema: BATTLE_HAND_ROULETTE_RUNTIME_SCHEMA,
      candidateCardIds: state.candidateCardIds,
      selectedCardId: state.selectedCardId,
      pendingTapCount,
      waitingForCandidateChange,
    }),
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      if (syncTimer !== null) globalRef.clearTimeout?.(syncTimer);
      observer?.disconnect?.();
      commitButton.removeEventListener?.('click', queueTap);
      host.remove?.();
      return true;
    },
  });
  host.__gameroadRuntime = runtime;
  return runtime;
}

function autoMount() {
  if (typeof globalThis !== 'object' || !globalThis.document) return;
  const runtime = mountBattleHandRouletteRuntime(globalThis);
  if (runtime) globalThis.__GAMEROAD_BATTLE_HAND_ROULETTE__ = runtime;
}

if (typeof globalThis === 'object' && globalThis.document) {
  if (globalThis.document.readyState === 'loading') {
    globalThis.document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    queueMicrotask(autoMount);
  }
}
