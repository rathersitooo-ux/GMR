import { SAASUNA_PARTNER_ID } from './partner-saasuna-conversation-source.mjs';

const STYLE_ID = 'gameroad-partner-advice-saasuna-bustup-r1';
const CHAT_ROOT_ID = 'partnerAdviceChatPresentation';
const BASE = './assets/partners/saasuna/';

function asset(fileName) {
  return Object.freeze({ fileName, src: new URL(`${BASE}${fileName}`, import.meta.url).href });
}

export const SAASUNA_BUSTUP_ASSETS = Object.freeze({
  HAPPY_WAVE: asset('GAMEROAD_SAASUNA_NAV_01_HAPPY_WAVE_TRANSPARENT_20260915.png'),
  CURIOUS_CONFUSED: asset('GAMEROAD_SAASUNA_NAV_02_CURIOUS_CONFUSED_TRANSPARENT_20260915.png'),
  SHH: asset('GAMEROAD_SAASUNA_NAV_03_SHH_TRANSPARENT_20260915.png'),
  GUIDE_PRESENT: asset('GAMEROAD_SAASUNA_NAV_04_GUIDE_PRESENT_TRANSPARENT_20260915.png'),
  IDLE_GENTLE: asset('GAMEROAD_SAASUNA_NAV_05_IDLE_GENTLE_TRANSPARENT_20260915.png'),
  SURPRISED: asset('GAMEROAD_SAASUNA_NAV_06_SURPRISED_TRANSPARENT_20260915.png'),
  TOUCH_CRY: asset('GAMEROAD_SAASUNA_NAV_07_TOUCH_CRY_TRANSPARENT_20260915.png'),
  HAPPY_SMILE: asset('GAMEROAD_SAASUNA_NAV_08_HAPPY_SMILE_TRANSPARENT_20260915.png'),
  SAD_DOWNCAST: asset('GAMEROAD_SAASUNA_NAV_09_SAD_DOWNCAST_TRANSPARENT_20260915.png'),
});

const touchCryLifecycleByFigure = new WeakMap();
const touchCryObserverByFigure = new WeakMap();
const TOUCH_CRY_AFTERGLOW_MS = 1200;

function resolveTouchCryLifecycle(input) {
  const figure = input.figure;
  const touchCryVisible = input.touchCryVisible === true || figure?.dataset?.touchCryVisible === 'true';
  const canTrack = figure && (typeof figure === 'object' || typeof figure === 'function');
  if (touchCryVisible) {
    if (canTrack) touchCryLifecycleByFigure.set(figure, { touching: true, sadUntil: 0 });
    return 'TOUCH_CRY';
  }
  if (!canTrack) return null;

  const lifecycle = touchCryLifecycleByFigure.get(figure);
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  if (lifecycle?.touching) {
    const sadUntil = nowMs + TOUCH_CRY_AFTERGLOW_MS;
    touchCryLifecycleByFigure.set(figure, { touching: false, sadUntil });
    return 'SAD_DOWNCAST';
  }
  if (lifecycle?.sadUntil > nowMs) return 'SAD_DOWNCAST';
  if (lifecycle) touchCryLifecycleByFigure.delete(figure);
  return null;
}

function clearTouchCryAfterglow(controller) {
  if (!controller || controller.afterglowTimer === null) return;
  const clearTimer = controller.view?.clearTimeout;
  if (typeof clearTimer === 'function') clearTimer.call(controller.view, controller.afterglowTimer);
  else globalThis.clearTimeout?.(controller.afterglowTimer);
  controller.afterglowTimer = null;
  controller.afterglowUntil = 0;
}

function scheduleTouchCryAfterglow(figure, controller) {
  if (!controller?.observer) return;
  const lifecycle = touchCryLifecycleByFigure.get(figure);
  if (!lifecycle || lifecycle.touching || !Number.isFinite(lifecycle.sadUntil)) return;
  if (controller.afterglowTimer !== null && controller.afterglowUntil === lifecycle.sadUntil) return;
  clearTouchCryAfterglow(controller);

  const latest = controller.latestRenderArgs;
  const nowMs = Number.isFinite(latest?.nowMs) ? latest.nowMs : Date.now();
  const delay = Math.max(0, lifecycle.sadUntil - nowMs);
  const runTimer = controller.view?.setTimeout;
  const callback = () => {
    controller.afterglowTimer = null;
    controller.afterglowUntil = 0;
    const currentLifecycle = touchCryLifecycleByFigure.get(figure);
    const currentArgs = controller.latestRenderArgs;
    if (!currentLifecycle || currentLifecycle.touching || !currentArgs) return;
    const afterglowNowMs = Number.isFinite(currentArgs.nowMs)
      ? Math.max(currentArgs.nowMs, currentLifecycle.sadUntil)
      : Date.now();
    renderSaasunaBattleBustup({ ...currentArgs, nowMs: afterglowNowMs });
  };
  controller.afterglowUntil = lifecycle.sadUntil;
  controller.afterglowTimer = typeof runTimer === 'function'
    ? runTimer.call(controller.view, callback, delay)
    : globalThis.setTimeout(callback, delay);
}

