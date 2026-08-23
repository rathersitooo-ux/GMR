import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIMODO_BVH_OUTPUT_PROBE_SCHEMA,
  probeKimodoBvh,
} from '../tools/kimodo-bvh-output-probe.mjs';

const OFFICIAL_REFERENCE_PROVENANCE = Object.freeze({
  repo: 'nv-tlabs/kimodo',
  commit: '1aece8c124d73d255ceff5086d983b844c9f4e94',
  path: 'kimodo/assets/skeletons/somaskel77/somaskel77_standard_tpose.bvh',
  blobSha: '2998cb69ade063fc38d329288de7a14255e46b65',
});

function bvh({frames, frameTime = 1 / 30, rows}) {
  return `HIERARCHY
ROOT Root
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
  JOINT Hips
  {
    OFFSET 0 100 0
    CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
  }
}
MOTION
Frames: ${frames}
Frame Time: ${frameTime}
${rows.join('\n')}
`;
}

test('normalizes Kimodo-compatible BVH temporal structure and preserves exact provenance', () => {
  const fixture = bvh({
    frames: 1,
    frameTime: 0.03333333333333333,
    rows: ['0 0 0 0 0 0 0 100 0 0 0 0'],
  });
  const result = probeKimodoBvh(fixture, OFFICIAL_REFERENCE_PROVENANCE);
  assert.equal(result.schema, KIMODO_BVH_OUTPUT_PROBE_SCHEMA);
  assert.deepEqual(result.source, OFFICIAL_REFERENCE_PROVENANCE);
  assert.equal(result.frames, 1);
  assert.equal(result.fps, 30);
  assert.equal(result.playbackDurationSeconds, 0.033333333);
  assert.equal(result.temporalSpanSeconds, 0);
  assert.equal(result.channelsPerFrame, 12);
  assert.equal(result.rootDisplacementUnits, 0);
  assert.equal(result.meanAbsoluteChannelDelta, 0);
  assert.equal(result.presentationOnly, true);
});

test('measures temporal span and root displacement without changing animation authority', () => {
  const fixture = bvh({
    frames: 3,
    rows: [
      '0 0 0 0 0 0 0 100 0 0 0 0',
      '0.5 0 0 0 0 0 0 100 0 0 0 0',
      '1 0 0 0 0 0 0 100 0 0 0 0',
    ],
  });
  const result = probeKimodoBvh(fixture);
  assert.equal(result.frames, 3);
  assert.equal(result.fps, 30);
  assert.equal(result.playbackDurationSeconds, 0.1);
  assert.equal(result.temporalSpanSeconds, 0.066666667);
  assert.equal(result.rootDisplacementUnits, 1);
  assert.equal(result.meanAbsoluteChannelDelta, 0.041666667);
  assert.equal(result.deterministic, true);
});

test('fails closed when declared frames or channel width do not match the payload', () => {
  assert.throws(
    () => probeKimodoBvh(bvh({frames: 2, rows: ['0 0 0 0 0 0 0 100 0 0 0 0']})),
    /FRAME_COUNT_MISMATCH/,
  );
  assert.throws(
    () => probeKimodoBvh(bvh({frames: 1, rows: ['0 0 0']})),
    /CHANNEL_COUNT_MISMATCH/,
  );
});
