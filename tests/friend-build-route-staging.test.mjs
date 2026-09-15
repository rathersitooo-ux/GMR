import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FRIEND_BUILD_ROAD_AHEAD_LABEL,
  FRIEND_BUILD_ROUTE_POLICY,
  normalizeFriendBuildRouteId,
  projectFriendBuildRoutes,
  resolveFriendBuildRouteDisposition,
  stageFriendBuildHome,
} from '../browser/friend-build-route-staging.mjs';

test('Friend Build defers only evidence-backed unfinished routes', () => {
  assert.equal(FRIEND_BUILD_ROUTE_POLICY.gacha.disposition, 'DEFER');
  assert.equal(FRIEND_BUILD_ROUTE_POLICY.gacha.evidence, 'preview-only-not-persisted');
  assert.equal(resolveFriendBuildRouteDisposition('gacha').label, FRIEND_BUILD_ROAD_AHEAD_LABEL);

  assert.equal(resolveFriendBuildRouteDisposition('cards').disposition, 'KEEP');
  assert.equal(resolveFriendBuildRouteDisposition('battle').disposition, 'KEEP');
  assert.equal(resolveFriendBuildRouteDisposition('unknown-route').disposition, 'KEEP');
});

test('Friend Build projection preserves finished and unresolved routes while removing deferred ones', () => {
  const projection = projectFriendBuildRoutes([' setup ', 'Battle', 'cards', 'gacha', 'shop']);
  assert.deepEqual(projection.visibleRouteIds, ['setup', 'battle', 'cards', 'shop']);
  assert.deepEqual(projection.deferredRouteIds, ['gacha']);
  assert.equal(normalizeFriendBuildRouteId(' GACHA '), 'gacha');
});

test('Home staging removes only deferred entry and leaves a single road-ahead marker', () => {
  const removed = [];
  const entries = [
    { dataset: { homeTarget: 'cards' }, remove() { removed.push('cards'); } },
    { dataset: { go: 'gacha' }, remove() { removed.push('gacha'); } },
    { dataset: { go: 'settings' }, remove() { removed.push('settings'); } },
  ];
  let marker = null;
  const host = { append(node) { marker = node; } };
  const home = {
    ownerDocument: null,
    querySelectorAll() { return entries; },
    querySelector(selector) {
      if (selector === '[data-friend-build-road-ahead="true"]') return marker;
      if (selector === '.codexHomeUtilities') return host;
      return null;
    },
  };
  const documentSource = {
    createElement() {
      return {
        dataset: {},
        className: '',
        textContent: '',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
  };

  const result = stageFriendBuildHome(home, { documentSource });
  assert.deepEqual(removed, ['gacha']);
  assert.deepEqual(result.deferredRouteIds, ['gacha']);
  assert.equal(result.changed, true);
  assert.equal(marker.textContent, FRIEND_BUILD_ROAD_AHEAD_LABEL);
  assert.equal(marker.dataset.friendBuildRoadAhead, 'true');
  assert.equal(marker.attributes.role, 'note');
});
