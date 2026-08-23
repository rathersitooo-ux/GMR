export const TRANSITION_PHASES = Object.freeze([
  "IDLE",
  "PREPARE",
  "EXIT",
  "SWAP",
  "ENTER",
  "SETTLE",
]);

const ACTIVE_PHASES = Object.freeze([
  "PREPARE",
  "EXIT",
  "SWAP",
  "ENTER",
  "SETTLE",
]);

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function cloneRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

function edgeKey(from, to, cause) {
  return `${from}\u0000${to}\u0000${cause}`;
}

export function createModeEndpointGraph({ endpoints = [], edges = [] } = {}) {
  const endpointById = new Map();
  for (const endpoint of endpoints) {
    const id = requireNonEmptyString(endpoint?.id, "endpoint.id");
    if (endpointById.has(id)) {
      throw new Error(`duplicate endpoint: ${id}`);
    }
    endpointById.set(id, Object.freeze({ ...endpoint, id }));
  }

  const edgeByKey = new Map();
  for (const edge of edges) {
    const from = requireNonEmptyString(edge?.from, "edge.from");
    const to = requireNonEmptyString(edge?.to, "edge.to");
    const cause = edge?.cause ? requireNonEmptyString(edge.cause, "edge.cause") : "*";
    if (!endpointById.has(from) || !endpointById.has(to)) {
      throw new Error(`edge references unknown endpoint: ${from} -> ${to}`);
    }
    const key = edgeKey(from, to, cause);
    if (edgeByKey.has(key)) {
      throw new Error(`duplicate edge: ${from} -> ${to} (${cause})`);
    }
    edgeByKey.set(key, Object.freeze({ ...edge, from, to, cause }));
  }

  return Object.freeze({
    getEndpoint(id) {
      return endpointById.get(id) ?? null;
    },
    resolveEdge(from, to, cause = "forward") {
      return (
        edgeByKey.get(edgeKey(from, to, cause)) ??
        edgeByKey.get(edgeKey(from, to, "*")) ??
        null
      );
    },
  });
}

export function planModeTransition(
  graph,
  {
    from,
    to,
    cause = "forward",
    reducedMotion = false,
    lowPerf = false,
    generatedMedia = true,
  } = {},
) {
  requireNonEmptyString(from, "from");
  requireNonEmptyString(to, "to");
  requireNonEmptyString(cause, "cause");

  const fromEndpoint = graph?.getEndpoint?.(from);
  const toEndpoint = graph?.getEndpoint?.(to);
  if (!fromEndpoint || !toEndpoint) {
    throw new Error(`unknown transition endpoint: ${from} -> ${to}`);
  }

  const edge = graph.resolveEdge(from, to, cause) ?? Object.freeze({ from, to, cause });
  const sourceCamera = cloneRecord(edge.camera);
  const sourceRig = cloneRecord(edge.rig);
  const sourceUi = cloneRecord(edge.ui);
  const sourceMedia = cloneRecord(edge.media);
  const suppressGenerated = reducedMotion || lowPerf || generatedMedia === false;

  const profile = reducedMotion ? "reduced-motion" : lowPerf ? "low-perf" : "full";
  const camera = Object.freeze({
    ...sourceCamera,
    mode: reducedMotion ? "cut-or-short-blend" : lowPerf ? "lite" : sourceCamera.mode ?? "path",
  });
  const rig = Object.freeze({
    ...sourceRig,
    mode: reducedMotion ? "pose-blend" : lowPerf ? "lite" : sourceRig.mode ?? "full",
  });
  const ui = Object.freeze({
    ...sourceUi,
    mode: reducedMotion ? "short" : sourceUi.mode ?? "choreographed",
  });
  const media = Object.freeze({
    ...sourceMedia,
    generatedClip: suppressGenerated ? null : sourceMedia.generatedClip ?? null,
  });

  return Object.freeze({
    from,
    to,
    cause,
    profile,
    fromEndpoint,
    toEndpoint,
    camera,
    rig,
    ui,
    media,
  });
}

function snapshotOf({ generation, phase, active }) {
  return Object.freeze({
    generation,
    phase,
    active,
    from: active?.from ?? null,
    to: active?.to ?? null,
    cause: active?.cause ?? null,
  });
}

export function createTransitionDirector() {
  let generation = 0;
  let phase = "IDLE";
  let active = null;

  function snapshot() {
    return snapshotOf({ generation, phase, active });
  }

  function begin(plan) {
    requireNonEmptyString(plan?.from, "plan.from");
    requireNonEmptyString(plan?.to, "plan.to");
    requireNonEmptyString(plan?.cause ?? "forward", "plan.cause");

    generation += 1;
    phase = "PREPARE";
    active = Object.freeze({ ...plan, generation });
    return snapshot();
  }

  function advance(expectedGeneration) {
    if (expectedGeneration !== generation) {
      return Object.freeze({ accepted: false, reason: "stale-generation", state: snapshot() });
    }
    if (!active || phase === "IDLE") {
      return Object.freeze({ accepted: false, reason: "no-active-transition", state: snapshot() });
    }

    const index = ACTIVE_PHASES.indexOf(phase);
    if (index < 0) {
      throw new Error(`invalid transition phase: ${phase}`);
    }

    if (index === ACTIVE_PHASES.length - 1) {
      phase = "IDLE";
      active = null;
    } else {
      phase = ACTIVE_PHASES[index + 1];
    }

    return Object.freeze({ accepted: true, reason: null, state: snapshot() });
  }

  function interrupt(nextPlan) {
    return begin(nextPlan);
  }

  function cancel(reason = "cancel") {
    const cancelledGeneration = generation;
    generation += 1;
    phase = "IDLE";
    active = null;
    return Object.freeze({
      accepted: true,
      reason,
      cancelledGeneration,
      state: snapshot(),
    });
  }

  return Object.freeze({ begin, advance, interrupt, cancel, snapshot });
}
