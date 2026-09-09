export * from './battle-janken-slidepad-runtime-mount-base.mjs';

export const BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID = 'gameroad-battle-janken-portrait-live-r5-style';

export const BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_CSS = `
@media(max-width:540px) and (orientation:portrait){
[data-battle-janken-slidepad="1"]{right:max(12px,env(safe-area-inset-right))!important;bottom:max(12px,env(safe-area-inset-bottom))!important}
section[data-screen="battle"] [data-battle-playable-hand-row-roulette-live="1"]{right:176px!important;left:auto!important;bottom:max(12px,env(safe-area-inset-bottom))!important;max-width:min(164px,42vw)!important;transform-origin:right bottom!important}
}
`;

export function installBattleJankenPortraitLiveOverride(documentRef = globalThis.document) {
  if (!documentRef || typeof documentRef.createElement !== 'function') return null;
  const existing = documentRef.getElementById?.(BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID);
  if (existing) return existing;
  const style = documentRef.createElement('style');
  style.id = BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID;
  style.textContent = BATTLE_JANKEN_PORTRAIT_LIVE_OVERRIDE_CSS;
  documentRef.head?.appendChild?.(style);
  return style;
}

if (typeof globalThis !== 'undefined' && globalThis.document) {
  installBattleJankenPortraitLiveOverride(globalThis.document);
}
