// FIRST-TIME-GUIDE-HOME-SETUP-001 — 初めての人の案内を流れへつなぐ取り付け。
// ホームと準備の画面に、first-time-guide-core の1行だけを出す。
// 対戦中の案内（battle-now-guide）には触らない。
//
// 読み取りは画面の今の表示だけ（今の画面・遊んだ回数・デッキが使えるか）。
// 対戦の状態・デッキ・勝敗は読まない・変えない。表示専用。
// 案内のボタンは、その場で次の動きをする：
// - ホーム：「バトルへ」→ バトル行きのボタンを押す。
// - 準備（遊び方／人数）：「このままでOK」→ 次の段へ進む。
// - 準備（できた）：「対戦開始」→ 対戦開始のボタンを押す。
//   対戦画面へ行けたら案内は終わりにする。行けなければそのまま残す。
// - 「閉じる」→ 案内を閉じる。遊んだ回数が 0 の間は、小さな「案内」
//   ボタンからもう一度出せる。
// 進み具合（段・終わり・閉じた）は端末の中だけに残す。
import {
  FIRST_TIME_AFTER_GUIDE_ITEMS,
  FIRST_TIME_GUIDE_STORAGE_KEY,
  nextFirstTimeGuideStep,
  projectFirstTimeAfterGuide,
  projectFirstTimeGuide,
} from './first-time-guide-core.mjs';

export const FIRST_TIME_GUIDE_ELEMENT_ID = 'firstTimeGuide';
export const FIRST_TIME_GUIDE_REOPEN_ID = 'firstTimeGuideReopen';
export const FIRST_TIME_GUIDE_AFTER_ID = 'firstTimeAfterGuide';
export const FIRST_TIME_GUIDE_SAVE_KEY = 'gameroad.browser.v10.core.1';

// ボタンに入れる絵（レビュー51の形）。小さな線画だけ、外部の絵は使わない。
// swords：交差した2本の剣。check：✓。play：▶。cards：重なった2枚のカード。
const GUIDE_ICON_SVGS = Object.freeze({
  swords: '<svg class="firstGuideIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 3.5 L14 13"/><path d="M19.5 3.5 L10 13"/><path d="M13.5 13.5 L17 17"/><path d="M10.5 13.5 L7 17"/><path d="M3.5 5.5 L6.5 8.5"/><path d="M20.5 5.5 L17.5 8.5"/></svg>',
  check: '<svg class="firstGuideIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 L10 18.5 L20 6.5"/></svg>',
  play: '<svg class="firstGuideIconSvg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5 L19 12 L8 19 Z"/></svg>',
  cards: '<svg class="firstGuideIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="12" height="13" rx="2"/><rect x="9" y="4" width="12" height="13" rx="2" fill="currentColor" fill-opacity="0.25"/></svg>',
});

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// 文を出す。大事な所（emphasis）だけ色付きの <b> にする。
// textContent はそのままの文、innerHTML は色付きの見た目。どちらも同じ文。
function setRichText(element, text, emphasis) {
  if (!element) return;
  element.textContent = text ?? '';
  let html = escapeHtml(text ?? '');
  if (emphasis && text?.includes(emphasis)) {
    html = html.replace(
      escapeHtml(emphasis),
      `<b class="firstGuideEmphasis">${escapeHtml(emphasis)}</b>`,
    );
  }
  try {
    element.innerHTML = html;
  } catch {
    // 検査の偽の要素では無視（textContent だけが残る）。
  }
}

// ボタンを出す。絵（SVG）と文字の両方を入れる。
function setActionContent(actionEl, label, icon) {
  if (!actionEl) return;
  actionEl.textContent = label ?? '';
  const svg = GUIDE_ICON_SVGS[icon] ?? '';
  try {
    actionEl.innerHTML = svg
      ? `<span class="firstGuideIcon" aria-hidden="true">${svg}</span><span>${escapeHtml(label ?? '')}</span>`
      : escapeHtml(label ?? '');
  } catch {
    // 検査の偽の要素では無視（textContent だけが残る）。
  }
}

const GUIDE_SCREENS = ['home', 'setup'];

function blankState() {
  return { step: null, done: false, dismissed: false };
}

export function readFirstTimeGuideState(storage) {
  if (!storage || typeof storage.getItem !== 'function') return blankState();
  let raw = null;
  try {
    raw = storage.getItem(FIRST_TIME_GUIDE_STORAGE_KEY);
  } catch {
    return blankState();
  }
  if (!raw) return blankState();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return blankState();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return blankState();
  return {
    step: typeof parsed.step === 'string' ? parsed.step : null,
    done: parsed.done === true,
    dismissed: parsed.dismissed === true,
  };
}

