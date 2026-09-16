import { projectApprovedFanArtShopCatalog } from './shop-transaction-presentation-adapter.mjs';

export const SHOP_LIVE_CATALOG_SCHEMA = 'gameroad.shop-live-catalog-runtime.v1';
const VALID_STANDARD_KINDS = new Set(['STANDARD', 'COSMETIC']);
const CURRENCY_DISPLAY = Object.freeze({ COIN: 'コイン', MANII: 'マニィ' });

function token(value, max = 160) {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  return out && out.length <= max ? out : null;
}

function projectStandardItem(raw) {
  const reasons = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok:false, reasons:['invalid-item'], item:null };
  }
  const productId = token(raw.productId, 128);
  const title = token(raw.title, 160);
  const kind = token(raw.kind, 32);
  const currency = token(raw.currency, 32);
  const price = Number.isSafeInteger(raw.price) && raw.price > 0 ? raw.price : null;
  const imageAssetId = token(raw.imageAssetId, 256);

  if (!productId) reasons.push('productId-invalid');
  if (!title) reasons.push('title-invalid');
  if (!kind || !VALID_STANDARD_KINDS.has(kind)) reasons.push('kind-invalid');
  if (!currency || !Object.hasOwn(CURRENCY_DISPLAY, currency)) reasons.push('currency-invalid');
  if (price == null) reasons.push('price-invalid');
  if (raw.acquisitionState !== 'READY') reasons.push('acquisition-not-ready');
  if (kind === 'STANDARD' && currency !== 'COIN') reasons.push('standard-currency-must-be-coin');
  if (kind === 'COSMETIC' && currency !== 'MANII') reasons.push('cosmetic-currency-must-be-manii');

  if (reasons.length) return {ok:false, reasons:[...new Set(reasons)].sort(), item:null};
  return {
    ok:true,
    reasons:[],
    item:Object.freeze({
      identity:`product:${productId}`,
      productId,
      source:'FORMAL_CATALOG',
      kind,
      title,
      imageAssetId,
      currency,
      currencyDisplayName:CURRENCY_DISPLAY[currency],
      price,
      actions:Object.freeze(['ACQUIRE']),
    }),
  };
}

function projectFormalCatalog(items) {
  if (!Array.isArray(items)) throw new Error('formalCatalogItems must be an array');
  if (items.length === 0) return Object.freeze({visible:false, items:Object.freeze([]), reasons:Object.freeze([])});

  const projected = [];
  const reasons = [];
  const identities = new Set();
  for (const raw of items) {
    const result = projectStandardItem(raw);
    if (!result.ok) {
      const key = token(raw?.productId, 128) ?? 'unknown';
      reasons.push(...result.reasons.map((reason)=>`${key}:${reason}`));
      continue;
    }
    if (identities.has(result.item.identity)) reasons.push(`duplicate:${result.item.identity}`);
    identities.add(result.item.identity);
    projected.push(result.item);
  }

  if (reasons.length) {
    return Object.freeze({visible:false, items:Object.freeze([]), reasons:Object.freeze([...new Set(reasons)].sort())});
  }
  return Object.freeze({visible:true, items:Object.freeze(projected), reasons:Object.freeze([])});
}

function projectFanArtItems(works) {
  const catalog = projectApprovedFanArtShopCatalog({works});
  if (!catalog.visible) return Object.freeze({visible:false, items:Object.freeze([]), reasons:catalog.reasons});

  const items = catalog.items.map((item)=>Object.freeze({
    identity:`fanart:${item.workId}@${item.workVersion}`,
    productId:item.acquisition.productId,
    source:'FANART',
    kind:'FANART',
    title:item.title,
    creatorDisplayName:item.creatorDisplayName,
    targetCardId:item.targetCardId,
    imageAssetId:item.imageAssetId,
    currency:item.acquisition.currency,
    currencyDisplayName:item.acquisition.currencyDisplayName,
    price:item.acquisition.price,
    actions:item.actions,
  }));
  return Object.freeze({visible:true, items:Object.freeze(items), reasons:Object.freeze([])});
}

