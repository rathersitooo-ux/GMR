import { PARTNER_TEA_QUICK_CHOICES } from './partner-tea-quick-choice-core.mjs';
import { nextPartnerShellView } from './partner-shell-presentation-core.mjs';
import { mountPartnerShellRuntime } from './partner-shell-runtime-mount.mjs';
import { createPartnerCostumeMainSaveProfileAdapter } from './partner-costume-main-save-profile-adapter.mjs';

const RUNTIME_NAME = 'GAMEROAD_PARTNER_TEA_QUICK_CHOICE_RUNTIME';
const RUNTIME_VERSION = 'gameroad.partner-tea-quick-choice-runtime.v1';
const STYLE_ID = 'gameroad-partner-tea-quick-choice-style';
const CONVERSATION_SELECTOR = '[data-gr-partner-conversation="1"]';
const TEA_BAR_SELECTOR = '[data-gr-partner-tea-quick-choice="1"]';
const HUB_TRIGGER_SELECTOR = '[data-partner-hub-trigger="1"]';
const HUB_OVERLAY_SELECTOR = '[data-partner-hub-overlay="1"]';
const PRESS_STATE_KEY = 'grPartnerTeaPressState';
const PRESS_KEYS = new Set(['Enter', ' ']);
const PARTNER_HUB_MOUNTED_KEY = 'partnerHubOverlayMounted';
const PARTNER_HUB_ALLOWED_ACTION_SET = new Set(['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION', 'OPEN_COSTUME', 'BACK_HUB']);
const partnerHubMounts = new WeakMap();

export const PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS = Object.freeze([...PARTNER_HUB_ALLOWED_ACTION_SET]);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

