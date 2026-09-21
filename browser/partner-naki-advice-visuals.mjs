import {
  NAKI_IDOL_ADVICE_ASSETS,
  resolveNakiAdviceAsset
} from './naki-idol-battle-assets.mjs';

export const NAKI_ADVICE_VISUAL_SCHEMA = 'gameroad.partner.naki-advice-visuals.v1';

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function resolveNakiAdviceExpression({
  reactionActive = false,
  tutorialActive = false,
  quickRouteId = '',
  adviceActive = false,
  battleActive = false
} = {}) {
  if (reactionActive) return 'SURPRISED';
  if (tutorialActive) return 'GUIDE_PRESENT';
  if (quickRouteId === 'casual' || quickRouteId === 'greeting') return 'HAPPY_WAVE';
  if (quickRouteId === 'question' || quickRouteId === 'situation') return 'CURIOUS_CONFUSED';
  if (quickRouteId === 'secret') return 'SHH';
  if (adviceActive) return battleActive ? 'HAPPY_SMILE' : 'TOUCH_CRY';
  return 'IDLE_GENTLE';
}

function createNode(document, tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function ensureNakiAdviceBustupStyle(document) {
  if (!document?.head || document.getElementById?.('gameroad-naki-advice-style')) return;
  const style = createNode(document, 'style');
  style.id = 'gameroad-naki-advice-style';
  style.textContent = `
.nakiAdviceBustup{position:absolute;z-index:34;right:2.5%;bottom:19%;width:min(28vw,250px);min-width:150px;aspect-ratio:.8;display:grid;align-items:end;pointer-events:none;filter:drop-shadow(0 10px 12px rgba(22,7,38,.42))}
.nakiAdviceBustup[hidden]{display:none!important}
.nakiAdviceBustupArt{position:absolute;inset:0;display:grid;place-items:end center}
.nakiAdviceBustupArt img{display:block;width:100%;height:100%;object-fit:contain;object-position:50% 100%;image-rendering:auto}
.nakiAdviceBustupLabel{position:absolute;right:0;bottom:0;padding:4px 9px;border:2px solid #f7d6ff;background:linear-gradient(90deg,#34126b,#7f2a94);color:#fff5ff;font:900 11px/1.1 system-ui,sans-serif;letter-spacing:.06em;text-shadow:0 2px 3px #24102f}
@media(max-width:700px){.nakiAdviceBustup{right:1%;bottom:24%;width:34vw;min-width:100px}.nakiAdviceBustupLabel{font-size:8px;padding:3px 5px}}
`;
  document.head.appendChild(style);
}

export function ensureNakiAdviceBustup({ document, root }) {
  if (!document || !root) return null;
  ensureNakiAdviceBustupStyle(document);
  let bustup = root.querySelector?.('[data-role="naki-advice-bustup"]');
  if (bustup) return bustup;
  bustup = createNode(document, 'figure', 'nakiAdviceBustup');
  bustup.dataset.role = 'naki-advice-bustup';
  bustup.dataset.presentationOnly = 'true';
  const art = createNode(document, 'div', 'nakiAdviceBustupArt');
  const image = createNode(document, 'img');
  image.alt = 'ナキ';
  image.decoding = 'async';
  image.draggable = false;
  art.appendChild(image);
  const label = createNode(document, 'figcaption', 'nakiAdviceBustupLabel');
  label.textContent = 'アドバイスパートナー・ナキ';
  bustup.append(art, label);
  root.appendChild(bustup);
  return bustup;
}

export function renderNakiAdviceBustup({
  bustup,
  expression,
  visible = true,
  partnerId = 'partner.naki'
} = {}) {
  if (!bustup) return null;
  const image = bustup.querySelector?.('img');
  if (!image) return null;
  const asset = resolveNakiAdviceAsset(text(expression, 'IDLE_GENTLE'));
  const isNaki = partnerId === 'partner.naki';
  bustup.hidden = !visible || !isNaki;
  if (isNaki) {
    image.src = asset.src;
    image.dataset.assetFile = asset.fileName;
  } else {
    image.removeAttribute('src');
    delete image.dataset.assetFile;
  }
  bustup.dataset.expression = asset.expression;
  bustup.dataset.assetFile = asset.fileName;
  return Object.freeze({
    schema: NAKI_ADVICE_VISUAL_SCHEMA,
    visible: !bustup.hidden,
    expression: asset.expression,
    asset: asset.fileName
  });
}

export { NAKI_IDOL_ADVICE_ASSETS };

