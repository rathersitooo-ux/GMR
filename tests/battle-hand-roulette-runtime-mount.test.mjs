import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  collectBattleHandRouletteCandidateCardIds,
  resolveBattleHandRouletteNode,
} from '../browser/battle-hand-roulette-runtime-mount.mjs';

function card(id, { candidate = true, disabled = false, ariaDisabled = false } = {}) {
  return {
    dataset: { cardId: id },
    disabled,
    getAttribute(name) {
      if (name === 'aria-disabled') return ariaDisabled ? 'true' : 'false';
      return null;
    },
    candidate,
  };
}

function root(nodes) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '#hand .handCard.grPlayableHandCandidate[data-card-id]');
      return nodes.filter((node) => node.candidate);
    },
  };
}

test('runtime membership comes only from the existing playable ordinary-hand DOM projection', () => {
  const a = card('a');
  const reservedLookingButNotProjected = card('reserved', { candidate: false });
  const disabled = card('disabled', { disabled: true });
  const duplicate = card('a');
  const b = card('b');
  assert.deepEqual(
    collectBattleHandRouletteCandidateCardIds(root([a, reservedLookingButNotProjected, disabled, duplicate, b])),
    ['a', 'b'],
  );
});

test('runtime resolves a fresh still-playable DOM node instead of keeping a stale card authority', () => {
  const a = card('a');
  const b = card('b');
  const battleRoot = root([a, b]);
  assert.strictEqual(resolveBattleHandRouletteNode(battleRoot, 'b'), b);
  b.disabled = true;
  assert.equal(resolveBattleHandRouletteNode(battleRoot, 'b'), null);
});

test('runtime source queues rapid taps behind an authoritative candidate change and performs one existing click', async () => {
  const source = await readFile(new URL('../browser/battle-hand-roulette-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(destroyed \|\| waitingForCandidateChange \|\| pendingTapCount <= 0\) return false;/);
  assert.match(source, /waitingForCandidateChange = true;[\s\S]*node\.click\(\);/);
  assert.match(source, /if \(changed\) waitingForCandidateChange = false;/);
  assert.equal((source.match(/node\.click\(\);/g) ?? []).length, 1,
    'roulette runtime must delegate through exactly one existing hand-card click site');
});

test('runtime does not create a second legality, refill, score, Honey, Mana, or reward authority', async () => {
  const source = await readFile(new URL('../browser/battle-hand-roulette-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.equal(/roadSelect|battleSelect|activeOptionValues|reservedCardIds|jankenReserved/.test(source), false,
    'roulette must consume the existing playable projection rather than recomputing legality/reservation');
  assert.equal(/\brefill\b|\bHoney\b|\bMana\b|Battle SCORE|result reward|victory/i.test(source), false);
});

test('runtime keeps variable 0/1/N candidate counts and reduced-motion meaning without continuous animation', async () => {
  const source = await readFile(new URL('../browser/battle-hand-roulette-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /ids\.forEach\(\(id, index\) =>/);
  assert.match(source, /Math\.max\(1, ids\.length\)/);
  assert.match(source, /prefers-reduced-motion:reduce/);
  assert.equal(/requestAnimationFrame|setInterval/.test(source), false);
});

test('existing Battle runtime chain imports the optional roulette runtime exactly once', async () => {
  const source = await readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
  const matches = source.match(/import '\.\/battle-hand-roulette-runtime-mount\.mjs';/g) ?? [];
  assert.equal(matches.length, 1);
  assert.equal(source.startsWith("import './battle-hand-roulette-runtime-mount.mjs';\n"), true);
});
