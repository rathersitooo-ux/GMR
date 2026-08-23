import test from 'node:test';
import assert from 'node:assert/strict';
import {probeKimodoBvh} from '../tools/kimodo-bvh-output-probe.mjs';
import {
  MOTION_ARTIFACT_SCHEMA,
  MOTION_ARTIFACT_EVALUATION_SCHEMA,
  createMotionArtifact,
  createMotionArtifactFromKimodoBvhProbe,
  evaluateMotionArtifact,
} from '../tools/motion-artifact-evaluator.mjs';

const PROVENANCE = Object.freeze({
  repo: 'localai-org/kimodo.cpp',
  commit: 'example-generation-commit',
  path: 'outputs/idle_breathe.bvh',
  blobSha: 'example-motion-blob',
});

function bvh(rows, frameTime = 1 / 30) {
  return `HIERARCHY
ROOT Root
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
  JOINT Hips
  {
    OFFSET 0 100 0
    CHANNELS 6 Xposition Yposition Zposition Yrotation Xrotation Zrotation
  }
}
MOTION
Frames: ${rows.length}
Frame Time: ${frameTime}
${rows.join('\n')}
`;
}

test('adapts the existing Kimodo BVH probe into a model-agnostic motion artifact without claiming product readiness', () => {
  const probe = probeKimodoBvh(bvh([
    '0 0 0 0 0 0 0 100 0 0 0 0',
    '0.1 0 0 0 1 0 0 100 0 0 0 0',
    '0.2 0 0 0 2 0 0 100 0 0 0 0',
  ]), PROVENANCE);
  const artifact = createMotionArtifactFromKimodoBvhProbe(probe, {
    artifactId: 'kimodo-idle-breathe-001',
    intent: 'idle_breathe',
  });
  const evaluation = evaluateMotionArtifact(artifact);

  assert.equal(artifact.schema, MOTION_ARTIFACT_SCHEMA);
  assert.equal(artifact.executor, 'kimodo');
  assert.equal(artifact.representation, 'bvh');
  assert.equal(evaluation.schema, MOTION_ARTIFACT_EVALUATION_SCHEMA);
  assert.equal(evaluation.structuralStatus, 'PASS');
  assert.equal(evaluation.productStatus, 'NOT_READY');
  assert.deepEqual([...evaluation.blockerReasons].sort(), [
    'HUMAN_ACCEPTANCE_UNRUN',
    'RETARGET_UNRUN',
    'RUNTIME_REPLAY_UNRUN',
  ]);
  assert.equal(evaluation.productProgressCredit, 0);
  assert.equal(evaluation.gameProgressCredit, 0);
});

test('accepts any executor that emits the shared artifact contract', () => {
  const artifact = createMotionArtifact({
    artifactId: 'ardy-short-dance-001',
    executor: 'ardy',
    intent: 'short_dance',
    representation: 'joint-rotations',
    frames: 121,
    fps: 60,
    temporalSpanSeconds: 2,
    rootTravel: 0.4,
    activityMean: 0.12,
    loopSeamDelta: 0.01,
    provenance: {
      repo: 'nv-tlabs/ardy',
      commit: 'candidate-commit',
      path: 'outputs/short-dance.motion',
    },
    deterministicMeasurements: true,
    evidence: {
      retarget: 'PASS',
      runtimeReplay: 'PASS',
      humanAcceptance: 'PASS',
    },
  });
  const evaluation = evaluateMotionArtifact(artifact, {requireLoop: true});
  assert.equal(evaluation.structuralStatus, 'PASS');
  assert.equal(evaluation.productStatus, 'READY_FOR_FORMAL_ACCEPTANCE');
  assert.deepEqual(evaluation.failureReasons, []);
  assert.deepEqual(evaluation.blockerReasons, []);
});

test('fails closed on static motion, inconsistent timing, or non-presentation mutation candidates', () => {
  const artifact = createMotionArtifact({
    artifactId: 'broken-001',
    executor: 'candidate',
    intent: 'short_dance',
    representation: 'joint-rotations',
    frames: 61,
    fps: 30,
    temporalSpanSeconds: 10,
    rootTravel: 0,
    activityMean: 0,
    provenance: {repo: 'example/repo', commit: 'abc', path: 'broken.motion'},
    presentationOnly: false,
  });
  const evaluation = evaluateMotionArtifact(artifact, {
    requireRetarget: false,
    requireRuntimeReplay: false,
    requireHumanAcceptance: false,
  });
  assert.equal(evaluation.structuralStatus, 'FAIL');
  assert.equal(evaluation.productStatus, 'NOT_READY');
  assert.ok(evaluation.failureReasons.includes('TEMPORAL_SPAN_INCONSISTENT'));
  assert.ok(evaluation.failureReasons.includes('MOTION_EFFECTIVELY_STATIC'));
  assert.ok(evaluation.failureReasons.includes('PRESENTATION_ONLY_REQUIRED'));
});

test('represents missing loop evidence as BLOCKED rather than fabricated PASS/FAIL', () => {
  const artifact = createMotionArtifact({
    artifactId: 'loop-candidate-001',
    executor: 'motionbricks',
    intent: 'light_sway',
    representation: 'joint-rotations',
    frames: 31,
    fps: 30,
    temporalSpanSeconds: 1,
    rootTravel: 0.01,
    activityMean: 0.02,
    provenance: {repo: 'nvidia/motionbricks', commit: 'candidate', path: 'out.motion'},
    deterministicMeasurements: true,
  });
  const evaluation = evaluateMotionArtifact(artifact, {
    requireLoop: true,
    requireRetarget: false,
    requireRuntimeReplay: false,
    requireHumanAcceptance: false,
  });
  assert.equal(evaluation.structuralStatus, 'BLOCKED');
  assert.equal(evaluation.productStatus, 'NOT_READY');
  assert.deepEqual(evaluation.blockerReasons, ['LOOP_SEAM_EVIDENCE_UNRUN']);
});

test('provenance is mandatory so cached or generated motion cannot silently lose source identity', () => {
  const artifact = createMotionArtifact({
    artifactId: 'unprovenanced-001',
    executor: 'kimodo',
    intent: 'beat_nod',
    representation: 'bvh',
    frames: 31,
    fps: 30,
    temporalSpanSeconds: 1,
    rootTravel: 0,
    activityMean: 0.01,
  });
  const evaluation = evaluateMotionArtifact(artifact, {
    requireRetarget: false,
    requireRuntimeReplay: false,
    requireHumanAcceptance: false,
  });
  assert.equal(evaluation.structuralStatus, 'FAIL');
  assert.ok(evaluation.failureReasons.includes('PROVENANCE_REPO_REQUIRED'));
  assert.ok(evaluation.failureReasons.includes('PROVENANCE_COMMIT_REQUIRED'));
  assert.ok(evaluation.failureReasons.includes('PROVENANCE_PATH_REQUIRED'));
});
