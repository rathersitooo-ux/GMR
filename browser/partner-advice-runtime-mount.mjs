import * as base from './partner-advice-runtime-base.mjs';
import {
  mountPartnerAdviceEvidencePresentation,
  projectPartnerAdviceEvidencePresentation,
} from './partner-advice-evidence-presentation.mjs';

export * from './partner-advice-runtime-base.mjs';

let latestEvidence = projectPartnerAdviceEvidencePresentation({ adviceResult: null });

export function readLatestPartnerAdviceEvidencePresentation() {
  return latestEvidence;
}

function renderLatestEvidence(win = globalThis.window) {
  const doc = win?.document;
  const chatRoot = doc?.getElementById?.('partnerAdviceChatPresentation');
  if (!chatRoot) return null;
  const before = chatRoot.querySelector?.('.partnerAdviceLaneProgress') ?? null;
  const mount = mountPartnerAdviceEvidencePresentation({ document: doc, parent: chatRoot, before });
  mount?.render(latestEvidence);
  return mount;
}

function scheduleEvidenceRender() {
  const run = () => {
    try { renderLatestEvidence(); } catch {}
  };
  if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(run);
  else Promise.resolve().then(run).catch(() => {});
}

function publishEvidence(result) {
  latestEvidence = projectPartnerAdviceEvidencePresentation({ adviceResult: result });
  try { renderLatestEvidence(); } catch {}
  scheduleEvidenceRender();
  return result;
}

/**
 * Compatibility wrapper over the existing advice bridge.
 * Selection is completed by the old runtime first; this wrapper only publishes a viewer explanation.
 */
export function createPartnerAdviceReplayBridge(options = {}) {
  const bridge = base.createPartnerAdviceReplayBridge(options);
  return function partnerAdviceReplayWithEvidence(...args) {
    try {
      return publishEvidence(bridge(...args));
    } catch (error) {
      latestEvidence = projectPartnerAdviceEvidencePresentation({ adviceResult: null });
      scheduleEvidenceRender();
      throw error;
    }
  };
}

function scheduleEvidenceSidecar(win) {
  const doc = win?.document;
  if (!doc) return;
  const mount = () => {
    try { return renderLatestEvidence(win); } catch { return null; }
  };
  if (mount()) return;
  const Observer = win.MutationObserver;
  if (typeof Observer !== 'function' || !doc.documentElement) return;
  const observer = new Observer(() => {
    if (mount()) observer.disconnect();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleEvidenceSidecar(window), { once: true });
  } else {
    scheduleEvidenceSidecar(window);
  }
}
