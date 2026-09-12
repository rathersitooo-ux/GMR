import assert from 'node:assert/strict';
import { BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA, mountBattleCurrentPlayerUiLiveAdapter } from '../browser/battle-current-player-ui-live-adapter.mjs';

const root = {};
const documentRef = { querySelector(selector) { return selector.includes('battle') ? root : null; } };
const globalRef = { document: documentRef };
const mounts = [];
let destroyCount = 0;
const fakeMount = (receivedGlobal, options) => {
  mounts.push({ receivedGlobal, root: options.root });
  return {
    inspect: () => ({ rootDecorated: true, presentationOnly: true }),
    sync: (snapshot) => ({ snapshot }),
    destroy: () => { destroyCount += 1; return true; },
  };
};

const first = mountBattleCurrentPlayerUiLiveAdapter(globalRef, { mountUi: fakeMount });
assert.ok(first);
assert.equal(first.schema, BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA);
assert.equal(first.presentationOnly, true);
assert.equal(first.gameplayAuthority, false);
assert.equal(first.gameStateWrite, false);
assert.equal(first.mounted(), true);
assert.equal(mounts.length, 1);
assert.equal(mounts[0].receivedGlobal, globalRef);
assert.equal(mounts[0].root, root);
assert.deepEqual(first.inspect(), { rootDecorated: true, presentationOnly: true });
assert.deepEqual(first.sync({ reducedMotion: true }), { snapshot: { reducedMotion: true } });

const duplicate = mountBattleCurrentPlayerUiLiveAdapter(globalRef, { mountUi: () => { throw new Error('must not remount'); } });
assert.equal(duplicate, first);
assert.equal(mounts.length, 1);
assert.equal(first.destroy(), true);
assert.equal(first.destroy(), false);
assert.equal(first.mounted(), false);
assert.equal(destroyCount, 1);

const second = mountBattleCurrentPlayerUiLiveAdapter(globalRef, { mountUi: fakeMount });
assert.ok(second);
assert.notEqual(second, first);
assert.equal(mounts.length, 2);
assert.equal(second.destroy(), true);
assert.equal(destroyCount, 2);
assert.equal(mountBattleCurrentPlayerUiLiveAdapter({ document: { querySelector: () => null } }, { mountUi: fakeMount }), null);
assert.equal(mountBattleCurrentPlayerUiLiveAdapter({}, { mountUi: fakeMount }), null);
console.log('battle-current-player-ui-live-adapter: focused lifecycle tests passed');
