import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOpponentCardSkin } from '../browser/card-skin-opponent-precedence-core.mjs';

test('viewer opponent-skin preference wins over opponent equipped skin', () => {
  const viewerPreference = { skinId: 'viewer-skin' };
  const opponentEquippedSkin = { skinId: 'opponent-skin' };
  const result = resolveOpponentCardSkin({ viewerPreference, opponentEquippedSkin, defaultSkin: { skinId: 'default' } });
  assert.equal(result.source, 'viewer_preference');
  assert.deepEqual(result.skin, viewerPreference);
  assert.notStrictEqual(result.skin, viewerPreference);
});

test('falls back to opponent equipped skin when viewer preference is absent', () => {
  const result = resolveOpponentCardSkin({ viewerPreference: null, opponentEquippedSkin: { skinId: 'opponent-skin' }, defaultSkin: { skinId: 'default' } });
  assert.equal(result.source, 'opponent_equipped');
  assert.deepEqual(result.skin, { skinId: 'opponent-skin' });
});

test('falls back to default/canonical skin when neither override exists', () => {
  const result = resolveOpponentCardSkin({ defaultSkin: { skinId: 'default' } });
  assert.equal(result.source, 'default');
  assert.deepEqual(result.skin, { skinId: 'default' });
});

test('does not mutate caller-owned skin objects', () => {
  const viewerPreference = { skinId: 'viewer-skin', nested: { x: 1 } };
  const before = structuredClone(viewerPreference);
  resolveOpponentCardSkin({ viewerPreference });
  assert.deepEqual(viewerPreference, before);
});
