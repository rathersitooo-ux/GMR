import {
  selectPartnerLegalCandidate,
  selectPartnerManifestOrRuleCandidate,
} from './partner-legal-action-adapter.mjs';
import {
  selectSaasunaBattleUtterance,
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
  SAASUNA_BATTLE_SPEECH_ACT,
} from './partner-saasuna-conversation-source.mjs';

const VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);
const PARTNER_STRATEGY_RULES = new Set(['left', 'right', 'max', 'min']);
const BOARD_PROJECTION_SCHEMA = 'gameroad.partner-advice-board-projection.v1';
const TUTORIAL_GUIDE_SCHEMA = 'gameroad.tutorial-partner-guide-control.v1';
const CONTEXTUAL_TUTORIAL_REPLAY_SCHEMA = 'gameroad.tutorial-contextual-replay-control.v1';
const QUICK_REPLY_SCHEMA = 'gameroad.partner-advice-quick-reply.v1';
const DELEGATE_REPLY_TEXT = 'まかせた！';

function exactVersionTuple(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of VERSION_KEYS) {
    const token = value[key];
    if (typeof token !== 'string' || !token || token.trim() !== token || token.length > 96) return null;
    out[key] = token;
  }
  return Object.freeze(out);
}

function exactPresentationToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > 160) return null;
  return token;
}

function resolvePartnerStrategyRule(rule, getPartnerId, getStrategyPreference) {
  if (!PARTNER_STRATEGY_RULES.has(rule)) return rule;
  if (typeof getPartnerId !== 'function' || typeof getStrategyPreference !== 'function') return rule;

  try {
    const partnerId = exactPresentationToken(getPartnerId());
    if (!partnerId) return rule;
    const preferredRule = getStrategyPreference(partnerId);
    return PARTNER_STRATEGY_RULES.has(preferredRule) ? preferredRule : rule;
  } catch {
    return rule;
  }
}

function inactiveBoardProjection(reason) {
  return Object.freeze({
    schema: BOARD_PROJECTION_SCHEMA,
    active: false,
    clear: true,
    reason,
    candidateId: null,
    targetId: null,
    alternativeCandidateId: null,
    source: null,
    presentationRole: 'partner-recommendation',
    autoExecute: false,
  });
}

function preservePublicPayload(result, candidates) {
  if (!result?.ok || !result.selected) return result;
  const id = String(result.selected.candidateId || '');
  const raw = (candidates || []).find((candidate) =>
    String(candidate?.candidateId || '') === id && candidate?.publicScope === true,
  );
  if (!raw) return result;
  return Object.freeze({
    ...result,
    selected: Object.freeze({ ...result.selected, payload: raw.payload }),
  });
}

export function projectPartnerAdviceBoardEmphasis({
  adviceResult,
  isCurrent,
  resolveTarget,
} = {}) {
  if (!adviceResult?.ok) return inactiveBoardProjection('ADVICE_UNAVAILABLE');
  if (adviceResult.containsPrivate !== false) return inactiveBoardProjection('PUBLIC_SCOPE_UNVERIFIED');

  const candidateId = exactPresentationToken(adviceResult.selected?.candidateId);
  if (!candidateId) return inactiveBoardProjection('NO_SELECTED_CANDIDATE');
  if (typeof isCurrent !== 'function' || typeof resolveTarget !== 'function') {
    return inactiveBoardProjection('PROJECTION_GATE_REQUIRED');
  }

  try {
    if (isCurrent(adviceResult) !== true) return inactiveBoardProjection('STALE_ADVICE');
  } catch {
    return inactiveBoardProjection('CURRENTNESS_CHECK_FAILED');
  }

  let resolvedTarget;
  try {
    resolvedTarget = resolveTarget(candidateId);
  } catch {
    return inactiveBoardProjection('TARGET_RESOLUTION_FAILED');
  }

  const targetId = exactPresentationToken(
    typeof resolvedTarget === 'string' ? resolvedTarget : resolvedTarget?.targetId,
  );
  if (!targetId) return inactiveBoardProjection('TARGET_UNMAPPED');

  const next = exactPresentationToken(adviceResult.next);
  return Object.freeze({
    schema: BOARD_PROJECTION_SCHEMA,
    active: true,
    clear: false,
    reason: null,
    candidateId,
    targetId,
    alternativeCandidateId: next && next !== candidateId ? next : null,
    source: exactPresentationToken(adviceResult.source),
    presentationRole: 'partner-recommendation',
    autoExecute: false,
  });
}

