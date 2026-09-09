import {
  advanceStudySession,
  createStudySession,
  getCurrentStudyQuestion,
  getStudyHint,
  normalizeStudySessionForResume,
  resolveCurrentStudyQuestion,
} from './study-problem-pack-core.mjs';
import { STUDY_MANUAL_PROBLEM_PACK } from './study-manual-problem-pack.mjs';

const GLOBAL_KEY = 'GAMEROAD_STUDY_RUN_RUNTIME';
const STYLE_ID = 'gameroad-study-run-runtime-r1-style';
const HOME_SELECTOR = '.screen.home[data-screen="home"]';
const APP_SELECTOR = '.app';
const ACTION_KINDS = new Set(['attack', 'counter']);
const RESUME_SCHEMA = 'gameroad.study-run-resume.v1';
const STUDY_CHECKPOINT_STORAGE_KEY = 'study/resume/current';

export const STUDY_MANUAL_SMOKE_ACTION_POLICY = Object.freeze({
  authority: 'PROVISIONAL_SMOKE_ONLY',
  difficultyPower: Object.freeze({
    manual_basic: 1,
    manual_multi: 2,
    manual_sequence: 2,
    manual_order: 3,
    manual_pattern: 2,
  }),
  maxTimeMultiplier: 1.25,
  timeBands: Object.freeze([
    Object.freeze({ maxMs: 5000, multiplier: 1.25 }),
    Object.freeze({ maxMs: 15000, multiplier: 1.1 }),
    Object.freeze({ maxMs: null, multiplier: 1 }),
  ]),
});

function cloneJson(value) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('STUDY_RUNTIME_NON_JSON_VALUE');
  return JSON.parse(encoded);
}

