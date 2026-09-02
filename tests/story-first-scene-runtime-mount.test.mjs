import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STORY_FIRST_SCENE_IDENTITY,
  STORY_FIRST_SCENE_LINES,
  STORY_FIRST_SCENE_RULES,
  STORY_FIRST_SCENE_SOURCE,
  createDefaultStoryProgress,
  createStoryFirstSceneController,
  normalizeStoryProgress,
} from '../browser/story-first-scene-runtime-mount.mjs';

function createMemoryHost(initial = null) {
  let stored = initial == null ? null : structuredClone(initial);
  return {
    readStoryProgress() {
      return stored == null ? null : structuredClone(stored);
    },
    writeStoryProgress(next) {
      stored = structuredClone(next);
      return structuredClone(stored);
    },
    readStored() {
      return stored == null ? null : structuredClone(stored);
    },
  };
}

test('accepted first-scene identity and provenance stay fixed to the Drive canon', () => {
  assert.deepEqual(STORY_FIRST_SCENE_IDENTITY, {
    storyId: 'arondight',
    chapterId: 'ch01',
    sceneId: 'moonlit-night',
    canonVersion: 'ARONDIGHT_ORIGINAL_20260720_R1',
  });
  assert.equal(STORY_FIRST_SCENE_SOURCE.documentId, '1u0yuXDfCGyouZ28EgmrIZFi_uu1hxIgXuzit5eAJozk');
  assert.equal(STORY_FIRST_SCENE_SOURCE.sectionTitle, '月光の夜');
  assert.equal(STORY_FIRST_SCENE_SOURCE.runtimeMirrorRole, 'NON_AUTHORITY_EXACT_TEXT_MIRROR');
  assert.equal(STORY_FIRST_SCENE_RULES.choices, false);
  assert.equal(STORY_FIRST_SCENE_RULES.rewards, false);
  assert.equal(STORY_FIRST_SCENE_RULES.migrationFromOtherModes, false);
  assert.equal(STORY_FIRST_SCENE_LINES.length, 98);
  assert.equal(STORY_FIRST_SCENE_LINES[0], 'とある王国、若くして皇子が亡くなってから15年。');
  assert.ok(STORY_FIRST_SCENE_LINES.includes('「私は、勝ってしまいました。」'));
  assert.ok(STORY_FIRST_SCENE_LINES.includes('おはよ、爺'));
  assert.equal(STORY_FIRST_SCENE_LINES.at(-1), 'この日はとても…');
});

test('new Story progress is isolated, resumable, and confirmed by readback', () => {
  const host = createMemoryHost();
  const controller = createStoryFirstSceneController({ host });

  assert.deepEqual(createDefaultStoryProgress(), {
    schemaVersion: 'gameroad.story-progress.r1',
    ...STORY_FIRST_SCENE_IDENTITY,
    read: false,
    currentPosition: 0,
  });

  assert.equal(controller.open().cursor, 0);
  const afterNext = controller.next();
  assert.equal(afterNext.cursor, 1);
  assert.equal(host.readStored().currentPosition, 1);
  assert.equal(host.readStored().read, false);

  const afterSkip = controller.skip();
  assert.equal(afterSkip.opened, false);
  assert.equal(afterSkip.progress.read, true);
  assert.equal(afterSkip.progress.currentPosition, STORY_FIRST_SCENE_LINES.length);
  assert.deepEqual(
    Object.keys(host.readStored()).sort(),
    ['canonVersion', 'chapterId', 'currentPosition', 'read', 'sceneId', 'schemaVersion', 'storyId'].sort(),
  );
});

test('foreign or stale progress is not migrated into the accepted scene', () => {
  const stale = {
    schemaVersion: 'gameroad.story-progress.r1',
    storyId: 'other',
    chapterId: 'ch99',
    sceneId: 'invented',
    canonVersion: 'OLD',
    read: true,
    currentPosition: 77,
    partnerAffinity: 999,
  };
  assert.deepEqual(normalizeStoryProgress(stale), createDefaultStoryProgress());
});

test('completed scene reopens from the beginning without downgrading read state', () => {
  const host = createMemoryHost({
    ...createDefaultStoryProgress(),
    read: true,
    currentPosition: STORY_FIRST_SCENE_LINES.length,
  });
  const controller = createStoryFirstSceneController({ host });

  const opened = controller.open();
  assert.equal(opened.cursor, 0);
  assert.equal(opened.progress.read, true);

  controller.next();
  assert.equal(host.readStored().read, true);
  assert.equal(host.readStored().currentPosition, STORY_FIRST_SCENE_LINES.length);
});
