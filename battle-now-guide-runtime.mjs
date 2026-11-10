// BATTLE-PHASE-GUIDE-NOW-LINE-007 — 対戦の案内を遊ぶ流れへつなぐ取り付け。
// GAMEROAD.html の対戦画面（上の状態表示の中、題の下）へ
// battle-now-guide-core の「今やること」1行を出す。
// 読み取りは画面の今の表示だけ（光っている段・ロード/バトルの選択・対戦画面かどうか）。
// 対戦の状態そのものは読まない・変えない。表示専用。
import { projectBattleNowGuide } from './battle-now-guide-core.mjs';

export const BATTLE_NOW_GUIDE_ELEMENT_ID = 'battleNowGuide';

const PHASE_BY_TITLE = Object.freeze({
  '行動を計画': 'plan',
  'ロードを公開': 'reveal',
  '移動を解決': 'move',
  '攻撃先を選択': 'target',
  '戦闘を解決': 'resolve',
});

// 画面（DOM）から案内に要る今の状態だけを読む。テストからも差し替えられる形。
export function readBattleNowGuideSnapshot(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return { screen: null, phase: null };
  const battleSection = doc.querySelector('section[data-screen="battle"]');
  const screen = battleSection?.classList?.contains?.('active') ? 'battle' : null;

  let phase = null;
  const lit = doc.querySelector('#phaseBar [data-ph].on') ?? doc.querySelector('#phaseBar span.on');
  const litPhase = typeof lit?.dataset?.ph === 'string' ? lit.dataset.ph : null;
  if (litPhase) {
    phase = litPhase;
  } else {
    const title = doc.querySelector('#phaseTitle')?.textContent?.trim() ?? '';
    phase = PHASE_BY_TITLE[title] ?? null;
  }

  const roadId = doc.querySelector('#roadSelect')?.value ?? null;
  const battleId = doc.querySelector('#battleSelect')?.value ?? null;
  return { screen, phase, roadId: roadId || null, battleId: battleId || null };
}

export function createBattleNowGuideController({ element, readSnapshot } = {}) {
  if (!element || typeof readSnapshot !== 'function') {
    throw new TypeError('BATTLE_NOW_GUIDE_CONTROLLER_REQUIRES_ELEMENT_AND_SNAPSHOT');
  }
  let destroyed = false;
  const update = () => {
    if (destroyed) return null;
    let projection;
    try {
      projection = projectBattleNowGuide(readSnapshot());
    } catch {
      projection = projectBattleNowGuide(null);
    }
    if (projection.active) {
      element.textContent = projection.message;
      element.hidden = false;
      element.setAttribute?.('aria-hidden', 'false');
    } else {
      element.textContent = '';
      element.hidden = true;
      element.setAttribute?.('aria-hidden', 'true');
    }
    if (element.dataset) {
      element.dataset.nowGuidePhase = projection.phase ?? '';
      element.dataset.nowGuideStep = projection.step ?? '';
      element.dataset.nowGuideActive = projection.active ? 'true' : 'false';
    }
    return projection;
  };
  return Object.freeze({
    update,
    destroy() { destroyed = true; },
    get destroyed() { return destroyed; },
  });
}

export function mountBattleNowGuide(doc = globalThis.document) {
  if (!doc || typeof doc.querySelector !== 'function') return null;
  const battleSection = doc.querySelector('section[data-screen="battle"]');
  if (!battleSection) return null;

  let element = typeof doc.getElementById === 'function' ? doc.getElementById(BATTLE_NOW_GUIDE_ELEMENT_ID) : null;
  if (!element) {
    const host = doc.querySelector('.battleTopStatus > div') ?? doc.querySelector('.battleTopStatus') ?? battleSection;
    element = doc.createElement('div');
    element.id = BATTLE_NOW_GUIDE_ELEMENT_ID;
    element.className = 'battleNowGuide';
    element.setAttribute?.('aria-live', 'polite');
    host.appendChild(element);
  }

  const controller = createBattleNowGuideController({
    element,
    readSnapshot: () => readBattleNowGuideSnapshot(doc),
  });

  let scheduled = false;
  const schedule = () => {
    if (scheduled || controller.destroyed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; controller.update(); });
  };

  const observers = [];
  if (typeof MutationObserver === 'function') {
    const observe = (target, options) => {
      if (!target) return;
      const observer = new MutationObserver(schedule);
      observer.observe(target, options);
      observers.push(observer);
    };
    observe(doc.querySelector('#phaseBar'), { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    observe(doc.querySelector('#phaseTitle'), { characterData: true, childList: true, subtree: true });
    observe(battleSection, { attributes: true, attributeFilter: ['class'] });
    observe(doc.querySelector('#targetBox'), { attributes: true, attributeFilter: ['class'] });
  }
  const changeTargets = ['#roadSelect', '#battleSelect']
    .map((selector) => doc.querySelector(selector))
    .filter(Boolean);
  for (const target of changeTargets) target.addEventListener?.('change', schedule);
  battleSection.addEventListener?.('click', schedule);

  controller.update();
  const api = Object.freeze({
    element,
    update: () => controller.update(),
    snapshot: () => readBattleNowGuideSnapshot(doc),
    destroy() {
      for (const observer of observers) observer.disconnect();
      for (const target of changeTargets) target.removeEventListener?.('change', schedule);
      battleSection.removeEventListener?.('click', schedule);
      controller.destroy();
    },
  });
  if (typeof globalThis !== 'undefined') globalThis.__GAMEROAD_BATTLE_NOW_GUIDE__ = api;
  return api;
}

// ブラウザでは読み込まれたらすぐ取り付ける（GAMEROAD.html の module script から）。
if (typeof document !== 'undefined' && document?.querySelector?.('section[data-screen="battle"]')) {
  mountBattleNowGuide(document);
} else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', () => mountBattleNowGuide(document), { once: true });
}
