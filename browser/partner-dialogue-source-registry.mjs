import {
  selectSaasunaBattleUtterance,
  selectSaasunaFallback,
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
  SAASUNA_BATTLE_SPEECH_ACT,
} from './partner-saasuna-conversation-source.mjs';

const SOURCE_STATE = 'approved_current';
const DISPLAY_NAMES = Object.freeze({
  'partner.naki': '緋累ナキ',
  'partner.saasuna': 'サースナー',
  'partner.mato': '泊愛まと',
  'partner.creator.miku': '初音ミク',
});
const DELEGATION_PRESENTATION_LABELS = Object.freeze({
  'まかせた': 'まかせた！',
  'まかせた！': 'まかせた！',
  'まかせろ': 'まかせろ！',
  'まかせろ！': 'まかせろ！',
});

function exactId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id && id === value && id.length <= 160 ? id : null;
}

const SOURCES = new Map([
  [SAASUNA_PARTNER_ID, Object.freeze({
    partnerId: SAASUNA_PARTNER_ID,
    dialogueVersion: SAASUNA_DIALOGUE_VERSION,
    sourceId: SAASUNA_DIALOGUE_SOURCE_ID,
    battleSpeechAct: SAASUNA_BATTLE_SPEECH_ACT,
    sourceState: SOURCE_STATE,
    selectBattleUtterance: selectSaasunaBattleUtterance,
  })],
]);

export function partnerDisplayName(partnerId) {
  const id = exactId(partnerId);
  return id ? DISPLAY_NAMES[id] || 'パートナー' : 'パートナー';
}

export function partnerRosterIdsFromRuntime(win = globalThis.window) {
  try {
    const profiles = win?.__GAMEROAD_TEST__?.partnerRoles?.()?.profiles
      || win?.__GAMEROAD_TEST__?.state?.partnerProfiles
      || null;
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return Object.freeze([]);
    return Object.freeze(Object.keys(profiles).filter((id) => Boolean(exactId(id))));
  } catch {
    return Object.freeze([]);
  }
}

export function resolveApprovedPartnerDialogueSource(partnerId) {
  const id = exactId(partnerId);
  return id ? SOURCES.get(id) || null : null;
}

export function selectApprovedPartnerBattleUtterance({
  partnerId,
  triggerId,
  seed,
  fields,
} = {}) {
  const source = resolveApprovedPartnerDialogueSource(partnerId);
  if (!source) return null;
  try {
    const utterance = source.selectBattleUtterance({
      partnerId: source.partnerId,
      dialogueVersion: source.dialogueVersion,
      sourceId: source.sourceId,
      speechAct: source.battleSpeechAct,
      triggerId,
      seed,
      fields,
    });
    if (!utterance || utterance.partnerId !== source.partnerId || utterance.sourceState !== SOURCE_STATE) return null;
    return utterance;
  } catch {
    return null;
  }
}

export function selectApprovedPartnerIdleUtterance({ partnerId, seed = 'idle' } = {}) {
  const source = resolveApprovedPartnerDialogueSource(partnerId);
  if (!source || source.partnerId !== SAASUNA_PARTNER_ID) return null;
  const stableSeed = exactId(seed) || 'idle';
  let text;
  try {
    text = exactId(selectSaasunaFallback(stableSeed));
  } catch {
    return null;
  }
  if (!text) return null;
  return Object.freeze({
    partnerId: source.partnerId,
    dialogueVersion: source.dialogueVersion,
    sourceId: source.sourceId,
    speechAct: source.battleSpeechAct,
    triggerId: 'idle_readable',
    text,
    sourceState: source.sourceState,
    presentationOnly: true,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
  });
}

export function approvedPartnerDialogueDescriptor(partnerId) {
  const source = resolveApprovedPartnerDialogueSource(partnerId);
  if (!source) return null;
  return Object.freeze({
    partnerId: source.partnerId,
    dialogueVersion: source.dialogueVersion,
    sourceId: source.sourceId,
    battleSpeechAct: source.battleSpeechAct,
    sourceState: source.sourceState,
  });
}

