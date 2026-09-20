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
  if (input.touchCryActive) return 'TOUCH_CRY';
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
  style.textContent = `section[data-screen="battle"] .partnerAdviceBustup{position:absolute;z-index:37;left:max(6px,env(safe-area-inset-left));bottom:clamp(12px,5vh,42px);width:clamp(132px,18vw,190px);height:clamp(176px,38vh,270px);box-sizing:border-box;margin:0;padding:22px 5px 5px;display:grid;place-items:end center;pointer-events:auto;touch-action:manipulation;cursor:pointer;overflow:hidden;isolation:isolate;border:1px solid rgba(217,246,235,.36);border-radius:15px;background:linear-gradient(165deg,rgba(6,31,34,.92),rgba(10,50,43,.82));box-shadow:0 10px 28px rgba(0,0,0,.34),inset 0 1px 0 rgba(239,255,249,.10)}section[data-screen="battle"] .partnerAdviceBustup[hidden]{display:none!important}section[data-screen="battle"] .partnerAdviceBustupHeader{position:absolute;z-index:2;left:7px;right:7px;top:4px;height:16px;display:flex;align-items:center;gap:5px;min-width:0;border-bottom:1px solid rgba(217,246,235,.16);color:#dff7ef;font-weight:950;line-height:1}section[data-screen="battle"] .partnerAdviceBustupHeader small{font-size:6px;letter-spacing:.05em;color:#9bc5b8;white-space:nowrap}section[data-screen="battle"] .partnerAdviceBustupHeader strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}section[data-screen="battle"] .partnerAdviceBustupArt{position:relative;z-index:1;width:100%;height:100%;display:grid;place-items:end center;overflow:hidden;border-radius:10px;background:radial-gradient(circle at 50% 72%,rgba(104,191,164,.14),transparent 62%)}section[data-screen="battle"] .partnerAdviceBustup img{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 7px 10px rgba(0,0,0,.34))}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-saasuna-bustup="true"]{left:clamp(146px,19vw,214px)}@media(max-height:430px) and (orientation:landscape){section[data-screen="battle"] .partnerAdviceBustup{left:4px;top:116px;bottom:auto;width:104px;height:126px;padding:18px 4px 4px;border-radius:11px}section[data-screen="battle"] .partnerAdviceBustupHeader{left:5px;right:5px;top:3px;height:13px}section[data-screen="battle"] .partnerAdviceBustupHeader small{display:none}section[data-screen="battle"] .partnerAdviceBustupHeader strong{font-size:7px}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-battle-advice-overlay="true"][data-saasuna-bustup="true"]{left:112px}}@media(max-width:540px) and (orientation:portrait){section[data-screen="battle"] .partnerAdviceBustup{left:4px;bottom:10px;width:min(34vw,142px);height:min(30vh,188px)}section[data-screen="battle"] #${CHAT_ROOT_ID}[data-saasuna-bustup="true"]{left:min(36vw,150px)}}`;
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
    figure.setAttribute('role', 'button');
    figure.tabIndex = 0;
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

export function renderSaasunaBattleBustup({ root, bustup, partnerId, battleActive = false, touchCryActive = false, reactionActive = false, tutorialActive = false, quickRouteId = null, adviceActive = false } = {}) {
  const state = resolveSaasunaAdviceBustupState({ partnerId, touchCryActive, reactionActive, tutorialActive, quickRouteId, adviceActive });
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
  bustup.figure.setAttribute('aria-label', 'アドバイスパートナー サースナーに触れる');
  if (bustup.image.dataset.assetFile !== entry.fileName) {
    bustup.image.src = entry.src;
    bustup.image.dataset.assetFile = entry.fileName;
  }
  bustup.image.alt = 'サースナー';
  return Object.freeze({ visible: true, state, asset: entry.fileName });
}
