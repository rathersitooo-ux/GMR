import {
  applyRogueRunEvent,
  createRogueRunState,
  snapshotRogueRunState,
} from './rogue-run-core.mjs';

const ROUTE_KINDS = new Set(['battle', 'boss']);
const FRIEND_ROOM_SHARE_GLOBAL_KEY = 'GAMEROAD_FRIEND_ROOM_SHARE_RUNTIME';
const FRIEND_ROOM_PANEL_SELECTOR = '#friendRoomPanel';
const FRIEND_ROOM_CODE_SELECTOR = '.friendCode > b';
const FRIEND_ROOM_ACTIONS_SELECTOR = '[data-friend-room-share-actions="r1"]';
const FRIEND_ROOM_COPY_SELECTOR = '[data-friend-room-copy="r1"]';
const FRIEND_ROOM_STYLE_ID = 'gameroad-friend-room-share-r1-style';
const FRIEND_ROOM_REAL_CODE = /^[A-Z0-9]{7}$/;

function cloneJson(value) {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('ROGUE_RUNTIME_VALUE_REQUIRED');
  return JSON.parse(text);
}

export function getRogueRunEntryLabel(run = null) {
  return run && run.phase !== 'COMPLETE' ? 'ローグを続ける' : 'ローグを開始';
}

function requireFunction(host, name) {
  if (typeof host?.[name] !== 'function') throw new TypeError(`ROGUE_RUNTIME_HOST_${name.toUpperCase()}_REQUIRED`);
}

function validateHost(host) {
  for (const name of [
    'createRunIdentity',
    'readDeckSnapshot',
    'readScreen',
    'readMatchSnapshot',
    'showSetup',
    'showHome',
  ]) requireFunction(host, name);
  return host;
}

export function createRogueRunConsumerController({ host } = {}) {
  validateHost(host);
  let run = null;
  let pendingRouteKind = null;
  let eventSequence = 0;

  const nextReceipt = (kind) => {
    eventSequence += 1;
    return `${run.runId}:${kind}:${eventSequence}`;
  };

  const readSnapshot = () => Object.freeze({
    run: run ? snapshotRogueRunState(run) : null,
    pendingRouteKind,
  });

  function start() {
    if (run && run.phase !== 'COMPLETE') {
      if (run.phase === 'AWAITING_ROUTE' && pendingRouteKind !== null && host.readScreen() === 'home') {
        host.showSetup();
      }
      return readSnapshot();
    }
    const identity = cloneJson(host.createRunIdentity());
    run = createRogueRunState({
      runId: identity.runId,
      pathSeed: identity.pathSeed,
      chapterIdentity: identity.chapterIdentity,
      deckSnapshot: host.readDeckSnapshot(),
      handSnapshot: typeof host.readHandSnapshot === 'function' ? host.readHandSnapshot() : null,
    });
    pendingRouteKind = null;
    eventSequence = 0;
    return readSnapshot();
  }

  function chooseRoute(nodeKind) {
    if (!run || run.phase !== 'AWAITING_ROUTE') throw new Error('ROGUE_RUNTIME_ROUTE_NOT_READY');
    if (!ROUTE_KINDS.has(nodeKind)) throw new Error('ROGUE_RUNTIME_ROUTE_KIND_INVALID');
    pendingRouteKind = nodeKind;
    host.showSetup();
    return readSnapshot();
  }

  function observeBattleStart() {
    if (!run || run.phase !== 'AWAITING_ROUTE' || !pendingRouteKind || host.readScreen() !== 'battle') {
      return false;
    }
    const match = host.readMatchSnapshot();
    if (!match?.matchId) return false;
    const nodeKind = pendingRouteKind;
    run = applyRogueRunEvent(run, {
      type: 'ROUTE_CONFIRMED',
      receiptId: nextReceipt('route'),
      nodeId: `${run.runId}:node:${eventSequence}`,
      nodeKind,
      battleHandoff: { matchId: match.matchId },
    });
    pendingRouteKind = null;
    return true;
  }

  function observeBattleResult() {
    if (!run || run.phase !== 'AWAITING_BATTLE_RESULT' || host.readScreen() !== 'result') return false;
    const match = host.readMatchSnapshot();
    if (!match?.matchId || !match.result) return false;
    const expectedMatchId = run.battleHandoff?.matchId;
    if (!expectedMatchId || match.matchId !== expectedMatchId) return false;
    const boss = run.currentNode?.nodeKind === 'boss';
    run = applyRogueRunEvent(run, {
      type: 'BATTLE_RESULT_CONFIRMED',
      receiptId: nextReceipt('battle-result'),
      result: match.result,
      authoritativeDisposition: boss ? 'RUN_COMPLETE' : 'REWARD',
      ...(boss ? { completion: { resultHandoff: { screen: 'result', matchId: match.matchId } } } : {}),
    });
    return true;
  }

  function observe() {
    const battleChanged = observeBattleStart();
    const resultChanged = observeBattleResult();
    return battleChanged || resultChanged;
  }

  function skipReward() {
    if (!run || run.phase !== 'AWAITING_REWARD_DECISION') throw new Error('ROGUE_RUNTIME_REWARD_NOT_READY');
    run = applyRogueRunEvent(run, {
      type: 'REWARD_DECISION_CONFIRMED',
      receiptId: nextReceipt('reward-skip'),
      decision: 'SKIP',
      nextDeckSnapshot: host.readDeckSnapshot(),
      ...(typeof host.readHandSnapshot === 'function' ? { nextHandSnapshot: host.readHandSnapshot() } : {}),
    });
    run = applyRogueRunEvent(run, {
      type: 'ADVANCE_CONFIRMED',
      receiptId: nextReceipt('advance'),
    });
    host.showHome();
    return readSnapshot();
  }

  return Object.freeze({ start, chooseRoute, observe, skipReward, getSnapshot: readSnapshot });
}

