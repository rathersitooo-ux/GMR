import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = 'gameroad.animation-frontier.kimodo-bvh-probe.v1';

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}_INVALID`);
  return parsed;
}

function round(value, digits = 9) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseMotionLines(text) {
  const marker = /\nMOTION\s*\n/i.exec(text);
  if (!marker) throw new Error('BVH_MOTION_SECTION_MISSING');
  const motion = text.slice(marker.index + marker[0].length);
  const lines = motion.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) throw new Error('BVH_MOTION_SECTION_INCOMPLETE');

  const framesMatch = /^Frames:\s*(\d+)$/i.exec(lines[0]);
  const frameTimeMatch = /^Frame\s+Time:\s*([+\-\deE.]+)$/i.exec(lines[1]);
  if (!framesMatch || !frameTimeMatch) throw new Error('BVH_TEMPORAL_HEADER_INVALID');

  const declaredFrames = Number(framesMatch[1]);
  const frameTimeSeconds = finiteNumber(frameTimeMatch[1], 'FRAME_TIME');
  if (!Number.isInteger(declaredFrames) || declaredFrames < 1) throw new Error('FRAME_COUNT_INVALID');
  if (!(frameTimeSeconds > 0)) throw new Error('FRAME_TIME_INVALID');

  const frameRows = lines.slice(2).map((line, index) => {
    const values = line.split(/\s+/).map((token) => finiteNumber(token, `FRAME_${index}_TOKEN`));
    return values;
  });

  if (frameRows.length !== declaredFrames) {
    throw new Error(`FRAME_COUNT_MISMATCH:${declaredFrames}:${frameRows.length}`);
  }
  return {declaredFrames, frameTimeSeconds, frameRows};
}

function parseHierarchy(text) {
  const hierarchyText = text.split(/\nMOTION\s*\n/i)[0];
  if (!/^HIERARCHY\b/m.test(hierarchyText)) throw new Error('BVH_HIERARCHY_MISSING');
  const jointEntries = [...hierarchyText.matchAll(/^\s*(ROOT|JOINT)\s+([^\s{]+)/gm)]
    .map((match) => ({kind: match[1], name: match[2]}));
  const channelCounts = [...hierarchyText.matchAll(/^\s*CHANNELS\s+(\d+)\b/gm)]
    .map((match) => Number(match[1]));
  const channelsPerFrame = channelCounts.reduce((sum, count) => sum + count, 0);
  if (jointEntries.length === 0 || channelsPerFrame === 0) throw new Error('BVH_HIERARCHY_EMPTY');
  return {jointEntries, channelsPerFrame};
}

function rootDisplacement(frameRows) {
  if (frameRows.length < 2 || frameRows[0].length < 3) return 0;
  const first = frameRows[0];
  const last = frameRows[frameRows.length - 1];
  return Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]);
}

function meanAbsoluteFrameDelta(frameRows) {
  if (frameRows.length < 2) return 0;
  let total = 0;
  let samples = 0;
  for (let frame = 1; frame < frameRows.length; frame += 1) {
    const previous = frameRows[frame - 1];
    const current = frameRows[frame];
    const width = Math.min(previous.length, current.length);
    for (let column = 0; column < width; column += 1) {
      total += Math.abs(current[column] - previous[column]);
      samples += 1;
    }
  }
  return samples === 0 ? 0 : total / samples;
}

export function probeKimodoBvh(text, provenance = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('BVH_TEXT_REQUIRED');
  const {jointEntries, channelsPerFrame} = parseHierarchy(text);
  const {declaredFrames, frameTimeSeconds, frameRows} = parseMotionLines(text);

  for (let index = 0; index < frameRows.length; index += 1) {
    if (frameRows[index].length !== channelsPerFrame) {
      throw new Error(`CHANNEL_COUNT_MISMATCH:${index}:${channelsPerFrame}:${frameRows[index].length}`);
    }
  }

  const fps = 1 / frameTimeSeconds;
  return Object.freeze({
    schema: SCHEMA,
    source: Object.freeze({
      repo: String(provenance.repo ?? ''),
      commit: String(provenance.commit ?? ''),
      path: String(provenance.path ?? ''),
      blobSha: String(provenance.blobSha ?? ''),
    }),
    format: 'bvh',
    jointEntryCount: jointEntries.length,
    firstJoint: jointEntries[0]?.name ?? null,
    channelsPerFrame,
    frames: declaredFrames,
    frameTimeSeconds: round(frameTimeSeconds, 12),
    fps: round(fps, 6),
    playbackDurationSeconds: round(declaredFrames * frameTimeSeconds, 9),
    temporalSpanSeconds: round(Math.max(0, declaredFrames - 1) * frameTimeSeconds, 9),
    rootDisplacementUnits: round(rootDisplacement(frameRows), 9),
    meanAbsoluteChannelDelta: round(meanAbsoluteFrameDelta(frameRows), 9),
    deterministic: true,
    presentationOnly: true,
  });
}

function runCli() {
  const [inputPath, provenancePath] = process.argv.slice(2);
  if (!inputPath) {
    console.error('usage: node tools/kimodo-bvh-output-probe.mjs <motion.bvh> [provenance.json]');
    process.exitCode = 2;
    return;
  }
  const text = fs.readFileSync(inputPath, 'utf8');
  const provenance = provenancePath
    ? JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
    : {path: path.resolve(inputPath)};
  process.stdout.write(`${JSON.stringify(probeKimodoBvh(text, provenance), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runCli();
}

export const KIMODO_BVH_OUTPUT_PROBE_SCHEMA = SCHEMA;