function ensureTouchCryObserver(figure, controller) {
  if (controller.observer) return;
  const Observer = controller.view?.MutationObserver ?? globalThis.MutationObserver;
  if (typeof Observer !== 'function') return;
  const observer = new Observer((records) => {
    if (!records.some((record) => record.attributeName === 'data-touch-cry-visible')) return;
    const latest = controller.latestRenderArgs;
    if (!latest) return;
    if (figure.dataset?.touchCryVisible === 'true') clearTouchCryAfterglow(controller);
    renderSaasunaBattleBustup(latest);
  });
  try {
    observer.observe(figure, { attributes: true, attributeFilter: ['data-touch-cry-visible'] });
    controller.observer = observer;
  } catch {
    observer.disconnect?.();
  }
}

function stopTouchCryTracking(figure) {
  const controller = touchCryObserverByFigure.get(figure);
  controller?.observer?.disconnect();
  clearTouchCryAfterglow(controller);
  if (controller) controller.latestRenderArgs = null;
  touchCryObserverByFigure.delete(figure);
  touchCryLifecycleByFigure.delete(figure);
}

export function resolveSaasunaAdviceBustupState(input = {}) {
  if (input.partnerId !== SAASUNA_PARTNER_ID) return null;
  const requestedState = input.visualState ?? input.figure?.dataset?.visualStateOverride;
  if (typeof requestedState === 'string' && Object.hasOwn(SAASUNA_BUSTUP_ASSETS, requestedState)) {
    return requestedState;
  }
  const touchCryState = resolveTouchCryLifecycle(input);
  if (touchCryState) return touchCryState;
  if (input.reactionActive) return 'SURPRISED';
  if (input.tutorialActive) return 'GUIDE_PRESENT';
  if (input.quickRouteId === 'casual') return 'HAPPY_WAVE';
  if (input.quickRouteId === 'situation') return 'CURIOUS_CONFUSED';
  if (input.quickRouteId === 'idea') return 'GUIDE_PRESENT';
  if (input.adviceActive) return 'HAPPY_SMILE';
  return 'IDLE_GENTLE';
}

export function ensureSaasunaBattleBustupStyle(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `section[data-screen="battle"] .partnerAdviceBustup{position:absolute;z-index:37;left:max(6px,env(safe-area-inset-left));bottom:clamp(12px,5vh,42px);width:clamp(132px,18vw,190px);height:clamp(176px,38vh,270px);box-sizing:border-box;margin:0;padding:22px 5px 5px;display:grid;place-items:end center;pointer-events:none;overflow:hidden;isolation:isolate;border:1px solid rgba(217,246,235,.36);border-radius:15px;background:linear-gradient(165deg,rgba(6,31,34,.92),rgba(10,50,43,.82));box-shadow:0 10px 28px rgba(0,0,0,.34),inset 0 1px 0 rgba(239,255,249,.10)}section[data-screen="battle"] .partnerAdviceBustup[hidden]{display:none!important}section[data-screen="battle"] .partnerAdviceBustupHeader{position:absolute;z-index:2;left:7px;right:7px;top:4px;height:16px;display:flex;align-items:center;gap:5px;min-width:0;border-bottom:1px solid rgba(217,246,235,.16);color:#dff7ef;font-weight:950;line-height:1}section[data-screen="battle"] .partnerAdviceBustupHeader small{font-size:6px;letter-spacing:.05em;color:#9bc5b8;white-space:nowrap}section[data-screen="battle"] .partnerAdviceBustupHeader strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}section[data-screen="battle"] .partnerAdviceBustupArt{position:relative;z-index:1;width:100%;height:100%;display:grid;place-items:end center;overflow:hidden;border-radius:10px;background:radial-gradient(circle at 50% 72%,rgba(104,191,164,.14),transparent 62%)}section[data-screen="battle"] .partnerAdviceBustup img{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 7px 10px rgba(0,0,0,.34))}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-saasuna-bustup="true"]{left:clamp(146px,19vw,214px)}@media(max-height:430px) and (orientation:landscape){section[data-screen="battle"] .partnerAdviceBustup{left:4px;top:116px;bottom:auto;width:104px;height:126px;padding:18px 4px 4px;border-radius:11px}section[data-screen="battle"] .partnerAdviceBustupHeader{left:5px;right:5px;top:3px;height:13px}section[data-screen="battle"] .partnerAdviceBustupHeader small{display:none}section[data-screen="battle"] .partnerAdviceBustupHeader strong{font-size:7px}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-battle-advice-overlay="true"][data-saasuna-bustup="true"]{left:112px}}@media(max-width:540px) and (orientation:portrait){section[data-screen="battle"] .partnerAdviceBustup{display:none!important}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-saasuna-bustup="true"]{left:max(8px,env(safe-area-inset-left))!important}}`;
  doc.head?.append(style);
}

