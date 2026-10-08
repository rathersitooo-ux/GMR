import {
  createAdviceBustupFrameMap,
  renderAdviceBustupSprite,
} from './partner-advice-bustup-sprite-core.mjs';

const NAKI_PARTNER_ID = 'partner.naki';

export const NAKI_ADVICE_BUSTUP_SPRITE = Object.freeze({
  fileName: 'naki-advice-bustup-candidate-r1.png',
  src: new URL('./assets/partners/naki-advice/naki-advice-bustup-candidate-r1.png', import.meta.url).href,
});

export const NAKI_ADVICE_BUSTUP_FRAMES = createAdviceBustupFrameMap([
  'GREET', 'IDOL_APPEAL', 'SHY', 'WINK_PEACE', 'CHUUNIBYOU',
  'SURPRISED', 'POUT', 'LAUGH', 'MOVED',
]);

const NAKI_EXPRESSION_LABELS = Object.freeze({
  GREET: '明るい笑顔',
  IDOL_APPEAL: 'アイドルアピール',
  SHY: '照れ顔',
  WINK_PEACE: 'ウィンク・ピース',
  CHUUNIBYOU: '赤眼の決めポーズ',
  SURPRISED: 'びっくり',
  POUT: 'ぷくっとした不満顔',
  LAUGH: '大笑い',
  MOVED: '感動',
});

export function resolveNakiAdviceBustupState(input = {}) {
  if (input.partnerId !== NAKI_PARTNER_ID) return null;
  if (input.reactionActive) return 'SURPRISED';
  if (input.tutorialActive) return 'WINK_PEACE';
  if (input.quickRouteId === 'casual') return 'IDOL_APPEAL';
  if (input.quickRouteId === 'situation') return 'SHY';
  if (input.quickRouteId === 'idea') return 'CHUUNIBYOU';
  if (input.adviceActive) return 'LAUGH';
  return 'GREET';
}

export function renderNakiAdviceBustup({
  root,
  bustup,
  partnerId,
  partnerName = '緋累ナキ',
  battleActive = false,
  reactionActive = false,
  tutorialActive = false,
  quickRouteId = null,
  adviceActive = false,
} = {}) {
  const state = resolveNakiAdviceBustupState({ partnerId, reactionActive, tutorialActive, quickRouteId, adviceActive });
  const frame = state ? NAKI_ADVICE_BUSTUP_FRAMES[state] : null;
  const presentation = renderAdviceBustupSprite({
    root,
    bustup,
    partnerId,
    partnerName,
    entry: frame ? NAKI_ADVICE_BUSTUP_SPRITE : null,
    frame,
    battleActive,
    alt: frame ? `${partnerName}（${NAKI_EXPRESSION_LABELS[state]}）` : '',
  });
  return presentation.visible
    ? Object.freeze({ ...presentation, state, frame: state })
    : Object.freeze({ visible: false, state: null, frame: null, asset: null });
}
