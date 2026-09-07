const ELIGIBLE_FIELD_ZONES = new Set([
  'lane',
  'road',
  'battle',
  'active_submission',
  'auto_defense',
  'ability_active_addition',
]);

function asStableKey(entry) {
  const value = entry?.instanceKey ?? entry?.physicalKey ?? entry?.key;
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key ? key : null;
}

function asName(entry) {
  const value = entry?.name ?? entry?.displayName;
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name ? name : null;
}

function asPrintedValue(entry) {
  const value = entry?.printedValue ?? entry?.baseValue ?? entry?.printedPower;
  return Number.isSafeInteger(value) ? value : null;
}

function asZone(entry) {
  const value = entry?.zone ?? entry?.origin;
  return typeof value === 'string' ? value.trim() : '';
}

function isFieldEligible(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.publicNow === false || entry.hidden === true) return false;
  if (entry.fieldEligible === false) return false;

  const zone = asZone(entry);
  if (!zone) return entry.fieldEligible === true;
  return ELIGIBLE_FIELD_ZONES.has(zone);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function normalizeDoppelgangerFieldSnapshot(entries) {
  if (!Array.isArray(entries)) return Object.freeze([]);

  const seen = new Set();
  const normalized = [];

  for (const entry of entries) {
    if (!isFieldEligible(entry)) continue;

    const key = asStableKey(entry);
    const name = asName(entry);
    const printedValue = asPrintedValue(entry);
    if (!key || !name || printedValue === null || seen.has(key)) continue;

    seen.add(key);
    normalized.push(Object.freeze({
      key,
      name,
      printedValue,
      zone: asZone(entry),
      cardId: entry?.cardId ?? null,
      source: entry,
    }));
  }

  return Object.freeze(normalized);
}

/**
 * Resolve the Doppelganger common game rule exactly once for one authoritative
 * whole-field snapshot.
 *
 * Rules owned here:
 * - every eligible field card receives the common-rule result; there is no
 *   card identity, ability-registry, deck-membership, or activation predicate
 * - same-number comparison uses printed/base value
 * - same-number effect activates at 2+ matching cards
 * - same-number count includes the target physical card itself
 * - same-name extra count excludes the target physical card itself
 * - one census pass is shared by all players; no per-player reapplication
 * - no current-value feedback loop
 *
 * This core returns only negative deltas. It does not own generic modifier
 * order, below-zero clamping, destruction, movement legality, battle settlement,
 * or display state.
 */
export function resolveDoppelgangerContinuousOnce(entries) {
  const snapshot = normalizeDoppelgangerFieldSnapshot(entries);
  const numberCounts = new Map();
  const nameCounts = new Map();

  for (const entry of snapshot) {
    numberCounts.set(entry.printedValue, (numberCounts.get(entry.printedValue) || 0) + 1);
    nameCounts.set(entry.name, (nameCounts.get(entry.name) || 0) + 1);
  }

  const deltas = {};
  for (const entry of snapshot) {
    const sameNumberCount = numberCounts.get(entry.printedValue) || 0;
    const sameNameOtherCount = Math.max(0, (nameCounts.get(entry.name) || 0) - 1);
    const active = sameNumberCount >= 2;
    const penalty = active ? sameNumberCount + sameNameOtherCount : 0;

    deltas[entry.key] = Object.freeze({
      key: entry.key,
      cardId: entry.cardId,
      printedValue: entry.printedValue,
      name: entry.name,
      active,
      sameNumberCount,
      sameNameOtherCount,
      penalty,
      delta: penalty === 0 ? 0 : -penalty,
    });
  }

  return deepFreeze({
    schema: 'gameroad.doppelganger-common-rule-resolution.v3',
    evaluationPasses: 1,
    snapshotSize: snapshot.length,
    deltas,
  });
}

export const DOPPELGANGER_ELIGIBLE_FIELD_ZONES = Object.freeze(
  [...ELIGIBLE_FIELD_ZONES],
);