function element(documentSource, tag, attributes = {}, text = '') {
  const node = documentSource.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  node.textContent = text;
  return node;
}

function installStyle(documentSource) {
  if (documentSource.getElementById('gameroad-rogue-run-live-mount-r1-style')) return;
  const style = element(documentSource, 'style', { id: 'gameroad-rogue-run-live-mount-r1-style' });
  style.textContent = `
    .rogueRunEntry{position:absolute;left:2%;bottom:3%;z-index:7;min-width:120px;min-height:44px;padding:0 12px;border:1px solid rgba(160,239,213,.3);border-radius:12px;background:rgba(3,17,14,.9);color:#c4d8d2;font-size:10px;font-weight:850;letter-spacing:.04em;box-shadow:none;opacity:.74;transition:opacity .14s ease,border-color .14s ease,background .14s ease,transform .14s ease}
    .rogueRunEntry:hover,.rogueRunEntry:focus-visible{opacity:1;border-color:rgba(160,239,213,.66);background:rgba(7,29,23,.96);transform:translateY(-1px);outline:none}
    .rogueRunPanel{position:absolute;z-index:150;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 24px));padding:18px;border:1px solid rgba(214,187,255,.72);border-radius:18px;background:rgba(15,12,31,.97);box-shadow:0 24px 80px rgba(0,0,0,.62);color:#f8f3ff}
    .rogueRunPanel[hidden]{display:none}.rogueRunPanel h2{margin:0 0 8px;font-size:22px}.rogueRunPanel p{margin:0 0 14px;color:#d6cae9;line-height:1.6}.rogueRunActions{display:flex;flex-wrap:wrap;gap:8px}.rogueRunAction{min-height:44px;border:1px solid rgba(220,200,255,.55);border-radius:12px;background:#332451;color:#fff;padding:0 14px;font-weight:900}.rogueRunAction.primary{border-color:#ffe19a;background:#60406f;color:#fff7d5}
    @media(max-width:620px) and (orientation:portrait){.rogueRunEntry{left:4%;bottom:31%;font-size:10px}.rogueRunPanel{top:44%;padding:14px}.rogueRunPanel h2{font-size:18px}}
  `;
  documentSource.head.append(style);
}

