import { PARTNER_TEA_QUICK_CHOICES } from './partner-tea-quick-choice-core.mjs';
import { nextPartnerShellView } from './partner-shell-presentation-core.mjs';
import { mountPartnerShellRuntime } from './partner-shell-runtime-mount.mjs';

const RUNTIME_NAME = 'GAMEROAD_PARTNER_TEA_QUICK_CHOICE_RUNTIME';
const RUNTIME_VERSION = 'gameroad.partner-tea-quick-choice-runtime.v3';
const STYLE_ID = 'gameroad-partner-tea-quick-choice-style';
const CONVERSATION_SELECTOR = '[data-gr-partner-conversation="1"]';
const TEA_BAR_SELECTOR = '[data-gr-partner-tea-quick-choice="1"]';
const HUB_TRIGGER_SELECTOR = '[data-partner-hub-trigger="1"]';
const HUB_OVERLAY_SELECTOR = '[data-partner-hub-overlay="1"]';
const PRESS_STATE_KEY = 'grPartnerTeaPressState';
const PRESS_KEYS = new Set(['Enter', ' ']);
const PARTNER_HUB_MOUNTED_KEY = 'partnerHubOverlayMounted';
const PARTNER_HUB_ALLOWED_ACTION_SET = new Set(['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION', 'OPEN_TEA', 'BACK_HUB']);
const partnerHubMounts = new WeakMap();
const PARTNER_IDENTITY_VISUAL_RUNTIME_NAME = 'GAMEROAD_NAKI_PARTNER_IDENTITY_VISUAL_RUNTIME';
const PARTNER_IDENTITY_VISUAL_RUNTIME_VERSION = 'gameroad.naki-partner-identity-visual.v1';
const PARTNER_IDENTITY_CARD_SELECTOR = '[data-gr-naki-partner-identity="1"]';
const NAKI_PARTNER_PORTRAIT_DATA_URI = 'data:image/webp;base64,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';
const NAKI_PARTNER_SOURCE_BLOB = '9508030cc899b750ba7206610c9281ec87437737';
const NAKI_PARTNER_SOURCE_ASSET = 'browser/assets/partners/naki-idol/battle/primary-r1/naki-idol-battle-idle-3x3.png';

export const PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS = Object.freeze([...PARTNER_HUB_ALLOWED_ACTION_SET]);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

export const NAKI_PARTNER_VISUAL_CONTRACT = freezeDeep({
  partnerId: 'partner.naki',
  displayName: '緋累ナキ',
  portraitRef: NAKI_PARTNER_PORTRAIT_DATA_URI,
  sourceAsset: NAKI_PARTNER_SOURCE_ASSET,
  sourceBlob: NAKI_PARTNER_SOURCE_BLOB,
  sourceRole: 'current_black_purple_chibi_candidate',
  formalArt: false,
  humanAccepted: false,
  candidateOnly: true,
});


function normalizePartnerIdentity(raw) {
  const partnerId = typeof raw?.partnerId === 'string' ? raw.partnerId : (typeof raw?.id === 'string' ? raw.id : null);
  const displayName = typeof raw?.displayName === 'string' ? raw.displayName : (typeof raw?.name === 'string' ? raw.name : null);
  const normalizedId = partnerId || 'partner.saasuna';
  return Object.freeze({
    partnerId: normalizedId,
    displayName: displayName || (normalizedId === 'partner.naki' ? '緋累ナキ' : normalizedId === 'partner.saasuna' ? 'サースナー' : normalizedId),
    portraitRef: normalizedId === 'partner.naki' ? NAKI_PARTNER_VISUAL_CONTRACT.portraitRef : (typeof raw?.portraitRef === 'string' ? raw.portraitRef : null),
  });
}

export function resolveCurrentPartnerIdentity(global = globalThis) {
  let raw = null;
  try { raw = global?.GAMEROAD_PARTNER_STATE?.partner?.() ?? null; } catch {}
  return normalizePartnerIdentity(raw);
}

