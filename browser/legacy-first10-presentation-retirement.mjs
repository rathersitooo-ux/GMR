const VERSION = 'LEGACY_FIRST10_PRESENTATION_RETIRE_R1';
const STYLE_ID = 'gameroad-legacy-first10-presentation-retire-r1-style';
const CUE_SELECTOR = '#first10Cue, #first10PublicRoad';
const FOCUS_SELECTOR = '.first10Focus';

function ensureRetirementStyle(doc) {
  if (!doc?.createElement || doc.getElementById?.(STYLE_ID)) return false;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${CUE_SELECTOR}{display:none!important}`;
  doc.head?.appendChild?.(style);
  return true;
}

export function retireLegacyFirst10Presentation(doc = globalThis.document) {
  if (!doc?.querySelectorAll) {
    return Object.freeze({ ok: false, reason: 'document_unavailable', cueCount: 0, focusCount: 0 });
  }

  ensureRetirementStyle(doc);

  let cueCount = 0;
  for (const node of doc.querySelectorAll(CUE_SELECTOR)) {
    cueCount += 1;
    node.classList?.remove?.('on', 'done');
    node.setAttribute?.('aria-hidden', 'true');
    node.removeAttribute?.('aria-live');
  }

  let focusCount = 0;
  for (const node of doc.querySelectorAll(FOCUS_SELECTOR)) {
    focusCount += 1;
    node.classList?.remove?.('first10Focus');
  }

  return Object.freeze({ ok: true, version: VERSION, cueCount, focusCount });
}

export function installLegacyFirst10PresentationRetirement(
  doc = globalThis.document,
  win = globalThis,
) {
  if (!doc?.querySelectorAll || typeof win?.MutationObserver !== 'function') {
    return Object.freeze({ ok: false, reason: 'runtime_unavailable' });
  }

  const refresh = () => retireLegacyFirst10Presentation(doc);
  refresh();

  const battle = doc.querySelector?.('section[data-screen="battle"]') ?? doc.body;
  if (!battle) return Object.freeze({ ok: true, version: VERSION, observer: null, refresh });

  const observer = new win.MutationObserver(refresh);
  observer.observe(battle, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-live'],
  });

  win.addEventListener?.('pageshow', refresh);
  win.GAMEROAD_LEGACY_FIRST10_PRESENTATION_RETIREMENT = Object.freeze({
    version: VERSION,
    refresh,
  });

  return Object.freeze({ ok: true, version: VERSION, observer, refresh });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  installLegacyFirst10PresentationRetirement(document, window);
}

export const LEGACY_FIRST10_PRESENTATION_RETIREMENT_CONTRACT = Object.freeze({
  version: VERSION,
  scope: 'presentation_only',
  normalBattleLegacyCueVisible: false,
  normalBattleLegacyFocusVisible: false,
  preservesDirectSelectionClasses: Object.freeze(['first10Road', 'first10Battle']),
  changesTutorialCompletion: false,
  changesGameplayRules: false,
});