export function createRoguePanelOutsideDismissHandler({ panel, onDismiss } = {}) {
  if (!panel?.contains || typeof onDismiss !== 'function') throw new TypeError('ROGUE_RUNTIME_DISMISS_INPUT_INVALID');
  return function dismissRoguePanelFromOutside(event) {
    if (panel.hidden || panel.contains(event?.target)) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    onDismiss();
    return true;
  };
}

export function mountRogueRunRuntime(host) {
  validateHost(host);
  const documentSource = host.document || globalThis.document;
  if (!documentSource?.createElement) throw new TypeError('ROGUE_RUNTIME_DOCUMENT_REQUIRED');
  const home = documentSource.querySelector('.screen.home[data-screen="home"]');
  const app = documentSource.querySelector('.app');
  if (!home || !app) throw new Error('ROGUE_RUNTIME_SURFACE_MISSING');
  if (globalThis.GAMEROAD_ROGUE_RUNTIME?.getSnapshot) return globalThis.GAMEROAD_ROGUE_RUNTIME;

  installStyle(documentSource);
  const controller = createRogueRunConsumerController({ host });
  const entry = element(documentSource, 'button', {
    type: 'button', class: 'rogueRunEntry', 'data-rogue-action': 'start', 'aria-haspopup': 'dialog',
  }, 'ローグを開始');
  const panel = element(documentSource, 'section', {
    class: 'rogueRunPanel', 'data-rogue-run-panel': 'r1', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rogueRunTitle',
  });
  panel.hidden = true;
  panel.innerHTML = `
    <h2 id="rogueRunTitle">ローグラン</h2>
    <div class="rogueRunActions" data-rogue-routes>
      <button type="button" class="rogueRunAction primary" data-rogue-action="route-battle">通常戦へ</button>
      <button type="button" class="rogueRunAction" data-rogue-action="route-boss">章最終戦へ</button>
    </div>
    <div class="rogueRunActions" data-rogue-reward hidden>
      <button type="button" class="rogueRunAction primary" data-rogue-action="skip-reward">報酬を見送って次へ</button>
    </div>
  `;
  home.append(entry);
  app.append(panel);

  const routes = panel.querySelector('[data-rogue-routes]');
  const reward = panel.querySelector('[data-rogue-reward]');
  let panelDismissed = false;

  function render() {
    const snapshot = controller.getSnapshot();
    const phase = snapshot.run?.phase || 'NOT_STARTED';
    panel.dataset.roguePhase = phase;
    entry.textContent = getRogueRunEntryLabel(snapshot.run);
    const routeReady = phase === 'AWAITING_ROUTE' && snapshot.pendingRouteKind === null;
    const rewardReady = phase === 'AWAITING_REWARD_DECISION';
    routes.hidden = !routeReady;
    reward.hidden = !rewardReady;
    panel.hidden = panelDismissed || !(routeReady || rewardReady);
  }

  function observeAndRender() {
    controller.observe();
    render();
  }

  entry.addEventListener('click', () => { panelDismissed = false; controller.start(); render(); });
  panel.querySelector('[data-rogue-action="route-battle"]').addEventListener('click', () => { controller.chooseRoute('battle'); render(); });
  panel.querySelector('[data-rogue-action="route-boss"]').addEventListener('click', () => { controller.chooseRoute('boss'); render(); });
  panel.querySelector('[data-rogue-action="skip-reward"]').addEventListener('click', () => { controller.skipReward(); render(); });

  const dismissOnOutsideClick = createRoguePanelOutsideDismissHandler({
    panel,
    onDismiss() {
      panelDismissed = true;
      render();
    },
  });
  documentSource.addEventListener('click', dismissOnOutsideClick, true);

  const observer = new MutationObserver(observeAndRender);
  documentSource.querySelectorAll('.screen[data-screen]').forEach((screen) => observer.observe(screen, { attributes: true, attributeFilter: ['class'] }));
  render();

  return Object.freeze({
    ...controller,
    destroy() {
      observer.disconnect();
      documentSource.removeEventListener('click', dismissOnOutsideClick, true);
      entry.remove();
      panel.remove();
    },
  });
}

