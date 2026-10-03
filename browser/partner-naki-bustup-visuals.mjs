import {
  NAKI_CURRENT_DISPLAY_NAME,
  NAKI_CURRENT_PARTNER_ID,
  NAKI_CURRENT_VISUAL_ASSETS,
  applySpriteFrame,
} from './naki-current-visual-assets.mjs';

const STYLE_ID = 'gameroad-partner-advice-naki-bustup-r1';

export const NAKI_ADVICE_VISUAL_STATES = Object.freeze(['IDLE', 'SPEAK', 'REACTION']);

export function resolveNakiAdviceBustupState(input = {}) {
  if (input.partnerId !== NAKI_CURRENT_PARTNER_ID) return null;
  if (input.reactionActive) return 'REACTION';
  if (input.tutorialActive || input.quickRouteId || input.adviceActive) return 'SPEAK';
  return 'IDLE';
}

export function ensureNakiBattleBustupStyle(doc) {
  if (!doc?.head || doc.getElementById?.(STYLE_ID)) return false;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    'section[data-screen="battle"] .partnerAdviceNakiBustup{position:absolute;z-index:37;left:max(6px,env(safe-area-inset-left));bottom:clamp(12px,5vh,42px);width:clamp(150px,20vw,218px);height:clamp(196px,42vh,300px);box-sizing:border-box;margin:0;padding:24px 6px 6px;display:grid;place-items:end center;pointer-events:none;overflow:hidden;isolation:isolate;border:1px solid rgba(236,195,255,.38);border-radius:16px;background:linear-gradient(165deg,rgba(18,8,31,.94),rgba(57,20,77,.88));box-shadow:0 12px 34px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,240,255,.12)}',
    'section[data-screen="battle"] .partnerAdviceNakiBustup[hidden]{display:none!important}',
    'section[data-screen="battle"] .partnerAdviceNakiBustupHeader{position:absolute;z-index:2;left:8px;right:8px;top:5px;height:17px;display:flex;align-items:center;gap:5px;min-width:0;border-bottom:1px solid rgba(238,206,255,.17);color:#f4ddff;font-weight:950;line-height:1}',
    'section[data-screen="battle"] .partnerAdviceNakiBustupHeader small{font-size:6px;letter-spacing:.05em;color:#c4a1d4;white-space:nowrap}',
    'section[data-screen="battle"] .partnerAdviceNakiBustupHeader strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}',
    'section[data-screen="battle"] .partnerAdviceNakiBustupArt{position:relative;z-index:1;width:100%;height:100%;display:grid;place-items:end center;overflow:hidden;border-radius:11px;background:radial-gradient(circle at 50% 64%,rgba(182,77,220,.18),transparent 60%)}',
    'section[data-screen="battle"] .partnerAdviceNakiBustupSprite{display:block;width:100%;height:100%;background-repeat:no-repeat;image-rendering:auto;filter:drop-shadow(0 8px 12px rgba(0,0,0,.38))}',
    'section[data-screen="battle"] #partnerAdviceChatPresentation[data-naki-bustup="true"]{left:clamp(164px,21vw,242px)}',
    '@media(max-height:430px) and (orientation:landscape){section[data-screen="battle"] .partnerAdviceNakiBustup{left:4px;top:108px;bottom:auto;width:116px;height:138px;padding:19px 4px 4px;border-radius:11px}section[data-screen="battle"] .partnerAdviceNakiBustupHeader{left:5px;right:5px;top:3px;height:13px}section[data-screen="battle"] .partnerAdviceNakiBustupHeader small{display:none}section[data-screen="battle"] .partnerAdviceNakiBustupHeader strong{font-size:7px}section[data-screen="battle"] #partnerAdviceChatPresentation[data-battle-advice-overlay="true"][data-naki-bustup="true"]{left:124px}}',
    '@media(max-width:540px) and (orientation:portrait){section[data-screen="battle"] .partnerAdviceNakiBustup{left:auto;right:max(8px,env(safe-area-inset-right));bottom:clamp(90px,13vh,128px);width:112px;height:144px;padding:18px 4px 4px;opacity:.94}section[data-screen="battle"] #partnerAdviceChatPresentation[data-naki-bustup="true"]{left:max(8px,env(safe-area-inset-left))!important}}',
  ].join('');
  doc.head.append(style);
  return true;
}

export function ensureNakiBattleBustup(doc, battleSurface) {
  if (!doc || !battleSurface) return null;
  let figure = battleSurface.querySelector?.('[data-role="advice-partner-naki-bustup"]');
  if (!figure) {
    figure = doc.createElement('figure');
    figure.className = 'partnerAdviceNakiBustup';
    figure.dataset.role = 'advice-partner-naki-bustup';
    figure.dataset.partnerId = NAKI_CURRENT_PARTNER_ID;
    figure.dataset.presentationOnly = 'true';
    figure.hidden = true;

    const header = doc.createElement('figcaption');
    header.className = 'partnerAdviceNakiBustupHeader';
    header.innerHTML = `<small>アドバイスパートナー</small><strong>${NAKI_CURRENT_DISPLAY_NAME}</strong>`;

    const art = doc.createElement('div');
    art.className = 'partnerAdviceNakiBustupArt';
    const sprite = doc.createElement('span');
    sprite.className = 'partnerAdviceNakiBustupSprite';
    sprite.dataset.role = 'naki-advice-sprite';
    sprite.setAttribute?.('aria-hidden', 'true');
    art.append(sprite);
    figure.append(header, art);
    battleSurface.append(figure);
    applySpriteFrame(sprite, {
      src: NAKI_CURRENT_VISUAL_ASSETS.advice.atlas,
      columns: NAKI_CURRENT_VISUAL_ASSETS.advice.columns,
      rows: NAKI_CURRENT_VISUAL_ASSETS.advice.rows,
      frameIndex: NAKI_CURRENT_VISUAL_ASSETS.advice.reducedMotionFrame,
    });
  }
  return Object.freeze({ figure, sprite: figure.querySelector?.('[data-role="naki-advice-sprite"]') ?? null });
}

export function renderNakiBattleBustup({
  root,
  bustup,
  partnerId,
  battleActive = false,
  reactionActive = false,
  tutorialActive = false,
  quickRouteId = null,
  adviceActive = false,
} = {}) {
  const state = resolveNakiAdviceBustupState({ partnerId, reactionActive, tutorialActive, quickRouteId, adviceActive });
  const visible = Boolean(root && bustup?.figure && bustup?.sprite && battleActive && state);
  if (root) root.dataset.nakiBustup = visible ? 'true' : 'false';
  if (!bustup?.figure || !bustup?.sprite) return Object.freeze({ visible: false, state: null });
  bustup.figure.hidden = !visible;
  if (!visible) {
    delete bustup.figure.dataset.state;
    return Object.freeze({ visible: false, state: null });
  }
  bustup.figure.dataset.state = state;
  bustup.figure.setAttribute?.('aria-label', `アドバイスパートナー ${NAKI_CURRENT_DISPLAY_NAME}`);
  return Object.freeze({ visible: true, state });
}
