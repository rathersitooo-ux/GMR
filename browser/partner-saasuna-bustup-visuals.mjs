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

export function resolveSaasunaAdviceBustupState(input = {}) {
  if (input.partnerId !== SAASUNA_PARTNER_ID) return null;
  if (input.reactionActive) return 'SURPRISED';
  if (input.tutorialActive) return 'GUIDE_PRESENT';  if (input.quickRouteId === 'casual') return 'HAPPY_WAVE';
  if (input.quickRouteId === 'situation') return 'CURIOUS_CONFUSED';
  if (input.quickRouteId === 'idea') return 'GUIDE_PRESENT';
  if (input.adviceActive) return 'HAPPY_SMILE';
  return 'IDLE_GENTLE';
}

export function ensureSaasunaBattleBustupStyle(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `section[data-screen="battle"] .partnerAdviceBustup{position:absolute;z-index:37;left:max(4px,env(safe-area-inset-left));bottom:clamp(10px,5vh,42px);width:clamp(126px,18vw,190px);height:clamp(158px,38vh,270px);margin:0;display:grid;align-items:end;justify-items:start;pointer-events:none;overflow:visible}section[data-screen="battle"] .partnerAdviceBustup[hidden]{display:none!important}section[data-screen="battle"] .partnerAdviceBustup img{display:block;width:100%;height:100%;object-fit:contain;object-position:left bottom;filter:drop-shadow(0 10px 14px rgba(0,0,0,.38))}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-saasuna-bustup="true"]{left:clamp(136px,19vw,214px)}@media(max-height:430px) and (orientation:landscape){section[data-screen="battle"] .partnerAdviceBustup{left:2px;top:142px;bottom:auto;width:108px;height:132px}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-battle-advice-overlay="true"][data-saasuna-bustup="true"]{left:112px}}@media(max-width:540px) and (orientation:portrait){section[data-screen="battle"] .partnerAdviceBustup{left:2px;bottom:10px;width:min(34vw,142px);height:min(30vh,188px)}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-saasuna-bustup="true"]{left:min(36vw,150px)}}`;
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
    const image = doc.createElement('img');
    image.decoding = 'async';
    image.loading = 'eager';
    image.draggable = false;    figure.append(image);
    battleSurface.append(figure);
  }
  return Object.freeze({ figure, image: figure.querySelector('img') });
}

export function renderSaasunaBattleBustup({ root, bustup, partnerId, battleActive = false, reactionActive = false, tutorialActive = false, quickRouteId = null, adviceActive = false } = {}) {
  const state = resolveSaasunaAdviceBustupState({ partnerId, reactionActive, tutorialActive, quickRouteId, adviceActive });
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
  if (bustup.image.dataset.assetFile !== entry.fileName) {
    bustup.image.src = entry.src;
    bustup.image.dataset.assetFile = entry.fileName;
  }
  bustup.image.alt = 'サースナー';
  return Object.freeze({ visible: true, state, asset: entry.fileName });
}