export function createCurrentBrowserRogueHost({
  qa = globalThis.__GAMEROAD_TEST__,
  documentSource = globalThis.document,
} = {}) {
  if (!qa?.state || typeof qa.show !== 'function' || !documentSource) return null;
  return Object.freeze({
    document: documentSource,
    createRunIdentity() {
      const token = globalThis.crypto?.randomUUID?.() || `r${Date.now().toString(36)}`;
      const runId = `rogue-${token}`;
      return { runId, pathSeed: { source: 'current-browser', runId }, chapterIdentity: null };
    },
    readDeckSnapshot() {
      return cloneJson(qa.state.saveAuthorityDeck || qa.state.savedDeck);
    },
    readHandSnapshot() {
      const human = qa.state.match?.players?.find((player) => player.human);
      return human ? { cardIds: [...human.hand] } : null;
    },
    readScreen() {
      return documentSource.querySelector('.screen.active[data-screen]')?.dataset?.screen || null;
    },
    readMatchSnapshot() {
      const match = qa.state.match;
      if (!match?.id) return null;
      const lastResult = match.lastResult;
      return {
        matchId: String(match.id),
        result: lastResult ? {
          headline: lastResult.headline,
          grade: lastResult.grade,
          points: cloneJson(lastResult.points),
          ranking: lastResult.ranking.map((row) => ({
            participantId: row.player?.id || null,
            rank: row.rank,
            depth: row.depth,
          })),
        } : null,
      };
    },
    showSetup() { qa.show('setup'); },
    showHome() { qa.show('home'); },
  });
}

export function mountRogueRunFromCurrentBrowser(options = {}) {
  if (globalThis.GAMEROAD_ROGUE_RUNTIME?.getSnapshot) return globalThis.GAMEROAD_ROGUE_RUNTIME;
  const host = createCurrentBrowserRogueHost(options);
  if (!host) return null;
  globalThis.GAMEROAD_ROGUE_HOST = host;
  const runtime = mountRogueRunRuntime(host);
  globalThis.GAMEROAD_ROGUE_RUNTIME = runtime;
  return runtime;
}

export function normalizeVisibleFriendRoomCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return FRIEND_ROOM_REAL_CODE.test(code) ? code : null;
}

export async function copyFriendRoomCode({ code, clipboard = globalThis.navigator?.clipboard } = {}) {
  const normalized = normalizeVisibleFriendRoomCode(code);
  if (!normalized) return Object.freeze({ ok: false, reason: 'NO_REAL_CODE' });
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    return Object.freeze({ ok: false, reason: 'CLIPBOARD_UNAVAILABLE', code: normalized });
  }
  try {
    await clipboard.writeText(normalized);
    return Object.freeze({ ok: true, reason: 'COPIED', code: normalized });
  } catch {
    return Object.freeze({ ok: false, reason: 'CLIPBOARD_REJECTED', code: normalized });
  }
}

function installFriendRoomShareStyle(documentSource) {
  if (documentSource.getElementById(FRIEND_ROOM_STYLE_ID)) return;
  const style = documentSource.createElement('style');
  style.id = FRIEND_ROOM_STYLE_ID;
  style.textContent = `
    .friendRoomShareActions{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin-top:6px}
    .friendRoomCopyBtn{min-height:44px;width:100%}
    .friendRoomCopyStatus{min-height:1.2em}
  `;
  documentSource.head?.append(style);
}

function removeFriendRoomShareActions(panel) {
  panel.querySelector(FRIEND_ROOM_ACTIONS_SELECTOR)?.remove();
}

