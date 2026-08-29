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

export function partnerConversationProjectionDecision({ screenActive = false } = {}) {
  return screenActive ? 'conversation' : 'idle';
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
        body: JSON.stringify({
          userMessage,
          providerSessionId,
        }),
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

function addConversationStyle(document) {
  if (document.getElementById?.(PARTNER_CONVERSATION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PARTNER_CONVERSATION_STYLE_ID;
  style.textContent = `
.grPartnerConversation{height:100%;min-height:0;display:grid;grid-template-rows:auto minmax(120px,1fr) auto;overflow:hidden;border:1px solid rgba(191,217,255,.23);border-radius:14px;background:linear-gradient(180deg,rgba(12,17,39,.94),rgba(9,13,30,.98));color:#f7f8ff}
.grPartnerConversationHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 12px;border-bottom:1px solid rgba(196,215,255,.13)}
.grPartnerConversationHeadText b{display:block;font-size:15px}.grPartnerConversationHeadText small{display:block;margin-top:2px;color:#aeb7d9;font-size:9px}
.grPartnerConversationState{flex:0 0 auto;padding:5px 8px;border-radius:999px;border:1px solid rgba(158,188,255,.26);background:rgba(90,113,196,.16);font-size:9px;color:#dce6ff}
.grPartnerConversationState[data-origin="provider"]{background:rgba(93,141,229,.22);color:#eff5ff}
.grPartnerConversationState[data-origin="fallback"]{background:rgba(137,112,178,.19);color:#e9dcff}
.grPartnerConversationLog{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:9px;padding:16px}
.grPartnerConversationMessage{max-width:86%;padding:10px 12px;border:1px solid rgba(193,212,255,.13);border-radius:14px 14px 14px 4px;background:rgba(33,42,76,.72);font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.grPartnerConversationMessage.user{align-self:flex-end;border-radius:14px 14px 4px 14px;background:rgba(60,91,161,.58)}.grPartnerConversationMessage.saasuna{align-self:flex-start}
.grPartnerConversationMessage.system{align-self:stretch;max-width:none;background:transparent;border-style:dashed;color:#aeb7d9;font-size:10px}
.grPartnerConversationComposer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:12px 14px 14px;border-top:1px solid rgba(196,215,255,.13)}
.grPartnerConversationInput{min-height:50px;max-height:112px;resize:vertical;border:1px solid rgba(184,207,255,.23);border-radius:13px;background:rgba(7,11,27,.76);color:#f7f8ff;padding:11px 12px;font:inherit;outline:none}
.grPartnerConversationInput:focus{border-color:rgba(159,190,255,.55)}.grPartnerConversationInput::placeholder{color:#7e8aaf}
.grPartnerConversationSend{min-width:72px;border-radius:13px!important}
@media(max-width:540px){.grPartnerConversationHead{padding:10px 11px 9px}.grPartnerConversationLog{padding:10px}.grPartnerConversationComposer{padding:9px 10px 10px}}
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

function setConversationState(node, label, origin) {
  if (!node) return;
  node.textContent = label;
  node.dataset.origin = origin || 'neutral';
}

export function mountSaasunaConversationProductSurface(global = globalThis) {
  const document = global?.document;
  const MutationObserverCtor = global?.MutationObserver;
  if (!document?.querySelector || !document?.createElement || typeof MutationObserverCtor !== 'function') return null;
  if (global[PARTNER_CONVERSATION_MOUNT_NAME]) return global[PARTNER_CONVERSATION_MOUNT_NAME];

  addConversationStyle(document);
  const provider = createSaasunaEdgeProvider(global);
  const entry = createSaasunaConversationEntry({ provider });
  let observer = null;

  const project = () => {
    const screen = document.querySelector('[data-screen="characters"]');
    const roster = document.querySelector('#charRoster');
    if (!screen || !roster || !screen.classList.contains('active')) return false;
    if (roster.querySelector('[data-gr-partner-conversation="1"]')) return true;

    const surface = document.createElement('section');
    surface.className = 'grPartnerConversation';
    surface.dataset.grPartnerConversation = '1';
    surface.setAttribute('aria-label', 'サースナーとの会話');
    surface.innerHTML = `
      <div class="grPartnerConversationHead">
        <div class="grPartnerConversationHeadText"><b>サースナーと話す</b><small>そのまま話しかけてください</small></div>
        <span class="grPartnerConversationState" data-origin="neutral">会話できます</span>
      </div>
      <div class="grPartnerConversationLog" aria-live="polite"></div>
      <form class="grPartnerConversationComposer">
        <textarea class="grPartnerConversationInput" maxlength="4000" rows="2" placeholder="メッセージを入力" aria-label="サースナーへのメッセージ"></textarea>
        <button class="btn primary grPartnerConversationSend" type="submit">送る</button>
      </form>`;

    const log = surface.querySelector('.grPartnerConversationLog');
    const form = surface.querySelector('form');
    const input = surface.querySelector('textarea');
    const send = surface.querySelector('button');
    const state = surface.querySelector('.grPartnerConversationState');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = String(input.value || '').trim();
      if (!message || send.disabled) return;
      appendMessage(document, log, 'user', message);
      input.value = '';
      input.disabled = true;
      send.disabled = true;
      setConversationState(state, '返事を考えています', 'neutral');
      try {
        const response = await entry.send(message);
        const turn = response?.turn;
        const ok = turn?.ok && typeof turn.utterance === 'string';
        appendMessage(document, log, ok ? 'saasuna' : 'system', ok ? turn.utterance : '応答できませんでした。');
        if (ok && turn.responseOrigin === 'provider_candidate') setConversationState(state, 'AI応答', 'provider');
        else if (ok) setConversationState(state, '仮応答', 'fallback');
        else setConversationState(state, '応答エラー', 'fallback');
      } catch {
        appendMessage(document, log, 'system', '応答できませんでした。');
        setConversationState(state, '仮応答', 'fallback');
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
    version: 'gameroad.partner-conversation-product-mount.v3',
    partnerId: 'partner.saasuna',
    pickerRequired: false,
    providerReady: provider !== null,
    persistentTranscript: false,
    project,
    status: () => Object.freeze({
      ...entry.status(),
      provider: provider?.status?.() ?? Object.freeze({ transport: 'fallback_only', providerSessionActive: false, providerSessionStoredInCanon: false }),
    }),
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