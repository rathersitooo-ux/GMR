import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../browser/battle-current-player-ui-live-adapter.mjs', import.meta.url), 'utf8');

const portraitRule = '@media (max-width:500px) and (orientation:portrait){\n[data-battle-current-action="1"].grBattleCurrentActionLive{transform:translateY(6px)}\n}';

test('current-action surface adds only the bounded portrait separation', () => {
  assert.ok(source.includes(portraitRule), 'portrait current-action +6px rule must stay present');
  assert.equal((source.match(/transform:translateY\(6px\)/g) ?? []).length, 1, 'the +6px translation stays scoped to one presentation rule');
});

test('portrait deconflict does not move peer strip or gameplay surfaces', () => {
  const mediaIndex = source.indexOf('@media (max-width:500px) and (orientation:portrait)');
  assert.notEqual(mediaIndex, -1);
  const mediaTail = source.slice(mediaIndex, mediaIndex + 240);
  assert.match(mediaTail, /data-battle-current-action/);
  assert.doesNotMatch(mediaTail, /publicPlayerStrip|readyPlan|targetBox|boardPlayers/);
});