export function projectShopLiveCatalog({formalCatalogItems = [], approvedFanArtWorks = []} = {}) {
  const formal = projectFormalCatalog(formalCatalogItems);
  const fanart = projectFanArtItems(approvedFanArtWorks);
  const standard = formal.items.filter((item)=>item.kind === 'STANDARD');
  const cosmetics = formal.items.filter((item)=>item.kind === 'COSMETIC');
  const visibleItems = [...standard, ...cosmetics, ...fanart.items];

  return Object.freeze({
    schema:SHOP_LIVE_CATALOG_SCHEMA,
    sections:Object.freeze([
      Object.freeze({id:'standard', title:'商品', visible:standard.length > 0, items:Object.freeze(standard)}),
      Object.freeze({id:'cosmetics', title:'外観', visible:cosmetics.length > 0, items:Object.freeze(cosmetics)}),
      Object.freeze({id:'fanart', title:'ファンアート', visible:fanart.visible, items:fanart.items}),
    ]),
    visible:visibleItems.length > 0,
    empty:visibleItems.length === 0,
    reasons:Object.freeze([...formal.reasons, ...fanart.reasons]),
    navigationMerchandiseAllowed:false,
    purchaseAuthority:false,
    ownershipMutationAllowed:false,
    saveMutationAllowed:false,
  });
}

function appendText(documentSource, parent, tagName, className, text) {
  const node = documentSource.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function renderItem(documentSource, grid, item, onAcquireRequest) {
  const card = documentSource.createElement('article');
  card.className = 'shopCard shopLiveCatalogCard';
  card.dataset.shopItemIdentity = item.identity;
  card.dataset.shopItemKind = item.kind;
  appendText(documentSource, card, 'div', 'k', item.kind === 'FANART' ? 'FAN ART' : item.kind);
  appendText(documentSource, card, 'h3', 'shopLiveCatalogTitle', item.title);
  if (item.creatorDisplayName) appendText(documentSource, card, 'p', 'shopLiveCatalogCreator', `作者 ${item.creatorDisplayName}`);
  appendText(documentSource, card, 'div', 'shopLiveCatalogPrice', `${item.price} ${item.currencyDisplayName}`);
  const button = appendText(documentSource, card, 'button', 'shopLiveCatalogAcquire', '取得する');
  button.type = 'button';
  button.dataset.shopProductId = item.productId;
  button.addEventListener('click', ()=>{
    onAcquireRequest?.(Object.freeze({
      productId:item.productId,
      source:item.source,
      itemIdentity:item.identity,
    }));
  });
  grid.appendChild(card);
}

export function mountShopLiveCatalogRuntime({
  host,
  formalCatalogItems = [],
  approvedFanArtWorks = [],
  onAcquireRequest = null,
} = {}) {
  if (!host || typeof host.replaceChildren !== 'function') throw new Error('host must support replaceChildren');
  const documentSource = host.ownerDocument ?? globalThis.document;
  if (!documentSource || typeof documentSource.createElement !== 'function') throw new Error('document source unavailable');
  if (onAcquireRequest != null && typeof onAcquireRequest !== 'function') throw new Error('onAcquireRequest must be a function or null');

  const projection = projectShopLiveCatalog({formalCatalogItems, approvedFanArtWorks});
  const fragment = documentSource.createDocumentFragment?.() ?? documentSource.createElement('div');
  const shell = documentSource.createElement('div');
  shell.className = 'shopLiveCatalog';
  shell.dataset.shopCatalogSchema = projection.schema;

  if (projection.empty) {
    appendText(documentSource, shell, 'p', 'safeNote shopLiveCatalogEmpty', '現在、購入できる商品はありません');
  } else {
    for (const section of projection.sections) {
      if (!section.visible) continue;
      const sectionNode = documentSource.createElement('section');
      sectionNode.className = `shopLiveCatalogSection shopLiveCatalogSection-${section.id}`;
      appendText(documentSource, sectionNode, 'h2', 'shopLiveCatalogSectionTitle', section.title);
      const grid = documentSource.createElement('div');
      grid.className = 'shopGrid shopLiveCatalogGrid';
      for (const item of section.items) renderItem(documentSource, grid, item, onAcquireRequest);
      sectionNode.appendChild(grid);
      shell.appendChild(sectionNode);
    }
  }

  fragment.appendChild(shell);
  host.replaceChildren(fragment);
  return Object.freeze({
    mounted:true,
    projection,
    snapshot:()=>projection,
    purchaseAuthority:false,
    ownershipMutationAllowed:false,
    saveMutationAllowed:false,
  });
}
