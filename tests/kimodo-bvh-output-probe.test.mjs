import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KIMODO_BVH_OUTPUT_PROBE_SCHEMA,
  KIMODO_NPZ_OUTPUT_PROBE_SCHEMA,
  probeKimodoBvh,
  probeKimodoNpzArtifact,
} from '../tools/kimodo-bvh-output-probe.mjs';

const OFFICIAL_REFERENCE_PROVENANCE = Object.freeze({
  repo: 'nv-tlabs/kimodo',
  commit: '1aece8c124d73d255ceff5086d983b844c9f4e94',
  path: 'kimodo/assets/skeletons/somaskel77/somaskel77_standard_tpose.bvh',
  blobSha: '2998cb69ade063fc38d329288de7a14255e46b65',
});

const ACTUAL_KIMODO_NPZ = Object.freeze({
  url: 'https://raw.githubusercontent.com/tmjeong1103/RIMKit/915a4e1faeba2ea0acb648c0c703d909afa216f9/examples/motions/kimodo/soma_rp_v11/stand_walk_run_stop.npz',
  repo: 'tmjeong1103/RIMKit',
  commit: '915a4e1faeba2ea0acb648c0c703d909afa216f9',
  path: 'examples/motions/kimodo/soma_rp_v11/stand_walk_run_stop.npz',
  blobSha: '4855e9dd9962cd3262f52d689c25c1066ebabf02',
  byteLength: 977750,
  redistributionLicense: 'CC BY 4.0 (RIMKit examples/LICENSE.md)',
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

async function downloadPinnedArtifact(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`PINNED_KIMODO_NPZ_DOWNLOAD_FAILED:${lastError?.message ?? lastError}`);
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

test('verifies a pinned rights-compatible real Kimodo v1.1 NPZ artifact in GitHub Actions', {
  skip: process.env.GITHUB_ACTIONS !== 'true',
  timeout: 60000,
}, async () => {
  const bytes = await downloadPinnedArtifact(ACTUAL_KIMODO_NPZ.url);
  const result = probeKimodoNpzArtifact(bytes, ACTUAL_KIMODO_NPZ);
  assert.equal(result.schema, KIMODO_NPZ_OUTPUT_PROBE_SCHEMA);
  assert.equal(result.source.blobSha, ACTUAL_KIMODO_NPZ.blobSha);
  assert.equal(result.source.byteLength, ACTUAL_KIMODO_NPZ.byteLength);
  assert.equal(result.source.redistributionLicense, ACTUAL_KIMODO_NPZ.redistributionLicense);
  assert.equal(result.actualGeneratedArtifactVerified, true);
  assert.equal(result.retargetedToGameroad, false);
  assert.ok(Number.isInteger(result.frameCount) && result.frameCount > 0);
  assert.ok(Number.isInteger(result.jointCount) && result.jointCount > 0);
});
