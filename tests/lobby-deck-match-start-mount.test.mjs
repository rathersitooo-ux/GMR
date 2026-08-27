import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDeckMatchStartSnapshot } from '../browser/deck-save-ack-core.mjs';

test('createDeckMatchStartSnapshot freezes the selected deck/setup at match start', () => {
  const selection = {
    savedDeck: { main: ['A', 'B'], ex: ['X'] },
    savedDeckRule: { id: 'deck-rule', revision: 3 },
    setupMode: '4p',
    setupContent: 'honey_hunt',
    playerCharacterId: 'player.a',
    selectedPartnerId: 'partner.b',
  };
  const snapshot = createDeckMatchStartSnapshot(selection, {
    validateDeck: (deck, options) => {
      assert.deepEqual(options, { forBattle: true });
      assert.deepEqual(deck, { main: ['A', 'B'], ex: ['X'] });
      return { ok: true };
    },
  });

  selection.savedDeck.main.push('MUTATED');
  selection.savedDeckRule.id = 'changed';
  selection.setupMode = '2p';

  assert.deepEqual(snapshot.deck.main, ['A', 'B']);
  assert.deepEqual(snapshot.deck.ex, ['X']);
  assert.equal(snapshot.deck.ruleId, 'deck-rule');
  assert.equal(snapshot.deck.ruleRevision, 3);
  assert.equal(snapshot.setup.mode, '4p');
  assert.equal(snapshot.setup.content, 'honey_hunt');
  assert.equal(snapshot.selection.playerCharacterId, 'player.a');
  assert.equal(snapshot.selection.selectedPartnerId, 'partner.b');
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.deck));
  assert.ok(Object.isFrozen(snapshot.deck.main));
});

test('createDeckMatchStartSnapshot fails closed on an invalid battle deck', () => {
  assert.throws(
    () => createDeckMatchStartSnapshot({
      savedDeck: { main: ['BAD'], ex: [] },
      setupMode: '2p',
      setupContent: 'road_shield',
    }, { validateDeck: () => ({ ok: false, errors: ['ILLEGAL'] }) }),
    /MATCH_START_DECK_INVALID:ILLEGAL/,
  );
});

test('Browser startMatch consumes the immutable snapshot instead of mutable savedDeck', () => {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  assert.match(html, /GAMEROAD_LOBBYDECK_R4_MATCHSTART_SNAPSHOT/);
  assert.match(html, /deck-save-ack-core\.mjs/);
  const hit = html.match(/function startMatch\(\)\{.*?return state\.match\}/s);
  assert.ok(hit, 'startMatch function must be uniquely discoverable');
  const body = hit[0];
  assert.match(body, /GAMEROAD_CREATE_DECK_MATCH_START_SNAPSHOT/);
  assert.match(body, /deckStartSnapshot:snapshot/);
  assert.match(body, /snapshot\.setup\.mode/);
  assert.match(body, /snapshot\.setup\.content/);
  assert.match(body, /snapshot\.deck\.main/);
  assert.match(body, /snapshot\.deck\.ruleId/);
  assert.doesNotMatch(body, /validateDeck\(state\.savedDeck/);
  assert.doesNotMatch(body, /makePlayer\([^)]*state\.savedDeck\.main/);
});