export function ensureSaasunaBattleBustup(doc, battleSurface) {
  if (!doc || !battleSurface) return null;
  let figure = battleSurface.querySelector('[data-role="advice-partner-bustup"]');
  if (!figure) {
    figure = doc.createElement('figure');
    figure.className = 'partnerAdviceBustup';
    figure.dataset.role = 'advice-partner-bustup';
    figure.dataset.presentationOnly = 'true';
    figure.hidden = true;
    const header = doc.createElement('figcaption');
    header.className = 'partnerAdviceBustupHeader';
    header.innerHTML = '<small>アドバイスパートナー</small><strong>サースナー</strong>';
    const art = doc.createElement('div');
    art.className = 'partnerAdviceBustupArt';
    const image = doc.createElement('img');
    image.decoding = 'async';
    image.loading = 'eager';
    image.draggable = false;
    art.append(image);
    figure.append(header, art);
    battleSurface.append(figure);
  }
  return Object.freeze({ figure, image: figure.querySelector('img') });
}

export function renderSaasunaBattleBustup({ root, bustup, partnerId, battleActive = false, reactionActive = false, tutorialActive = false, quickRouteId = null, adviceActive = false, visualState = null, nowMs } = {}) {
  const figure = bustup?.figure;
  let touchCryController = null;
  if (figure && (!battleActive || partnerId !== SAASUNA_PARTNER_ID)) {
    stopTouchCryTracking(figure);
  } else if (figure && (typeof figure === 'object' || typeof figure === 'function')) {
    touchCryController = touchCryObserverByFigure.get(figure);
    if (!touchCryController) {
      touchCryController = {
        view: figure.ownerDocument?.defaultView ?? globalThis,
        observer: null,
        latestRenderArgs: null,
        afterglowTimer: null,
        afterglowUntil: 0,
      };
      touchCryObserverByFigure.set(figure, touchCryController);
    }
    touchCryController.latestRenderArgs = {
      root, bustup, partnerId, battleActive, reactionActive, tutorialActive,
      quickRouteId, adviceActive, visualState, nowMs,
    };
    ensureTouchCryObserver(figure, touchCryController);
  }
  const state = resolveSaasunaAdviceBustupState({
    partnerId,
    reactionActive,
    tutorialActive,
    quickRouteId,
    adviceActive,
    visualState: visualState ?? (battleActive ? figure?.dataset?.visualStateOverride : null),
    touchCryVisible: battleActive && figure?.dataset?.touchCryVisible === 'true',
    figure: battleActive ? figure : null,
    nowMs,
  });
  if (touchCryController) {
    if (state === 'TOUCH_CRY') clearTouchCryAfterglow(touchCryController);
    else if (state === 'SAD_DOWNCAST') scheduleTouchCryAfterglow(figure, touchCryController);
  }
  const entry = state ? SAASUNA_BUSTUP_ASSETS[state] : null;
  const visible = Boolean(root && bustup?.figure && bustup?.image && battleActive && entry);
  if (root) root.dataset.saasunaBustup = visible ? 'true' : 'false';
  if (!bustup?.figure || !bustup?.image) return Object.freeze({ visible: false, state: null, asset: null });
  bustup.figure.hidden = !visible;
  if (!visible) {
    delete bustup.figure.dataset.state;
    return Object.freeze({ visible: false, state: null, asset: null });
  }
  bustup.figure.dataset.state = state;
  bustup.figure.setAttribute('aria-label', 'アドバイスパートナー サースナー');
  if (state === 'TOUCH_CRY') {
    const touchOverlay = bustup.figure.querySelector?.('.partnerAdviceTouchCryOverlay');
    if (touchOverlay?.style) touchOverlay.style.display = 'none';
  }
  if (bustup.image.dataset.assetFile !== entry.fileName) {
    bustup.image.src = entry.src;
    bustup.image.dataset.assetFile = entry.fileName;
  }
  bustup.image.alt = 'サースナー';
  return Object.freeze({ visible: true, state, asset: entry.fileName });
}