export function writeFirstTimeGuideState(storage, state) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const next = {
    step: typeof state?.step === 'string' ? state.step : null,
    done: state?.done === true,
    dismissed: state?.dismissed === true,
  };
  try {
    storage.setItem(FIRST_TIME_GUIDE_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function readHistoryLength() {
  const testState = globalThis.__GAMEROAD_TEST__?.state;
  if (Array.isArray(testState?.history)) return testState.history.length;
  try {
    const raw = globalThis.localStorage?.getItem?.(FIRST_TIME_GUIDE_SAVE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.history) ? parsed.history.length : 0;
  } catch {
    return null;
  }
}

// 画面（DOM）と端末の案内の進み具合から、案内に要る今の状態だけを読む。
export function readFirstTimeGuideSnapshot(doc, { storage, historyLength } = {}) {
  if (!doc || typeof doc.querySelector !== 'function') {
    return { screen: null, historyLength: null, dismissed: false, done: false, step: null, deckUsable: true };
  }
  let screen = null;
  for (const name of GUIDE_SCREENS) {
    const section = doc.querySelector(`section[data-screen="${name}"]`);
    if (section?.classList?.contains?.('active')) {
      screen = name;
      break;
    }
  }
  if (screen === null) {
    // ほかの画面（対戦・結果・カードなど）では案内は出さない。
    const active = doc.querySelector('section.screen.active');
    screen = active?.dataset?.screen ?? null;
  }
  const stored = readFirstTimeGuideState(storage ?? globalThis.localStorage ?? null);
  const start = doc.querySelector('#startMatch');
  const deckNote = doc.querySelector('#setupDeckNote');
  const deckUsable = start
    ? start.disabled !== true && deckNote?.classList?.contains?.('bad') !== true
    : true;
  return {
    screen,
    historyLength: typeof historyLength === 'number' ? historyLength : readHistoryLength(),
    dismissed: stored.dismissed,
    done: stored.done,
    step: stored.step,
    deckUsable,
  };
}

export function createFirstTimeGuideController({ bar, reopenButton, afterGuide, doc, readSnapshot, storage } = {}) {
  if (!bar || typeof readSnapshot !== 'function') {
    throw new TypeError('FIRST_TIME_GUIDE_CONTROLLER_REQUIRES_BAR_AND_SNAPSHOT');
  }
  const store = storage ?? null;
  let destroyed = false;
  let highlighted = null;
  let lastProjection = null;
  let lastAfterGuide = null;

  const messageEl = bar.querySelector?.('[data-role="first-guide-message"]') ?? null;
  const actionEl = bar.querySelector?.('[data-role="first-guide-action"]') ?? null;
  const closeEl = bar.querySelector?.('[data-role="first-guide-close"]') ?? null;
  const afterItems = typeof afterGuide?.querySelectorAll === 'function'
    ? [...(afterGuide.querySelectorAll('[data-role="first-after-guide-item"]') ?? [])]
    : [];

  const saveState = (patch) => {
    const current = readFirstTimeGuideState(store);
    writeFirstTimeGuideState(store, { ...current, ...patch });
  };

  const clearHighlight = () => {
    highlighted?.classList?.remove?.('firstGuideTarget');
    highlighted = null;
  };

  const update = () => {
    if (destroyed) return null;
    let projection;
    try {
      projection = projectFirstTimeGuide(readSnapshot());
    } catch {
      projection = projectFirstTimeGuide(null);
    }
    lastProjection = projection;
    const snapshot = (() => {
      try {
        return readSnapshot();
      } catch {
        return { screen: null, historyLength: null };
      }
    })();

    if (projection.active) {
      setRichText(messageEl, projection.message, projection.emphasis);
      setActionContent(actionEl, projection.actionLabel, projection.icon);
      if (actionEl) actionEl.hidden = false;
      bar.hidden = false;
      bar.setAttribute?.('aria-hidden', 'false');
      clearHighlight();
      const target = projection.targetSelector && doc?.querySelector
        ? doc.querySelector(projection.targetSelector)
        : null;
      if (target) {
        target.classList?.add?.('firstGuideTarget');
        highlighted = target;
      }
    } else {
      clearHighlight();
      setRichText(messageEl, '', null);
      if (actionEl) actionEl.hidden = true;
      bar.hidden = true;
      bar.setAttribute?.('aria-hidden', 'true');
    }
    // 説明が終わったあとは、短い案内を2つだけ残す（レビュー51の形）。
    // 案内のバーが出ている間は、残す案内は出さない。
    let afterGuideProjection = null;
    try {
      afterGuideProjection = projectFirstTimeAfterGuide(snapshot);
    } catch {
      afterGuideProjection = projectFirstTimeAfterGuide(null);
    }
    lastAfterGuide = afterGuideProjection;
    if (afterGuide) {
      afterGuideProjection.items.forEach((item, index) => {
        if (afterItems[index]) afterItems[index].textContent = item.text;
      });
      afterGuide.hidden = !afterGuideProjection.active;
    }
    if (bar.dataset) {
      bar.dataset.firstGuideStep = projection.step ?? '';
      bar.dataset.firstGuideActive = projection.active ? 'true' : 'false';
    }
    // 閉じたあと、まだ1回も遊んでいない間だけ、小さな「案内」ボタンを残す。
    if (reopenButton) {
      const showReopen = !projection.active
        && projection.reason === 'DISMISSED'
        && (snapshot.historyLength === 0 || snapshot.historyLength === null)
        && (snapshot.screen === 'home' || snapshot.screen === 'setup');
      reopenButton.hidden = !showReopen;
    }
    return projection;
  };

  const advance = () => {
    const current = readFirstTimeGuideState(store);
    const next = nextFirstTimeGuideStep(lastProjection?.step ?? current.step);
    if (next) saveState({ step: next });
    else saveState({ done: true, step: null });
    update();
  };

  const onAction = () => {
    if (destroyed || !lastProjection?.active) return;
    const step = lastProjection.step;
    const target = lastProjection.targetSelector && doc?.querySelector
      ? doc.querySelector(lastProjection.targetSelector)
      : null;
    if (step === 'home' || step === 'ready') {
      target?.click?.();
      if (step === 'ready') {
        // 対戦開始のボタンが押せて対戦画面へ行けたら、案内は終わり。
        queueMicrotask(() => {
          if (destroyed) return;
          let snapshot = null;
          try {
            snapshot = readSnapshot();
          } catch {
            snapshot = null;
          }
          if (snapshot?.screen === 'battle') saveState({ done: true, step: null });
          update();
        });
        return;
      }
      // ホームから準備へ行くときは、次の段から始める。
      saveState({ step: 'content' });
      update();
      return;
    }
    if (step === 'content' || step === 'mode') {
      advance();
      return;
    }
  };

  const onClose = () => {
    saveState({ dismissed: true });
    update();
  };

  const onReopen = () => {
    saveState({ dismissed: false, step: null });
    update();
  };

  actionEl?.addEventListener?.('click', onAction);
  closeEl?.addEventListener?.('click', onClose);
  reopenButton?.addEventListener?.('click', onReopen);

  return Object.freeze({
    update,
    get projection() { return lastProjection; },
    get afterGuide() { return lastAfterGuide; },
    destroy() {
      destroyed = true;
      clearHighlight();
      actionEl?.removeEventListener?.('click', onAction);
      closeEl?.removeEventListener?.('click', onClose);
      reopenButton?.removeEventListener?.('click', onReopen);
    },
    get destroyed() { return destroyed; },
  });
}

function createBar(doc) {
  const bar = doc.createElement('div');
  bar.id = FIRST_TIME_GUIDE_ELEMENT_ID;
  bar.className = 'firstTimeGuide';
  bar.hidden = true;
  bar.setAttribute?.('aria-live', 'polite');
  const message = doc.createElement('span');
  message.dataset.role = 'first-guide-message';
  message.className = 'firstGuideMessage';
  const action = doc.createElement('button');
  action.type = 'button';
  action.dataset.role = 'first-guide-action';
  action.className = 'firstGuideAction';
  const close = doc.createElement('button');
  close.type = 'button';
  close.dataset.role = 'first-guide-close';
  close.className = 'firstGuideClose';
  close.textContent = '閉じる';
  close.setAttribute?.('aria-label', 'はじめての案内を閉じる');
  bar.append(message, action, close);
  return bar;
}

function createReopen(doc) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = FIRST_TIME_GUIDE_REOPEN_ID;
  button.className = 'firstTimeGuideReopen';
  button.hidden = true;
  button.textContent = '案内';
  button.setAttribute?.('aria-label', 'はじめての案内をもう一度見る');
  return button;
}

// 説明が終わったあとに残す短い案内（2つだけ）。中身は取り付け時に
// コントローラが核の FIRST_TIME_AFTER_GUIDE_ITEMS から入れる。
function createAfterGuide(doc) {
  const wrap = doc.createElement('div');
  wrap.id = FIRST_TIME_GUIDE_AFTER_ID;
  wrap.className = 'firstTimeAfterGuide';
  wrap.hidden = true;
  for (const item of FIRST_TIME_AFTER_GUIDE_ITEMS) {
    const chip = doc.createElement('span');
    chip.className = 'firstAfterGuideItem';
    chip.dataset.role = 'first-after-guide-item';
    chip.dataset.afterGuideId = item.id;
    chip.textContent = item.text;
    wrap.appendChild(chip);
  }
  return wrap;
}

export function mountFirstTimeGuide(doc = globalThis.document) {
  if (!doc || typeof doc.querySelector !== 'function' || typeof doc.createElement !== 'function') return null;
  if (globalThis.__GAMEROAD_FIRST_TIME_GUIDE__) return globalThis.__GAMEROAD_FIRST_TIME_GUIDE__;
  const root = doc.body ?? doc.querySelector?.('.app') ?? null;
  if (!root) return null;

  let bar = typeof doc.getElementById === 'function' ? doc.getElementById(FIRST_TIME_GUIDE_ELEMENT_ID) : null;
  if (!bar) {
    bar = createBar(doc);
    root.appendChild(bar);
  }
  let reopenButton = typeof doc.getElementById === 'function' ? doc.getElementById(FIRST_TIME_GUIDE_REOPEN_ID) : null;
  if (!reopenButton) {
    reopenButton = createReopen(doc);
    root.appendChild(reopenButton);
  }
  let afterGuide = typeof doc.getElementById === 'function' ? doc.getElementById(FIRST_TIME_GUIDE_AFTER_ID) : null;
  if (!afterGuide) {
    afterGuide = createAfterGuide(doc);
    root.appendChild(afterGuide);
  }

  const readSnapshot = () => readFirstTimeGuideSnapshot(doc);
  const controller = createFirstTimeGuideController({
    bar,
    reopenButton,
    afterGuide,
    doc,
    readSnapshot,
    storage: globalThis.localStorage ?? null,
  });

  let scheduled = false;
  const schedule = () => {
    if (scheduled || controller.destroyed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; controller.update(); });
  };

  const observers = [];
  if (typeof MutationObserver === 'function') {
    for (const name of GUIDE_SCREENS) {
      const section = doc.querySelector(`section[data-screen="${name}"]`);
      if (!section) continue;
      const observer = new MutationObserver(schedule);
      observer.observe(section, { attributes: true, attributeFilter: ['class'] });
      observers.push(observer);
    }
  }
  // 利用者が自分で遊び方・人数のボタンを押したときも、案内は次の段へ進む。
  const onClick = (event) => {
    if (controller.destroyed) return;
    const target = event?.target?.closest?.('.contentBtn, .modeBtn, #startMatch');
    if (!target) return;
    const current = readFirstTimeGuideState(globalThis.localStorage ?? null);
    if (current.done || current.dismissed) return;
    if (target.classList?.contains?.('contentBtn')) {
      writeFirstTimeGuideState(globalThis.localStorage ?? null, { ...current, step: 'mode' });
    } else if (target.classList?.contains?.('modeBtn')) {
      writeFirstTimeGuideState(globalThis.localStorage ?? null, { ...current, step: 'ready' });
    }
    schedule();
  };
  doc.addEventListener?.('click', onClick);

  controller.update();
  const api = Object.freeze({
    bar,
    reopenButton,
    afterGuide,
    update: () => controller.update(),
    snapshot: () => readFirstTimeGuideSnapshot(doc),
    destroy() {
      for (const observer of observers) observer.disconnect();
      doc.removeEventListener?.('click', onClick);
      controller.destroy();
    },
  });
  globalThis.__GAMEROAD_FIRST_TIME_GUIDE__ = api;
  return api;
}

// ブラウザでは読み込まれたらすぐ取り付ける（GAMEROAD.html の module script から）。
if (typeof document !== 'undefined' && document?.querySelector?.('section[data-screen="home"]')) {
  mountFirstTimeGuide(document);
} else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', () => mountFirstTimeGuide(document), { once: true });
}
