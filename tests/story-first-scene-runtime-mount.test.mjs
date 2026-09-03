import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  STORY_PUBLIC_DEINTEGRATION,
  mountStoryFirstSceneFromCurrentBrowser,
} from '../browser/story-first-scene-runtime-mount.mjs';

test('rejected Story runtime is inert and exposes no player-facing feature', async () => {
  assert.deepEqual(STORY_PUBLIC_DEINTEGRATION, {
    mounted: false,
    active: false,
    productFeature: false,
    reason: 'USER_REJECTED_20260903',
    compatibilityTombstoneOnly: true,
  });

  globalThis.GAMEROAD_STORY_RUNTIME = { stale: true };
  const result = mountStoryFirstSceneFromCurrentBrowser();
  assert.equal(result, STORY_PUBLIC_DEINTEGRATION);
  assert.equal(globalThis.GAMEROAD_STORY_RUNTIME, undefined);

  const source = await readFile(new URL('../browser/story-first-scene-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /moonlit-night/);
  assert.doesNotMatch(source, /ARONDIGHT_ORIGINAL/);
  assert.doesNotMatch(source, /STORY_FIRST_SCENE_LINES/);
  assert.doesNotMatch(source, /storyFirstSceneEntry/);
  assert.doesNotMatch(source, /storyFirstScenePanel/);
  assert.doesNotMatch(source, /readStoryProgress|writeStoryProgress/);
});