export function createPartnerAdviceReplayBridge({
  legacyReplay,
  getVersions = () => null,
  getManifest = () => null,
  getRuntimeState = () => null,
  getPartnerId = null,
  getStrategyPreference = null,
} = {}) {
  if (typeof legacyReplay !== 'function') throw new TypeError('legacyReplay must be a function');
  if (getPartnerId !== null && typeof getPartnerId !== 'function') {
    throw new TypeError('getPartnerId must be a function or null');
  }
  if (getStrategyPreference !== null && typeof getStrategyPreference !== 'function') {
    throw new TypeError('getStrategyPreference must be a function or null');
  }

  return function partnerAdviceReplay(candidates, rule) {
    const effectiveRule = resolvePartnerStrategyRule(rule, getPartnerId, getStrategyPreference);
    const fallback = () => legacyReplay({ rule: effectiveRule, candidates });
    const versions = exactVersionTuple(getVersions());
    if (!versions) return fallback();

    try {
      const manifest = getManifest();
      const result = manifest
        ? selectPartnerManifestOrRuleCandidate({
            candidates,
            rule: effectiveRule,
            sourceVersions: versions,
            targetVersions: versions,
            manifest,
            runtimeState: getRuntimeState(),
          })
        : selectPartnerLegalCandidate({
            candidates,
            rule: effectiveRule,
            sourceVersions: versions,
            targetVersions: versions,
          });

      if (!result?.ok) return fallback();
      return preservePublicPayload(result, candidates);
    } catch {
      return fallback();
    }
  };
}

export function createPartnerAdviceRuntimeControl({ onChange } = {}) {
  let versions = null;
  let manifest = null;
  let runtimeStateProvider = null;
  const changed = () => { if (typeof onChange === 'function') onChange(); };

  return Object.freeze({
    setVersions(next) {
      const parsed = exactVersionTuple(next);
      if (!parsed) return false;
      versions = parsed;
      changed();
      return true;
    },
    setManifest(next) {
      if (!next || typeof next !== 'object' || Array.isArray(next)) return false;
      manifest = next;
      changed();
      return true;
    },
    setRuntimeStateProvider(next) {
      if (next !== null && typeof next !== 'function') return false;
      runtimeStateProvider = next;
      changed();
      return true;
    },
    clearManifest() {
      manifest = null;
      changed();
    },
    getVersions: () => versions,
    getManifest: () => manifest,
    getRuntimeState: () => (runtimeStateProvider ? runtimeStateProvider() : null),
    status: () => Object.freeze({
      versionReady: Boolean(versions),
      manifestReady: Boolean(manifest),
      runtimeStateReady: Boolean(runtimeStateProvider),
      mode: versions ? (manifest ? 'manifest-or-rule' : 'shared-rule') : 'legacy-fallback',
    }),
  });
}

