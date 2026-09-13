import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTNER_ADVICE_DELEGATE_TEXT,
  PARTNER_ADVICE_RECLAIM_TEXT,
  projectPartnerAdviceDelegationControl,
  projectPartnerAdviceReplyPair,
} from '../browser/partner-advice-player-control-core.mjs';

function authority(overrides = {}) {
  return {
    current: true,
    sourceId: 'battle.authority.current',
    generation: 7,
    delegated: false,
    canDelegate: true,
    canReclaim: true,
    ...overrides,
  };
}

test('delegation main control switches wording by authoritative delegated state without executing gameplay', () => {
  const handOff = projectPartnerAdviceDelegationControl({ authority: authority() });
  assert.equal(handOff.visible, true);
  assert.equal(handOff.label, PARTNER_ADVICE_DELEGATE_TEXT);
  assert.equal(handOff.action, 'request-partner-delegation');
  assert.equal(handOff.autoExecute, false);
  assert.equal(handOff.gameplayAuthorityMutated, false);

  const reclaim = projectPartnerAdviceDelegationControl({ authority: authority({ delegated: true }) });
  assert.equal(reclaim.visible, true);
  assert.equal(reclaim.label, PARTNER_ADVICE_RECLAIM_TEXT);
  assert.equal(reclaim.action, 'request-player-reclaim');
});

test('delegation main control fails closed without current explicit authority', () => {
  for (const value of [null, authority({ current: false }), authority({ sourceId: '' }), authority({ generation: -1 })]) {
    const projection = projectPartnerAdviceDelegationControl({ authority: value });
    assert.equal(projection.visible, false);
    assert.equal(projection.label, null);
    assert.equal(projection.action, null);
  }
});

test('conversation reply pair requires exactly two traceable approved player replies', () => {
  const projection = projectPartnerAdviceReplyPair({
    source: {
      approvedCurrent: true,
      sourceId: 'SOURCE-DIALOGUE-EXAMPLE',
      dialogueVersion: 'dialogue.current.r1',
      conversationId: 'battle-advice-turn-12',
      options: [
        { id: 'reply-a', label: 'A' },
        { id: 'reply-b', label: 'B' },
      ],
    },
  });
  assert.equal(projection.visible, true);
  assert.deepEqual(projection.options.map(({ id, label }) => ({ id, label })), [
    { id: 'reply-a', label: 'A' },
    { id: 'reply-b', label: 'B' },
  ]);
  assert.equal(projection.autoExecute, false);
  assert.equal(projection.emits2v2Ping, false);
  assert.equal(projection.gameplayAuthorityMutated, false);
});

test('unresolved, malformed, or delegation-text reply pairs stay hidden', () => {
  const base = {
    approvedCurrent: true,
    sourceId: 'SOURCE-DIALOGUE-EXAMPLE',
    dialogueVersion: 'dialogue.current.r1',
    conversationId: 'battle-advice-turn-12',
  };
  const invalid = [
    null,
    { ...base, approvedCurrent: false, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
    { ...base, options: [{ id: 'a', label: 'A' }] },
    { ...base, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] },
    { ...base, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'A' }] },
    { ...base, options: [{ id: 'a', label: PARTNER_ADVICE_DELEGATE_TEXT }, { id: 'b', label: 'B' }] },
    { ...base, options: [{ id: 'a', label: 'A' }, { id: 'b', label: PARTNER_ADVICE_RECLAIM_TEXT }] },
  ];
  for (const source of invalid) {
    const projection = projectPartnerAdviceReplyPair({ source });
    assert.equal(projection.visible, false);
    assert.deepEqual(projection.options, []);
  }
});