export function currentAdvicePartnerId(win = globalThis.window) {
  try {
    const state = win?.__GAMEROAD_TEST__?.state || null;
    const roster = partnerRosterIdsFromRuntime(win);
    const preferred = exactId(state?.settings?.advicePartnerId);
    if (preferred && roster.includes(preferred)) return preferred;
    const regular = exactId(state?.selectedPartnerId);
    return regular && roster.includes(regular) ? regular : roster[0] || null;
  } catch {
    return null;
  }
}

export function setAdvicePartnerId(win = globalThis.window, partnerId) {
  const id = exactId(partnerId);
  if (!id) return false;
  try {
    const state = win?.__GAMEROAD_TEST__?.state || null;
    if (!state) return false;
    const roster = partnerRosterIdsFromRuntime(win);
    if (!roster.includes(id)) return false;
    if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) state.settings = {};
    state.settings.advicePartnerId = id;
    win.__GAMEROAD_TEST__?.save?.();
    return currentAdvicePartnerId(win) === id;
  } catch {
    return false;
  }
}

export function cycleAdvicePartner(win = globalThis.window, step = 1) {
  const roster = partnerRosterIdsFromRuntime(win);
  if (!roster.length) return null;
  const current = currentAdvicePartnerId(win);
  const index = Math.max(0, roster.indexOf(current));
  const delta = Number.isInteger(step) && step !== 0 ? step : 1;
  const next = roster[(index + delta % roster.length + roster.length) % roster.length];
  return setAdvicePartnerId(win, next) ? next : null;
}

export function normalizePartnerDelegationControlPresentation(button) {
  if (!button || button?.classList?.contains?.('forced')) return false;
  const current = exactId(button.textContent);
  const next = current ? DELEGATION_PRESENTATION_LABELS[current] || null : null;
  if (!next) return false;
  if (button.textContent !== next) button.textContent = next;
  if (button.dataset) button.dataset.partnerDelegationLabelPresentationOnly = 'true';
  return true;
}

export function installPartnerDelegationLabelPresentation(win = globalThis.window) {
  const doc = win?.document;
  const Observer = win?.MutationObserver;
  if (!doc || typeof doc.getElementById !== 'function' || typeof Observer !== 'function') return null;

  let targetObserver = null;
  let mountObserver = null;
  let target = null;
  const bind = () => {
    const nextTarget = doc.getElementById('partnerDelegateBtn');
    if (!nextTarget) return false;
    if (target === nextTarget && targetObserver) {
      normalizePartnerDelegationControlPresentation(target);
      return true;
    }
    targetObserver?.disconnect?.();
    target = nextTarget;
    normalizePartnerDelegationControlPresentation(target);
    targetObserver = new Observer(() => normalizePartnerDelegationControlPresentation(target));
    targetObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return true;
  };

  if (!bind() && doc.documentElement) {
    mountObserver = new Observer(() => {
      if (!bind()) return;
      mountObserver?.disconnect?.();
      mountObserver = null;
    });
    mountObserver.observe(doc.documentElement, { childList: true, subtree: true });
  }

  return Object.freeze({
    presentationOnly: true,
    gameplayAuthorityMutated: false,
    disconnect() {
      mountObserver?.disconnect?.();
      targetObserver?.disconnect?.();
      mountObserver = null;
      targetObserver = null;
      target = null;
    },
  });
}

export const PARTNER_DIALOGUE_SOURCE_REGISTRY_CONTRACT = Object.freeze({
  schema: 'gameroad.partner-dialogue-source-registry.v1',
  rosterAuthority: 'existing-runtime-partnerProfiles',
  adviceSelectionStorage: 'existing-main-save.settings.advicePartnerId',
  unknownSourcePolicy: 'fail-closed-silent',
  saasunaFallbackForOtherCharacters: false,
  delegationLabelPresentation: 'existing-real-button-text-only',
  delegationGameplayAuthority: 'existing-gameplay-runtime',
});

function schedulePartnerDelegationLabelPresentation(win) {
  const doc = win?.document;
  if (!doc) return;
  const install = () => installPartnerDelegationLabelPresentation(win);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
  else queueMicrotask(install);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  schedulePartnerDelegationLabelPresentation(window);
}