export function createTutorialPartnerGuideControl({
  tutorialId = 'tutorial.first-battle',
  isTutorialCompleted = () => false,
  commitTutorialCompletion = null,
  onChange,
} = {}) {
  const id = exactPresentationToken(tutorialId);
  if (!id) throw new TypeError('tutorialId must be an exact non-empty token');
  if (typeof isTutorialCompleted !== 'function') throw new TypeError('isTutorialCompleted must be a function');
  if (commitTutorialCompletion !== null && typeof commitTutorialCompletion !== 'function') {
    throw new TypeError('commitTutorialCompletion must be a function or null');
  }

  let runId = null;
  let active = false;
  let autoGuideEnabled = false;
  let completionCommitted = false;
  const changed = () => { if (typeof onChange === 'function') onChange(); };
  const externallyCompleted = () => {
    try {
      return isTutorialCompleted(id) === true;
    } catch {
      return null;
    }
  };
  const status = () => Object.freeze({
    schema: TUTORIAL_GUIDE_SCHEMA,
    tutorialId: id,
    runId,
    active,
    autoGuideEnabled: active && autoGuideEnabled,
    userCanDisableAutoGuide: active && autoGuideEnabled,
    onDemandConversationAllowed: true,
    completionCommitted,
    completed: completionCommitted || externallyCompleted() === true,
  });

  return Object.freeze({
    begin(nextRunId) {
      const next = exactPresentationToken(nextRunId);
      if (!next) return false;
      if (active || completionCommitted) return false;
      const completed = externallyCompleted();
      if (completed !== false) return false;
      runId = next;
      active = true;
      autoGuideEnabled = true;
      changed();
      return true;
    },
    disableAutoGuide() {
      if (!active) return false;
      if (!autoGuideEnabled) return true;
      autoGuideEnabled = false;
      changed();
      return true;
    },
    shouldAutoGuide(nextRunId = runId) {
      const next = exactPresentationToken(nextRunId);
      return Boolean(next && active && autoGuideEnabled && next === runId);
    },
    allowsOnDemandConversation() {
      return true;
    },
    abort() {
      if (!active) return false;
      runId = null;
      active = false;
      autoGuideEnabled = false;
      changed();
      return true;
    },
    async complete() {
      if (!active || completionCommitted || typeof commitTutorialCompletion !== 'function') return false;
      let committed = false;
      try {
        committed = await commitTutorialCompletion(Object.freeze({ tutorialId: id, runId }));
      } catch {
        return false;
      }
      if (committed !== true) return false;
      completionCommitted = true;
      runId = null;
      active = false;
      autoGuideEnabled = false;
      changed();
      return true;
    },
    status,
  });
}

export function projectBattleContextualTutorialReplay(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.screen !== 'battle') {
    return Object.freeze({
      schema: CONTEXTUAL_TUTORIAL_REPLAY_SCHEMA,
      active: false,
      reason: 'BATTLE_CONTEXT_REQUIRED',
      message: null,
      focusRole: null,
      presentationOnly: true,
      autoExecute: false,
    });
  }

  const phase = exactPresentationToken(snapshot.phase) || null;
  const busy = snapshot.busy === true;
  let message = '公開・移動・次の判断へ進行中';
  let focusRole = null;

  if (phase === 'plan' && !busy) {
    if (!exactPresentationToken(snapshot.roadId)) {
      message = '手札からロードカードを1枚選ぶ';
      focusRole = 'road';
    } else if (!exactPresentationToken(snapshot.battleId)) {
      message = '次に、別のバトルカードを1枚選ぶ';
      focusRole = 'battle';
    } else {
      message = '予約内容を確認して準備完了';
      focusRole = 'ready';
    }
  } else if (phase === 'reveal' || phase === 'move') {
    message = 'ロード受理済み。公開と次段階を確認中';
  }

  return Object.freeze({
    schema: CONTEXTUAL_TUTORIAL_REPLAY_SCHEMA,
    active: true,
    reason: null,
    message,
    focusRole,
    presentationOnly: true,
    autoExecute: false,
  });
}

