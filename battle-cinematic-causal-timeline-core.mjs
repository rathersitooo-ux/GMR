const TIMELINE_SCHEMA = 'gameroad.battle-cinematic-causal-timeline.v1';

const PHASE_ORDER = Object.freeze([
  'stance',
  'anticipation',
  'release',
  'impact',
  'reaction',
  'return'
]);

const NORMAL_DURATIONS = Object.freeze({
  attack: Object.freeze({
    stance: 120,
    anticipation: 240,
    release: 190,
    impact: 70,
    reaction: 180,
    return: 220
  }),
  ability: Object.freeze({
    stance: 140,
    anticipation: 300,
    release: 220,
    impact: 90,
    reaction: 200,
    return: 260
  })
});

const PHASE_CUES = Object.freeze({
  stance: Object.freeze({
    source: 'hold',
    vfx: 'hidden',
    target: 'idle',
    environment: 'settled'
  }),
  anticipation: Object.freeze({
    source: 'anticipation',
    vfx: 'hidden',
    target: 'idle',
    environment: 'settled'
  }),
  release: Object.freeze({
    source: 'release',
    vfx: 'travel',
    target: 'braced',
    environment: 'settled'
  }),
  impact: Object.freeze({
    source: 'follow_through',
    vfx: 'impact',
    target: 'braced',
    environment: 'impact'
  }),
  reaction: Object.freeze({
    source: 'follow_through',
    vfx: 'afterglow',
    target: 'reaction',
    environment: 'afterglow'
  }),
  return: Object.freeze({
    source: 'return',
    vfx: 'clear',
    target: 'return',
    environment: 'settled'
  }),
  static: Object.freeze({
    source: 'idle',
    vfx: 'static_cue',
    target: 'idle',
    environment: 'settled'
  })
});

function freezeTimeline(value) {
  for (const entry of value.entries ?? []) Object.freeze(entry);
  Object.freeze(value.entries);
  return Object.freeze(value);
}

function normalizedActionPhase(value) {
  return value === 'ability' ? 'ability' : 'attack';
}

export function createBattleCinematicCausalTimeline({
  actionPhase = 'attack',
  motion = 'cinematic_action'
} = {}) {
  const normalizedPhase = normalizedActionPhase(actionPhase);
  if (motion === 'static_only') {
    return freezeTimeline({
      schema: TIMELINE_SCHEMA,
      mode: 'static',
      actionPhase: normalizedPhase,
      impactPhase: 'static',
      totalDurationMs: 0,
      entries: [{
        phase: 'static',
        atMs: 0,
        durationMs: 0,
        cues: PHASE_CUES.static
      }]
    });
  }

  const durations = NORMAL_DURATIONS[normalizedPhase];
  let atMs = 0;
  const entries = PHASE_ORDER.map((phase) => {
    const durationMs = durations[phase];
    const entry = {
      phase,
      atMs,
      durationMs,
      cues: PHASE_CUES[phase]
    };
    atMs += durationMs;
    return entry;
  });

  return freezeTimeline({
    schema: TIMELINE_SCHEMA,
    mode: 'causal',
    actionPhase: normalizedPhase,
    impactPhase: 'impact',
    totalDurationMs: atMs,
    entries
  });
}

function setTimelinePhase(node, entry, timeline) {
  if (!node?.dataset) return;
  node.dataset.causalPhase = entry.phase;
  node.dataset.causalTimeline = timeline.schema;
  node.dataset.causalActionPhase = timeline.actionPhase;
  node.dataset.causalPhaseAtMs = String(entry.atMs);
}

export function scheduleBattleCinematicCausalTimeline({
  clock,
  nodes = [],
  timeline,
  onPhase = null
} = {}) {
  if (!timeline || timeline.schema !== TIMELINE_SCHEMA || !Array.isArray(timeline.entries) || timeline.entries.length === 0) {
    throw new TypeError('BATTLE_CINEMATIC_TIMELINE_REQUIRED');
  }
  const timerHost = clock && typeof clock.setTimeout === 'function' ? clock : globalThis;
  const activeNodes = nodes.filter(node => node?.dataset);
  const timers = [];

  const apply = (entry) => {
    for (const node of activeNodes) setTimelinePhase(node, entry, timeline);
    if (typeof onPhase === 'function') onPhase(entry, timeline);
  };

  apply(timeline.entries[0]);
  if (timeline.mode !== 'static') {
    for (let index = 1; index < timeline.entries.length; index += 1) {
      const entry = timeline.entries[index];
      timers.push(timerHost.setTimeout(() => apply(entry), entry.atMs));
    }
  }

  return Object.freeze({
    schema: timeline.schema,
    mode: timeline.mode,
    totalDurationMs: timeline.totalDurationMs,
    timers: Object.freeze(timers.slice())
  });
}

export function clearBattleCinematicCausalTimeline(nodes = []) {
  for (const node of nodes) {
    if (!node?.dataset) continue;
    delete node.dataset.causalPhase;
    delete node.dataset.causalTimeline;
    delete node.dataset.causalActionPhase;
    delete node.dataset.causalPhaseAtMs;
  }
}

export const BATTLE_CINEMATIC_CAUSAL_TIMELINE = Object.freeze({
  schema: TIMELINE_SCHEMA,
  authority: 'PRESENTATION_ONLY_NO_GAMEPLAY_RECALCULATION',
  phaseOrder: PHASE_ORDER,
  impactSyncPoint: 'impact',
  exactReferenceTimingAuthority: false,
  sourceReferences: Object.freeze([
    'UIVIS_SRC_142_TACTICAL_SLASH_CAUSAL_SEQUENCE',
    'UIVIS_SRC_151_FE8_ACTUAL_LAYER_AND_EVENT_SEQUENCE'
  ])
});