function currentPartnerSupportsConversation(global = globalThis) {
  return resolveCurrentPartnerIdentity(global).partnerId === 'partner.saasuna';
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
    activePartnerSource: 'GAMEROAD_PARTNER_STATE',
    fallbackActivePartnerId: 'partner.saasuna',
    directConversationDefault: true,
    conversationDomPreserved: true,
    allowedActions: [...PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS],
    teaPresentation: 'existing_inline_quick_choice',
    teaCreatesStandaloneView: false,
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

export function createPartnerConversationHubInput(view = 'hub', partner = null) {
  const identity = normalizePartnerIdentity(partner);
  return Object.freeze({
    activePartnerId: identity.partnerId,
    roster: Object.freeze([identity]),
    view,
    detailPartnerId: identity.partnerId,
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
.grPartnerHubPanel .partner-shell-portrait{width:82px;height:104px;object-fit:contain;image-rendering:pixelated;display:block;margin:4px auto 8px}
[data-screen="characters"][data-gr-naki-partner-visual="1"] #charRuntime{visibility:hidden!important;opacity:0!important}
.grNakiPartnerIdentityVisual{position:absolute;inset:4% 3% 3% 46%;z-index:3;display:grid;place-items:center;pointer-events:none;margin:0;padding:0}
.grNakiPartnerIdentityVisual img{display:block;width:min(44vw,290px);height:min(54vh,360px);max-width:92%;max-height:92%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 16px 26px rgba(10,5,25,.5))}
@media(max-width:540px) and (orientation:portrait){.grNakiPartnerIdentityVisual{inset:2% 14% 12%}}
@media(max-width:540px){.grPartnerTeaQuickChoice{padding:8px 10px 0;gap:6px}.grPartnerTeaQuickChoiceButton{flex:1 1 112px}.grPartnerHubOverlay{padding:8px}.grPartnerHubPanel{width:96%;padding:9px}}
`;
  document.head?.appendChild?.(style);
}


function classHas(node, token) {
  return String(node?.className || '').split(/\s+/).includes(token);
}

function removeNakiPartnerIdentityVisual(screen) {
  const card = screen?.querySelector?.(PARTNER_IDENTITY_CARD_SELECTOR);
  card?.remove?.();
  if (screen?.dataset) delete screen.dataset.grNakiPartnerVisual;
  return false;
}

export function projectNakiPartnerIdentityVisual(global = globalThis) {
  const document = global?.document;
  if (!document?.querySelectorAll || !document?.createElement) return 0;
  const screen = Array.from(document.querySelectorAll('[data-screen="characters"]'))[0] ?? null;
  if (!screen) return 0;
  const roleTabs = Array.from(screen.querySelectorAll?.('.charRoleTab') ?? []);
  const activeRole = roleTabs.find((tab) => classHas(tab, 'on'))?.dataset?.role ?? null;
  const roleAllowsPartner = roleTabs.length === 0 || activeRole === 'partner';
  const screenActive = classHas(screen, 'active');
  const identity = resolveCurrentPartnerIdentity(global);
  if (!screenActive || !roleAllowsPartner || identity.partnerId !== 'partner.naki') {
    removeNakiPartnerIdentityVisual(screen);
    return 0;
  }

  ensureStyle(document);
  screen.dataset.grNakiPartnerVisual = '1';
  const existing = screen.querySelector?.(PARTNER_IDENTITY_CARD_SELECTOR);
  if (existing) return 0;
  const stage = screen.querySelector?.('.charStage');
  if (!stage?.appendChild) return 0;
  const card = document.createElement('figure');
  card.className = 'grNakiPartnerIdentityVisual';
  card.dataset.grNakiPartnerIdentity = '1';
  card.dataset.partnerId = NAKI_PARTNER_VISUAL_CONTRACT.partnerId;
  card.dataset.formalArt = 'false';
  card.dataset.humanAccepted = 'false';
  card.dataset.sourceBlob = NAKI_PARTNER_VISUAL_CONTRACT.sourceBlob;
  const image = document.createElement('img');
  image.src = NAKI_PARTNER_VISUAL_CONTRACT.portraitRef;
  image.alt = '緋累ナキ';
  image.width = 162;
  image.height = 203;
  image.loading = 'eager';
  image.decoding = 'async';
  card.appendChild(image);
  stage.appendChild(card);
  return 1;
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

function focusTeaQuickChoice(surface) {
  const bar = surface?.querySelector?.(TEA_BAR_SELECTOR);
  if (!bar) return false;
  const button = typeof bar.querySelector === 'function'
    ? bar.querySelector('.grPartnerTeaQuickChoiceButton')
    : Array.from(bar.children || []).find((child) => child?.className === 'grPartnerTeaQuickChoiceButton');
  if (!button || button.disabled) return false;
  button.focus?.();
  return true;
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

function mountPartnerConversationHubOnSurface(surface, global = globalThis) {
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

  const shell = mountPartnerShellRuntime({
    root: shellRoot,
    getInput: () => createPartnerConversationHubInput(view, resolveCurrentPartnerIdentity(global)),
    canDispatch: (action, context) => {
      if (!partnerConversationHubCanDispatch(action, context)) return false;
      const supportsConversation = currentPartnerSupportsConversation(global);
      if (action === 'OPEN_CONVERSATION') return supportsConversation;
      if (action === 'OPEN_TEA') return supportsConversation && Boolean(surface.querySelector(TEA_BAR_SELECTOR));
      return true;
    },
    onAction: ({ action }) => {
      if (action === 'OPEN_CONVERSATION') {
        close();
        return;
      }
      if (action === 'OPEN_TEA') {
        close();
        focusTeaQuickChoice(surface);
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
      activePartnerId: resolveCurrentPartnerIdentity(global).partnerId,
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
    if (!partnerHubMounts.has(surface) && mountPartnerConversationHubOnSurface(surface, global)) mounted += 1;
  }
  return mounted;
}

export function projectPartnerTeaQuickChoices(global = globalThis) {
  const document = global?.document;
  if (!document?.querySelectorAll || !document?.createElement) return 0;
  ensureStyle(document);
  projectNakiPartnerIdentityVisual(global);
  if (!currentPartnerSupportsConversation(global)) {
    for (const surface of document.querySelectorAll(CONVERSATION_SELECTOR)) {
      surface?.querySelector?.(TEA_BAR_SELECTOR)?.remove?.();
    }
    return 0;
  }

  let mounted = 0;
  for (const surface of document.querySelectorAll(CONVERSATION_SELECTOR)) {
    if (!partnerHubMounts.has(surface)) mountPartnerConversationHubOnSurface(surface, global);

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


export function mountNakiPartnerIdentityVisualRuntime(global = globalThis) {
  const document = global?.document;
  const MutationObserverCtor = global?.MutationObserver;
  if (!document?.querySelectorAll || !document?.createElement || typeof MutationObserverCtor !== 'function') return null;
  const existing = global[PARTNER_IDENTITY_VISUAL_RUNTIME_NAME];
  if (existing) {
    if (existing.version === PARTNER_IDENTITY_VISUAL_RUNTIME_VERSION) return existing;
    throw new Error('NAKI_PARTNER_IDENTITY_VISUAL_RUNTIME_GLOBAL_COLLISION');
  }
  const project = () => projectNakiPartnerIdentityVisual(global);
  const observer = new MutationObserverCtor(project);
  const screen = Array.from(document.querySelectorAll('[data-screen="characters"]'))[0] ?? null;
  const roster = Array.from(document.querySelectorAll('#charRoster'))[0] ?? null;
  if (screen) observer.observe(screen, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
  if (roster && roster !== screen) observer.observe(roster, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
  project();
  const runtime = Object.freeze({
    version: PARTNER_IDENTITY_VISUAL_RUNTIME_VERSION,
    project,
    visual: NAKI_PARTNER_VISUAL_CONTRACT,
    disconnect: () => observer.disconnect?.(),
  });
  Object.defineProperty(global, PARTNER_IDENTITY_VISUAL_RUNTIME_NAME, {
    configurable: false, enumerable: true, writable: false, value: runtime,
  });
  return runtime;
}

function autoMountNakiPartnerIdentityVisualRuntime(global = globalThis) {
  if (!global?.document || typeof global?.MutationObserver !== 'function') return;
  const start = () => {
    try { mountNakiPartnerIdentityVisualRuntime(global); } catch {}
  };
  if (global.document.readyState === 'loading' && typeof global.document.addEventListener === 'function') {
    global.document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    Promise.resolve().then(start);
  }
}

if (typeof globalThis !== 'undefined') autoMountNakiPartnerIdentityVisualRuntime(globalThis);

export const PARTNER_TEA_QUICK_CHOICE_RUNTIME_NAME = RUNTIME_NAME;
export const PARTNER_TEA_QUICK_CHOICE_RUNTIME_VERSION = RUNTIME_VERSION;
