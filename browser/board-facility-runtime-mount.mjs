import { createSaasunaConversationEntry } from './partner-conversation-core.mjs';

const CLASSIC_BRIDGE_NAME = 'GAMEROAD_BOARD_FACILITY_STATE_CORE';
const RUNTIME_NAME = 'GAMEROAD_BOARD_FACILITY_RUNTIME';
const RUNTIME_VERSION = 'gameroad.board-facility-runtime-mount.v1';
const PARTNER_CONVERSATION_MOUNT_NAME = 'GAMEROAD_PARTNER_CONVERSATION_PRODUCT_MOUNT';
const PARTNER_CONVERSATION_STYLE_ID = 'gameroad-partner-conversation-product-style';

function requireObject(value, code) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new Error(code);
  }
  return value;
}

export function partnerConversationProjectionDecision({
  screenActive = false,
  partnerRoleActive = false,
  playerModeRequested = false,
  saasunaSelected = false,
} = {}) {
  if (!screenActive) return 'idle';
  if (!partnerRoleActive) return playerModeRequested ? 'player' : 'activate_partner';
  if (!saasunaSelected) return 'select_saasuna';
  return 'conversation';
}

function appendStyle(document) {
  if (document.getElementById?.(PARTNER_CONVERSATION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PARTNER_CONVERSATION_STYLE_ID;
  style.textContent = `
.grPartnerConversation{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(150px,1fr) auto;gap:8px;padding:2px}
.grPartnerConversationHead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.grPartnerConversationHeadCopy{min-width:0}.grPartnerConversationHeadCopy b{display:block;font-size:16px}.grPartnerConversationHeadCopy small{display:block;margin-top:3px;color:var(--muted);font-size:8px;line-height:1.4}
.grPartnerConversationSwitch{min-height:42px!important;white-space:nowrap}
.grPartnerConversationLog{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:7px;padding:4px 2px 8px;overscroll-behavior:contain}
.grPartnerConversationMessage{max-width:88%;padding:8px 10px;border:1px solid var(--line);background:#081d18;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.grPartnerConversationMessage.user{align-self:flex-end;background:#173f35;border-color:rgba(160,239,213,.45)}
.grPartnerConversationMessage.saasuna{align-self:flex-start;background:#0b2721}
.grPartnerConversationMessage.system{align-self:stretch;max-width:none;color:var(--muted);font-size:9px;background:rgba(5,20,16,.7)}
.grPartnerConversationComposer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:stretch}
.grPartnerConversationInput{min-height:48px;max-height:120px;resize:vertical;border:1px solid var(--line);background:#071a16;color:var(--ink);padding:10px;font:inherit;line-height:1.45}
.grPartnerConversationSend{min-width:72px}
@media(max-width:540px) and (orientation:portrait){.grPartnerConversation{min-height:320px}.grPartnerConversationMessage{max-width:94%;font-size:12px}.grPartnerConversationComposer{grid-template-columns:1fr}.grPartnerConversationSend{width:100%}}
`;
  document.head?.appendChild(style);
}

function createElement(document, tag, className, text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function scrollLog(log) {
  try {
    log.scrollTop = log.scrollHeight;
  } catch {
    // Presentation-only best effort.
  }
}

function addMessage(document, log, role, text) {
  const row = createElement(document, 'div', `grPartnerConversationMessage ${role}`, text);
  row.dataset.role = role;
  log.appendChild(row);
  while (log.children.length > 40) log.firstElementChild?.remove();
  scrollLog(log);
  return row;
}

function findSaasunaCard(roster) {
  return [...roster.querySelectorAll('.charCard')]
    .find((card) => String(card.textContent || '').includes('サースナー')) ?? null;
}

export function mountSaasunaConversationProductSurface(global = globalThis) {
  const document = global?.document;
  const MutationObserverCtor = global?.MutationObserver;
  if (!document?.querySelector || !document?.createElement || typeof MutationObserverCtor !== 'function') {
    return null;
  }

  const existing = global[PARTNER_CONVERSATION_MOUNT_NAME];
  if (existing) return existing;

  appendStyle(document);
  const entry = createSaasunaConversationEntry({ provider: null });
  let playerModeRequested = false;
  let screenWasActive = false;
  let projecting = false;
  let observer = null;
  let scheduled = false;

  const scheduleProject = () => {
    if (scheduled) return;
    scheduled = true;
    const queue = typeof global.queueMicrotask === 'function' ? global.queueMicrotask.bind(global) : queueMicrotask;
    queue(() => {
      scheduled = false;
      project();
    });
  };

  const observe = () => {
    const screen = document.querySelector('[data-screen="characters"]');
    if (!screen || !observer) return;
    observer.observe(screen, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  };

  const safelyMutate = (fn) => {
    observer?.disconnect();
    try {
      return fn();
    } finally {
      observe();
    }
  };

  const buildConversation = (roster, playerTab) => {
    const surface = createElement(document, 'section', 'grPartnerConversation');
    surface.dataset.grPartnerConversation = '1';
    surface.setAttribute('aria-label', 'サースナーとの会話');

    const head = createElement(document, 'div', 'grPartnerConversationHead');
    const headCopy = createElement(document, 'div', 'grPartnerConversationHeadCopy');
    headCopy.appendChild(createElement(document, 'b', '', 'サースナーと会話'));
    headCopy.appendChild(createElement(document, 'small', '', 'AI接続：未接続 / 現在は承認済みサースナー応答'));
    head.appendChild(headCopy);

    if (playerTab) {
      playerTab.classList.add('grPartnerConversationSwitch');
      playerTab.querySelector('span') && (playerTab.querySelector('span').textContent = '人物');
      playerTab.querySelector('b') && (playerTab.querySelector('b').textContent = '操作人物を変更');
      const originalClick = playerTab.onclick;
      playerTab.onclick = (event) => {
        playerModeRequested = true;
        return originalClick?.call(playerTab, event);
      };
      head.appendChild(playerTab);
    }

    const log = createElement(document, 'div', 'grPartnerConversationLog');
    log.setAttribute('aria-live', 'polite');
    addMessage(document, log, 'system', '会話内容はこの画面のメモリ内だけで扱い、保存データや関係値には書き込みません。');

    const composer = createElement(document, 'form', 'grPartnerConversationComposer');
    const input = createElement(document, 'textarea', 'grPartnerConversationInput');
    input.maxLength = 4000;
    input.rows = 2;
    input.placeholder = 'サースナーに話しかける';
    input.setAttribute('aria-label', 'サースナーへのメッセージ');
    const send = createElement(document, 'button', 'btn primary grPartnerConversationSend', '送る');
    send.type = 'submit';
    composer.append(input, send);

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = String(input.value || '').trim();
      if (!message || send.disabled) return;
      addMessage(document, log, 'user', message);
      input.value = '';
      input.disabled = true;
      send.disabled = true;
      try {
        const response = await entry.send(message);
        const turn = response?.turn;
        if (turn?.ok && typeof turn.utterance === 'string') {
          addMessage(document, log, 'saasuna', turn.utterance);
        } else {
          addMessage(document, log, 'system', '応答を生成できませんでした。');
        }
      } catch {
        addMessage(document, log, 'system', '会話処理に失敗しました。診断情報は会話文として表示しません。');
      } finally {
        input.disabled = false;
        send.disabled = false;
        input.focus?.();
      }
    });

    surface.append(head, log, composer);
    safelyMutate(() => roster.replaceChildren(surface));
    const charName = document.querySelector('#charName');
    const roleLabel = document.querySelector('#charRoleLabel');
    if (charName) charName.textContent = 'サースナー';
    if (roleLabel) roleLabel.textContent = 'PARTNER CONVERSATION';
  };

  function project() {
    if (projecting) return;
    const screen = document.querySelector('[data-screen="characters"]');
    const roster = document.querySelector('#charRoster');
    if (!screen || !roster) return;

    const screenActive = screen.classList.contains('active');
    if (!screenActive) {
      screenWasActive = false;
      return;
    }
    if (!screenWasActive) {
      screenWasActive = true;
      playerModeRequested = false;
    }
    if (roster.querySelector('[data-gr-partner-conversation="1"]')) return;

    const partnerTab = roster.querySelector('[data-role="partner"]');
    const playerTab = roster.querySelector('[data-role="player"]');
    const partnerRoleActive = Boolean(partnerTab?.classList.contains('on'));
    const saasunaCard = findSaasunaCard(roster);
    const saasunaSelected = Boolean(saasunaCard?.classList.contains('on'));
    const decision = partnerConversationProjectionDecision({
      screenActive,
      partnerRoleActive,
      playerModeRequested,
      saasunaSelected,
    });

    projecting = true;
    try {
      if (decision === 'activate_partner') {
        if (partnerTab?.click) safelyMutate(() => partnerTab.click());
        scheduleProject();
        return;
      }
      if (decision === 'player' || decision === 'idle') return;
      if (decision === 'select_saasuna') {
        if (saasunaCard?.click) safelyMutate(() => saasunaCard.click());
        scheduleProject();
        return;
      }
      playerModeRequested = false;
      buildConversation(roster, playerTab);
    } finally {
      projecting = false;
    }
  }

  observer = new MutationObserverCtor(scheduleProject);
  observe();
  scheduleProject();

  const runtime = Object.freeze({
    version: 'gameroad.partner-conversation-product-mount.v1',
    partnerId: 'partner.saasuna',
    pickerRequired: false,
    providerReady: false,
    persistentTranscript: false,
    project: scheduleProject,
    status: () => entry.status(),
    disconnect: () => observer?.disconnect(),
  });

  Object.defineProperty(global, PARTNER_CONVERSATION_MOUNT_NAME, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: runtime,
  });
  return runtime;
}

export async function mountBoardFacilityRuntime(global = globalThis) {
  requireObject(global, 'BOARD_FACILITY_RUNTIME_GLOBAL_REQUIRED');

  const bridge = requireObject(
    global[CLASSIC_BRIDGE_NAME],
    'BOARD_FACILITY_CLASSIC_BRIDGE_MISSING',
  );
  if (!bridge.ready || typeof bridge.ready.then !== 'function') {
    throw new Error('BOARD_FACILITY_CLASSIC_READY_PROMISE_REQUIRED');
  }

  await bridge.ready;

  // Intentionally cross the synchronous proxy only after ready resolves.
  // This is the production host seam promised by the R20 classic bridge.
  const contract = requireObject(
    bridge.BOARD_FACILITY_STATE_CORE,
    'BOARD_FACILITY_SYNC_PROXY_UNAVAILABLE',
  );

  const existing = global[RUNTIME_NAME];
  if (existing) {
    if (
      existing.version === RUNTIME_VERSION &&
      existing.bridge === bridge &&
      existing.contract === contract
    ) {
      mountSaasunaConversationProductSurface(global);
      return existing;
    }
    throw new Error('BOARD_FACILITY_RUNTIME_GLOBAL_COLLISION');
  }

  const runtime = Object.freeze({
    version: RUNTIME_VERSION,
    bridge,
    contract,
  });

  Object.defineProperty(global, RUNTIME_NAME, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: runtime,
  });

  mountSaasunaConversationProductSurface(global);
  return runtime;
}

export const BOARD_FACILITY_RUNTIME_MOUNT = Object.freeze({
  classicBridgeName: CLASSIC_BRIDGE_NAME,
  runtimeName: RUNTIME_NAME,
  version: RUNTIME_VERSION,
  mount: mountBoardFacilityRuntime,
});
