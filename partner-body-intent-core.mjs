export const PARTNER_BODY_INTENT_SCHEMA = 'gameroad.partner-body-intent.v1';

export const PARTNER_BODY_INTENTS = Object.freeze([
  'idle_breathe',
  'beat_nod',
  'light_sway',
  'clap_once',
  'clap_pattern',
  'hip_sway',
  'smile',
  'whistle_intent',
  'short_dance',
  'interrupt_to_focus',
]);

const BODY_INTENT_SET = new Set(PARTNER_BODY_INTENTS);
const SYNC_MODES = new Set(['none', 'beat', 'downbeat', 'section']);
const MOTION_SCALES = new Set(['none', 'small', 'large', 'unknown']);
const COST_CLASSES = new Set(['low', 'normal', 'high', 'unknown']);
const AUDIENCE_ENERGY = new Set(['neutral', 'positive', 'high']);
const AUDIENCE_KEYS = new Set(['present', 'publicSafe', 'energy']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isFiniteTime(value) {
  return Number.isFinite(value) && value >= 0;
}

function normalizeCapability(entry) {
  if (typeof entry === 'string') {
    const intent = safeText(entry);
    if (!BODY_INTENT_SET.has(intent)) return null;
    return {
      intent,
      ready: true,
      sync: 'none',
      motionScale: 'unknown',
      cost: 'unknown',
    };
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const intent = safeText(entry.intent);
  if (!BODY_INTENT_SET.has(intent) || entry.ready === false) return null;
  const sync = SYNC_MODES.has(entry.sync) ? entry.sync : 'none';
  const motionScale = MOTION_SCALES.has(entry.motionScale) ? entry.motionScale : 'unknown';
  const cost = COST_CLASSES.has(entry.cost) ? entry.cost : 'unknown';
  return {intent, ready: true, sync, motionScale, cost};
}

function normalizeCapabilities(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    const capability = normalizeCapability(entry);
    if (!capability || seen.has(capability.intent)) continue;
    seen.add(capability.intent);
    normalized.push(capability);
  }
  return normalized;
}

function validateAudienceSignal(signal) {
  if (signal == null) return {present: false, publicSafe: true, energy: 'neutral'};
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return null;
  if (Object.keys(signal).some((key) => !AUDIENCE_KEYS.has(key))) return null;
  if (signal.publicSafe !== true) return null;
  const present = signal.present === true;
  const energy = AUDIENCE_ENERGY.has(signal.energy) ? signal.energy : 'neutral';
  return {present, publicSafe: true, energy};
}

function unavailable(reason) {
  return deepFreeze({
    schema: PARTNER_BODY_INTENT_SCHEMA,
    status: 'unavailable',
    reason,
    intent: null,
    beatLocked: false,
    scheduledAtMs: null,
    timingSource: 'none',
    sync: 'none',
    presentationOnly: true,
  });
}

function addCandidate(list, seen, intent) {
  if (!BODY_INTENT_SET.has(intent) || seen.has(intent)) return;
  seen.add(intent);
  list.push(intent);
}

function buildSemanticCandidates({excitement, audienceSignal, musicTimingContext, characterIntentCandidates}) {
  const candidates = [];
  const seen = new Set();
  addCandidate(candidates, seen, 'idle_breathe');

  if (excitement === 'excited') {
    addCandidate(candidates, seen, 'smile');
    addCandidate(candidates, seen, 'light_sway');
  }

  if (audienceSignal.present && audienceSignal.energy !== 'neutral') {
    addCandidate(candidates, seen, 'smile');
    if (audienceSignal.energy === 'high') addCandidate(candidates, seen, 'clap_once');
  }

  if (musicTimingContext && musicTimingContext.mode !== 'none') {
    addCandidate(candidates, seen, 'beat_nod');
    addCandidate(candidates, seen, 'light_sway');
  }

  if (Array.isArray(characterIntentCandidates)) {
    for (const intent of characterIntentCandidates) addCandidate(candidates, seen, safeText(intent));
  }

  return candidates;
}

function applyPresentationConstraints(candidates, capabilityByIntent, {reducedMotion, lowPerf}) {
  return candidates.filter((intent) => {
    const capability = capabilityByIntent.get(intent);
    if (!capability) return false;
    if (reducedMotion === true && !['none', 'small'].includes(capability.motionScale)) return false;
    if (lowPerf === true && capability.cost !== 'low') return false;
    return true;
  });
}

function suppressRecentRepetition(candidates, recentIntentHistory) {
  if (!Array.isArray(recentIntentHistory) || candidates.length < 2) return candidates;
  const recent = new Set(recentIntentHistory.map(safeText).filter((intent) => BODY_INTENT_SET.has(intent)));
  const novel = candidates.filter((intent) => !recent.has(intent));
  return novel.length > 0 ? novel : candidates;
}

function stableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicChoice(candidates, identity, decisionSeed, decisionTimeMs) {
  if (candidates.length === 1) return candidates[0];
  const seed = safeText(decisionSeed);
  if (!seed || !isFiniteTime(decisionTimeMs)) return null;
  const material = `${identity.id}|${identity.version}|${seed}|${decisionTimeMs}|${candidates.join('|')}`;
  return candidates[stableHash(material) % candidates.length];
}

function timingTargetForSync(musicTimingContext, sync) {
  if (!musicTimingContext || sync === 'none') return null;
  if (sync === 'beat') return musicTimingContext.nextBeatAtMs;
  if (sync === 'downbeat') return musicTimingContext.nextDownbeatAtMs;
  if (sync === 'section') return musicTimingContext.nextSectionAtMs;
  return null;
}

function resolveTiming({musicTimingContext, capability, decisionTimeMs}) {
  if (!capability || capability.sync === 'none') {
    return {beatLocked: false, scheduledAtMs: null, timingSource: 'none', sync: 'none'};
  }
  if (!musicTimingContext || typeof musicTimingContext !== 'object' || Array.isArray(musicTimingContext)) {
    return {beatLocked: false, scheduledAtMs: null, timingSource: 'none', sync: capability.sync};
  }

  const target = timingTargetForSync(musicTimingContext, capability.sync);
  if (!isFiniteTime(target) || (isFiniteTime(decisionTimeMs) && target < decisionTimeMs)) {
    return {beatLocked: false, scheduledAtMs: null, timingSource: 'none', sync: capability.sync};
  }

  if (musicTimingContext.mode === 'known' && musicTimingContext.authoritativeTimeline === true) {
    return {beatLocked: true, scheduledAtMs: target, timingSource: 'known', sync: capability.sync};
  }
  if (musicTimingContext.mode === 'estimated' && musicTimingContext.confidenceUsable === true) {
    return {beatLocked: true, scheduledAtMs: target, timingSource: 'estimated', sync: capability.sync};
  }
  return {beatLocked: false, scheduledAtMs: null, timingSource: 'none', sync: capability.sync};
}

function selected(intent, capability, timing, reason) {
  return deepFreeze({
    schema: PARTNER_BODY_INTENT_SCHEMA,
    status: 'selected',
    reason,
    intent,
    beatLocked: timing.beatLocked,
    scheduledAtMs: timing.scheduledAtMs,
    timingSource: timing.timingSource,
    sync: capability.sync,
    presentationOnly: true,
  });
}

export function selectPartnerBodyIntent({
  identity,
  rendererReady,
  availableMotionCapabilities,
  gameIntensity = 'calm',
  criticalGameEvent = false,
  excitement = 'neutral',
  audienceSignal = null,
  musicTimingContext = {mode: 'none'},
  characterIntentCandidates = [],
  recentIntentHistory = [],
  reducedMotion = false,
  lowPerf = false,
  decisionSeed = '',
  decisionTimeMs = 0,
} = {}) {
  const id = safeText(identity?.id);
  const version = safeText(identity?.version);
  if (!id || !version) return unavailable('IDENTITY_OR_VERSION_INVALID');
  if (rendererReady !== true) return unavailable('RENDERER_OR_RIG_UNAVAILABLE');

  const audience = validateAudienceSignal(audienceSignal);
  if (!audience) return unavailable('AUDIENCE_SIGNAL_NOT_PUBLIC_SAFE');

  const capabilities = normalizeCapabilities(availableMotionCapabilities);
  if (capabilities.length === 0) return unavailable('NO_READY_MOTION_CAPABILITY');
  const capabilityByIntent = new Map(capabilities.map((capability) => [capability.intent, capability]));
  const constraintContext = {reducedMotion: reducedMotion === true, lowPerf: lowPerf === true};
  const normalizedIdentity = {id, version};
  const critical = criticalGameEvent === true || gameIntensity === 'critical';

  if (critical) {
    const criticalCandidates = applyPresentationConstraints(
      ['interrupt_to_focus', 'idle_breathe'],
      capabilityByIntent,
      constraintContext,
    );
    const intent = criticalCandidates[0];
    if (!intent) return unavailable('NO_SAFE_FOCUS_FALLBACK');
    const capability = capabilityByIntent.get(intent);
    return selected(
      intent,
      capability,
      {beatLocked: false, scheduledAtMs: null, timingSource: 'none'},
      intent === 'interrupt_to_focus' ? 'CRITICAL_EVENT_INTERRUPT' : 'CRITICAL_EVENT_IDLE_FALLBACK',
    );
  }

  let candidates = buildSemanticCandidates({
    excitement,
    audienceSignal: audience,
    musicTimingContext,
    characterIntentCandidates,
  });
  candidates = applyPresentationConstraints(candidates, capabilityByIntent, constraintContext);
  if (candidates.length === 0) return unavailable('NO_SAFE_PRESENTATION_INTENT');
  candidates = suppressRecentRepetition(candidates, recentIntentHistory);

  const intent = deterministicChoice(candidates, normalizedIdentity, decisionSeed, decisionTimeMs);
  if (!intent) return unavailable('DETERMINISTIC_DECISION_INPUT_REQUIRED');
  const capability = capabilityByIntent.get(intent);
  const timing = resolveTiming({musicTimingContext, capability, decisionTimeMs});
  return selected(intent, capability, timing, 'AUTONOMOUS_SELECTION');
}

export const PARTNER_BODY_INTENT_CORE = Object.freeze({
  schema: PARTNER_BODY_INTENT_SCHEMA,
  intents: PARTNER_BODY_INTENTS,
  select: selectPartnerBodyIntent,
});
