import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RANK_MATCH_ENTRY_SCHEMA,
  RANK_MATCH_REFERENCE_LAYOUT,
  RANK_MATCH_WAITING_TEXTURE,
  createRankMatchEntryState,
  projectRankMatchWaitingLayout,
  resolveRankMatchEntryAction,
} from '../browser/rank-match-entry-core.mjs';

test('home state removes the old rank label and exposes the choice only on setup', () => {
  const home = createRankMatchEntryState({ screen: 'home' });
  const setup = createRankMatchEntryState({ screen: 'setup', rankChoiceVisible: true });

  assert.equal(home.homeRankTextVisible, false);
  assert.equal(home.setupRankChoiceVisible, false);
  assert.equal(setup.homeRankTextVisible, false);
  assert.equal(setup.setupRankChoiceVisible, true);
  assert.equal(setup.gameplayAuthorityChanged, false);
});

test('reference layout keeps the supplied 1536x864 geometry', () => {
  const layout = projectRankMatchWaitingLayout({ viewportWidth: 1536, viewportHeight: 864 });

  assert.equal(layout.schema, RANK_MATCH_ENTRY_SCHEMA + '.layout');
  assert.deepEqual(layout.panel, { left: 187, top: 106, width: 1200, height: 451 });
  assert.deepEqual(layout.rail, { left: 187, top: 106, width: 170, height: 451 });
  assert.deepEqual(layout.action, { left: 1174, top: 364, width: 163, height: 165 });
  assert.equal(RANK_MATCH_WAITING_TEXTURE.role, 'generated_reference_texture');
  assert.equal(RANK_MATCH_REFERENCE_LAYOUT.panel.left, 0.122);
});

test('reference layout scales without changing the relative anchors', () => {
  const layout = projectRankMatchWaitingLayout({ viewportWidth: 768, viewportHeight: 432 });
  assert.deepEqual(layout.panel, { left: 94, top: 53, width: 600, height: 226 });
  assert.deepEqual(layout.rail, { left: 94, top: 53, width: 85, height: 226 });
});

test('entry actions are accepted only from setup', () => {
  assert.deepEqual(resolveRankMatchEntryAction({ screen: 'home', action: 'open-waiting' }), {
    ok: false,
    reason: 'SETUP_REQUIRED',
    screen: 'home',
    action: 'open-waiting',
  });
  assert.deepEqual(resolveRankMatchEntryAction({ screen: 'setup', action: 'open-waiting' }), {
    ok: true,
    next: 'waiting',
    screen: 'setup',
    action: 'open-waiting',
  });
  assert.deepEqual(resolveRankMatchEntryAction({ screen: 'setup', action: 'start-search' }), {
    ok: true,
    next: 'searching',
    screen: 'setup',
    action: 'start-search',
  });
});
