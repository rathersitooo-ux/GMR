export * from './battle-screen-runtime-mount-base.mjs';

export const BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID = 'gameroad-battle-screen-portrait-live-r5-style';

export const BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_CSS = `
@media(max-width:540px) and (orientation:portrait){
[data-gr-battle-screen="1"] .grBattleScreenTop{height:56px!important;padding:4px 6px!important;gap:4px!important}
[data-gr-battle-screen="1"] [data-battle-current-action]{top:auto!important;bottom:248px!important;left:8px!important;right:8px!important;transform:none!important;max-width:none!important;min-height:44px!important;display:flex!important;align-items:center!important;justify-content:center!important;white-space:normal!important;padding:6px 9px!important}
[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{top:56px!important;right:8px!important;bottom:auto!important;left:8px!important;height:52px!important;gap:4px!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;grid-template-rows:minmax(0,1fr)!important}
[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]::before{display:none!important}
[data-gr-battle-screen="1"] [data-battle-screen-lane]{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto!important;column-gap:0!important;row-gap:1px!important;padding:3px!important;transform:none!important;min-height:0!important}
[data-gr-battle-screen="1"] .grBattleLaneIdentity{grid-column:1!important;grid-row:1!important}
[data-gr-battle-screen="1"] .grBattleLaneRole,[data-gr-battle-screen="1"] .grBattleLaneAfterstate{display:none!important}
[data-gr-battle-screen="1"] #battleResolution{left:8px!important;right:8px!important;bottom:12px!important;transform:none!important;max-width:none!important}
[data-gr-battle-screen="1"] [data-battle-progress-guide]{display:none!important}
}
`;

export function installBattleScreenPortraitLiveOverride(documentRef = globalThis.document) {
  if (!documentRef || typeof documentRef.createElement !== 'function') return null;
  const existing = documentRef.getElementById?.(BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID);
  if (existing) return existing;
  const style = documentRef.createElement('style');
  style.id = BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_STYLE_ID;
  style.textContent = BATTLE_SCREEN_PORTRAIT_LIVE_OVERRIDE_CSS;
  documentRef.head?.appendChild?.(style);
  return style;
}

if (typeof globalThis !== 'undefined' && globalThis.document) {
  installBattleScreenPortraitLiveOverride(globalThis.document);
}
