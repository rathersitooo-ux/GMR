import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CURRENT_ACTION_CONTEXT_PRESENTATION,
  isBattleCurrentActionContextPresentation,
  projectBattleCurrentActionContext
} from '../browser/battle-current-action-context-presentation-core.mjs';

const authorityBoundary = 'caller_authoritative_public_state';
const participants = Object.freeze([
  Object.freeze({ id: 'p1', label: 'あなた' }),
  Object.freeze({ id: 'p2', label: 'プレイヤー2' }),
  Object.freeze({ id: 'p3', label: 'プレイヤー3' }),
  Object.freeze({ id: 'p4', label: 'プレイヤー4' })
]);

test('self input owner shows current action without fabricating a wait target', () => {
  const result = projectBattleCurrentActionContext({
    authorityBoundary,
    participants,
    viewerParticipantId: 'p1',
    inputOwnerParticipantId: 'p1',
    currentAction: 'カードを選択',
    waitReason: null
  });

  assert.equal(result.ownerRelation, 'SELF');
  assert.equal(result.viewerOwnsInput, true);
  assert.equal(result.waitingFor, null);
  assert.equal(result.text, '今：カードを選択');
  assert.deepEqual(result.lines.map(line => line.kind), ['current_action']);
  assert.equal(result.controlAuthority, false);
  assert.equal(result.legalityAuthority, false);
  assert.equal(result.gameStateWrite, false);
  assert.equal(isBattleCurrentActionContextPresentation(result), true);
});

test('other public input owner produces exact waiting participant and caller reason', () => {
  const result = projectBattleCurrentActionContext({
    authorityBoundary,
    participants,
    viewerParticipantId: 'p1',
    inputOwnerParticipantId: 'p3',
    currentAction: '公開入力を待機',
    waitReason: 'プレイヤー3の公開済み入力が未確定'
  });

  assert.equal(result.ownerRelation, 'OTHER');
  assert.equal(result.viewerOwnsInput, false);
  assert.deepEqual(result.waitingFor, { participantId: 'p3', label: 'プレイヤー3' });
  assert.equal(
    result.text,
    '今：公開入力を待機 / 待ち：プレイヤー3 / 理由：プレイヤー3の公開済み入力が未確定'
  );
  assert.deepEqual(result.lines.map(line => line.kind), [
    'current_action',
    'waiting_for',
    'reason'
  ]);
});

test('unresolved input owner stays unresolved instead of guessing from phase or labels', () => {
  const result = projectBattleCurrentActionContext({
    authorityBoundary,
    participants,
    viewerParticipantId: 'p1',
    currentAction: '選択',
    waitReason: null
  });

  assert.equal(result.ownerRelation, 'UNRESOLVED');
  assert.equal(result.inputOwner, null);
  assert.equal(result.waitingFor, null);
  assert.equal(result.viewerOwnsInput, false);
  assert.equal(result.text, '今：選択');
});

test('caller may provide a public reason without an owner and it is not reinterpreted', () => {
  const result = projectBattleCurrentActionContext({
    authorityBoundary,
    participants,
    viewerParticipantId: 'p1',
    currentAction: null,
    waitReason: '対戦状態を同期中'
  });

  assert.equal(result.ownerRelation, 'UNRESOLVED');
  assert.equal(result.waitingFor, null);
  assert.equal(result.text, '理由：対戦状態を同期中');
  assert.equal(result.visible, true);
});

test('empty caller facts produce a hidden presentation rather than invented copy', () => {
  const result = projectBattleCurrentActionContext({
    authorityBoundary,
    participants,
    viewerParticipantId: 'p1'
  });

  assert.equal(result.text, '');
  assert.equal(result.visible, false);
  assert.deepEqual(result.lines, []);
});

test('unknown viewer or input owner fails closed', () => {
  assert.throws(
    () => projectBattleCurrentActionContext({
      authorityBoundary,
      participants,
      viewerParticipantId: 'unknown'
    }),
    /VIEWER_INVALID_UNKNOWN/
  );

  assert.throws(
    () => projectBattleCurrentActionContext({
      authorityBoundary,
      participants,
      viewerParticipantId: 'p1',
      inputOwnerParticipantId: 'unknown'
    }),
    /INPUT_OWNER_INVALID_UNKNOWN/
  );
});

test('public authority boundary is mandatory', () => {
  assert.throws(
    () => projectBattleCurrentActionContext({
      participants,
      viewerParticipantId: 'p1',
      inputOwnerParticipantId: 'p2'
    }),
    /PUBLIC_AUTHORITY_REQUIRED/
  );
});

test('invalid duplicate participants and blank display facts are rejected', () => {
  assert.throws(
    () => projectBattleCurrentActionContext({
      authorityBoundary,
      participants: [{ id: 'p1', label: 'A' }, { id: 'p1', label: 'B' }],
      viewerParticipantId: 'p1'
    }),
    /PARTICIPANT_IDS_NOT_UNIQUE/
  );

  assert.throws(
    () => projectBattleCurrentActionContext({
      authorityBoundary,
      participants,
      viewerParticipantId: 'p1',
      currentAction: '   '
    }),
    /CURRENT_ACTION_INVALID/
  );

  assert.throws(
    () => projectBattleCurrentActionContext({
      authorityBoundary,
      participants,
      viewerParticipantId: 'p1',
      waitReason: ''
    }),
    /WAIT_REASON_INVALID/
  );
});

test('result and contract are deeply frozen and expose no gameplay authority', () => {
  const result = projectBattleCurrentActionContext({
    authorityBoundary,
    participants,
    viewerParticipantId: 'p1',
    inputOwnerParticipantId: 'p2',
    currentAction: '待機',
    waitReason: '公開済み状態の更新待ち'
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.lines), true);
  assert.equal(Object.isFrozen(result.lines[0]), true);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(result.turnAuthority, false);
  assert.equal(result.waitReasonAuthority, false);
  assert.equal(result.secretExpansion, false);

  assert.equal(BATTLE_CURRENT_ACTION_CONTEXT_PRESENTATION.computesControlOwner, false);
  assert.equal(BATTLE_CURRENT_ACTION_CONTEXT_PRESENTATION.computesTurnOwner, false);
  assert.equal(BATTLE_CURRENT_ACTION_CONTEXT_PRESENTATION.computesLegality, false);
  assert.equal(BATTLE_CURRENT_ACTION_CONTEXT_PRESENTATION.computesWaitReason, false);
  assert.equal(BATTLE_CURRENT_ACTION_CONTEXT_PRESENTATION.writesGameState, false);
});
