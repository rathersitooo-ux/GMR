import assert from 'node:assert/strict';
import { resolveOpponentCardSkin } from '../browser/card-presentation-core.mjs';

const viewer = { skinId: 'viewer-skin' };
const opponent = { skinId: 'opponent-skin' };
const fallback = { skinId: 'default-skin' };

const viewerWins = resolveOpponentCardSkin({
  viewerPreference: viewer,
  opponentEquippedSkin: opponent,
  defaultSkin: fallback,
});
assert.equal(viewerWins.source, 'viewer_preference');
assert.deepEqual(viewerWins.skin, viewer);
assert.notStrictEqual(viewerWins.skin, viewer);

const opponentFallback = resolveOpponentCardSkin({
  viewerPreference: null,
  opponentEquippedSkin: opponent,
  defaultSkin: fallback,
});
assert.equal(opponentFallback.source, 'opponent_equipped');
assert.deepEqual(opponentFallback.skin, opponent);

const canonicalFallback = resolveOpponentCardSkin({
  viewerPreference: undefined,
  opponentEquippedSkin: null,
  defaultSkin: fallback,
});
assert.equal(canonicalFallback.source, 'default');
assert.deepEqual(canonicalFallback.skin, fallback);

const emptyFallback = resolveOpponentCardSkin();
assert.deepEqual(emptyFallback, { source: 'default', skin: null });

assert.deepEqual(viewer, { skinId: 'viewer-skin' });
assert.deepEqual(opponent, { skinId: 'opponent-skin' });
assert.deepEqual(fallback, { skinId: 'default-skin' });

console.log('card-presentation-core opponent skin precedence: PASS');
