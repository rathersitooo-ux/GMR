import { PARTNER_TEA_QUICK_CHOICES } from './partner-tea-quick-choice-core.mjs';

const RUNTIME_NAME = 'GAMEROAD_PARTNER_TEA_QUICK_CHOICE_RUNTIME';
const RUNTIME_VERSION = 'gameroad.partner-tea-quick-choice-runtime.v1';
const STYLE_ID = 'gameroad-partner-tea-quick-choice-style';
const CONVERSATION_SELECTOR = '[data-gr-partner-conversation="1"]';
const TEA_BAR_SELECTOR = '[data-gr-partner-tea-quick-choice="1"]';

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

function ensureStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.grPartnerTeaQuickChoice{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px 0;border-top:1px solid rgba(196,215,255,.08)}
.grPartnerTeaQuickChoiceLabel{font-size:10px;color:#aeb7d9;letter-spacing:.08em;margin-right:2px}
.grPartnerTeaQuickChoiceButton{min-height:44px;min-width:92px;padding:9px 14px;border:1px solid rgba(184,207,255,.24);border-radius:999px;background:rgba(55,72,126,.32);color:#eef3ff;font:inherit;font-size:12px;cursor:pointer;touch-action:manipulation}
.grPartnerTeaQuickChoiceButton:hover{background:rgba(73,96,164,.42)}
.grPartnerTeaQuickChoiceButton:focus-visible{outline:2px solid rgba(159,190,255,.8);outline-offset:2px}
.grPartnerTeaQuickChoiceButton:disabled{opacity:.48;cursor:default}
@media(max-width:540px){.grPartnerTeaQuickChoice{padding:8px 10px 0;gap:6px}.grPartnerTeaQuickChoiceButton{flex:1 1 112px}}
`;
  document.head?.appendChild?.(style);
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
  }
  return busy;
}

export function projectPartnerTeaQuickChoices(global = globalThis) {
  const document = global?.document;
  if (!document?.querySelectorAll || !document?.createElement) return 0;
  ensureStyle(document);

  let mounted = 0;
  for (const surface of document.querySelectorAll(CONVERSATION_SELECTOR)) {
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
      button.textContent = choice.label;
      button.setAttribute?.('aria-label', `お茶会: ${choice.label}`);
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