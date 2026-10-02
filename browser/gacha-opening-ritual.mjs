export const GACHA_ARCADE_CABINET_STATE = Object.freeze({
  BLUE: 'blue',
  GOLD: 'gold',
  RAINBOW: 'rainbow',
});

export const GACHA_ARCADE_CABINET_ID = 'gachaArcadeCabinetR2';
const GACHA_ARCADE_STYLE_ID = 'gameroad-gacha-arcade-ritual-r2-style';

const RARITY_LEVEL = Object.freeze({
  common: 0,
  rare: 1,
  sr: 2,
  ultimate: 3,
  ticket: 4,
});

export function gachaRarityOf(item) {
  if (item?.ticket === true) return 'ticket';
  const raw = String(item?.rarity ?? '').trim().toLowerCase();
  return Object.hasOwn(RARITY_LEVEL, raw) ? raw : 'common';
}

export function gachaRarityLevel(itemOrRarity) {
  const rarity = typeof itemOrRarity === 'string'
    ? String(itemOrRarity).trim().toLowerCase()
    : gachaRarityOf(itemOrRarity);
  return RARITY_LEVEL[rarity] ?? 0;
}

function cabinetStateForLevel(level) {
  if (level >= RARITY_LEVEL.ultimate) return GACHA_ARCADE_CABINET_STATE.RAINBOW;
  if (level >= RARITY_LEVEL.sr) return GACHA_ARCADE_CABINET_STATE.GOLD;
  return GACHA_ARCADE_CABINET_STATE.BLUE;
}

export function planGachaArcadeRitual(resultBundle, {reducedMotion = false, lowPerf = false} = {}) {
  if (!Array.isArray(resultBundle) || resultBundle.length === 0) {
    throw new Error('resultBundle must be a non-empty ordered array');
  }

  const rarities = resultBundle.map(gachaRarityOf);
  let peakIndex = 0;
  for (let index = 1; index < rarities.length; index += 1) {
    if (gachaRarityLevel(rarities[index]) > gachaRarityLevel(rarities[peakIndex])) peakIndex = index;
  }

  const peakRarity = rarities[peakIndex];
  const peakLevel = gachaRarityLevel(peakRarity);
  const motionMode = reducedMotion ? 'still' : lowPerf ? 'short_fade' : 'interactive';
  const stagedIndices = motionMode === 'interactive'
    ? Object.freeze(
      rarities
        .map((rarity, index) => gachaRarityLevel(rarity) >= RARITY_LEVEL.sr ? index : -1)
        .filter((index) => index >= 0),
    )
    : Object.freeze([]);

  return Object.freeze({
    resultCount: resultBundle.length,
    peakRarity,
    peakIndex,
    cabinetState: cabinetStateForLevel(peakLevel),
    motionMode,
    interactionSteps: motionMode === 'interactive' ? 4 : 0,
    stagedIndices,
  });
}

function appendPresentationStyle(documentSource) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return null;
  const existing = documentSource.getElementById?.(GACHA_ARCADE_STYLE_ID);
  if (existing) return existing;

  const style = documentSource.createElement('style');
  style.id = GACHA_ARCADE_STYLE_ID;
  style.textContent = [
    '.gachaStage.grGachaArcadeStage{position:relative;isolation:isolate;overflow:hidden}',
    '.grGachaArcadeCabinet{--gr-gacha-accent:#5dc8ff;position:absolute;inset:2% 3%;z-index:0;pointer-events:none;border:2px solid color-mix(in srgb,var(--gr-gacha-accent) 68%,transparent);border-radius:22px 22px 34px 34px;box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 0 28px color-mix(in srgb,var(--gr-gacha-accent) 22%,transparent) inset}',
    '.gachaStage[data-gacha-cabinet-state="gold"] .grGachaArcadeCabinet{--gr-gacha-accent:#ffd36c}',
    '.gachaStage[data-gacha-cabinet-state="rainbow"] .grGachaArcadeCabinet{--gr-gacha-accent:#f8a7ff}',
    '.grGachaArcadeMarquee{position:absolute;left:12%;right:12%;top:3%;height:9%;border:1px solid var(--gr-gacha-accent);border-radius:12px;background:linear-gradient(180deg,color-mix(in srgb,var(--gr-gacha-accent) 26%,#08111a),rgba(4,11,18,.8));box-shadow:0 0 18px color-mix(in srgb,var(--gr-gacha-accent) 25%,transparent)}',
    '.grGachaArcadeCoin{position:absolute;right:7%;top:42%;width:18px;height:34px;border:2px solid var(--gr-gacha-accent);border-radius:7px;box-shadow:0 0 12px color-mix(in srgb,var(--gr-gacha-accent) 35%,transparent)}',
    '.grGachaArcadeChute{position:absolute;left:31%;right:31%;bottom:4%;height:12%;border:2px solid var(--gr-gacha-accent);border-radius:6px 6px 18px 18px;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.38))}',
    '.grGachaArcadeRail{position:absolute;left:8%;right:8%;bottom:18%;height:2px;background:linear-gradient(90deg,transparent,var(--gr-gacha-accent),transparent);opacity:.72}',
    '@media(prefers-reduced-motion:reduce){.grGachaArcadeCabinet{transition:none!important}}',
  ].join('');
  documentSource.head.appendChild?.(style);
  return style;
}

