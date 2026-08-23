import {
  KIMODO_BVH_OUTPUT_PROBE_SCHEMA,
} from './kimodo-bvh-output-probe.mjs';

export const MOTION_ARTIFACT_SCHEMA = 'gameroad.motion-artifact.v1';
export const MOTION_ARTIFACT_EVALUATION_SCHEMA = 'gameroad.motion-artifact-evaluation.v1';

const EVIDENCE_STATES = new Set(['PASS', 'FAIL', 'UNRUN', 'NOT_APPLICABLE']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function evidenceState(value) {
  return EVIDENCE_STATES.has(value) ? value : 'UNRUN';
}

function normalizeEvidence(evidence = {}) {
  return {
    retarget: evidenceState(evidence.retarget),
    runtimeReplay: evidenceState(evidence.runtimeReplay),
    humanAcceptance: evidenceState(evidence.humanAcceptance),
  };
}

function normalizeProvenance(provenance = {}) {
  return {
    repo: text(provenance.repo),
    commit: text(provenance.commit),
    path: text(provenance.path),
    blobSha: text(provenance.blobSha),
  };
}

export function createMotionArtifact({
  artifactId,
  executor,
  intent,
  representation,
  frames,
  fps,
  temporalSpanSeconds,
  rootTravel,
  activityMean,
  loopSeamDelta = null,
  presentationOnly = true,
  deterministicMeasurements = false,
  provenance = {},
  evidence = {},
} = {}) {
  return deepFreeze({
    schema: MOTION_ARTIFACT_SCHEMA,
    artifactId: text(artifactId),
    executor: text(executor),
    intent: text(intent),
    representation: text(representation),
    temporal: {
      frames: Number.isInteger(frames) ? frames : frames,
      fps: finite(fps),
      temporalSpanSeconds: finite(temporalSpanSeconds),
    },
    kinematics: {
      rootTravel: finite(rootTravel),
      activityMean: finite(activityMean),
      loopSeamDelta: loopSeamDelta == null ? null : finite(loopSeamDelta),
    },
    provenance: normalizeProvenance(provenance),
    evidence: normalizeEvidence(evidence),
    deterministicMeasurements: deterministicMeasurements === true,
    presentationOnly: presentationOnly === true,
  });
}

export function createMotionArtifactFromKimodoBvhProbe(probe, metadata = {}) {
  if (!probe || probe.schema !== KIMODO_BVH_OUTPUT_PROBE_SCHEMA) {
    throw new Error('KIMODO_BVH_PROBE_REQUIRED');
  }
  return createMotionArtifact({
    artifactId: metadata.artifactId,
    executor: metadata.executor || 'kimodo',
    intent: metadata.intent,
    representation: 'bvh',
    frames: probe.frames,
    fps: probe.fps,
    temporalSpanSeconds: probe.temporalSpanSeconds,
    rootTravel: probe.rootDisplacementUnits,
    activityMean: probe.meanAbsoluteChannelDelta,
    loopSeamDelta: metadata.loopSeamDelta ?? null,
    presentationOnly: probe.presentationOnly,
    deterministicMeasurements: probe.deterministic,
    provenance: probe.source,
    evidence: metadata.evidence,
  });
}

function gate(name, status, reasons = []) {
  return deepFreeze({name, status, reasons: [...reasons]});
}

function identityGate(artifact) {
  const reasons = [];
  if (artifact?.schema !== MOTION_ARTIFACT_SCHEMA) reasons.push('SCHEMA_INVALID');
  if (!text(artifact?.artifactId)) reasons.push('ARTIFACT_ID_REQUIRED');
  if (!text(artifact?.executor)) reasons.push('EXECUTOR_REQUIRED');
  if (!text(artifact?.intent)) reasons.push('INTENT_REQUIRED');
  if (!text(artifact?.representation)) reasons.push('REPRESENTATION_REQUIRED');
  const provenance = artifact?.provenance ?? {};
  if (!text(provenance.repo)) reasons.push('PROVENANCE_REPO_REQUIRED');
  if (!text(provenance.commit)) reasons.push('PROVENANCE_COMMIT_REQUIRED');
  if (!text(provenance.path)) reasons.push('PROVENANCE_PATH_REQUIRED');
  return gate('identity_provenance', reasons.length === 0 ? 'PASS' : 'FAIL', reasons);
}

function temporalGate(artifact, {minFrames, minFps, maxFps}) {
  const reasons = [];
  const frames = artifact?.temporal?.frames;
  const fps = artifact?.temporal?.fps;
  const span = artifact?.temporal?.temporalSpanSeconds;
  if (!Number.isInteger(frames) || frames < minFrames) reasons.push('FRAME_COUNT_BELOW_MINIMUM');
  if (!Number.isFinite(fps) || fps < minFps || fps > maxFps) reasons.push('FPS_OUT_OF_RANGE');
  if (!Number.isFinite(span) || span < 0) reasons.push('TEMPORAL_SPAN_INVALID');
  if (Number.isInteger(frames) && Number.isFinite(fps) && fps > 0 && Number.isFinite(span)) {
    const expected = Math.max(0, frames - 1) / fps;
    const tolerance = Math.max(1e-6, 1 / fps / 1000);
    if (Math.abs(span - expected) > tolerance) reasons.push('TEMPORAL_SPAN_INCONSISTENT');
  }
  return gate('temporal_integrity', reasons.length === 0 ? 'PASS' : 'FAIL', reasons);
}

function motionGate(artifact, {requireMotion, activityEpsilon}) {
  if (!requireMotion) return gate('motion_present', 'NOT_APPLICABLE');
  const activity = artifact?.kinematics?.activityMean;
  const rootTravel = artifact?.kinematics?.rootTravel;
  if (!Number.isFinite(activity) || activity < 0 || !Number.isFinite(rootTravel) || rootTravel < 0) {
    return gate('motion_present', 'FAIL', ['KINEMATIC_MEASUREMENTS_INVALID']);
  }
  if (activity <= activityEpsilon && rootTravel <= activityEpsilon) {
    return gate('motion_present', 'FAIL', ['MOTION_EFFECTIVELY_STATIC']);
  }
  return gate('motion_present', 'PASS');
}

function loopGate(artifact, {requireLoop, maxLoopSeamDelta}) {
  if (!requireLoop) return gate('loop_continuity', 'NOT_APPLICABLE');
  const seam = artifact?.kinematics?.loopSeamDelta;
  if (seam == null) return gate('loop_continuity', 'BLOCKED', ['LOOP_SEAM_EVIDENCE_UNRUN']);
  if (!Number.isFinite(seam) || seam < 0) return gate('loop_continuity', 'FAIL', ['LOOP_SEAM_INVALID']);
  if (seam > maxLoopSeamDelta) return gate('loop_continuity', 'FAIL', ['LOOP_SEAM_ABOVE_LIMIT']);
  return gate('loop_continuity', 'PASS');
}

function evidenceGate(name, state, required) {
  if (!required) return gate(name, 'NOT_APPLICABLE');
  if (state === 'PASS') return gate(name, 'PASS');
  if (state === 'FAIL') return gate(name, 'FAIL', [`${name.toUpperCase()}_FAILED`]);
  return gate(name, 'BLOCKED', [`${name.toUpperCase()}_UNRUN`]);
}

export function evaluateMotionArtifact(artifact, profile = {}) {
  const config = {
    minFrames: Number.isInteger(profile.minFrames) && profile.minFrames > 0 ? profile.minFrames : 2,
    minFps: Number.isFinite(profile.minFps) && profile.minFps > 0 ? profile.minFps : 1,
    maxFps: Number.isFinite(profile.maxFps) && profile.maxFps > 0 ? profile.maxFps : 240,
    requireMotion: profile.requireMotion !== false,
    activityEpsilon: Number.isFinite(profile.activityEpsilon) && profile.activityEpsilon >= 0
      ? profile.activityEpsilon
      : 1e-9,
    requireLoop: profile.requireLoop === true,
    maxLoopSeamDelta: Number.isFinite(profile.maxLoopSeamDelta) && profile.maxLoopSeamDelta >= 0
      ? profile.maxLoopSeamDelta
      : 0.05,
    requireRetarget: profile.requireRetarget !== false,
    requireRuntimeReplay: profile.requireRuntimeReplay !== false,
    requireHumanAcceptance: profile.requireHumanAcceptance !== false,
  };

  const gates = [
    identityGate(artifact),
    temporalGate(artifact, config),
    motionGate(artifact, config),
    loopGate(artifact, config),
    evidenceGate('retarget', artifact?.evidence?.retarget, config.requireRetarget),
    evidenceGate('runtime_replay', artifact?.evidence?.runtimeReplay, config.requireRuntimeReplay),
    evidenceGate('human_acceptance', artifact?.evidence?.humanAcceptance, config.requireHumanAcceptance),
  ];

  if (artifact?.presentationOnly !== true) gates.push(gate('presentation_only', 'FAIL', ['PRESENTATION_ONLY_REQUIRED']));
  else gates.push(gate('presentation_only', 'PASS'));
  if (artifact?.deterministicMeasurements !== true) gates.push(gate('deterministic_measurements', 'FAIL', ['DETERMINISTIC_MEASUREMENTS_REQUIRED']));
  else gates.push(gate('deterministic_measurements', 'PASS'));

  const hardFailures = gates.filter((entry) => entry.status === 'FAIL');
  const blockers = gates.filter((entry) => entry.status === 'BLOCKED');
  const structuralNames = new Set(['identity_provenance', 'temporal_integrity', 'motion_present', 'loop_continuity', 'presentation_only', 'deterministic_measurements']);
  const structuralGates = gates.filter((entry) => structuralNames.has(entry.name));
  const structuralStatus = structuralGates.some((entry) => entry.status === 'FAIL')
    ? 'FAIL'
    : structuralGates.some((entry) => entry.status === 'BLOCKED')
      ? 'BLOCKED'
      : 'PASS';
  const productEvidenceReady = artifact?.evidence?.retarget === 'PASS'
    && artifact?.evidence?.runtimeReplay === 'PASS'
    && artifact?.evidence?.humanAcceptance === 'PASS';
  const productStatus = structuralStatus === 'PASS' && productEvidenceReady
    ? 'READY_FOR_FORMAL_ACCEPTANCE'
    : 'NOT_READY';

  return deepFreeze({
    schema: MOTION_ARTIFACT_EVALUATION_SCHEMA,
    artifactId: text(artifact?.artifactId),
    executor: text(artifact?.executor),
    intent: text(artifact?.intent),
    structuralStatus,
    productStatus,
    gates,
    failureReasons: hardFailures.flatMap((entry) => entry.reasons),
    blockerReasons: blockers.flatMap((entry) => entry.reasons),
    productProgressCredit: 0,
    gameProgressCredit: 0,
  });
}
