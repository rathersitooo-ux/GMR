import {
  selectSaasunaBattleUtterance,
  selectSaasunaFallback,
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
  SAASUNA_BATTLE_SPEECH_ACT,
} from './partner-saasuna-conversation-source.mjs';
import { projectPartnerAdviceReplyPair } from './partner-advice-player-control-core.mjs';

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
const ADVICE_REPLY_PAIR_STYLE_ID = 'gameroad-partner-advice-reply-pair-r2-style';
const ADVICE_REPLY_PAIR_ROLE = 'partner-advice-reply-pair';
const ADVICE_REPLY_PAIR_OPTIONS = Object.freeze([
  Object.freeze({ id: 'hint-only', label: 'ヒントだけ教えて' }),
  Object.freeze({ id: 'answer-through', label: '答えまで教えて' }),
]);

function exactId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id && id === value && id.length <= 160 ? id : null;
}

function exactReplyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text === value && text.length <= 240 ? text : null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function replyConversationId({ matchId, round, adviceText }) {
  const match = exactId(matchId);
  const text = exactReplyText(adviceText);
  const roundToken = Number.isSafeInteger(round) && round >= 0
    ? String(round)
    : exactId(round) || 'x';
  if (!match || !text) return null;
  return `battle-advice-${stableHash(`${match}|${roundToken}|${text}`)}`;
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

export function approvedPartnerAdviceReplyPairSource({
  partnerId,
  matchId,
  round = null,
  adviceText,
} = {}) {
  const id = exactId(partnerId);
  if (id !== SAASUNA_PARTNER_ID) return null;
  const descriptor = approvedPartnerDialogueDescriptor(id);
  const conversationId = replyConversationId({ matchId, round, adviceText });
  if (!descriptor || descriptor.sourceState !== SOURCE_STATE || !conversationId) return null;
  return Object.freeze({
    approvedCurrent: true,
    partnerId: id,
    sourceId: descriptor.sourceId,
    dialogueVersion: descriptor.dialogueVersion,
    conversationId,
    options: ADVICE_REPLY_PAIR_OPTIONS,
    wordingAuthority: 'ai-delegated-reversible',
    userDirectRaw: false,
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
    gameplayAuthorityMutated: false,
  });
}

export function projectApprovedPartnerAdviceReplyPair(input = {}) {
  return projectPartnerAdviceReplyPair({
    source: approvedPartnerAdviceReplyPairSource(input),
  });
}

function replyPairView(projection, selectedOption) {
  if (!projection.visible) {
    return Object.freeze({
      ...projection,
      selectedOption: null,
    });
  }
  if (!selectedOption) {
    return Object.freeze({
      ...projection,
      selectedOption: null,
    });
  }
  return Object.freeze({
    ...projection,
    visible: false,
    reason: 'REPLY_ALREADY_SELECTED',
    selectedOption,
  });
}

export function createPartnerAdviceReplyPairPresentationControl() {
  let activeConversationId = null;
  let selectedOption = null;

  const project = (input) => projectApprovedPartnerAdviceReplyPair(input);
  const sync = (input) => {
    const projection = project(input);
    if (!projection.visible) {
      activeConversationId = null;
      selectedOption = null;
      return projection;
    }
    if (activeConversationId !== projection.conversationId) {
      activeConversationId = projection.conversationId;
      selectedOption = null;
    }
    return projection;
  };

  return Object.freeze({
    status(input = {}) {
      const projection = sync(input);
      return replyPairView(projection, selectedOption);
    },
    choose({ optionId, ...input } = {}) {
      const projection = sync(input);
      if (!projection.visible || selectedOption) return null;
      const id = exactId(optionId);
      const option = id ? projection.options.find((candidate) => candidate.id === id) : null;
      if (!option) return null;
      selectedOption = option;
      return Object.freeze({
        schema: 'gameroad.partner-advice-reply-selection.v1',
        conversationId: projection.conversationId,
        sourceId: projection.sourceId,
        dialogueVersion: projection.dialogueVersion,
        optionId: option.id,
        playerText: option.label,
        presentationOnly: true,
        autoExecute: false,
        emits2v2Ping: false,
        gameplayAuthorityMutated: false,
      });
    },
    clear() {
      activeConversationId = null;
      selectedOption = null;
    },
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

function currentPartnerAdviceReplyPairInput(win) {
  try {
    if (win?.__GAMEROAD_TEST__?.state?.screen !== 'battle') return null;
    const raw = win.__GAMEROAD_PARTNER_ADVICE_STATE_VERSION__?.();
    const snapshot = typeof raw === 'string' ? JSON.parse(raw) : null;
    const adviceText = exactReplyText(win.__GAMEROAD_HATE_PARTNER_TEST__?.status?.()?.advice);
    const partnerId = currentAdvicePartnerId(win);
    const matchId = exactId(snapshot?.matchId);
    if (!partnerId || !matchId || !adviceText) return null;
    return Object.freeze({
      partnerId,
      matchId,
      round: snapshot?.round ?? null,
      adviceText,
    });
  } catch {
    return null;
  }
}

function ensurePartnerAdviceReplyPairStyle(doc) {
  if (doc.getElementById(ADVICE_REPLY_PAIR_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = ADVICE_REPLY_PAIR_STYLE_ID;
  style.textContent = `#partnerAdviceChatPresentation .partnerAdviceReplyPair{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:4px}#partnerAdviceChatPresentation .partnerAdviceReplyPair[hidden]{display:none!important}#partnerAdviceChatPresentation .partnerAdviceReplyChoice{min-height:30px;padding:5px 7px;border:1px solid rgba(255,211,126,.5);border-radius:9px;background:rgba(69,49,19,.72);color:#fff1c9;font-size:9px;font-weight:950;line-height:1.2}#partnerAdviceChatPresentation .partnerAdviceReplyReceipt{grid-column:1/-1;justify-self:end;max-width:92%;padding:5px 7px;border:1px solid rgba(255,211,126,.56);border-radius:9px 9px 3px 9px;background:rgba(69,49,19,.72);color:#fff1c9;font-size:9px;font-weight:850;line-height:1.25}@media(max-height:430px) and (orientation:landscape){#partnerAdviceChatPresentation .partnerAdviceReplyChoice{min-height:24px;padding:3px 5px;font-size:8px}#partnerAdviceChatPresentation .partnerAdviceReplyReceipt{padding:4px 6px;font-size:8px}}`;
  doc.head?.append(style);
}

function ensurePartnerAdviceReplyPairNode(doc, root) {
  let node = root.querySelector(`[data-role="${ADVICE_REPLY_PAIR_ROLE}"]`);
  if (node) return node;
  node = doc.createElement('div');
  node.className = 'partnerAdviceReplyPair';
  node.dataset.role = ADVICE_REPLY_PAIR_ROLE;
  node.setAttribute('aria-label', 'パートナーへの2択返答');
  const before = root.querySelector('.partnerAdviceQuickRoutes')
    || root.querySelector('[data-role="tutorial-experience-conversation"]')
    || root.querySelector('.partnerAdviceTutorialReplay');
  root.insertBefore(node, before || null);
  return node;
}

export function installPartnerAdviceReplyPairPresentation(win = globalThis.window) {
  const doc = win?.document;
  const Observer = win?.MutationObserver;
  if (!doc || typeof doc.getElementById !== 'function' || typeof Observer !== 'function') return null;

  const control = createPartnerAdviceReplyPairPresentationControl();
  let root = null;
  let node = null;
  let observed = [];
  let stateObserver = null;
  let mountObserver = null;
  let rendering = false;

  const render = () => {
    if (rendering || !root || !node) return false;
    rendering = true;
    try {
      const input = currentPartnerAdviceReplyPairInput(win);
      const status = control.status(input || {});
      const selected = status.selectedOption || null;
      node.hidden = !status.visible && !selected;
      const signature = selected
        ? `selected:${status.conversationId}:${selected.id}:${selected.label}`
        : status.visible
          ? `open:${status.conversationId}:${status.options.map((option) => `${option.id}:${option.label}`).join('|')}`
          : `hidden:${status.reason || 'unavailable'}`;
      if (node.dataset.signature === signature) return true;
      node.dataset.signature = signature;
      node.replaceChildren();
      if (selected) {
        const receipt = doc.createElement('div');
        receipt.className = 'partnerAdviceReplyReceipt';
        receipt.dataset.replyOptionId = selected.id;
        receipt.textContent = selected.label;
        node.append(receipt);
        return true;
      }
      if (!status.visible) return true;
      for (const option of status.options) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'partnerAdviceReplyChoice';
        button.dataset.partnerReplyOptionId = option.id;
        button.textContent = option.label;
        node.append(button);
      }
      return true;
    } finally {
      rendering = false;
    }
  };

  const bind = () => {
    const nextRoot = doc.getElementById('partnerAdviceChatPresentation');
    if (!nextRoot) return false;
    if (root === nextRoot && node && stateObserver) return render();
    stateObserver?.disconnect?.();
    root = nextRoot;
    ensurePartnerAdviceReplyPairStyle(doc);
    node = ensurePartnerAdviceReplyPairNode(doc, root);
    if (node.dataset.replyPairBound !== 'true') {
      node.dataset.replyPairBound = 'true';
      node.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-partner-reply-option-id]');
        const optionId = exactId(button?.dataset?.partnerReplyOptionId);
        const input = currentPartnerAdviceReplyPairInput(win);
        if (!optionId || !input) return;
        const receipt = control.choose({ ...input, optionId });
        if (!receipt) return;
        render();
      });
    }
    observed = [
      root.querySelector('.partnerAdviceSpeech.partner:not(.characterReaction)'),
      root.querySelector('[data-role="advice-partner-name"]'),
      doc.getElementById('roundNo'),
      doc.getElementById('partnerDecisionStatus'),
    ].filter(Boolean);
    stateObserver = new Observer(() => queueMicrotask(render));
    for (const target of observed) {
      stateObserver.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }
    render();
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
    autoExecute: false,
    emits2v2Ping: false,
    control,
    render,
    disconnect() {
      mountObserver?.disconnect?.();
      stateObserver?.disconnect?.();
      mountObserver = null;
      stateObserver = null;
      observed = [];
      root = null;
      node = null;
      control.clear();
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
  adviceReplyPairAuthority: 'approved-current-dialogue-descriptor+ai-delegated-reversible-player-wording',
  adviceReplyPairUserDirectRaw: false,
  adviceReplyPairAutoExecute: false,
  adviceReplyPairEmits2v2Ping: false,
});

function schedulePartnerDelegationLabelPresentation(win) {
  const doc = win?.document;
  if (!doc) return;
  const install = () => installPartnerDelegationLabelPresentation(win);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
  else queueMicrotask(install);
}

function schedulePartnerAdviceReplyPairPresentation(win) {
  const doc = win?.document;
  if (!doc) return;
  const install = () => installPartnerAdviceReplyPairPresentation(win);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
  else queueMicrotask(install);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  schedulePartnerDelegationLabelPresentation(window);
  schedulePartnerAdviceReplyPairPresentation(window);
}