export function createBattleContextualTutorialReplayControl({
  getSnapshot = () => null,
  showHelp = null,
  clearHelp = null,
  setFocus = null,
  onChange,
} = {}) {
  if (typeof getSnapshot !== 'function') throw new TypeError('getSnapshot must be a function');
  if (showHelp !== null && typeof showHelp !== 'function') throw new TypeError('showHelp must be a function or null');
  if (clearHelp !== null && typeof clearHelp !== 'function') throw new TypeError('clearHelp must be a function or null');
  if (setFocus !== null && typeof setFocus !== 'function') throw new TypeError('setFocus must be a function or null');

  let active = false;
  const changed = () => { if (typeof onChange === 'function') onChange(); };
  const projection = () => {
    try {
      return projectBattleContextualTutorialReplay(getSnapshot());
    } catch {
      return projectBattleContextualTutorialReplay(null);
    }
  };
  const available = () => projection().active && typeof showHelp === 'function' && typeof clearHelp === 'function';
  const status = () => {
    const current = projection();
    return Object.freeze({
      schema: CONTEXTUAL_TUTORIAL_REPLAY_SCHEMA,
      available: current.active && typeof showHelp === 'function' && typeof clearHelp === 'function',
      active,
      message: active ? current.message : null,
      focusRole: active ? current.focusRole : null,
      returnContext: 'same-battle',
      presentationOnly: true,
      firstTutorialCompletionMutated: false,
      rewardMutated: false,
      saveMutated: false,
      gameplayAuthorityMutated: false,
      autoExecute: false,
    });
  };
  const clearPresentation = () => {
    try {
      clearHelp?.('BATTLE_CONTEXTUAL_REPLAY');
    } catch {}
    try {
      setFocus?.(null);
    } catch {}
  };
  const apply = () => {
    const current = projection();
    if (!current.active || typeof showHelp !== 'function' || typeof clearHelp !== 'function') return false;
    try {
      clearHelp('BATTLE_CONTEXTUAL_REPLAY');
      const shown = showHelp(Object.freeze({
        code: 'BATTLE_CONTEXTUAL_REPLAY',
        message: current.message,
        kind: 'ok',
        ttl: 0,
      }));
      if (shown === false) return false;
      setFocus?.(current.focusRole);
      return true;
    } catch {
      return false;
    }
  };

  return Object.freeze({
    open() {
      if (!available() || !apply()) return false;
      active = true;
      changed();
      return true;
    },
    close() {
      if (!active) return false;
      clearPresentation();
      active = false;
      changed();
      return true;
    },
    refresh() {
      if (!active) return status();
      if (!apply()) {
        clearPresentation();
        active = false;
        changed();
      }
      return status();
    },
    status,
  });
}

export function createPartnerAdviceQuickReplyControl({
  getPartnerId = () => null,
  getDialogueVersion = () => SAASUNA_DIALOGUE_VERSION,
  getSourceId = () => SAASUNA_DIALOGUE_SOURCE_ID,
} = {}) {
  if (typeof getPartnerId !== 'function' || typeof getDialogueVersion !== 'function' || typeof getSourceId !== 'function') {
    throw new TypeError('quick reply authority providers must be functions');
  }

  let pending = null;
  const consumed = new Set();
  const status = () => Object.freeze({
    schema: QUICK_REPLY_SCHEMA,
    pendingReplyId: pending?.replyId ?? null,
    pendingText: pending?.text ?? null,
    committedReplyIds: Object.freeze([...consumed]),
    autoExecute: false,
    emits2v2Ping: false,
  });

  return Object.freeze({
    arm({ replyId, text } = {}) {
      const id = exactPresentationToken(replyId);
      if (!id || text !== DELEGATE_REPLY_TEXT || pending || consumed.has(id)) return false;
      pending = Object.freeze({ replyId: id, text });
      return true;
    },
    cancel(replyId) {
      const id = exactPresentationToken(replyId);
      if (!id || !pending || pending.replyId !== id) return false;
      pending = null;
      return true;
    },
    commit(replyId) {
      const id = exactPresentationToken(replyId);
      if (!id || !pending || pending.replyId !== id || consumed.has(id)) return null;

      let partnerId;
      let dialogueVersion;
      let sourceId;
      try {
        partnerId = exactPresentationToken(getPartnerId());
        dialogueVersion = exactPresentationToken(getDialogueVersion());
        sourceId = exactPresentationToken(getSourceId());
      } catch {
        return null;
      }
      if (partnerId !== SAASUNA_PARTNER_ID || dialogueVersion !== SAASUNA_DIALOGUE_VERSION || sourceId !== SAASUNA_DIALOGUE_SOURCE_ID) {
        return null;
      }

      const utterance = selectSaasunaBattleUtterance({
        partnerId,
        dialogueVersion,
        sourceId,
        speechAct: SAASUNA_BATTLE_SPEECH_ACT,
        triggerId: 'delegate_normal',
        seed: id,
      });
      if (!utterance) return null;

      consumed.add(id);
      pending = null;
      return Object.freeze({
        schema: QUICK_REPLY_SCHEMA,
        replyId: id,
        playerText: DELEGATE_REPLY_TEXT,
        partnerId,
        speechAct: SAASUNA_BATTLE_SPEECH_ACT,
        partnerUtterance: utterance.text,
        sourceId,
        dialogueVersion,
        presentationOnly: true,
        autoExecute: false,
        emits2v2Ping: false,
        exactlyOnce: true,
      });
    },
    status,
  });
}