function appendCabinetPiece(documentSource, cabinet, className) {
  const piece = documentSource.createElement('span');
  piece.className = className;
  piece.setAttribute?.('aria-hidden', 'true');
  cabinet.appendChild?.(piece);
}

export function ensureGachaArcadeCabinet(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.getElementById !== 'function' || typeof documentSource.createElement !== 'function') return null;
  const screen = documentSource.getElementById('gachaScreen');
  if (!screen) return null;
  const stage = screen.querySelector?.('.gachaStage') ?? documentSource.querySelector?.('.gachaStage') ?? null;
  if (!stage) return null;

  const existing = documentSource.getElementById(GACHA_ARCADE_CABINET_ID);
  if (existing) return existing;

  appendPresentationStyle(documentSource);
  stage.classList?.add('grGachaArcadeStage');
  stage.setAttribute?.('data-gacha-cabinet-state', 'idle');
  stage.setAttribute?.('data-gacha-presentation-only', 'true');

  const cabinet = documentSource.createElement('div');
  cabinet.id = GACHA_ARCADE_CABINET_ID;
  cabinet.className = 'grGachaArcadeCabinet';
  cabinet.setAttribute?.('aria-hidden', 'true');
  cabinet.setAttribute?.('data-presentation-only', 'true');
  appendCabinetPiece(documentSource, cabinet, 'grGachaArcadeMarquee');
  appendCabinetPiece(documentSource, cabinet, 'grGachaArcadeCoin');
  appendCabinetPiece(documentSource, cabinet, 'grGachaArcadeChute');
  appendCabinetPiece(documentSource, cabinet, 'grGachaArcadeRail');
  stage.prepend?.(cabinet);
  return cabinet;
}

export function applyGachaArcadeRitualPlan(stage, resultBundle, options = {}) {
  if (!stage || typeof stage.setAttribute !== 'function') throw new Error('stage element is required');
  const plan = planGachaArcadeRitual(resultBundle, options);
  stage.setAttribute('data-gacha-cabinet-state', plan.cabinetState);
  stage.setAttribute('data-gacha-result-count', String(plan.resultCount));
  stage.setAttribute('data-gacha-motion-mode', plan.motionMode);
  return plan;
}

export function markGachaArcadeResultPresentation(root, resultBundle, options = {}) {
  if (!root || !root.children) throw new Error('result root element is required');
  const plan = planGachaArcadeRitual(resultBundle, options);
  const cards = Array.from(root.children);
  if (cards.length < resultBundle.length) {
    throw new Error('result root does not contain enough presentation cards');
  }

  const staged = new Set(plan.stagedIndices);
  for (let index = 0; index < resultBundle.length; index += 1) {
    const card = cards[index];
    if (typeof card?.setAttribute !== 'function') throw new Error('result card element is required');
    card.setAttribute('data-gacha-result-order', String(index + 1));
    card.setAttribute('data-gacha-staged', staged.has(index) ? 'true' : 'false');
  }
  root.setAttribute?.('data-gacha-presentation-state', staged.size > 0 ? 'staged' : 'settled');
  return Object.freeze({plan, markedCount: resultBundle.length});
}

export function settleGachaArcadeResultPresentation(root) {
  if (!root || !root.children) throw new Error('result root element is required');
  const cards = Array.from(root.children);
  for (const card of cards) card?.setAttribute?.('data-gacha-staged', 'false');
  root.setAttribute?.('data-gacha-presentation-state', 'settled');
  return Object.freeze({settledCount: cards.length});
}
