export const BATTLE_ROULETTE_ORECA_PRESENTATION_SCHEMA = 'gameroad.battle-roulette-oreca-presentation.v1';

export const BATTLE_ROULETTE_ORECA_TARGET_SLOT_COUNT = 6;

export const BATTLE_ROULETTE_ORECA_PRESENTATION_TOKENS = Object.freeze({
  targetSlotCount: BATTLE_ROULETTE_ORECA_TARGET_SLOT_COUNT,
  selectedScale: 1.06,
  inactiveOpacity: 0.68,
  tickDurationMs: 96,
  settleDurationMs: 180,
  layout: 'VERTICAL_COMMAND_ROWS',
  selection: 'ONE_STRONG_ROW',
  input: 'PRIMARY_STOP_ACTION',
  brandingPolicy: 'GAMEROAD_ORIGINAL_ONLY',
});

const PHASES = new Set(['IDLE', 'ROLLING', 'STOPPED']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const ids = [];
  const seen = new Set();
  for (const raw of value) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

function readPresentation(source, cardId) {
  let value = null;
  if (source instanceof Map) value = source.get(cardId) ?? null;
  else if (source && typeof source === 'object') value = source[cardId] ?? null;
  value = value && typeof value === 'object' ? value : {};
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : cardId;
  return Object.freeze({
    cardId,
    label,
    shortLabel: typeof value.shortLabel === 'string' && value.shortLabel.trim()
      ? value.shortLabel.trim()
      : label,
    suit: typeof value.suit === 'string' ? value.suit.trim() : '',
    number: value.number ?? null,
    artUrl: typeof value.artUrl === 'string' ? value.artUrl.trim() : '',
  });
}

function normalizePhase(value) {
  return PHASES.has(value) ? value : 'IDLE';
}

export function projectBattlePlayableHandRouletteOrecaPresentation(model, {
  phase = 'IDLE',
  commitPending = false,
} = {}) {
  const candidateCardIds = normalizeIds(model?.candidateCardIds);
  const selectedCardId = typeof model?.selectedCardId === 'string'
    && candidateCardIds.includes(model.selectedCardId.trim())
    ? model.selectedCardId.trim()
    : null;
  const normalizedPhase = normalizePhase(phase);
  const reducedMotion = model?.reducedMotion === true;
  const lowPerf = model?.lowPerf === true;
  const exactSixSlot = candidateCardIds.length === BATTLE_ROULETTE_ORECA_TARGET_SLOT_COUNT;
  const useOrecaInspiredPresentation = exactSixSlot;
  const motionAllowed = !reducedMotion && !lowPerf;

  const rows = candidateCardIds.map((cardId, index) => {
    const presentation = readPresentation(model?.cardPresentationById, cardId);
    const selected = selectedCardId === cardId;
    let motion = 'STATIC';
    if (motionAllowed && normalizedPhase === 'ROLLING') motion = 'REEL_TICK';
    else if (motionAllowed && normalizedPhase === 'STOPPED' && selected) motion = 'STOP_FLASH';
    return Object.freeze({
      slotNumber: index + 1,
      ...presentation,
      selected,
      emphasis: selected ? 'PRIMARY' : 'SECONDARY',
      opacity: selected ? 1 : BATTLE_ROULETTE_ORECA_PRESENTATION_TOKENS.inactiveOpacity,
      scale: selected ? BATTLE_ROULETTE_ORECA_PRESENTATION_TOKENS.selectedScale : 1,
      motion,
    });
  });

  return deepFreeze({
    schema: BATTLE_ROULETTE_ORECA_PRESENTATION_SCHEMA,
    referenceFamily: 'ORECA_COMMAND_ROULETTE_INSPIRED',
    referenceScope: 'PRESENTATION_AND_INPUT_FEEL_ONLY',
    candidateCardIds,
    selectedCardId,
    rows: Object.freeze(rows),
    slotCount: candidateCardIds.length,
    targetSlotCount: BATTLE_ROULETTE_ORECA_TARGET_SLOT_COUNT,
    exactSixSlot,
    mode: useOrecaInspiredPresentation ? 'ORECA_SIX_ROW' : 'EXISTING_RUNTIME_FALLBACK',
    phase: normalizedPhase,
    commitPending: commitPending === true,
    reducedMotion,
    lowPerf,
    motionAllowed,
    interaction: Object.freeze({
      primaryAction: normalizedPhase === 'ROLLING' ? 'STOP' : 'SELECT_OR_COMMIT',
      eyeTimingAdvantage: false,
      randomOutcomeAuthority: false,
      gameplayAuthority: false,
      legalityAuthority: false,
      fillerCardPolicy: 'NEVER',
    }),
    tokens: BATTLE_ROULETTE_ORECA_PRESENTATION_TOKENS,
  });
}

export function canUseBattlePlayableHandRouletteOrecaPresentation(model) {
  return normalizeIds(model?.candidateCardIds).length === BATTLE_ROULETTE_ORECA_TARGET_SLOT_COUNT;
}