export function isPartnerAdviceQuickReplyAvailable({ partnerId, matchId } = {}) {
  return partnerId === SAASUNA_PARTNER_ID && Boolean(exactPresentationToken(matchId));
}

export const PARTNER_ADVICE_DELEGATE_REPLY_TEXT = DELEGATE_REPLY_TEXT;

const CHAT_PRESENTATION_SCHEMA = 'gameroad.partner-advice-chat-presentation.v1';
const CHAT_STYLE_ID = 'gameroad-partner-advice-chat-r1';
const CHAT_ROOT_ID = 'partnerAdviceChatPresentation';

function chatLaneProgress(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const lane of ['L', 'C', 'R']) {
    const value = Number(input[lane]);
    if (!Number.isInteger(value) || value < 0) return null;
    out[lane] = value;
  }
  return Object.freeze(out);
}

function chatText(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token ? token.slice(0, 240) : null;
}

export function projectPartnerAdviceChatPresentation({ laneProgress, partnerText = null, playerText = null } = {}) {
  const progress = chatLaneProgress(laneProgress);
  if (!progress) return Object.freeze({ schema: CHAT_PRESENTATION_SCHEMA, active: false, reason: 'LANE_PROGRESS_UNVERIFIED', presentationOnly: true, autoExecute: false, emits2v2Ping: false });
  return Object.freeze({
    schema: CHAT_PRESENTATION_SCHEMA,
    active: true,
    reason: null,
    laneProgress: progress,
    partnerText: chatText(partnerText),
    playerText: playerText === DELEGATE_REPLY_TEXT ? DELEGATE_REPLY_TEXT : null,
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
  });
}

function currentBattleChatSnapshot(win) {
  try {
    const raw = win.__GAMEROAD_PARTNER_ADVICE_STATE_VERSION__?.();
    const snapshot = typeof raw === 'string' ? JSON.parse(raw) : null;
    const status = win.__GAMEROAD_HATE_PARTNER_TEST__?.status?.() || null;
    return {
      lanes: snapshot?.human?.lanes || null,
      partnerText: status?.advice || null,
      partnerId: win.__GAMEROAD_TEST__?.state?.selectedPartnerId || null,
      matchId: snapshot?.matchId || null,
      round: snapshot?.round ?? null,
    };
  } catch {
    return null;
  }
}

function currentBattleTutorialReplaySnapshot(win) {
  try {
    const state = win.__GAMEROAD_TEST__?.state || null;
    const me = state?.match?.players?.[0] || null;
    return {
      screen: state?.screen || null,
      phase: state?.match?.phase || null,
      busy: state?.match?.busy === true,
      roadId: me?.plan?.roadId || null,
      battleId: me?.plan?.battleId || null,
    };
  } catch {
    return null;
  }
}

function setBattleContextualTutorialFocus(doc, role) {
  doc.querySelectorAll('[data-contextual-tutorial-focus="true"]').forEach((node) => {
    node.removeAttribute('data-contextual-tutorial-focus');
    node.classList.remove('contextualTutorialFocus');
  });
  const selector = role === 'road' ? '#roadSelect' : role === 'battle' ? '#battleSelect' : role === 'ready' ? '#readyPlan' : null;
  if (!selector) return true;
  const target = doc.querySelector(selector);
  if (!target) return false;
  target.dataset.contextualTutorialFocus = 'true';
  target.classList.add('contextualTutorialFocus');
  return true;
}

