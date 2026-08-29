import { createSaasunaConversationEntry } from './partner-conversation-core.mjs';

const CLASSIC_BRIDGE_NAME = 'GAMEROAD_BOARD_FACILITY_STATE_CORE';
const RUNTIME_NAME = 'GAMEROAD_BOARD_FACILITY_RUNTIME';
const RUNTIME_VERSION = 'gameroad.board-facility-runtime-mount.v1';
const PARTNER_CONVERSATION_MOUNT_NAME = 'GAMEROAD_PARTNER_CONVERSATION_PRODUCT_MOUNT';
const PARTNER_CONVERSATION_STYLE_ID = 'gameroad-partner-conversation-product-style';

function requireObject(value, code) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) throw new Error(code);
  return value;
}

export function partnerConversationProjectionDecision({ screenActive = false } = {}) {
  return screenActive ? 'conversation' : 'idle';
}

function addConversationStyle(document) {
  if (document.getElementById?.(PARTNER_CONVERSATION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PARTNER_CONVERSATION_STYLE_ID;
  style.textContent = `
.grPartnerConversation{height:100%;min-height:0;position:relative;display:grid;grid-template-rows:auto minmax(90px,1fr) auto;gap:6px;padding:2px;background:transparent}
.grPartnerConversationStatus{justify-self:end;align-self:start;max-width:100%;padding:4px 7px;border:1px solid color-mix(in srgb,var(--line) 72%,transparent);background:color-mix(in srgb,#071a16 76%,transparent);backdrop-filter:blur(6px);color:var(--muted);font-size:8px;line-height:1.25}
.grPartnerConversationLog{min-height:0;overflow:auto;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;padding:4px 2px 6px;mask-image:linear-gradient(to bottom,transparent 0,#000 22px,#000 100%)}
.grPartnerConversationMessage{max-width:82%;padding:7px 9px;border:1px solid color-mix(in srgb,var(--line) 72%,transparent);background:color-mix(in srgb,#0b2721 82%,transparent);backdrop-filter:blur(6px);font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.grPartnerConversationMessage.user{align-self:flex-end;background:color-mix(in srgb,#173f35 86%,transparent)}.grPartnerConversationMessage.saasuna{align-self:flex-start}
.grPartnerConversationMessage.system{align-self:stretch;max-width:none;color:var(--muted);font-size:9px;background:color-mix(in srgb,#071a16 72%,transparent)}
.grPartnerConversationComposer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end;padding-top:2px}
.grPartnerConversationInput{min-height:46px;max-height:104px;resize:none;border:1px solid var(--line);background:color-mix(in srgb,#071a16 92%,transparent);backdrop-filter:blur(8px);color:var(--ink);padding:10px;font:inherit}
.grPartnerConversationSend{min-height:46px}.grPartnerConversation[data-provider-state="fallback"] .grPartnerConversationStatus{opacity:.86}
@media(max-width:540px) and (orientation:portrait){.grPartnerConversation{grid-template-rows:auto minmax(72px,1fr) auto}.grPartnerConversationMessage{max-width:90%}.grPartnerConversationComposer{grid-template-columns:minmax(0,1fr) auto}.grPartnerConversationInput{min-height:44px}.grPartnerConversationSend{min-width:52px;min-height:44px}}
`;
  document.head?.appendChild(style);
}

function appendMessage(document, log, role, text, origin = '') {
  const row = document.createElement('div');
  row.className = `grPartnerConversationMessage ${role}`;
  row.dataset.role = role;
  if (origin) row.dataset.responseOrigin = origin;
  row.textContent = text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function findSaasunaCard(roster) {
  return [...roster.querySelectorAll('.charCard')]
    .find((card) => String(card.textContent || '').includes('サースナー')) ?? null;
}

function hideRosterUntilConversation(roster) {
  if (!roster?.style) return () => {};
  const previousVisibility = roster.style.visibility;
  roster.style.visibility = 'hidden';
  return () => {
    roster.style.visibility = previousVisibility;
  };
}

function synchronizeSaasunaStateBeforePaint(document, initialRoster) {
  let roster = initialRoster;
  let restoreVisibility = hideRosterUntilConversation(roster);
  let partnerRoleSynchronized = false;
  let saasunaSynchronized = false;

  const refreshRoster = () => {
    const current = document.querySelector('#charRoster');
    if (!current || current === roster) return;
    restoreVisibility();
    roster = current;
    restoreVisibility = hideRosterUntilConversation(roster);
  };

  try {
    const partnerTab = roster.querySelector('[data-role="partner"]');
    if (partnerTab && !partnerTab.classList.contains('on') && typeof partnerTab.click === 'function') {
      partnerTab.click();
      refreshRoster();
    }
    const currentPartnerTab = roster.querySelector('[data-role="partner"]');
    partnerRoleSynchronized = !currentPartnerTab || currentPartnerTab.classList.contains('on');

    const saasunaCard = findSaasunaCard(roster);
    if (saasunaCard && !saasunaCard.classList.contains('on') && typeof saasunaCard.click === 'function') {
      saasunaCard.click();
      refreshRoster();
    }
    const currentSaasunaCard = findSaasunaCard(roster);
    saasunaSynchronized = !currentSaasunaCard || currentSaasunaCard.classList.contains('on');
  } catch {
    // The direct chat surface still mounts. Existing selection side effects are best-effort only.
  }

  return { roster, restoreVisibility, partnerRoleSynchronized, saasunaSynchronized };
}

function setProviderStatus(surface, status, state) {
  if (!surface) return;
  surface.dataset.providerState = state;
  const node = surface.querySelector('.grPartnerConversationStatus');
  if (node) node.textContent = status;
}

export function mountSaasunaConversationProductSurface(global = globalThis, { provider = null } = {}) {
  const document = global?.document;
  const MutationObserverCtor = global?.MutationObserver;
  if (!document?.querySelector || !document?.createElement || typeof MutationObserverCtor !== 'function') return null;

  if (global[PARTNER_CONVERSATION_MOUNT_NAME]) return global[PARTNER_CONVERSATION_MOUNT_NAME];

  addConversationStyle(document);
  const entry = createSaasunaConversationEntry({ provider });
  let observer = null;

  const project = () => {
    const screen = document.querySelector('[data-screen="characters"]');
    let roster = document.querySelector('#charRoster');
    if (!screen || !roster || !screen.classList.contains('active')) return false;
    if (roster.querySelector('[data-gr-partner-conversation="1"]')) return true;

    screen.dataset.grPartnerConversationDirectScene = '1';
    const synchronized = synchronizeSaasunaStateBeforePaint(document, roster);
    roster = synchronized.roster;

    const surface = document.createElement('section');
    surface.className = 'grPartnerConversation';
    surface.dataset.grPartnerConversation = '1';
    surface.dataset.partnerId = 'partner.saasuna';
    surface.dataset.entryMode = 'direct_scene';
    surface.dataset.partnerRoleSynchronized = String(synchronized.partnerRoleSynchronized);
    surface.dataset.saasunaSynchronized = String(synchronized.saasunaSynchronized);
    surface.setAttribute('aria-label', 'サースナーとの会話');
    surface.innerHTML = `
      <div class="grPartnerConversationStatus" aria-live="polite">${provider ? '会話AI準備中' : '固定台詞待機'}</div>
      <div class="grPartnerConversationLog" aria-live="polite"></div>
      <form class="grPartnerConversationComposer">
        <textarea class="grPartnerConversationInput" maxlength="4000" rows="2" placeholder="サースナーに話しかける" aria-label="サースナーへのメッセージ"></textarea>
        <button class="btn primary grPartnerConversationSend" type="submit" aria-label="送信">送る</button>
      </form>`;

    const log = surface.querySelector('.grPartnerConversationLog');
    const form = surface.querySelector('form');
    const input = surface.querySelector('textarea');
    const send = surface.querySelector('button');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = String(input.value || '').trim();
      if (!message || send.disabled) return;
      appendMessage(document, log, 'user', message);
      input.value = '';
      input.disabled = true;
      send.disabled = true;
      setProviderStatus(surface, provider ? '会話中…' : '固定台詞待機', provider ? 'pending' : 'fallback');
      try {
        const response = await entry.send(message);
        const turn = response?.turn;
        if (turn?.ok && typeof turn.utterance === 'string') {
          appendMessage(document, log, 'saasuna', turn.utterance, turn.responseOrigin || '');
          if (turn.responseOrigin === 'provider_candidate') {
            setProviderStatus(surface, '会話AI接続', 'connected');
          } else {
            setProviderStatus(surface, '固定台詞（AI未応答）', 'fallback');
          }
        } else {
          appendMessage(document, log, 'system', '応答できませんでした。');
          setProviderStatus(surface, '応答失敗', 'error');
        }
      } catch {
        appendMessage(document, log, 'system', '応答できませんでした。');
        setProviderStatus(surface, '応答失敗', 'error');
      } finally {
        input.disabled = false;
        send.disabled = false;
        input.focus?.();
      }
    });

    roster.replaceChildren(surface);
    synchronized.restoreVisibility();
    const charName = document.querySelector('#charName');
    if (charName) charName.textContent = 'サースナー';
    return true;
  };

  const screen = document.querySelector('[data-screen="characters"]');
  if (screen) {
    observer = new MutationObserverCtor(project);
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  }
  project();

  const runtime = Object.freeze({
    version: 'gameroad.partner-conversation-product-mount.v2',
    partnerId: 'partner.saasuna',
    entryMode: 'direct_scene',
    pickerRequired: false,
    intermediateEntryAllowed: false,
    providerReady: provider !== null,
    persistentTranscript: false,
    project,
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

  const bridge = requireObject(global[CLASSIC_BRIDGE_NAME], 'BOARD_FACILITY_CLASSIC_BRIDGE_MISSING');
  if (!bridge.ready || typeof bridge.ready.then !== 'function') {
    throw new Error('BOARD_FACILITY_CLASSIC_READY_PROMISE_REQUIRED');
  }

  await bridge.ready;
  const contract = requireObject(bridge.BOARD_FACILITY_STATE_CORE, 'BOARD_FACILITY_SYNC_PROXY_UNAVAILABLE');

  const existing = global[RUNTIME_NAME];
  if (existing) {
    if (existing.version === RUNTIME_VERSION && existing.bridge === bridge && existing.contract === contract) {
      mountSaasunaConversationProductSurface(global);
      return existing;
    }
    throw new Error('BOARD_FACILITY_RUNTIME_GLOBAL_COLLISION');
  }

  const runtime = Object.freeze({ version: RUNTIME_VERSION, bridge, contract });
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
