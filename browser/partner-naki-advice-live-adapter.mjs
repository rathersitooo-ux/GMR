import { currentAdvicePartnerId } from './partner-dialogue-source-registry.mjs';
import {
  ensureNakiAdviceBustup,
  renderNakiAdviceBustup,
  resolveNakiAdviceExpression
} from './partner-naki-advice-visuals.mjs';

const ADAPTER_SCHEMA = 'gameroad.partner.naki-advice-live-adapter.v1';

function readStatus(win) {
  try {
    return win?.__GAMEROAD_HATE_PARTNER_TEST__?.status?.() || null;
  } catch {
    return null;
  }
}

function readBattleState(win) {
  try {
    return win?.__GAMEROAD_TEST__?.state || null;
  } catch {
    return null;
  }
}

function readQuickRoute(root) {
  const selected = root?.querySelector?.('.partnerAdviceQuickRoute[aria-pressed="true"]');
  return selected?.dataset?.quickRoute || '';
}

export function mountNakiAdviceLiveAdapter(global = globalThis) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') return null;
  const battleSurface = document.querySelector?.('section[data-screen="battle"]');
  if (!battleSurface) return null;
  const chatRoot = document.getElementById?.('partnerAdviceChatPresentation');
  const bustup = ensureNakiAdviceBustup({ document, root: battleSurface });
  if (!bustup) return null;

  let destroyed = false;
  function render() {
    if (destroyed) return null;
    const state = readBattleState(global);
    const status = readStatus(global);
    const partnerId = currentAdvicePartnerId(global);
    const battleActive = state?.screen === 'battle';
    const adviceActive = Boolean(status?.advice) || Boolean(chatRoot && !chatRoot.hidden);
    const tutorialActive = Boolean(chatRoot?.querySelector?.('[data-role="tutorial-experience-conversation"]:not([hidden])'));
    const reactionActive = state?.match?.phase === 'resolve' && state?.match?.busy === true;
    const expression = resolveNakiAdviceExpression({
      reactionActive,
      tutorialActive,
      quickRouteId: readQuickRoute(chatRoot),
      adviceActive,
      battleActive
    });
    return renderNakiAdviceBustup({
      bustup,
      expression,
      visible: battleActive,
      partnerId
    });
  }

  render();
  const observers = [];
  if (typeof global.MutationObserver === 'function') {
    const observer = new global.MutationObserver(() => queueMicrotask(render));
    observer.observe(battleSurface, { subtree: true, childList: true, characterData: true, attributes: true });
    observers.push(observer);
  }
  const api = Object.freeze({
    schema: ADAPTER_SCHEMA,
    render,
    bustup,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      for (const observer of observers) observer.disconnect();
      bustup.hidden = true;
      return true;
    }
  });
  global.__GAMEROAD_NAKI_ADVICE__ = api;
  return api;
}

function scheduleMount(global) {
  const document = global?.document;
  if (!document) return;
  const tryMount = () => mountNakiAdviceLiveAdapter(global);
  if (tryMount()) return;
  if (typeof global.MutationObserver !== 'function' || !document.documentElement) return;
  const observer = new global.MutationObserver(() => {
    if (tryMount()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleMount(window), { once: true });
  } else {
    queueMicrotask(() => scheduleMount(window));
  }
}

