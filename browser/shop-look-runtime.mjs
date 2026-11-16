// Shop look (#9 of GAMEROAD-ショップ実装表-20261112, no-GPT version).
// Applies the six separated look parts (background / panel base / heading
// band / currency tray / button base / catalog frame) to the shop screen
// as CSS backgrounds. The parts were generated one by one from the
// decomposition table (decomposition-shop9-20261113.md); this module only
// frames them onto the existing elements. It never changes routes,
// prices, balances, purchase state, ownership, or saves, and it adds no
// screen text. If an image fails to load, the dark-blue fallback colour
// underneath keeps the screen readable.
//
// Framing numbers are measured from the actual files, not guessed:
// each part sits centred inside a 16:9 canvas, so background-size zooms
// onto the part's own box and background-position centres that box.
//   background: full-bleed, cover.
//   panel base (2048x1152, wide): part box x 10.2-89.8%, y 9.7-90.1%
//     -> size 125% 124%, position 50% 50%.
//     (Replaces the tall 2096x1184 panel base: its baked-in dark button
//     base showed as a dark band under the real buttons on wide cards.
//     The wide base has no baked-in button base.)
//   band base (2048x1152): part box x 6.4-93.5%, y 38.0-61.7%
//     -> size 115% 422%, position 50% 50%.
//   tray base (2048x1152): part box x 6.4-93.6%, y 38.0-62.8%
//     -> size 115% 404%, position 50% 50%.
//   button base (2048x1152): part box x 31.2-68.8%, y 40.1-59.4%
//     -> size 266% 519%, position 50% 50%.
//   catalog frame (2048x1152): part box x 11.6-88.3%, y 51.0-91.1%
//     -> size 130% 249%, position 50% 85%.
//   charge / exchange view (outer container): the same wide panel base
//     as the branch cards (125% 124%, 50% 50%). The two views are
//     containers, not branch cards, but they sit on the shop screen the
//     same way the catalog host sits inside the catalog frame, so they
//     wear the same panel type. Their inner cards keep their own
//     translucent fill for now; only the green outer container is gone.
//     (Step 14 of the no-GPT lane, 2026-11-13: this closes the last
//     recorded gap of #9, "charge / exchange containers still green".)
//
// Note: the panel-base rule also dresses the formal catalog's product
// cards, because the catalog grid carries the same .shopGrid class and
// its cards carry .shopCard (shop-live-catalog-runtime.mjs). That is
// kept on purpose: the product card reads as the same panel type as the
// four branch cards, and the real screen (2026-11-13) shows it framed
// consistently inside the catalog frame. It is not a second panel kind.

export const SHOP_LOOK_SCHEMA = 'gameroad.shop-look.v1';
export const SHOP_LOOK_STYLE_ID = 'gameroad-shop-look-r1';

export const SHOP_LOOK_ASSETS = Object.freeze({
  background: 'assets/visual/shop-look-background-v1.png',
  panelBase: 'assets/visual/shop-look-panel-base-v1.webp',
  bandBase: 'assets/visual/shop-look-band-base-v1.webp',
  trayBase: 'assets/visual/shop-look-tray-base-v1.webp',
  buttonBase: 'assets/visual/shop-look-button-base-v1.webp',
  catalogFrame: 'assets/visual/shop-look-catalog-frame-v1.webp',
});