export function mountFriendRoomShareRuntime({
  documentSource = globalThis.document,
  clipboard = globalThis.navigator?.clipboard,
  MutationObserverSource = globalThis.MutationObserver,
} = {}) {
  if (!documentSource?.querySelector || !documentSource?.createElement) return null;
  const panel = documentSource.querySelector(FRIEND_ROOM_PANEL_SELECTOR);
  if (!panel) return null;
  if (globalThis[FRIEND_ROOM_SHARE_GLOBAL_KEY]?.panel === panel) return globalThis[FRIEND_ROOM_SHARE_GLOBAL_KEY];

  installFriendRoomShareStyle(documentSource);
  let destroyed = false;
  let refreshScheduled = false;

  function refresh() {
    if (destroyed) return false;
    const codeNode = panel.querySelector(FRIEND_ROOM_CODE_SELECTOR);
    const code = normalizeVisibleFriendRoomCode(codeNode?.textContent);
    const codeBox = codeNode?.closest?.('.friendCode');
    if (!code || !codeBox) {
      removeFriendRoomShareActions(panel);
      return false;
    }

    let actions = panel.querySelector(FRIEND_ROOM_ACTIONS_SELECTOR);
    let button = actions?.querySelector(FRIEND_ROOM_COPY_SELECTOR);
    let status = actions?.querySelector('[data-friend-room-copy-status="r1"]');
    if (!actions || !button || !status) {
      removeFriendRoomShareActions(panel);
      actions = documentSource.createElement('div');
      actions.className = 'friendRoomShareActions';
      actions.dataset.friendRoomShareActions = 'r1';

      button = documentSource.createElement('button');
      button.type = 'button';
      button.className = 'btn friendRoomCopyBtn';
      button.dataset.friendRoomCopy = 'r1';
      button.textContent = '合言葉をコピー';

      status = documentSource.createElement('small');
      status.className = 'friendRoomCopyStatus';
      status.dataset.friendRoomCopyStatus = 'r1';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');

      button.addEventListener('click', async () => {
        const currentCode = normalizeVisibleFriendRoomCode(panel.querySelector(FRIEND_ROOM_CODE_SELECTOR)?.textContent);
        if (!currentCode) {
          status.textContent = '合言葉がありません';
          return;
        }
        button.disabled = true;
        status.textContent = '';
        const result = await copyFriendRoomCode({ code: currentCode, clipboard });
        button.disabled = false;
        const stillVisible = normalizeVisibleFriendRoomCode(panel.querySelector(FRIEND_ROOM_CODE_SELECTOR)?.textContent);
        if (result.ok && stillVisible === result.code) status.textContent = 'コピーしました';
        else if (result.ok) status.textContent = '';
        else status.textContent = 'コピーできません';
      });
      actions.append(button, status);
      codeBox.append(actions);
    }

    button.dataset.friendRoomCode = code;
    button.setAttribute('aria-label', `合言葉 ${code} をコピー`);
    return true;
  }

  function scheduleRefresh() {
    if (destroyed || refreshScheduled) return;
    refreshScheduled = true;
    queueMicrotask(() => {
      refreshScheduled = false;
      refresh();
    });
  }

  const observer = typeof MutationObserverSource === 'function'
    ? new MutationObserverSource(scheduleRefresh)
    : null;
  observer?.observe(panel, { childList: true, subtree: true, characterData: true });
  refresh();

  const runtime = Object.freeze({
    panel,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      removeFriendRoomShareActions(panel);
      if (globalThis[FRIEND_ROOM_SHARE_GLOBAL_KEY] === runtime) delete globalThis[FRIEND_ROOM_SHARE_GLOBAL_KEY];
    },
  });
  globalThis[FRIEND_ROOM_SHARE_GLOBAL_KEY] = runtime;
  return runtime;
}

export function mountFriendRoomShareFromCurrentBrowser() {
  return mountFriendRoomShareRuntime();
}

function autoMountFriendRoomShare() {
  if (typeof document === 'undefined') return;
  const mount = () => mountFriendRoomShareFromCurrentBrowser();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}

autoMountFriendRoomShare();
