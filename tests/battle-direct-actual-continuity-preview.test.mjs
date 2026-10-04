import assert from 'node:assert/strict';
import {
  BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW,
  BATTLE_PRESENTATION_STATES,
  createBattleDirectActualContinuityController,
  projectBattleDirectActualPresentationState
} from '../browser/battle-direct-actual-continuity-preview.mjs';

assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.sourceBinding.referenceId, 'GR-USER-ASTRAL-PARTY-VIDEO-20261004');
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.sourceBinding.originalDriveFileId, '16ST3f8rkjU8xD7MbeGRjb59BXpT93JN9');
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.sourceBinding.proseOnlyReferenceAccepted, false);
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.gameStateWrite, false);
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.targetWrite, false);
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.winnerWrite, false);
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.orderWrite, false);
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.networkWrite, false);
assert.equal(BATTLE_DIRECT_ACTUAL_CONTINUITY_PREVIEW.humanVisualAcceptance, false);

assert.deepEqual(projectBattleDirectActualPresentationState(BATTLE_PRESENTATION_STATES.BOARD), {
  schema: 'gameroad.battle-direct-actual-continuity-preview.v1',
  presentationOnly: true,
  gameStateWrite: false,
  state: 'BOARD',
  boardVisible: true,
  contextOverlayVisible: false,
  battleSceneVisible: false,
  boardInteractionEnabled: true
});

assert.deepEqual(projectBattleDirectActualPresentationState(BATTLE_PRESENTATION_STATES.CONTEXT_OVERLAY), {
  schema: 'gameroad.battle-direct-actual-continuity-preview.v1',
  presentationOnly: true,
  gameStateWrite: false,
  state: 'CONTEXT_OVERLAY',
  boardVisible: true,
  contextOverlayVisible: true,
  battleSceneVisible: false,
  boardInteractionEnabled: false
});

assert.deepEqual(projectBattleDirectActualPresentationState(BATTLE_PRESENTATION_STATES.BATTLE_SCENE), {
  schema: 'gameroad.battle-direct-actual-continuity-preview.v1',
  presentationOnly: true,
  gameStateWrite: false,
  state: 'BATTLE_SCENE',
  boardVisible: false,
  contextOverlayVisible: false,
  battleSceneVisible: true,
  boardInteractionEnabled: false
});

const view = { camera: [16, 18, 29], target: [2, 0.7, 2], selectedRoad: 'P1-R2' };
const restored = [];
const transitions = [];
let captures = 0;

const controller = createBattleDirectActualContinuityController({
  captureBoardView() {
    captures += 1;
    return structuredClone(view);
  },
  restoreBoardView(snapshot) {
    restored.push(structuredClone(snapshot));
  },
  onTransition(record) {
    transitions.push(record);
  }
});

const context = controller.openContextOverlay({ reason: 'light_event' });
assert.equal(context.from, 'BOARD');
assert.equal(context.to, 'CONTEXT_OVERLAY');
assert.equal(context.snapshotCaptured, true);
assert.equal(context.directives.boardVisible, true);
assert.equal(context.directives.contextOverlayVisible, true);
assert.equal(captures, 1);

view.camera = [99, 99, 99];
const battle = controller.enterBattleScene({ reason: 'material_combat' });
assert.equal(battle.from, 'CONTEXT_OVERLAY');
assert.equal(battle.to, 'BATTLE_SCENE');
assert.equal(battle.snapshotCaptured, false);
assert.equal(battle.directives.boardVisible, false);
assert.equal(battle.directives.battleSceneVisible, true);
assert.equal(captures, 1);

const back = controller.returnToBoard({ reason: 'combat_resolved' });
assert.equal(back.from, 'BATTLE_SCENE');
assert.equal(back.to, 'BOARD');
assert.equal(back.snapshotRestored, true);
assert.deepEqual(restored, [{ camera: [16, 18, 29], target: [2, 0.7, 2], selectedRoad: 'P1-R2' }]);
assert.equal(controller.current().boardInteractionEnabled, true);

const directRestored = [];
const direct = createBattleDirectActualContinuityController({
  captureBoardView: () => ({ camera: 'same-board-camera', target: 'same-board-target' }),
  restoreBoardView: (snapshot) => directRestored.push(snapshot)
});
assert.equal(direct.enterBattleScene().snapshotCaptured, true);
assert.equal(direct.returnToBoard().snapshotRestored, true);
assert.deepEqual(directRestored, [{ camera: 'same-board-camera', target: 'same-board-target' }]);

const noop = direct.returnToBoard({ reason: 'already_back' });
assert.equal(noop.from, 'BOARD');
assert.equal(noop.to, 'BOARD');
assert.equal(noop.snapshotCaptured, false);
assert.equal(noop.snapshotRestored, false);
assert.equal(direct.current().state, 'BOARD');
