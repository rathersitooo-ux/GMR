const CONTROL_SCHEMA = 'gameroad.partner-advice-player-control.v1';
const REPLY_PAIR_SCHEMA = 'gameroad.partner-advice-reply-pair.v1';
const SAASUNA_STATIC_NAV_STYLE_ID = 'gameroad-saasuna-static-navigator-r1-style';
const SAASUNA_STATIC_NAV_ATTR = 'data-saasuna-static-navigator';
const SAASUNA_STATIC_NAV_DATA_URL = 'data:image/webp;base64,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';

export const PARTNER_ADVICE_DELEGATE_TEXT = 'まかせた！';
export const PARTNER_ADVICE_RECLAIM_TEXT = 'まかせろ！';

function exactToken(value, max = 160) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > max || /[\u0000-\u001f\u007f]/.test(token)) return null;
  return token;
}

function inactiveDelegation(reason) {
  return Object.freeze({
    schema: CONTROL_SCHEMA,
    visible: false,
    reason,
    delegated: null,
    label: null,
    action: null,
    sourceId: null,
    generation: null,
    presentationOnly: true,
    autoExecute: false,
    gameplayAuthorityMutated: false,
  });
}

export function projectPartnerAdviceDelegationControl({ authority } = {}) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    return inactiveDelegation('CURRENT_DELEGATION_AUTHORITY_REQUIRED');
  }
  const sourceId = exactToken(authority.sourceId);
  const generation = Number(authority.generation);
  if (authority.current !== true || !sourceId || !Number.isSafeInteger(generation) || generation < 0 || typeof authority.delegated !== 'boolean') {
    return inactiveDelegation('CURRENT_DELEGATION_AUTHORITY_REQUIRED');
  }

  const delegated = authority.delegated;
  const allowed = delegated ? authority.canReclaim === true : authority.canDelegate === true;
  if (!allowed) return inactiveDelegation(delegated ? 'RECLAIM_NOT_ALLOWED' : 'DELEGATION_NOT_ALLOWED');

  return Object.freeze({
    schema: CONTROL_SCHEMA,
    visible: true,
    reason: null,
    delegated,
    label: delegated ? PARTNER_ADVICE_RECLAIM_TEXT : PARTNER_ADVICE_DELEGATE_TEXT,
    action: delegated ? 'request-player-reclaim' : 'request-partner-delegation',
    sourceId,
    generation,
    presentationOnly: true,
    autoExecute: false,
    gameplayAuthorityMutated: false,
  });
}

function inactiveReplyPair(reason) {
  return Object.freeze({
    schema: REPLY_PAIR_SCHEMA,
    visible: false,
    reason,
    sourceId: null,
    dialogueVersion: null,
    conversationId: null,
    options: Object.freeze([]),
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
    gameplayAuthorityMutated: false,
  });
}

function approvedReplyOption(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = exactToken(value.id, 96);
  const label = exactToken(value.label, 240);
  if (!id || !label || label === PARTNER_ADVICE_DELEGATE_TEXT || label === PARTNER_ADVICE_RECLAIM_TEXT) return null;
  return Object.freeze({ id, label });
}

export function projectPartnerAdviceReplyPair({ source } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.approvedCurrent !== true) {
    return inactiveReplyPair('APPROVED_CURRENT_REPLY_SOURCE_REQUIRED');
  }
  const sourceId = exactToken(source.sourceId);
  const dialogueVersion = exactToken(source.dialogueVersion, 96);
  const conversationId = exactToken(source.conversationId, 96);
  if (!sourceId || !dialogueVersion || !conversationId || !Array.isArray(source.options) || source.options.length !== 2) {
    return inactiveReplyPair('EXACT_TWO_APPROVED_REPLIES_REQUIRED');
  }
  const options = source.options.map(approvedReplyOption);
  if (options.some((option) => !option) || options[0].id === options[1].id || options[0].label === options[1].label) {
    return inactiveReplyPair('EXACT_TWO_APPROVED_REPLIES_REQUIRED');
  }

  return Object.freeze({
    schema: REPLY_PAIR_SCHEMA,
    visible: true,
    reason: null,
    sourceId,
    dialogueVersion,
    conversationId,
    options: Object.freeze(options),
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
    gameplayAuthorityMutated: false,
  });
}