export function partnerTeaQuickChoiceProjectionPlan() {
  return freezeDeep({
    runtimeVersion: RUNTIME_VERSION,
    presentation: 'inline_quick_choice',
    useSite: 'partner-conversation',
    choices: PARTNER_TEA_QUICK_CHOICES.map((choice) => ({ ...choice })),
    minimumTargetPx: 44,
    reusesConversationForm: true,
    createsConversationSession: false,
    relationshipMutationAllowed: false,
    rewardMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export function partnerConversationHubProjectionPlan() {
  return freezeDeep({
    presentation: 'secondary_nonblocking_overlay',
    useSite: 'partner-conversation',
    activePartnerId: 'partner.saasuna',
    directConversationDefault: true,
    conversationDomPreserved: true,
    allowedActions: [...PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS],
    minimumTargetPx: 44,
    createsConversationSession: false,
    relationshipMutationAllowed: false,
    rewardMutationAllowed: false,
    saveMutationAllowed: false,
    gameplayMutationAllowed: false,
    canonMutationAllowed: false,
  });
}

export function partnerConversationHubCanDispatch(action) {
  return PARTNER_HUB_ALLOWED_ACTION_SET.has(String(action || ''));
}

export function createPartnerConversationHubInput(view = 'hub') {
  return Object.freeze({
    activePartnerId: 'partner.saasuna',
    roster: Object.freeze([
      Object.freeze({ partnerId: 'partner.saasuna', displayName: 'サースナー', portraitRef: null }),
    ]),
    view,
    detailPartnerId: 'partner.saasuna',
    formationPartnerIds: Object.freeze([]),
    strategyId: null,
  });
}

function ensureStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.grPartnerTeaQuickChoice{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px 0;border-top:1px solid rgba(196,215,255,.08)}
.grPartnerTeaQuickChoiceLabel{font-size:10px;color:#aeb7d9;letter-spacing:.08em;margin-right:2px}
.grPartnerTeaQuickChoiceButton{min-height:44px;min-width:92px;padding:9px 14px;border:1px solid rgba(184,207,255,.24);border-radius:999px;background:rgba(55,72,126,.32);color:#eef3ff;font:inherit;font-size:12px;cursor:pointer;touch-action:manipulation;transform:translateY(0) scale(1);box-shadow:0 1px 0 rgba(255,255,255,.06) inset}
.grPartnerTeaQuickChoiceButton:hover{background:rgba(73,96,164,.42)}
.grPartnerTeaQuickChoiceButton:focus-visible{outline:2px solid rgba(159,190,255,.8);outline-offset:2px}
.grPartnerTeaQuickChoiceButton[data-gr-partner-tea-press-state="pressed"]:not(:disabled){background:rgba(46,62,110,.58);border-color:rgba(178,204,255,.42);transform:translateY(1px) scale(.98);box-shadow:0 2px 7px rgba(8,14,36,.34) inset}
.grPartnerTeaQuickChoiceButton:disabled{opacity:.48;cursor:default;transform:none;box-shadow:none}
[data-gr-partner-conversation="1"][data-partner-hub-overlay-mounted="1"]{position:relative}
.grPartnerHubTrigger{min-width:44px;min-height:44px;padding:7px 10px;border:1px solid rgba(158,188,255,.35);border-radius:11px;background:rgba(31,45,88,.72);color:inherit;font:inherit;font-size:10px;font-weight:900;touch-action:manipulation}
.grPartnerHubOverlay{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:14px;background:rgba(5,8,20,.72);backdrop-filter:blur(4px)}
.grPartnerHubOverlay[hidden]{display:none!important}
.grPartnerHubPanel{width:min(430px,94%);max-height:92%;overflow:auto;border:1px solid rgba(190,211,255,.3);border-radius:16px;background:linear-gradient(160deg,#111a36,#0b1024);box-shadow:0 18px 55px rgba(0,0,0,.45);padding:12px;color:#f7f8ff}
.grPartnerHubPanelHead{display:flex;align-items:center;justify-content:flex-end;min-height:44px}
.grPartnerHubClose,.grPartnerHubPanel .partner-shell-action{min-width:44px;min-height:44px;border:1px solid rgba(190,211,255,.25);border-radius:11px;background:rgba(34,48,90,.74);color:inherit;font:inherit;font-weight:900}
.grPartnerHubClose{padding:7px 11px}
.grPartnerHubShell{padding:0 4px 6px}
.grPartnerHubPanel .partner-shell-menu,.grPartnerHubPanel .partner-shell-navigation{display:grid;gap:8px}
.grPartnerHubPanel .partner-shell-idle-readable{margin:10px 0 12px;padding:10px 12px;border-radius:12px;background:rgba(73,96,164,.18);line-height:1.55}
@media(max-width:540px){.grPartnerTeaQuickChoice{padding:8px 10px 0;gap:6px}.grPartnerTeaQuickChoiceButton{flex:1 1 112px}.grPartnerHubOverlay{padding:8px}.grPartnerHubPanel{width:96%;padding:9px}}
`;
  document.head?.appendChild?.(style);
}

function setQuickChoicePressState(button, pressed) {
  if (!button?.dataset) return false;
  const next = Boolean(pressed && !button.disabled);
  button.dataset[PRESS_STATE_KEY] = next ? 'pressed' : 'idle';
  return next;
}

function wireQuickChoicePressFeedback(button) {
  if (!button?.addEventListener) return;
  const release = () => setQuickChoicePressState(button, false);
  button.addEventListener('pointerdown', (event = {}) => {
    if (button.disabled || (event.button != null && event.button !== 0)) return;
    setQuickChoicePressState(button, true);
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('keydown', (event = {}) => {
    if (button.disabled || event.repeat || !PRESS_KEYS.has(event.key)) return;
    setQuickChoicePressState(button, true);
  });
  button.addEventListener('keyup', (event = {}) => {
    if (PRESS_KEYS.has(event.key)) release();
  });
  button.addEventListener('blur', release);
}

function submitFixedChoice(global, { form, input, send, choice }) {
  if (!form || !input || !send || input.disabled || send.disabled) return false;
  const draft = typeof input.value === 'string' ? input.value : '';
  input.value = choice.label;
  let submitted = false;
  try {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      submitted = true;
    } else if (typeof form.dispatchEvent === 'function' && typeof global?.Event === 'function') {
      submitted = form.dispatchEvent(new global.Event('submit', { bubbles: true, cancelable: true })) !== false;
    }
  } finally {
    input.value = draft;
  }
  return submitted;
}

function syncQuickChoiceBusyState(bar, input, send) {
  if (!bar || !input || !send) return false;
  const busy = Boolean(input.disabled || send.disabled);
  const buttons = typeof bar.querySelectorAll === 'function'
    ? Array.from(bar.querySelectorAll('.grPartnerTeaQuickChoiceButton'))
    : Array.from(bar.children || []).filter((child) => child?.className === 'grPartnerTeaQuickChoiceButton');
  for (const button of buttons) {
    if (Boolean(button.disabled) !== busy) button.disabled = busy;
    if (busy) setQuickChoicePressState(button, false);
  }
  return busy;
}

function isConversationSurface(surface) {
  return Boolean(
    surface
    && surface.dataset?.grPartnerConversation === '1'
    && surface.ownerDocument?.createElement
    && typeof surface.querySelector === 'function'
    && typeof surface.appendChild === 'function'
  );
}

export function currentPartnerCostumeServices(global = globalThis) {
  const bridge = global?.GAMEROAD_PARTNER_COSTUME_MAIN_SAVE;
  const catalog = global?.GAMEROAD_PARTNER_COSTUME_CATALOG;
  const ownedSource = global?.GAMEROAD_PARTNER_COSTUME_OWNED_ITEM_IDS_BY_PARTNER;
  if (!bridge || typeof bridge.getSelectedPartnerId !== 'function'
    || typeof bridge.getPartnerProfiles !== 'function'
    || typeof bridge.persistPartnerEquipment !== 'function'
    || !catalog || typeof catalog !== 'object' || Array.isArray(catalog)
    || (!ownedSource || (typeof ownedSource !== 'object' && typeof ownedSource !== 'function'))) return null;
  const readOwned = () => typeof ownedSource === 'function' ? ownedSource() : ownedSource;
  const adapter = createPartnerCostumeMainSaveProfileAdapter({
    getSelectedPartnerId: bridge.getSelectedPartnerId,
    getPartnerProfiles: bridge.getPartnerProfiles,
    getOwnedItemIdsByPartner: readOwned,
    persistPartnerEquipment: bridge.persistPartnerEquipment,
  });
  return Object.freeze({
    catalog,
    loadAuthoritativeSnapshot: adapter.loadAuthoritativeSnapshot,
    saveAuthoritativeSelection: adapter.saveAuthoritativeSelection,
    createSaveRequestId: () => `partner-costume:${Date.now()}:${Math.random().toString(36).slice(2)}`,
  });
}

function mountPartnerConversationHubOnSurface(surface) {
  if (!isConversationSurface(surface)) return null;
  const existing = partnerHubMounts.get(surface);
  if (existing) return existing;
  if (surface.querySelector(HUB_TRIGGER_SELECTOR) || surface.querySelector(HUB_OVERLAY_SELECTOR)) return null;

  const document = surface.ownerDocument;
  const header = surface.querySelector('.grPartnerConversationHead');
  if (!header || typeof header.appendChild !== 'function') return null;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'grPartnerHubTrigger';
  trigger.dataset.partnerHubTrigger = '1';
  trigger.textContent = 'パートナー';
  trigger.setAttribute?.('aria-haspopup', 'dialog');
  trigger.setAttribute?.('aria-expanded', 'false');
  trigger.setAttribute?.('aria-label', 'パートナーメニューを開く');

  const overlay = document.createElement('section');
  overlay.className = 'grPartnerHubOverlay';
  overlay.dataset.partnerHubOverlay = '1';
  overlay.hidden = true;
  overlay.tabIndex = -1;
  overlay.setAttribute?.('role', 'dialog');
  overlay.setAttribute?.('aria-modal', 'true');
  overlay.setAttribute?.('aria-label', 'パートナー');

  const panel = document.createElement('div');
  panel.className = 'grPartnerHubPanel';
  const panelHead = document.createElement('div');
  panelHead.className = 'grPartnerHubPanelHead';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'grPartnerHubClose';
  closeButton.dataset.partnerHubClose = '1';
  closeButton.textContent = '会話へ戻る';
  const shellRoot = document.createElement('div');
  shellRoot.className = 'grPartnerHubShell';

  panelHead.appendChild(closeButton);
  panel.append(panelHead, shellRoot);
  overlay.appendChild(panel);
  header.appendChild(trigger);
  surface.appendChild(overlay);
  surface.dataset[PARTNER_HUB_MOUNTED_KEY] = '1';

  let destroyed = false;
  let open = false;
  let view = 'hub';

  const costume = currentPartnerCostumeServices(globalThis);
  const shell = mountPartnerShellRuntime({
    root: shellRoot,
    costume,
    getInput: () => createPartnerConversationHubInput(view),
    canDispatch: partnerConversationHubCanDispatch,
    onAction: ({ action }) => {
      if (action === 'OPEN_CONVERSATION') {
        close();
        return;
      }
      const next = nextPartnerShellView(view, action);
      if (next !== view) {
        view = next;
        shell.render();
      }
    },
  });

  function snapshot() {
    return Object.freeze({
      mounted: !destroyed,
      open,
      view,
      activePartnerId: 'partner.saasuna',
      directConversationDefault: true,
      conversationDomPreserved: true,
      allowedActions: PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS,
    });
  }

  function openHub() {
    if (destroyed) return snapshot();
    view = 'hub';
    const result = shell.render();
    if (!result.ok) return snapshot();
    open = true;
    overlay.hidden = false;
    trigger.setAttribute?.('aria-expanded', 'true');
    closeButton.focus?.();
    return snapshot();
  }

  function close() {
    if (destroyed) return snapshot();
    open = false;
    overlay.hidden = true;
    trigger.setAttribute?.('aria-expanded', 'false');
    trigger.focus?.();
    return snapshot();
  }

  trigger.addEventListener?.('click', openHub);
  closeButton.addEventListener?.('click', close);
  overlay.addEventListener?.('click', (event = {}) => {
    if (event.target !== overlay) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    close();
  });
  overlay.addEventListener?.('keydown', (event = {}) => {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault?.();
    event.stopPropagation?.();
    close();
  });
  panel.addEventListener?.('click', (event = {}) => event.stopPropagation?.());

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    shell.destroy();
    trigger.remove?.();
    overlay.remove?.();
    delete surface.dataset[PARTNER_HUB_MOUNTED_KEY];
    partnerHubMounts.delete(surface);
    return true;
  }

  const api = Object.freeze({ open: openHub, close, destroy, snapshot });
  partnerHubMounts.set(surface, api);
  return api;
}

export function projectPartnerConversationHubOverlay(global = globalThis) {
  const document = global?.document;
  if (!document?.querySelectorAll || !document?.createElement) return 0;
  ensureStyle(document);
  let mounted = 0;
  for (const surface of document.querySelectorAll(CONVERSATION_SELECTOR)) {
    if (!partnerHubMounts.has(surface) && mountPartnerConversationHubOnSurface(surface)) mounted += 1;
  }
  return mounted;
}

export function projectPartnerTeaQuickChoices(global = globalThis) {
  const document = global?.document;
  if (!document?.querySelectorAll || !document?.createElement) return 0;
  ensureStyle(document);

  let mounted = 0;
  for (const surface of document.querySelectorAll(CONVERSATION_SELECTOR)) {
    if (!partnerHubMounts.has(surface)) mountPartnerConversationHubOnSurface(surface);

    const existingBar = surface?.querySelector?.(TEA_BAR_SELECTOR);
    const form = surface?.querySelector?.('form.grPartnerConversationComposer');
    const input = surface?.querySelector?.('.grPartnerConversationInput');
    const send = surface?.querySelector?.('.grPartnerConversationSend');
    if (!form || !input || !send) continue;
    if (existingBar) {
      syncQuickChoiceBusyState(existingBar, input, send);
      continue;
    }
    if (typeof form.before !== 'function') continue;

    const bar = document.createElement('div');
    bar.className = 'grPartnerTeaQuickChoice';
    bar.dataset.grPartnerTeaQuickChoice = '1';
    bar.setAttribute?.('aria-label', 'お茶会のクイック選択');

    const label = document.createElement('span');
    label.className = 'grPartnerTeaQuickChoiceLabel';
    label.textContent = 'お茶会';
    bar.appendChild?.(label);

    for (const choice of PARTNER_TEA_QUICK_CHOICES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'grPartnerTeaQuickChoiceButton';
      button.dataset.choiceId = choice.id;
      button.dataset[PRESS_STATE_KEY] = 'idle';
      button.textContent = choice.label;
      button.setAttribute?.('aria-label', `お茶会: ${choice.label}`);
      wireQuickChoicePressFeedback(button);
      button.addEventListener?.('click', () => {
        submitFixedChoice(global, { form, input, send, choice });
      });
      bar.appendChild?.(button);
    }

    syncQuickChoiceBusyState(bar, input, send);
    form.before(bar);
    mounted += 1;
  }
  return mounted;
}

export function mountPartnerTeaQuickChoiceRuntime(global = globalThis) {
  const document = global?.document;
  const MutationObserverCtor = global?.MutationObserver;
  if (!document?.querySelectorAll || !document?.createElement || typeof MutationObserverCtor !== 'function') return null;

  const existing = global[RUNTIME_NAME];
  if (existing) {
    if (existing.version === RUNTIME_VERSION) return existing;
    throw new Error('PARTNER_TEA_RUNTIME_GLOBAL_COLLISION');
  }

  const project = () => projectPartnerTeaQuickChoices(global);
  const observer = new MutationObserverCtor(project);
  const observeTarget = document.body || document.documentElement;
  if (observeTarget) observer.observe(observeTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  project();

  const runtime = Object.freeze({
    version: RUNTIME_VERSION,
    plan: partnerTeaQuickChoiceProjectionPlan(),
    partnerHubPlan: partnerConversationHubProjectionPlan(),
    project,
    disconnect: () => observer.disconnect?.(),
  });
  Object.defineProperty(global, RUNTIME_NAME, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: runtime,
  });
  return runtime;
}

export const PARTNER_TEA_QUICK_CHOICE_RUNTIME_NAME = RUNTIME_NAME;
export const PARTNER_TEA_QUICK_CHOICE_RUNTIME_VERSION = RUNTIME_VERSION;
