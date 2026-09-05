const SCHEMA = 'gameroad.gacha-branch-hope-greybox.v1';

const BRANCHES = Object.freeze([
  'quiet_standard',
  'late_upgrade',
  'early_premium',
]);

const UPGRADE_SIGNALS = Object.freeze([
  'low_to_mid',
  'mid_to_high',
  'low_to_high',
]);

const PREMIUM_SIGNALS = Object.freeze([
  'highest_tier',
  'multiple_highest',
  'guaranteed',
  'pickup',
  'new',
]);

const FORBIDDEN_INPUT_KEYS = Object.freeze([
  'resultBundle',
  'results',
  'items',
  'cardId',
  'itemIdentity',
  'highlightSlots',
]);

const UPGRADE_MAP = Object.freeze({
  low_to_mid: Object.freeze({ from: 'low', to: 'mid', fromRank: 0, toRank: 1 }),
  mid_to_high: Object.freeze({ from: 'mid', to: 'high', fromRank: 1, toRank: 2 }),
  low_to_high: Object.freeze({ from: 'low', to: 'high', fromRank: 0, toRank: 2 }),
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizePremiumSignals(value) {
  if (!Array.isArray(value)) throw new Error('premiumSignals must be an array');
  if (value.some(signal => !PREMIUM_SIGNALS.includes(signal))) {
    throw new Error('premiumSignals contains an unsupported or invented signal');
  }
  if (new Set(value).size !== value.length) {
    throw new Error('premiumSignals must be unique');
  }
  return [...value];
}

function validateSignalContract(branch, upgradeSignal, premiumSignals) {
  if (!BRANCHES.includes(branch)) throw new Error(`unsupported gacha branch: ${branch}`);

  if (branch === 'quiet_standard') {
    if (upgradeSignal !== null || premiumSignals.length !== 0) {
      throw new Error('quiet_standard cannot carry upgrade or premium pre-reveal signals');
    }
    return;
  }

  if (branch === 'late_upgrade') {
    if (!UPGRADE_SIGNALS.includes(upgradeSignal)) {
      throw new Error('late_upgrade requires one authoritative upgradeSignal');
    }
    if (premiumSignals.length !== 0) {
      throw new Error('late_upgrade cannot also carry early premium signals');
    }
    return;
  }

  if (upgradeSignal !== null) {
    throw new Error('early_premium cannot also carry a late upgrade signal');
  }
  if (premiumSignals.length === 0) {
    throw new Error('early_premium requires at least one authoritative premium signal');
  }
}

function buildAnticipationCues(branch, upgradeSignal, premiumSignals) {
  const base = [
    Object.freeze({
      id: 'touch_response',
      semantic: 'interaction_registered_only',
      source: 'user_input',
      guaranteesResultTier: false,
    }),
  ];

  if (branch === 'quiet_standard') {
    return Object.freeze([
      ...base,
      Object.freeze({
        id: 'world_omen',
        semantic: 'anticipation_only_no_guarantee',
        source: 'presentation_contract',
        guaranteesResultTier: false,
      }),
    ]);
  }

  if (branch === 'late_upgrade') {
    return Object.freeze([
      ...base,
      Object.freeze({
        id: 'world_omen',
        semantic: 'anticipation_only_no_guarantee',
        source: 'presentation_contract',
        guaranteesResultTier: false,
      }),
      Object.freeze({
        id: 'late_upgrade',
        semantic: upgradeSignal,
        source: 'authoritative_upgrade_signal',
        guaranteesResultTier: true,
      }),
    ]);
  }

  return Object.freeze([
    ...base,
    Object.freeze({
      id: 'early_premium',
      semantic: premiumSignals.join('+'),
      source: 'authoritative_premium_signal',
      guaranteesResultTier: true,
    }),
  ]);
}

function buildAccessibility({ reducedMotion = false, lowPerf = false, soundOff = false } = {}) {
  const reduced = Boolean(reducedMotion);
  const low = Boolean(lowPerf);
  const muted = Boolean(soundOff);

  return Object.freeze({
    reducedMotion: reduced,
    lowPerf: low,
    soundOff: muted,
    motionMode: reduced ? 'still_or_fade' : low ? 'lightweight_motion' : 'full_motion',
    mediaMode: reduced || low ? 'fallback_first' : 'optional_premium_media',
    soundMode: muted ? 'off' : 'supported',
    semanticMeaningPreserved: true,
    audioOnlySemanticsAllowed: false,
    motionOnlySemanticsAllowed: false,
  });
}

function buildUpgrade(branch, upgradeSignal) {
  if (branch !== 'late_upgrade') {
    return Object.freeze({ eventCount: 0, event: null, monotonic: true });
  }

  const mapping = UPGRADE_MAP[upgradeSignal];
  return Object.freeze({
    eventCount: 1,
    event: Object.freeze({ signal: upgradeSignal, from: mapping.from, to: mapping.to }),
    monotonic: mapping.toRank > mapping.fromRank,
  });
}

function buildMulti(pullCount) {
  return Object.freeze({
    pullCount,
    commonRitualRepetitions: 1,
    shellOpeningRepeatedPerResult: false,
    revealMode: pullCount === 1 ? 'single' : 'compressed_with_optional_post_reveal_highlights',
    highlightSource: 'explicit_upstream_after_reveal_only',
    summaryFastPath: 'one_action',
    specialReplayRoute: 'post_summary_optional',
  });
}

export function createGachaBranchHopePlan(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('input must be an object');
  }

  for (const key of FORBIDDEN_INPUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      throw new Error(`${key} is forbidden in branch greybox input`);
    }
  }

  const resultIdentity = requireNonEmptyString(input.resultIdentity, 'resultIdentity');
  const branch = requireNonEmptyString(input.branch, 'branch');
  const variantKey = requireNonEmptyString(input.variantKey ?? 'default', 'variantKey');
  const pullCount = requirePositiveInteger(input.pullCount ?? 1, 'pullCount');
  const upgradeSignal = input.upgradeSignal ?? null;
  const premiumSignals = normalizePremiumSignals(input.premiumSignals ?? []);

  if (upgradeSignal !== null && !UPGRADE_SIGNALS.includes(upgradeSignal)) {
    throw new Error('upgradeSignal must be null or an authoritative supported upgrade signal');
  }

  validateSignalContract(branch, upgradeSignal, premiumSignals);

  const anticipationCues = buildAnticipationCues(branch, upgradeSignal, premiumSignals);
  if (anticipationCues.length < 2 || anticipationCues.length > 3) {
    throw new Error('branch anticipation cue count must stay within 2-3');
  }

  const upgrade = buildUpgrade(branch, upgradeSignal);
  const accessibility = buildAccessibility(input.accessibility);
  const multi = buildMulti(pullCount);

  const semantics = deepFreeze({
    branch,
    cueSemantics: anticipationCues.map(cue => ({
      id: cue.id,
      semantic: cue.semantic,
      source: cue.source,
      guaranteesResultTier: cue.guaranteesResultTier,
    })),
    upgrade: cloneJson(upgrade),
    premiumSignals: branch === 'early_premium' ? [...premiumSignals] : [],
    lossCertainBeforeReveal: false,
    revealHero: 'acquired_card',
    settleMeaning: 'authoritative_result_readable',
    multi: {
      commonRitualRepetitions: multi.commonRitualRepetitions,
      shellOpeningRepeatedPerResult: multi.shellOpeningRepeatedPerResult,
      summaryFastPath: multi.summaryFastPath,
    },
  });

  return deepFreeze({
    schema: SCHEMA,
    proposalOnly: true,
    resultBinding: Object.freeze({
      resultIdentity,
      authoritativeResultAlreadyConfirmed: true,
      resultItemPayloadAccepted: false,
    }),
    branch,
    variantKey,
    stageSequence: Object.freeze(['touch', 'anticipation', 'hush', 'reveal', 'settle']),
    anticipationCues,
    hush: Object.freeze({
      semantic: 'contrast_before_reveal',
      resultSignal: false,
    }),
    reveal: Object.freeze({
      hero: 'acquired_card',
      unrevealedItemIdentityAllowed: false,
    }),
    settle: Object.freeze({
      priority: 'read_authoritative_result',
      nextActionBlockedByPresentation: false,
    }),
    upgrade,
    premium: Object.freeze({
      signals: branch === 'early_premium' ? [...premiumSignals] : [],
      source: branch === 'early_premium' ? 'authoritative_upstream_only' : 'none',
      inventedSignalsAllowed: false,
    }),
    multi,
    accessibility,
    semanticsFingerprint: canonicalJson(semantics),
    invariants: Object.freeze({
      rngMutable: false,
      resultTruthMutable: false,
      resultOrderMutable: false,
      saveMutable: false,
      ownershipMutable: false,
      resultBundleInspectable: false,
      unrevealedItemIdentityExposed: false,
      inventedSignalsAllowed: false,
      earlyWeakCueMeansLoss: false,
      upgradeEventsMax: 1,
      upgradeMonotonic: true,
      skipRecalculatesResult: false,
    }),
  });
}

export const GACHA_BRANCH_HOPE_GREYBOX_SCHEMA = SCHEMA;
export const GACHA_BRANCH_HOPE_BRANCHES = BRANCHES;
export const GACHA_BRANCH_HOPE_UPGRADE_SIGNALS = UPGRADE_SIGNALS;
export const GACHA_BRANCH_HOPE_PREMIUM_SIGNALS = PREMIUM_SIGNALS;
