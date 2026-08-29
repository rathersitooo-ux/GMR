import { createSaasunaConversationEntry } from './partner-conversation-core.mjs';

const CLASSIC_BRIDGE_NAME = 'GAMEROAD_BOARD_FACILITY_STATE_CORE';
const RUNTIME_NAME = 'GAMEROAD_BOARD_FACILITY_RUNTIME';
const RUNTIME_VERSION = 'gameroad.board-facility-runtime-mount.v1';
const PARTNER_CONVERSATION_MOUNT_NAME = 'GAMEROAD_PARTNER_CONVERSATION_PRODUCT_MOUNT';
const PARTNER_CONVERSATION_STYLE_ID = 'gameroad-partner-conversation-product-style';
const PARTNER_EDGE_ENDPOINT = '/ws?partnerOp=conversation';

function requireObject(value, code) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) throw new Error(code);
  return value;
}

function exactToken(value, max = 256) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max || text !== value) return null;
  return text;
}

export function createSaasunaEdgeProvider(global = globalThis) {
  const fetchImpl = global?.fetch;
  if (typeof fetchImpl !== 'function') return null;
  let providerSessionId = null;

  return Object.freeze({
    async sendMessage(request) {
      const userMessage = typeof request?.userMessage === 'string' ? request.userMessage.trim() : '';
      if (!userMessage || userMessage.length > 4000) throw new Error('PARTNER_PROVIDER_INPUT_INVALID');

      const response = await fetchImpl(PARTNER_EDGE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userMessage, providerSessionId }),
      });
      if (!response?.ok) throw new Error('PARTNER_PROVIDER_UNAVAILABLE');

      const payload = await response.json();
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      const nextSessionId = payload?.providerSessionId == null ? null : exactToken(payload.providerSessionId);
      if (payload?.ok !== true || !text || text.length > 800) throw new Error('PARTNER_PROVIDER_OUTPUT_INVALID');
      if (payload.providerSessionId != null && !nextSessionId) throw new Error('PARTNER_PROVIDER_SESSION_INVALID');
      if (nextSessionId) providerSessionId = nextSessionId;

      return Object.freeze({
        kind: 'utterance_candidate',
        partnerId: request.partnerId,
        dialogueVersion: request.dialogueVersion,
        sourceId: request.sourceId,
        text,
      });
    },
    status() {
      return Object.freeze({
        transport: 'convai_edge',
        providerSessionActive: providerSessionId !== null,
        providerSessionStoredInCanon: false,
      });
    },
  });
}

export function partnerConversationProjectionDecision({
  screenActive = false,
  partnerRoleActive = false,
  saasunaSelected = false,
} = {}) {
  if (!screenActive) return 'idle';
  if (!partnerRoleActive) return 'activate_partner';
  if (!saasunaSelected) return 'select_saasuna';
  return 'conversation';
}

function addConversationStyle(document) {
  if (document.getElementById?.(PARTNER_CONVERSATION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PARTNER_CONVERSATION_STYLE_ID;
  style.textContent = `
.grPartnerConversation{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(150px,1fr) auto;gap:8px;padding:2px}
.grPartnerConversationHead{padding-bottom:8px;border-bottom:1px solid var(--line)}
.grPartnerConversationHead b{display:block;font-size:16px}.grPartnerConversationHead small{color:var(--muted);font-size:8px}
.grPartnerConversationLog{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:7px;padding:4px 2px 8px}
.grPartnerConversationMessage{max-width:88%;padding:8px 10px;border:1px solid var(--line);background:#0b2721;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.grPartnerConversationMessage.user{align-self:flex-end;background:#173f35}.grPartnerConversationMessage.saasuna{align-self:flex-start}
.grPartnerConversationMessage.system{align-self:stretch;max-width:none;color:var(--muted);font-size:9px}
.grPartnerConversationComposer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}
.grPartnerConversationInput{min-height:48px;max-height:120px;resize:vertical;border:1px solid var(--line);background:#071a16;color:var(--ink);padding:10px;font:inherit}
@media(max-width:540px) and (orientation:portrait){.grPartnerConversationComposer{grid-template-columns:1fr}.grPartnerConversationSend{width:100%}}
`;
  document.head?.appendChild(style);
}

function appendMessage(document, log, role, text) {
  const row = document.createElement('div');
  row.className = `grPartnerConversationMessage ${role}`;
  row.dataset.role = role;
  row.textContent = text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function findSaasunaCard(roster) {
  return [...roster.querySelectorAll('.charCard')]
    .find((card) => String(card.textContent || '').includes('サースナー')) ?? null;
}

export function mountSaasunaConversationProductSurface(global = globalThis) {
  const document = global?.document;
  const MutationObserverCtor = global?.MutationObserver;
  if (!document?.querySelector || !document?.createElement || typeof MutationObserverCtor !== 'function') return null;

  if (global[PARTNER_CONVERSATION_MOUNT_NAME]) return global[PARTNER_CONVERSATION_MOUNT_NAME];

  addConversationStyle(document);
  const provider = createSaasunaEdgeProvider(global);
  const entry = createSaasunaConversationEntry({ provider });
  const queue = typeof global.queueMicrotask === 'function' ? global.queueMicrotask.bind(global) : queueMicrotask;
  let observer = null;

  const project = () => {
    const screen = document.querySelector('[data-screen="characters"]');
    const roster = document.querySelector('#charRoster');
    if (!screen || !roster || !screen.classList.contains('active')) return false;
    if (roster.querySelector('[data-gr-partner-conversation="1"]')) return true;

    const partnerTab = roster.querySelector('[data-role="partner"]');
    const saasunaCard = findSaasunaCard(roster);
    const decision = partnerConversationProjectionDecision({
      screenActive: true,
      partnerRoleActive: !partnerTab || partnerTab.classList.contains('on'),
      saasunaSelected: !saasunaCard || saasunaCard.classList.contains('on'),
    });

    if (decision === 'activate_partner' && partnerTab?.click) {
      partnerTab.click();
      queue(project);
      return false;
    }
    if (decision === 'select_saasuna' && saasunaCard?.click) {
      saasunaCard.click();
      queue(project);
      return false;
    }

    const surface = document.createElement('section');
    surface.className = 'grPartnerConversation';
    surface.dataset.grPartnerConversation = '1';
    surface.setAttribute('aria-label', 'サースナーとの会話');
    surface.innerHTML = `
      <div class="grPartnerConversationHead"><b>サースナーと会話</b><small>会話</small></div>
      <div class="grPartnerConversationLog" aria-live="polite"></div>
      <form class="grPartnerConversationComposer">
        <textarea class="grPartnerConversationInput" maxlength="4000" rows="2" placeholder="サースナーに話しかける" aria-label="サースナーへのメッセージ"></textarea>
        <button class="btn primary grPartnerConversationSend" type="submit">送る</button>
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
      try {
        const response = await entry.send(message);
        const turn = response?.turn;
        appendMessage(
          document,
          log,
          turn?.ok && typeof turn.utterance === 'string' ? 'saasuna' : 'system',
          turn?.ok && typeof turn.utterance === 'string' ? turn.utterance : '応答できませんでした。',
        );
      } catch {
        appendMessage(document, log, 'system', '応答できませんでした。');
      } finally {
        input.disabled = false;
        send.disabled = false;
        input.focus?.();
      }
    });

    roster.replaceChildren(surface);
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
    version: 'gameroad.partner-conversation-product-mount.v1',
    partnerId: 'partner.saasuna',
    pickerRequired: false,
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