function ensureBattleChatStyle(doc) {
  if (doc.getElementById(CHAT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = CHAT_STYLE_ID;
  style.textContent = `#${CHAT_ROOT_ID}{display:grid;gap:6px;margin:7px 0;padding:7px;border:1px solid rgba(190,225,214,.28);border-radius:10px;background:rgba(3,18,16,.72)}#${CHAT_ROOT_ID} .partnerAdviceLaneProgress{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}#${CHAT_ROOT_ID} .partnerAdviceLane{display:grid;place-items:center;min-height:38px;border:1px solid rgba(205,239,228,.22);border-radius:8px;background:rgba(8,35,29,.72)}#${CHAT_ROOT_ID} .partnerAdviceLane span{font-size:8px;color:#9eb7af;font-weight:900}#${CHAT_ROOT_ID} .partnerAdviceLane b{font-size:15px;line-height:1;font-variant-numeric:tabular-nums}.partnerAdviceSpeech{display:none;max-width:92%;padding:8px 10px;border:1px solid rgba(173,235,214,.38);font-size:11px;font-weight:850;line-height:1.4}.partnerAdviceSpeech.on{display:block}.partnerAdviceSpeech.partner{border-radius:10px 10px 10px 3px;background:#143e34}.partnerAdviceSpeech.player{justify-self:end;border-radius:10px 10px 3px 10px;background:rgba(69,49,19,.72);border-color:rgba(255,211,126,.56);color:#fff1c9}.partnerAdviceQuickReply,.partnerAdviceTutorialReplay{min-height:44px;padding:9px 14px;border-radius:12px;font-size:11px;font-weight:950}.partnerAdviceQuickReply{justify-self:end;border:1px solid rgba(255,211,126,.56);background:rgba(69,49,19,.72);color:#fff1c9}.partnerAdviceTutorialReplay{justify-self:start;border:1px solid rgba(173,235,214,.38);background:rgba(10,45,38,.78);color:#e4fff6}.contextualTutorialFocus{outline:2px solid rgba(255,216,120,.78)!important;outline-offset:2px!important;box-shadow:0 0 0 2px rgba(255,216,120,.24),0 0 18px rgba(255,216,120,.22)!important}@media(max-width:540px){#${CHAT_ROOT_ID}{padding:5px;gap:4px}.partnerAdviceSpeech{font-size:10px}.partnerAdviceQuickReply,.partnerAdviceTutorialReplay{font-size:10px}}@media(prefers-reduced-motion:reduce){#${CHAT_ROOT_ID} *,.contextualTutorialFocus{transition:none!important;animation:none!important}}`;
  doc.head?.append(style);
}

export function mountPartnerAdviceChatPresentation({ windowRef = globalThis.window } = {}) {
  const win = windowRef;
  const doc = win?.document;
  if (!doc) return null;
  const host = doc.getElementById('partnerDecisionBox');
  if (!host) return null;
  ensureBattleChatStyle(doc);
  let root = doc.getElementById(CHAT_ROOT_ID);
  if (!root) {
    root = doc.createElement('section');
    root.id = CHAT_ROOT_ID;
    root.setAttribute('aria-label', 'パートナーとの対戦チャット');
    root.innerHTML = '<div class="partnerAdviceLaneProgress" aria-label="3列の現在進行値"><div class="partnerAdviceLane" data-lane="L"><span>左列</span><b>—</b></div><div class="partnerAdviceLane" data-lane="C"><span>中央列</span><b>—</b></div><div class="partnerAdviceLane" data-lane="R"><span>右列</span><b>—</b></div></div><div class="partnerAdviceSpeech partner" aria-live="polite"></div><div class="partnerAdviceSpeech player" aria-live="polite"></div><button type="button" class="partnerAdviceTutorialReplay" aria-pressed="false">操作を再確認</button><button type="button" class="partnerAdviceQuickReply">まかせた！</button>';
    const statusNode = host.querySelector('.partnerDecisionStatus');
    host.insertBefore(root, statusNode || host.firstChild);
  }

  let lastReceipt = null;
  const quickReply = createPartnerAdviceQuickReplyControl({ getPartnerId: () => currentBattleChatSnapshot(win)?.partnerId });
  const tutorialReplay = createBattleContextualTutorialReplayControl({
    getSnapshot: () => currentBattleTutorialReplaySnapshot(win),
    showHelp: ({ code, message, kind, ttl }) => win.__GAMEROAD_CONTEXT_HELP_TEST__?.set?.(code, { message, kind, ttl }) ?? false,
    clearHelp: (code) => win.__GAMEROAD_CONTEXT_HELP_TEST__?.clear?.(code),
    setFocus: (role) => setBattleContextualTutorialFocus(doc, role),
  });
  const render = () => {
    const current = currentBattleChatSnapshot(win);
    const projection = projectPartnerAdviceChatPresentation({
      laneProgress: current?.lanes,
      partnerText: lastReceipt?.partnerUtterance || current?.partnerText || null,
      playerText: lastReceipt?.playerText || null,
    });
    const tutorialStatus = tutorialReplay.refresh();
    root.hidden = !projection.active && !tutorialStatus.available;
    const lanes = root.querySelector('.partnerAdviceLaneProgress');
    if (lanes) lanes.hidden = !projection.active;
    if (projection.active) {
      for (const lane of ['L', 'C', 'R']) {
        const value = root.querySelector(`[data-lane="${lane}"] b`);
        if (value) value.textContent = String(projection.laneProgress[lane]);
      }
    }
    const partner = root.querySelector('.partnerAdviceSpeech.partner');
    if (partner) {
      partner.textContent = projection.active ? projection.partnerText || '' : '';
      partner.classList.toggle('on', projection.active && Boolean(projection.partnerText));
    }
    const player = root.querySelector('.partnerAdviceSpeech.player');
    if (player) {
      player.textContent = projection.active ? projection.playerText || '' : '';
      player.classList.toggle('on', projection.active && Boolean(projection.playerText));
    }
    const button = root.querySelector('.partnerAdviceQuickReply');
    const quickReplyAvailable = projection.active && isPartnerAdviceQuickReplyAvailable(current);
    if (button) {
      button.hidden = !quickReplyAvailable;
      button.disabled = !quickReplyAvailable;
    }
    const tutorialButton = root.querySelector('.partnerAdviceTutorialReplay');
    if (tutorialButton) {
      tutorialButton.hidden = !tutorialStatus.available;
      tutorialButton.disabled = !tutorialStatus.available;
      tutorialButton.setAttribute('aria-pressed', tutorialStatus.active ? 'true' : 'false');
      tutorialButton.textContent = tutorialStatus.active ? '説明を閉じる' : '操作を再確認';
    }
    return Object.freeze({ projection, tutorial: tutorialStatus });
  };

  const button = root.querySelector('.partnerAdviceQuickReply');
  if (button && button.dataset.partnerAdviceBound !== 'true') {
    button.dataset.partnerAdviceBound = 'true';
    button.addEventListener('click', () => {
      const current = currentBattleChatSnapshot(win);
      if (!isPartnerAdviceQuickReplyAvailable(current)) return;
      const replyId = `${current.matchId}:${current.round ?? 'x'}:delegate-quick-reply`;
      if (!quickReply.arm({ replyId, text: DELEGATE_REPLY_TEXT })) return;
      const receipt = quickReply.commit(replyId);
      if (!receipt) {
        quickReply.cancel(replyId);
        return;
      }
      lastReceipt = receipt;
      render();
    });
  }

  const tutorialButton = root.querySelector('.partnerAdviceTutorialReplay');
  if (tutorialButton && tutorialButton.dataset.contextualTutorialBound !== 'true') {
    tutorialButton.dataset.contextualTutorialBound = 'true';
    tutorialButton.addEventListener('click', () => {
      const status = tutorialReplay.status();
      if (status.active) tutorialReplay.close();
      else tutorialReplay.open();
      render();
    });
  }

  if (root.dataset.partnerAdviceObserved !== 'true') {
    root.dataset.partnerAdviceObserved = 'true';
    const observer = new win.MutationObserver(() => queueMicrotask(render));
    for (const id of ['publicPlayerStrip', 'partnerDecisionStatus']) {
      const node = doc.getElementById(id);
      if (node) observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    doc.getElementById('partnerAdviceBtn')?.addEventListener('click', () => queueMicrotask(render));
  }
  render();
  return Object.freeze({ root, render, tutorialReplay });
}

function schedulePartnerAdviceChatMount(win) {
  const doc = win?.document;
  if (!doc) return;
  const tryMount = () => mountPartnerAdviceChatPresentation({ windowRef: win });
  if (tryMount()) return;
  const observer = new win.MutationObserver(() => {
    if (tryMount()) observer.disconnect();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedulePartnerAdviceChatMount(window), { once: true });
  else schedulePartnerAdviceChatMount(window);
}
