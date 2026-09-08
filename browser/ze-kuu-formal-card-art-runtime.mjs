export const ZE_KUU_FORMAL_CARD_ART = Object.freeze({
  schema: 'gameroad.formal-card-art.v1',
  cardId: 'DCG_ZE_KUU',
  name: 'ゼ・クウ',
  assetPath: '../assets/visual/cards/dcg-ze-kuu.jpg',
  source: 'user-provided-authoritative-art',
  generated: false,
});

export function resolveZeKuuFormalCardArt(cardId, { moduleUrl = import.meta.url } = {}) {
  if (String(cardId ?? '').trim() !== ZE_KUU_FORMAL_CARD_ART.cardId) return null;
  return Object.freeze({
    ...ZE_KUU_FORMAL_CARD_ART,
    assetUrl: new URL(ZE_KUU_FORMAL_CARD_ART.assetPath, moduleUrl).href,
  });
}

const installations = new WeakMap();

function nodeCardId(node) {
  return String(node?.dataset?.id ?? node?.dataset?.cardId ?? '').trim();
}

function isSupportedHost(node) {
  if (!node?.matches) return false;
  return node.matches('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id], .resolutionCard[data-card-id]');
}

export function installZeKuuFormalCardArt({
  document: doc = globalThis.document,
  window: win = globalThis.window,
} = {}) {
  if (!doc?.querySelectorAll || !doc?.createElement) {
    return Object.freeze({ installed: false, refresh() {}, destroy() {} });
  }
  const prior = installations.get(doc);
  if (prior) return prior;

  const resolved = resolveZeKuuFormalCardArt(ZE_KUU_FORMAL_CARD_ART.cardId);
  const styleId = 'gameroad-ze-kuu-formal-card-art-style';
  let style = doc.getElementById?.(styleId) ?? null;
  let ownsStyle = false;
  if (!style) {
    style = doc.createElement('style');
    style.id = styleId;
    style.textContent = `[data-ze-kuu-formal-art="1"]{position:relative!important;overflow:hidden!important;isolation:isolate}[data-ze-kuu-formal-art="1"]::before{content:"";position:absolute;inset:0;background-image:url("${resolved.assetUrl}");background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;z-index:0}[data-ze-kuu-formal-art="1"]>*:not([data-role="fanart-local-skin-overlay"]):not([data-role="fanart-public-battle-card-art"]){position:relative;z-index:1}.resolutionCard[data-ze-kuu-formal-art="1"]>b{position:relative!important;z-index:2!important;padding:1px 2px!important;border-radius:3px!important;background:rgba(0,0,0,.66)!important;color:#fff!important;text-shadow:0 1px 2px #000!important}`;
    (doc.head || doc.documentElement)?.appendChild?.(style);
    ownsStyle = true;
  }

  let destroyed = false;
  const refresh = () => {
    if (destroyed) return;
    const marked = [...doc.querySelectorAll('[data-ze-kuu-formal-art="1"]')];
    for (const node of marked) {
      if (!isSupportedHost(node) || nodeCardId(node) !== ZE_KUU_FORMAL_CARD_ART.cardId) {
        node.removeAttribute?.('data-ze-kuu-formal-art');
        node.removeAttribute?.('data-formal-art-source');
      }
    }
    const hosts = [...doc.querySelectorAll(
      '#collectionGrid [data-id="DCG_ZE_KUU"], #deckSlots [data-id="DCG_ZE_KUU"], #exDeckSlots [data-id="DCG_ZE_KUU"], .resolutionCard[data-card-id="DCG_ZE_KUU"]',
    )];
    for (const node of hosts) {
      node.dataset.zeKuuFormalArt = '1';
      node.dataset.formalArtSource = 'official';
    }
  };

  const Observer = win?.MutationObserver ?? globalThis.MutationObserver;
  const observer = typeof Observer === 'function'
    ? new Observer(() => refresh())
    : null;
  observer?.observe?.(doc.documentElement || doc, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-id', 'data-card-id'],
  });
  refresh();

  const installation = Object.freeze({
    installed: true,
    contract: ZE_KUU_FORMAL_CARD_ART,
    assetUrl: resolved.assetUrl,
    refresh,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      for (const node of [...doc.querySelectorAll('[data-ze-kuu-formal-art="1"]')]) {
        node.removeAttribute?.('data-ze-kuu-formal-art');
        node.removeAttribute?.('data-formal-art-source');
      }
      if (ownsStyle) style?.remove?.();
      installations.delete(doc);
      return true;
    },
  });
  installations.set(doc, installation);
  return installation;
}

function autoInstall() {
  const doc = globalThis.document;
  if (!doc?.querySelectorAll) return;
  const run = () => installZeKuuFormalCardArt({ document: doc, window: globalThis.window });
  if (doc.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', run, { once: true });
  else run();
}

autoInstall();