export const SHOP_LOOK_CSS = `
.screen[data-screen="shop"].shopLookApplied{background-color:#0a2e45;background-image:url("${SHOP_LOOK_ASSETS.background}");background-size:cover;background-position:center top;background-repeat:no-repeat}
.screen[data-screen="shop"].shopLookApplied .simplePanel.shopPanel{background-color:#0a2e45;background-image:url("${SHOP_LOOK_ASSETS.background}");background-size:cover;background-position:center top;background-repeat:no-repeat}
.shopLookApplied .surfaceHead.shopHead{background-image:url("${SHOP_LOOK_ASSETS.bandBase}");background-size:115% 422%;background-position:50% 50%;background-repeat:no-repeat;background-color:#0d3247;min-height:64px;padding:10px 18px;align-items:center}
.shopLookApplied .surfaceHead.shopHead .h{text-shadow:0 1px 6px rgba(2,12,20,.85),0 0 2px rgba(2,12,20,.6)}
.shopLookApplied .shopGrid .shopCard{background-image:url("${SHOP_LOOK_ASSETS.panelBase}");background-size:125% 124%;background-position:50% 50%;background-repeat:no-repeat;background-color:#0d3247;border-color:rgba(212,175,105,.55)}
.shopLookApplied .shopGrid .shopCard .btn{background-image:url("${SHOP_LOOK_ASSETS.buttonBase}");background-size:266% 519%;background-position:50% 50%;background-repeat:no-repeat;background-color:#0d3247;border-color:rgba(212,175,105,.6);color:#fff;text-shadow:0 1px 4px rgba(2,12,20,.85)}
.shopLookApplied .shopChargeBalance,.shopLookApplied .shopExchangeBalance{background-image:url("${SHOP_LOOK_ASSETS.trayBase}");background-size:115% 404%;background-position:50% 50%;background-repeat:no-repeat;background-color:#0d3247;padding:12px}
.shopLookApplied .shopChargeView,.shopLookApplied .shopExchangeView{background-image:url("${SHOP_LOOK_ASSETS.panelBase}");background-size:125% 124%;background-position:50% 50%;background-repeat:no-repeat;background-color:#0d3247;border-color:rgba(212,175,105,.55)}
.shopLookApplied .shopFormalCatalogHost{background-image:url("${SHOP_LOOK_ASSETS.catalogFrame}");background-size:130% 249%;background-position:50% 85%;background-repeat:no-repeat;background-color:transparent;padding:18px 22px}
`;

export function projectShopLook() {
  return Object.freeze({
    schema: SHOP_LOOK_SCHEMA,
    assets: SHOP_LOOK_ASSETS,
    targets: Object.freeze([
      'shop-screen-background',
      'shop-heading-band',
      'shop-branch-cards',
      'shop-branch-card-buttons',
      'shop-charge-balance',
      'shop-exchange-balance',
      'shop-charge-view',
      'shop-exchange-view',
      'shop-formal-catalog',
    ]),
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export function ensureShopLookStyle(documentSource = globalThis.document) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return false;
  if (documentSource.getElementById?.(SHOP_LOOK_STYLE_ID)) return false;
  const style = documentSource.createElement('style');
  style.id = SHOP_LOOK_STYLE_ID;
  style.textContent = SHOP_LOOK_CSS;
  if (typeof documentSource.head.appendChild === 'function') documentSource.head.appendChild(style);
  else documentSource.head.append?.(style);
  return true;
}

const mountedByScreen = new WeakMap();

export function mountShopLookRuntime({screen, documentSource = globalThis.document} = {}) {
  if (!screen || typeof screen !== 'object') {
    throw new Error('shop look requires a shop screen node');
  }
  if (mountedByScreen.has(screen)) return mountedByScreen.get(screen);
  if (!documentSource || typeof documentSource.createElement !== 'function') {
    throw new Error('document source unavailable');
  }
  ensureShopLookStyle(documentSource);
  if (screen.classList && typeof screen.classList.add === 'function') {
    screen.classList.add('shopLookApplied');
  } else if (typeof screen.className === 'string' && !screen.className.includes('shopLookApplied')) {
    screen.className = `${screen.className} shopLookApplied`.trim();
  }
  const runtime = Object.freeze({
    mounted: true,
    schema: SHOP_LOOK_SCHEMA,
    projection: projectShopLook(),
    purchaseAuthority: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
  });
  mountedByScreen.set(screen, runtime);
  return runtime;
}

export function ensureShopLookRuntime(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function' || typeof documentSource.createElement !== 'function') return null;
  const shopScreen = [...documentSource.querySelectorAll('.screen[data-screen]')]
    .find((candidate) => candidate?.dataset?.screen === 'shop');
  if (!shopScreen || typeof shopScreen.querySelector !== 'function') return null;
  try {
    return mountShopLookRuntime({screen: shopScreen, documentSource});
  } catch {
    return null;
  }
}
