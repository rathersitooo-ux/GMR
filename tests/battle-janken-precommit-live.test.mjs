import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBattleJankenSlidePadModel,
  resolveBattleJankenSlotCardAction,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

async function runtimeSource() {
  const { readFile } = await import('node:fs/promises');
  return readFile(new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url), 'utf8');
}

test('live janken selection stages before the existing card action and cancel stays local-only', async () => {
  const source = await runtimeSource();
  const stageBody = source.match(/function stageJankenAction\(nextHand\) \{[\s\S]*?\n  \}\n\n  function commitStagedJankenAction/);
  const clearBody = source.match(/function clearStagedJankenAction\(\) \{[\s\S]*?\n  \}\n\n  function stageJankenAction/);
  assert.ok(stageBody, 'live stage function must exist');
  assert.ok(clearBody, 'one-operation clear function must exist');
  assert.doesNotMatch(stageBody[0], /clickExistingHandCard/, 'staging must not invoke the existing authoritative action');
  assert.doesNotMatch(clearBody[0], /clickExistingHandCard/, 'cancel must not invoke or roll back the existing authoritative action');
  assert.match(source, /if \(!selectedHand \|\| !model\) return;\s*stageJankenAction\(selectedHand\);/);
  assert.match(source, /node\.onclick = \(\) => \{\s*stageJankenAction\(slot\.jankenHand\);\s*\};/);
});

test('confirmation revalidates the current source hand before exactly one existing action path', async () => {
  const source = await runtimeSource();
  const commitBody = source.match(/function commitStagedJankenAction\(\) \{[\s\S]*?\n  \}\n\n  function setExpanded/);
  assert.ok(commitBody, 'commit function must exist');
  assert.match(commitBody[0], /readHand\(globalRef, root\)\.map\(\(card\) => card\.id\)/);
  assert.match(commitBody[0], /resolveBattleJankenSlotCardAction\(model, selectedHand, currentSourceHandIds\)/);
  assert.equal((commitBody[0].match(/clickExistingHandCard\(/g) ?? []).length, 1);
  assert.match(
    commitBody[0],
    /clearStagedJankenAction\(\);\s*if \(!cardId\) return false;\s*const clicked = clickExistingHandCard/,
    'stale or invalid staged cards must fail closed before any source action',
  );
});

test('a staged reserved card fails closed if it disappears before confirmation', () => {
  const hand = [
    { id: 'club-a', suit: 'CL', label: 'Club A' },
    { id: 'diamond-a', suit: 'DI', label: 'Diamond A' },
    { id: 'spade-a', suit: 'SP', label: 'Spade A' },
  ];
  const model = buildBattleJankenSlidePadModel({ roundId: 'precommit-1', hand });
  assert.equal(resolveBattleJankenSlotCardAction(model, 'ROCK', hand.map((card) => card.id)), 'club-a');
  assert.equal(resolveBattleJankenSlotCardAction(model, 'ROCK', ['diamond-a', 'spade-a']), null);
});

test('precommit is visibly distinct and every supported clear input converges on the same local cancel', async () => {
  const source = await runtimeSource();
  assert.match(source, /data-precommit=\"true\"[^\n]*\.grJankenPrecommit\{opacity:1;[^\n]*pointer-events:auto/);
  assert.match(source, /loadPreviewLabel\.textContent = stagedJankenHand \? '未確定 \/ LOAD' : 'LOAD CARD'/);
  assert.match(source, /cancelPrecommit\.addEventListener\('click', \(\) => clearStagedJankenAction\(\)\)/);
  assert.match(source, /function handlePrecommitKeydown\(event\) \{[\s\S]*?event\?\.key !== 'Escape'[\s\S]*?clearStagedJankenAction\(\)/);
  assert.match(source, /clearPrecommit: clearStagedJankenAction/);
  assert.match(source, /function openForRound\(roundId\) \{[\s\S]*?clearStagedJankenAction\(\)/);
});
