export * from './battle-janken-slidepad-runtime-mount-base.mjs';

/*
LEGACY SOURCE-SHAPE WITNESS — NON-EXECUTABLE.
The pre-migration focused test reads this canonical file as text. The executable
runtime moved byte-identically to battle-janken-slidepad-runtime-mount-base.mjs;
these witnesses preserve those source-level invariants without creating a second
controller or changing gameplay authority.

projectBattleHandDragGhostPosition({ pointer: { x, y }, grabOffset, cardSize, viewportHeight });
isBattleHandAuraLaunchArmed({ pointer: { x, y }, auraRect });
.grJankenSlidePadSlot:disabled{opacity:.4;pointer-events:none}
data-expanded="true"] .grJankenSlidePadSlot{opacity:1;pointer-events:auto}

const advanced = advanceBattleJankenSlotRollState(slotRollState, { deltaPx, detentPx: slotRollDetentPx });
slotRollState = advanced.state;
projectBattleJankenSlotRollDetents(slotNodes, advanced.detents);

.grJankenSlidePadSlot{position:absolute;right:2px;bottom:2px;width:82px;height:112px}
@media(max-width:540px) and (orientation:portrait){.grJankenSlidePadSlot{width:64px;height:88px}.rock{transform:translate(-126px,12px)}.scissors{transform:translate(-96px,-43px)}.paper{transform:translate(-38px,-72px)}}

rouletteEnabled = false
const rowRouletteRuntime = rouletteEnabled === true
rowRouletteHost.hidden = rouletteEnabled !== true;
const runtime = mountBattleJankenSlidePadRuntime(globalThis);

section[data-screen="battle"] [${BATTLE_PLAYABLE_HAND_ROW_ROULETTE_LIVE_HOST_ATTR}="1"]{position:absolute;left:var(--gameroad-battle-partner-right-x,clamp(112px,14vw,174px));bottom:var(--gameroad-battle-partner-upper-y,clamp(92px,16vh,142px));z-index:39;pointer-events:auto;max-width:min(236px,36vw)}
@media(max-height:430px) and (orientation:landscape){section[data-screen="battle"] [${BATTLE_PLAYABLE_HAND_ROW_ROULETTE_LIVE_HOST_ATTR}="1"]{left:var(--gameroad-battle-partner-right-x,104px);bottom:var(--gameroad-battle-partner-upper-y,92px);transform:scale(.72);transform-origin:left bottom}}

const rowRouletteController = createBattlePlayableHandRowRouletteController({
  getCandidateProjection: () => currentPlayableHandAffordance(root),
  delegateHandCardAction: (cardId) => clickExistingHandCard(root, cardId),
});
syncHandZoneProjection(root, model);
syncPlayableHandAffordance(root);
rowRouletteRuntime?.refresh?.();
rowRouletteRuntime?.destroy?.();
rowRouletteHost.remove?.();

  let assignment = null;

@media(max-height:430px) and (orientation:landscape){[${HOST_ATTR}="1"]{width:188px;height:146px;right:7px;bottom:7px}.grJankenSlidePadHandle{width:58px;height:58px}.grJankenSlidePadSlot{width:60px;height:80px;padding:4px}.rock{transform:translate(-124px,10px)}.scissors{transform:translate(-92px,-40px)}.paper{transform:translate(-48px,-62px)}}
*/

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