function defaultSessionId() {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `study.session.${random}`;
  return `study.session.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
}

function assertActionPolicy(policy) {
  if (!policy || policy.authority !== 'PROVISIONAL_SMOKE_ONLY') {
    throw new TypeError('STUDY_RUNTIME_PROVISIONAL_ACTION_POLICY_REQUIRED');
  }
  return policy;
}

function assertCheckpointStore(store) {
  if (store === null) return null;
  if (!store || typeof store.load !== 'function' || typeof store.commit !== 'function') {
    throw new TypeError('STUDY_RUNTIME_CHECKPOINT_STORE_REQUIRED');
  }
  return store;
}

export function createStudyRunCartridgeCheckpointStore({
  cartridgeStorage,
  key = STUDY_CHECKPOINT_STORAGE_KEY,
} = {}) {
  if (!cartridgeStorage || typeof cartridgeStorage.get !== 'function' || typeof cartridgeStorage.set !== 'function' || typeof cartridgeStorage.delete !== 'function') {
    throw new TypeError('STUDY_RUNTIME_CARTRIDGE_STORAGE_REQUIRED');
  }
  if (typeof key !== 'string' || key !== key.trim() || !key) {
    throw new TypeError('STUDY_RUNTIME_CHECKPOINT_STORAGE_KEY_INVALID');
  }

  function load() {
    const saved = cartridgeStorage.get(key);
    return saved === null ? null : cloneJson(saved);
  }

  function commit(checkpoint) {
    const candidate = cloneJson(checkpoint);
    cartridgeStorage.set(key, candidate);
    const readback = cartridgeStorage.get(key);
    if (readback === null || JSON.stringify(readback) !== JSON.stringify(candidate)) {
      throw new Error('STUDY_RUNTIME_CHECKPOINT_COMMIT_READBACK_MISMATCH');
    }
    return Object.freeze(cloneJson(readback));
  }

  function clear() {
    return cartridgeStorage.delete(key);
  }

  return Object.freeze({
    authority: 'CARTRIDGE_STORAGE_CALLER_BACKEND',
    storageBackendCreated: false,
    key,
    load,
    commit,
    clear,
  });
}

export function createStudyRunConsumerController({
  pack = STUDY_MANUAL_PROBLEM_PACK,
  actionPolicy = STUDY_MANUAL_SMOKE_ACTION_POLICY,
  now = () => Date.now(),
  createSessionId = defaultSessionId,
  resumeCheckpoint = null,
  checkpointStore = null,
} = {}) {
  assertActionPolicy(actionPolicy);
  if (typeof now !== 'function' || typeof createSessionId !== 'function') {
    throw new TypeError('STUDY_RUNTIME_CLOCK_AND_ID_REQUIRED');
  }
  const persistence = assertCheckpointStore(checkpointStore);
  if (resumeCheckpoint !== null && persistence !== null) {
    throw new Error('STUDY_RUNTIME_MULTIPLE_RESUME_SOURCES_REFUSED');
  }

  let session = null;
  let throws = [];
  let resolved = null;
  let actionKind = 'attack';
  let questionStartedAtMs = 0;
  let hint = null;

  function normalizeResumeCheckpoint(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== RESUME_SCHEMA) {
      throw new TypeError('STUDY_RUNTIME_RESUME_CHECKPOINT_INVALID');
    }
    const restoredSession = normalizeStudySessionForResume(raw.session, pack);
    if (!ACTION_KINDS.has(raw.actionKind)) throw new TypeError('STUDY_RUNTIME_RESUME_ACTION_KIND_INVALID');
    const started = Number(raw.questionStartedAtMs);
    if (!Number.isFinite(started) || started < 0) throw new TypeError('STUDY_RUNTIME_RESUME_QUESTION_TIME_INVALID');
    return Object.freeze({
      schemaVersion: RESUME_SCHEMA,
      session: restoredSession,
      actionKind: raw.actionKind,
      questionStartedAtMs: started,
    });
  }

  function resumeFromCheckpoint(raw) {
    const restored = normalizeResumeCheckpoint(raw);
    if (session?.status === 'active' && session.sessionId !== restored.session.sessionId) {
      throw new Error('STUDY_RUNTIME_ACTIVE_SESSION_REPLACEMENT_REFUSED');
    }
    session = restored.session;
    throws = [];
    resolved = null;
    hint = null;
    actionKind = restored.actionKind;
    questionStartedAtMs = restored.questionStartedAtMs;
    return snapshot();
  }

  function exportResumeCheckpoint() {
    if (!session) throw new Error('STUDY_RUNTIME_SESSION_NOT_STARTED');
    if (throws.length !== 0 || resolved !== null) {
      throw new Error('STUDY_RUNTIME_RESUME_CHECKPOINT_REQUIRES_STABLE_BOUNDARY');
    }
    const safeSession = normalizeStudySessionForResume(session, pack);
    return Object.freeze({
      schemaVersion: RESUME_SCHEMA,
      session: cloneJson(safeSession),
      actionKind,
      questionStartedAtMs,
      persistenceAuthority: 'CALLER',
      storageBackendCreated: false,
    });
  }

  function persistStableBoundary() {
    if (!persistence) return null;
    return persistence.commit(exportResumeCheckpoint());
  }

  function loadSavedCheckpoint() {
    if (!persistence) throw new Error('STUDY_RUNTIME_CHECKPOINT_STORE_NOT_CONFIGURED');
    const saved = persistence.load();
    if (saved === null) return snapshot();
    return resumeFromCheckpoint(saved);
  }

  function currentQuestion() {
    return session ? getCurrentStudyQuestion(session, pack) : null;
  }

  function start() {
    if (session?.status === 'active') return snapshot();
    const startedAtMs = Math.max(0, Number(now()) || 0);
    session = createStudySession({ sessionId: createSessionId(), pack, startedAtMs });
    throws = [];
    resolved = null;
    hint = null;
    actionKind = 'attack';
    questionStartedAtMs = startedAtMs;
    persistStableBoundary();
    return snapshot();
  }

  function restart() {
    session = null;
    return start();
  }

  function setActionKind(nextKind) {
    if (!ACTION_KINDS.has(nextKind)) throw new TypeError('STUDY_RUNTIME_ACTION_KIND_INVALID');
    if (resolved) throw new Error('STUDY_RUNTIME_QUESTION_ALREADY_RESOLVED');
    actionKind = nextKind;
    if (throws.length === 0) persistStableBoundary();
    return snapshot();
  }

  function throwAnswer(cardId, value) {
    const question = currentQuestion();
    if (!question || session?.status !== 'active') throw new Error('STUDY_RUNTIME_QUESTION_NOT_ACTIVE');
    if (resolved) throw new Error('STUDY_RUNTIME_QUESTION_ALREADY_RESOLVED');
    if (throws.length >= question.slotCount) throw new Error('STUDY_RUNTIME_ALL_SLOTS_FILLED');
    const card = question.answerHand.find((item) => item.cardId === cardId);
    if (!card) throw new TypeError('STUDY_RUNTIME_CARD_NOT_IN_HAND');
    if (throws.some((item) => item.cardId === card.cardId)) throw new Error('STUDY_RUNTIME_CARD_ALREADY_THROWN');
    const entry = card.kind === 'input'
      ? { cardId: card.cardId, value: String(value ?? '').trim() }
      : { cardId: card.cardId };
    if (card.kind === 'input' && !entry.value) throw new TypeError('STUDY_RUNTIME_INPUT_REQUIRED');
    throws = [...throws, entry];
    return snapshot();
  }

  function undoLastThrow() {
    if (resolved) throw new Error('STUDY_RUNTIME_QUESTION_ALREADY_RESOLVED');
    if (throws.length) throws = throws.slice(0, -1);
    return snapshot();
  }

  function revealHint(hintIndex = 0) {
    const question = currentQuestion();
    if (!question) throw new Error('STUDY_RUNTIME_QUESTION_NOT_ACTIVE');
    hint = getStudyHint(pack, { questionId: question.questionId, hintIndex });
    return snapshot();
  }

  function resolve() {
    const question = currentQuestion();
    if (!question || session?.status !== 'active') throw new Error('STUDY_RUNTIME_QUESTION_NOT_ACTIVE');
    if (resolved) return snapshot();
    if (throws.length !== question.slotCount) throw new Error('STUDY_RUNTIME_ALL_SLOTS_REQUIRED');
    const elapsedMs = Math.max(0, (Number(now()) || 0) - questionStartedAtMs);
    resolved = resolveCurrentStudyQuestion(session, pack, {
      throws,
      elapsedMs,
      actionKind,
      actionPolicy,
    });
    session = resolved.session;
    return snapshot();
  }

  function advance() {
    if (!resolved) throw new Error('STUDY_RUNTIME_RESOLUTION_REQUIRED');
    session = advanceStudySession(session, pack);
    throws = [];
    resolved = null;
    hint = null;
    questionStartedAtMs = Math.max(0, Number(now()) || 0);
    persistStableBoundary();
    return snapshot();
  }

  function snapshot() {
    const question = currentQuestion();
    const publicThrows = throws.map((entry, index) => {
      const card = question?.answerHand.find((item) => item.cardId === entry.cardId) ?? null;
      return Object.freeze({
        position: index + 1,
        cardId: entry.cardId,
        kind: card?.kind ?? 'unknown',
        label: card?.label ?? (entry.value || ''),
        value: entry.value ?? null,
      });
    });
    return Object.freeze({
      started: Boolean(session),
      status: session?.status ?? 'not_started',
      session: session ? cloneJson(session) : null,
      question,
      actionKind,
      throws: publicThrows,
      canResolve: Boolean(question) && !resolved && throws.length === question.slotCount,
      canAdvance: Boolean(resolved),
      resolution: resolved ? cloneJson({ grade: resolved.grade, action: resolved.action }) : null,
      hint: hint ? cloneJson(hint) : null,
      balanceAuthority: actionPolicy.authority,
      hasDefeatState: false,
      hasLossState: false,
    });
  }

  if (resumeCheckpoint !== null) resumeFromCheckpoint(resumeCheckpoint);
  else if (persistence) {
    const saved = persistence.load();
    if (saved !== null) resumeFromCheckpoint(saved);
  }

  return Object.freeze({
    start,
    restart,
    setActionKind,
    throwAnswer,
    undoLastThrow,
    revealHint,
    resolve,
    advance,
    exportResumeCheckpoint,
    resumeFromCheckpoint,
    saveStableCheckpoint: persistStableBoundary,
    loadSavedCheckpoint,
    getSnapshot: snapshot,
  });
}

export function createStudyPanelOutsideDismissHandler({ panel, onDismiss } = {}) {
  if (!panel?.contains || typeof onDismiss !== 'function') throw new TypeError('STUDY_RUNTIME_DISMISS_INPUT_INVALID');
  return function dismissStudyPanelFromOutside(event) {
    if (panel.hidden || panel.contains(event?.target)) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    onDismiss();
    return true;
  };
}

function element(documentSource, tag, attrs = {}, text = '') {
  const node = documentSource.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  node.textContent = text;
  return node;
}

function installStyle(documentSource) {
  if (documentSource.getElementById(STYLE_ID)) return;
  const style = element(documentSource, 'style', { id: STYLE_ID });
  style.textContent = `
    .studyRunEntry{position:absolute;left:2%;bottom:10%;z-index:8;min-width:128px;min-height:44px;padding:0 13px;border:1px solid rgba(173,218,255,.5);border-radius:12px;background:rgba(8,18,34,.92);color:#e8f6ff;font-weight:850;letter-spacing:.03em}
    .studyRunPanel{position:absolute;z-index:170;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 24px));max-height:min(720px,calc(100vh - 24px));overflow:auto;padding:18px;border:1px solid rgba(172,218,255,.72);border-radius:18px;background:rgba(10,16,30,.98);color:#f6fbff;box-shadow:0 24px 80px rgba(0,0,0,.62)}
    .studyRunPanel[hidden]{display:none}.studyRunHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.studyRunHead h2{margin:0;font-size:22px}.studyRunClose{min-width:44px;min-height:44px;border:0;border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font-size:22px}.studyRunPrompt{margin:14px 0 10px;font-size:20px;font-weight:800;line-height:1.5}.studyRunMeta,.studyRunHint,.studyRunNotice{font-size:12px;line-height:1.5;color:#bcd2e2}.studyRunSlots{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:8px;margin:12px 0}.studyRunSlot{min-height:56px;padding:8px;border:1px dashed rgba(184,219,255,.48);border-radius:10px;display:grid;place-items:center;text-align:center}.studyRunHand{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.studyRunCard{min-width:92px;min-height:58px;padding:8px 10px;border:1px solid rgba(184,219,255,.55);border-radius:12px;background:#162846;color:#fff;font-weight:800}.studyRunCard[disabled]{opacity:.42}.studyRunInputCard{display:grid;gap:6px;min-width:150px}.studyRunInputCard input{min-height:38px;border:1px solid rgba(184,219,255,.48);border-radius:8px;background:#0d1727;color:#fff;padding:0 9px;font-size:16px}.studyRunActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.studyRunAction{min-height:44px;padding:0 14px;border:1px solid rgba(184,219,255,.45);border-radius:10px;background:#223a60;color:#fff;font-weight:850}.studyRunAction[aria-pressed="true"]{outline:2px solid #d8f1ff;outline-offset:2px}.studyRunAction.primary{background:#315b87}.studyRunResult{margin-top:14px;padding:12px;border-radius:12px;background:rgba(255,255,255,.06);font-weight:800}.studyRunProvisional{margin-top:10px;font-size:11px;color:#9eb4c4}
    @media(max-width:620px){.studyRunEntry{left:4%;bottom:24%}.studyRunPanel{top:48%;padding:14px}.studyRunPrompt{font-size:17px}.studyRunCard{flex:1 1 42%}}
  `;
  documentSource.head.append(style);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function actionText(action) {
  if (!action?.issued) return '今回はゲーム内行動なし';
  const kind = action.actionKind === 'counter' ? 'カウンター' : '攻撃';
  return `正解 → ${kind} ${Number(action.power).toFixed(2)}`;
}

export function mountStudyRunRuntime({ document: documentSource = globalThis.document, checkpointStore = null } = {}) {
  if (!documentSource?.createElement) throw new TypeError('STUDY_RUNTIME_DOCUMENT_REQUIRED');
  const existing = globalThis[GLOBAL_KEY];
  if (existing?.getSnapshot) return existing;
  const home = documentSource.querySelector(HOME_SELECTOR);
  const app = documentSource.querySelector(APP_SELECTOR);
  if (!home || !app) throw new Error('STUDY_RUNTIME_SURFACE_MISSING');

  installStyle(documentSource);
  const controller = createStudyRunConsumerController({ checkpointStore });
  const entry = element(documentSource, 'button', {
    type: 'button', class: 'studyRunEntry', 'data-study-action': 'open', 'aria-haspopup': 'dialog',
  }, '勉強スレスパ');
  const panel = element(documentSource, 'section', {
    class: 'studyRunPanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'studyRunTitle', 'data-study-run-panel': 'r1',
  });
  panel.hidden = true;
  home.append(entry);
  app.append(panel);

  function render() {
    const view = controller.getSnapshot();
    entry.textContent = view.status === 'active' ? '勉強スレスパを続ける' : '勉強スレスパ';
    panel.dataset.studyStatus = view.status;
    panel.dataset.balanceAuthority = view.balanceAuthority;

    if (!view.started) {
      panel.innerHTML = `<div class="studyRunHead"><h2 id="studyRunTitle">勉強スレスパ</h2><button type="button" class="studyRunClose" data-study-action="close" aria-label="閉じる">×</button></div><p class="studyRunNotice">問題から回答カードが出ます。</p><div class="studyRunActions"><button type="button" class="studyRunAction primary" data-study-action="start">開始</button></div>`;
      return;
    }

    if (view.status === 'complete') {
      panel.innerHTML = `<div class="studyRunHead"><h2 id="studyRunTitle">問題パック完了</h2><button type="button" class="studyRunClose" data-study-action="close" aria-label="閉じる">×</button></div><p class="studyRunNotice">この問題パックはここまでです。勝敗状態は作りません。</p><div class="studyRunActions"><button type="button" class="studyRunAction primary" data-study-action="restart">もう一度</button></div><p class="studyRunProvisional">現在の強さ・時間倍率は手動動作確認用の試作値です。</p>`;
      return;
    }

    const question = view.question;
    const used = new Set(view.throws.map((item) => item.cardId));
    const thrownByPosition = new Map(view.throws.map((item) => [item.position, item]));
    const slots = question.slots.map((slot) => {
      const thrown = thrownByPosition.get(slot.position);
      const value = thrown ? (thrown.label || thrown.value || '回答済み') : `${slot.position}番目`;
      return `<div class="studyRunSlot" data-study-slot-position="${slot.position}"><span>${escapeHtml(value)}</span></div>`;
    }).join('');
    const hand = question.answerHand.map((card) => {
      if (card.kind === 'input') {
        return `<label class="studyRunCard studyRunInputCard" data-study-card="${card.cardId}"><span>回答カード</span><input type="text" inputmode="text" autocomplete="off" data-study-input="${card.cardId}" ${used.has(card.cardId) || view.resolution ? 'disabled' : ''}><button type="button" class="studyRunAction" data-study-throw="${card.cardId}" ${used.has(card.cardId) || view.resolution ? 'disabled' : ''}>投げる</button></label>`;
      }
      return `<button type="button" class="studyRunCard" data-study-throw="${card.cardId}" ${used.has(card.cardId) || view.resolution ? 'disabled' : ''}>${escapeHtml(card.label)}</button>`;
    }).join('');
    const result = view.resolution
      ? `<div class="studyRunResult" data-study-result="${view.resolution.grade.result}">${view.resolution.grade.result === 'VERIFIED_CORRECT' ? actionText(view.resolution.action) : '判定済み → 今回はゲーム内行動なし'}</div>`
      : '';
    const hintText = view.hint ? `<p class="studyRunHint" data-study-hint>ヒント: ${escapeHtml(view.hint.hint)}<br>費用処理はまだ未接続です。</p>` : '';

    panel.innerHTML = `
      <div class="studyRunHead"><h2 id="studyRunTitle">勉強スレスパ</h2><button type="button" class="studyRunClose" data-study-action="close" aria-label="閉じる">×</button></div>
      <p class="studyRunMeta">${view.session.questionIndex + 1} / ${STUDY_MANUAL_PROBLEM_PACK.questions.length}</p>
      <p class="studyRunPrompt">${escapeHtml(question.prompt)}</p>
      <div class="studyRunSlots">${slots}</div>
      <div class="studyRunHand">${hand}</div>
      <div class="studyRunActions">
        <button type="button" class="studyRunAction" data-study-action-kind="attack" aria-pressed="${view.actionKind === 'attack'}">攻撃</button>
        <button type="button" class="studyRunAction" data-study-action-kind="counter" aria-pressed="${view.actionKind === 'counter'}">カウンター</button>
        <button type="button" class="studyRunAction" data-study-action="undo" ${view.throws.length && !view.resolution ? '' : 'disabled'}>1枚戻す</button>
        <button type="button" class="studyRunAction" data-study-action="hint" ${question.hintCount && !view.hint ? '' : 'disabled'}>ヒント</button>
        ${view.resolution ? '<button type="button" class="studyRunAction primary" data-study-action="next">次の問題</button>' : `<button type="button" class="studyRunAction primary" data-study-action="resolve" ${view.canResolve ? '' : 'disabled'}>判定</button>`}
      </div>
      ${result}${hintText}
      <p class="studyRunProvisional">現在の強さ・時間倍率は手動動作確認用の試作値です。</p>
    `;
  }

  function openPanel() {
    if (!controller.getSnapshot().started) controller.start();
    panel.hidden = false;
    render();
  }

  function closePanel() {
    panel.hidden = true;
  }

  entry.addEventListener('click', openPanel);
  panel.addEventListener('click', (event) => {
    const target = event.target?.closest?.('button');
    if (!target) return;
    const action = target.dataset.studyAction;
    const kind = target.dataset.studyActionKind;
    const cardId = target.dataset.studyThrow;
    try {
      if (action === 'close') closePanel();
      else if (action === 'start') controller.start();
      else if (action === 'restart') controller.restart();
      else if (action === 'undo') controller.undoLastThrow();
      else if (action === 'hint') controller.revealHint(0);
      else if (action === 'resolve') controller.resolve();
      else if (action === 'next') controller.advance();
      else if (kind) controller.setActionKind(kind);
      else if (cardId) {
        const input = panel.querySelector(`[data-study-input="${cardId}"]`);
        controller.throwAnswer(cardId, input?.value);
      }
      if (action !== 'close') render();
    } catch (error) {
      panel.dataset.studyError = String(error?.message || error);
    }
  });

  const outsideDismiss = createStudyPanelOutsideDismissHandler({ panel, onDismiss: closePanel });
  documentSource.addEventListener('pointerdown', outsideDismiss, true);

  render();
  const api = Object.freeze({
    open: openPanel,
    close: closePanel,
    render,
    getSnapshot: controller.getSnapshot,
    controller,
  });
  globalThis[GLOBAL_KEY] = api;
  return api;
}

export function mountStudyRunFromCurrentBrowser({ checkpointStore = null } = {}) {
  if (typeof document === 'undefined') return null;
  try {
    return mountStudyRunRuntime({ document, checkpointStore });
  } catch (error) {
    globalThis.__GAMEROAD_STUDY_RUN_MOUNT_ERROR__ = String(error?.message || error);
    return null;
  }
}
