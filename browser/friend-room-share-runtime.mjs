const GLOBAL_KEY = 'GAMEROAD_FRIEND_ROOM_SHARE_RUNTIME';
const PANEL_SELECTOR = '#friendRoomPanel';
const CODE_SELECTOR = '.friendCode > b';
const ACTIONS_SELECTOR = '[data-friend-room-share-actions="r1"]';
const COPY_SELECTOR = '[data-friend-room-copy="r1"]';
const STYLE_ID = 'gameroad-friend-room-share-r1-style';
const REAL_CODE = /^[A-Z0-9]{7}$/;

export function normalizeVisibleFriendRoomCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return REAL_CODE.test(code) ? code : null;
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

function installStyle(documentSource) {
  if (documentSource.getElementById(STYLE_ID)) return;
  const style = documentSource.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .friendRoomShareActions{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin-top:6px}
    .friendRoomCopyBtn{min-height:44px;width:100%}
    .friendRoomCopyStatus{min-height:1.2em}
  `;
  documentSource.head?.append(style);
}

function removeActions(panel) {
  panel.querySelector(ACTIONS_SELECTOR)?.remove();
}

export function mountFriendRoomShareRuntime({
  documentSource = globalThis.document,
  clipboard = globalThis.navigator?.clipboard,
  MutationObserverSource = globalThis.MutationObserver,
} = {}) {
  if (!documentSource?.querySelector || !documentSource?.createElement) return null;
  const panel = documentSource.querySelector(PANEL_SELECTOR);
  if (!panel) return null;
  if (globalThis[GLOBAL_KEY]?.panel === panel) return globalThis[GLOBAL_KEY];

  installStyle(documentSource);
  let destroyed = false;
  let refreshScheduled = false;

  function refresh() {
    if (destroyed) return false;
    const codeNode = panel.querySelector(CODE_SELECTOR);
    const code = normalizeVisibleFriendRoomCode(codeNode?.textContent);
    const codeBox = codeNode?.closest?.('.friendCode');
    if (!code || !codeBox) {
      removeActions(panel);
      return false;
    }

    let actions = panel.querySelector(ACTIONS_SELECTOR);
    let button = actions?.querySelector(COPY_SELECTOR);
    let status = actions?.querySelector('[data-friend-room-copy-status="r1"]');
    if (!actions || !button || !status) {
      removeActions(panel);
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
        const currentCode = normalizeVisibleFriendRoomCode(panel.querySelector(CODE_SELECTOR)?.textContent);
        if (!currentCode) {
          status.textContent = '合言葉がありません';
          return;
        }
        button.disabled = true;
        status.textContent = '';
        const result = await copyFriendRoomCode({ code: currentCode, clipboard });
        button.disabled = false;
        const stillVisible = normalizeVisibleFriendRoomCode(panel.querySelector(CODE_SELECTOR)?.textContent);
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
      removeActions(panel);
      if (globalThis[GLOBAL_KEY] === runtime) delete globalThis[GLOBAL_KEY];
    },
  });
  globalThis[GLOBAL_KEY] = runtime;
  return runtime;
}

export function mountFriendRoomShareFromCurrentBrowser() {
  return mountFriendRoomShareRuntime();
}

function autoMount() {
  if (typeof document === 'undefined') return;
  const mount = () => mountFriendRoomShareFromCurrentBrowser();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}

autoMount();
