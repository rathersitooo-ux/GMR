function fail(message) {
  throw new TypeError(message);
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function requireToken(token, label) {
  if (typeof token !== 'string' || token.length === 0) fail(`${label} must be a non-empty string`);
  return token;
}

function normalizeConfig({ handOrder, beats, noHand = null } = {}) {
  if (!Array.isArray(handOrder) || handOrder.length !== 3) {
    fail('handOrder must contain exactly three hand tokens');
  }
  const order = handOrder.map((hand) => requireToken(hand, 'hand token'));
  if (new Set(order).size !== 3) fail('handOrder must contain three distinct hand tokens');
  if (noHand !== null) {
    requireToken(noHand, 'noHand');
    if (order.includes(noHand)) fail('noHand must be distinct from active hand tokens');
  }
  if (!beats || typeof beats !== 'object' || Array.isArray(beats)) fail('beats must be an object');

  const handSet = new Set(order);
  const targets = [];
  for (const hand of order) {
    const target = beats[hand];
    if (!handSet.has(target)) fail(`beats must map ${hand} to another active hand token`);
    if (target === hand) fail(`beats must not map ${hand} to itself`);
    targets.push(target);
  }
  if (new Set(targets).size !== 3) fail('beats must define one closed three-hand cycle');

  return { order, handSet, beats, noHand };
}

function normalizeSelections(selections, { handSet, noHand }) {
  if (!Array.isArray(selections)) fail('selections must be an array');
  const seen = new Set();
  return selections.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('selection must be an object');
    const playerId = requireToken(entry.playerId, 'playerId');
    if (seen.has(playerId)) fail(`duplicate playerId: ${playerId}`);
    seen.add(playerId);
    const hand = entry.hand;
    if (hand !== noHand && !handSet.has(hand)) fail(`unsupported triad hand: ${String(hand)}`);
    return { playerId, hand };
  });
}

/**
 * Resolves a complete stateless three-hand cyclic contest. The caller owns
 * commitment/reveal timing and the domain-specific meaning of each hand token.
 */
export function resolveCyclicTriad(selections, config = {}) {
  const safeConfig = normalizeConfig(config);
  const normalized = normalizeSelections(selections, safeConfig);
  const active = normalized.filter((entry) => entry.hand !== safeConfig.noHand);
  const handSet = new Set(active.map((entry) => entry.hand));
  const uniqueHands = safeConfig.order.filter((hand) => handSet.has(hand));

  let winningHand = null;
  if (uniqueHands.length === 1) {
    winningHand = uniqueHands[0];
  } else if (uniqueHands.length === 2) {
    const [a, b] = uniqueHands;
    winningHand = safeConfig.beats[a] === b ? a : b;
  }

  const participants = active.map((entry) => entry.playerId).sort(compareText);
  const nonParticipants = normalized
    .filter((entry) => entry.hand === safeConfig.noHand)
    .map((entry) => entry.playerId)
    .sort(compareText);
  const winners = winningHand === null
    ? []
    : active.filter((entry) => entry.hand === winningHand).map((entry) => entry.playerId).sort(compareText);

  return Object.freeze({
    participants: Object.freeze(participants),
    nonParticipants: Object.freeze(nonParticipants),
    uniqueHands: Object.freeze(uniqueHands),
    winningHand,
    winners: Object.freeze(winners),
  });
}

/**
 * Resolves an already-authoritatively-ordered cyclic triad using the current
 * win-only pass rule.
 *
 * Each still-valid entry gets its pass in the supplied order. During that pass
 * it invalidates only other still-valid entries whose hand it beats. The
 * current entry is never invalidated merely because another still-valid hand
 * beats it; that opposing entry can invalidate it later only if that entry is
 * still valid when its own pass arrives. Invalidated entries never receive a
 * later pass.
 *
 * `orderedSelections` must already be in the authoritative processing order.
 * This resolver deliberately does not invent numeric sorting, equal-value
 * tie-breaking, or any destination for invalidated cards. Those remain owned
 * by the caller/current Battle authority.
 */
export function resolveCyclicTriadByProcessingOrder(orderedSelections, config = {}) {
  const safeConfig = normalizeConfig(config);
  const normalized = normalizeSelections(orderedSelections, safeConfig);
  const active = normalized.filter((entry) => entry.hand !== safeConfig.noHand);
  const nonParticipants = normalized
    .filter((entry) => entry.hand === safeConfig.noHand)
    .map((entry) => entry.playerId)
    .sort(compareText);

  const validIds = new Set(active.map((entry) => entry.playerId));
  const invalidated = [];
  const steps = [];

  for (const entry of active) {
    if (!validIds.has(entry.playerId)) continue;

    const stepInvalidated = [];
    for (const candidate of active) {
      if (candidate.playerId === entry.playerId || !validIds.has(candidate.playerId)) continue;
      if (safeConfig.beats[entry.hand] !== candidate.hand) continue;
      validIds.delete(candidate.playerId);
      invalidated.push(candidate);
      stepInvalidated.push(candidate);
    }

    const stepSurvivors = active.filter((candidate) => validIds.has(candidate.playerId));
    steps.push(Object.freeze({
      processedPlayerId: entry.playerId,
      winningHand: entry.hand,
      invalidated: Object.freeze(stepInvalidated.map((candidate) => candidate.playerId)),
      survivors: Object.freeze(stepSurvivors.map((candidate) => candidate.playerId)),
    }));
  }

  const survivors = active.filter((entry) => validIds.has(entry.playerId));
  return Object.freeze({
    processingOrder: Object.freeze(active.map((entry) => entry.playerId)),
    nonParticipants: Object.freeze(nonParticipants),
    survivingHand: survivors.length === 0 ? null : survivors[0].hand,
    survivors: Object.freeze(survivors.map((entry) => entry.playerId)),
    invalidated: Object.freeze(invalidated.map((entry) => entry.playerId)),
    steps: Object.freeze(steps),
  });
}