function ensureSaasunaStaticNavigatorStyle(doc) {
  if (doc.getElementById?.(SAASUNA_STATIC_NAV_STYLE_ID)) return;
  const style = doc.createElement?.('style');
  if (!style) return;
  style.id = SAASUNA_STATIC_NAV_STYLE_ID;
  style.textContent = `section[data-screen="battle"] [${SAASUNA_STATIC_NAV_ATTR}="true"]{position:absolute;z-index:24;left:max(0px,env(safe-area-inset-left));bottom:0;width:clamp(132px,20vw,230px);height:auto;max-height:64vh;object-fit:contain;object-position:left bottom;pointer-events:none;user-select:none;-webkit-user-drag:none;filter:drop-shadow(0 10px 18px rgba(0,0,0,.28))}section[data-screen="battle"] [${SAASUNA_STATIC_NAV_ATTR}="true"][hidden]{display:none!important}@media(max-height:430px) and (orientation:landscape){section[data-screen="battle"] [${SAASUNA_STATIC_NAV_ATTR}="true"]{width:clamp(108px,17vw,168px);max-height:58vh}}@media(max-width:540px) and (orientation:portrait){section[data-screen="battle"] [${SAASUNA_STATIC_NAV_ATTR}="true"]{width:min(42vw,190px);max-height:52vh}}`;
  doc.head?.append?.(style);
}

export function installSaasunaStaticNavigatorPresentation(win = globalThis.window) {
  const doc = win?.document;
  const Observer = win?.MutationObserver;
  if (!doc || typeof doc.querySelector !== 'function' || typeof Observer !== 'function') return null;

  ensureSaasunaStaticNavigatorStyle(doc);
  let disposed = false;
  let image = null;
  const render = () => {
    if (disposed) return false;
    const battle = doc.querySelector('section[data-screen="battle"]');
    const roleName = doc.querySelector('#partnerAdviceChatPresentation [data-role="advice-partner-name"]');
    const active = Boolean(
      battle &&
      win?.__GAMEROAD_TEST__?.state?.screen === 'battle' &&
      roleName?.textContent?.trim?.() === 'サースナー'
    );

    if (!image || !image.isConnected) image = doc.querySelector(`[${SAASUNA_STATIC_NAV_ATTR}="true"]`);
    if (!active) {
      if (image && image.hidden !== true) image.hidden = true;
      return false;
    }
    if (!image) {
      image = doc.createElement('img');
      image.setAttribute(SAASUNA_STATIC_NAV_ATTR, 'true');
      image.setAttribute('aria-hidden', 'true');
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.src = SAASUNA_STATIC_NAV_DATA_URL;
    }
    if (image.parentNode !== battle) battle.append?.(image);
    if (image.hidden) image.hidden = false;
    return true;
  };

  const observer = new Observer(() => queueMicrotask(render));
  if (doc.documentElement) observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  render();
  return Object.freeze({
    presentationOnly: true,
    gameplayAuthorityMutated: false,
    animation: false,
    transparentSource: true,
    render,
    disconnect() {
      disposed = true;
      observer.disconnect?.();
      image?.remove?.();
      image = null;
    },
  });
}

export const SAASUNA_STATIC_NAVIGATOR_RUNTIME_CONTRACT = Object.freeze({
  partnerId: 'partner.saasuna',
  displayName: 'サースナー',
  screen: 'battle',
  side: 'left',
  sourceFormat: 'webp-alpha',
  sourceSize: 352,
  imageGeneration: false,
  animation: false,
  pointerEvents: 'none',
  rightUiReserved: true,
});

export const PARTNER_ADVICE_PLAYER_CONTROL_CONTRACT = Object.freeze({
  controlSchema: CONTROL_SCHEMA,
  replyPairSchema: REPLY_PAIR_SCHEMA,
  delegationText: PARTNER_ADVICE_DELEGATE_TEXT,
  reclaimText: PARTNER_ADVICE_RECLAIM_TEXT,
});

function scheduleSaasunaStaticNavigatorPresentation(win) {
  const doc = win?.document;
  if (!doc) return;
  const install = () => installSaasunaStaticNavigatorPresentation(win);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
  else queueMicrotask(install);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  scheduleSaasunaStaticNavigatorPresentation(window);
}
