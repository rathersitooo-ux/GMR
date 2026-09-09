import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING,
  NAKI_4P_BOARD_VISUAL_BINDING,
  projectFourParticipantControlledCharacters,
  projectFourParticipantNakiBoardMarkers,
} from '../browser/battle-board-naki-4p-visual-binding.mjs';

function marker(participantId, left = '50%', top = '50%', ox = 0, oy = 0) {
  return {
    dataset: { player: participantId },
    style: {
      left,
      top,
      getPropertyValue(name) {
        if (name === '--ox') return `${ox}px`;
        if (name === '--oy') return `${oy}px`;
        return '';
      },
    },
  };
}

function motion(overrides = {}) {
  return {
    phase: 'idle',
    animation: 'idle-breathe',
    durationMs: 2200,
    easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    loop: true,
    facing: 'forward',
    reaction: null,
    motionSerial: 0,
    reducedMotion: false,
    lowPerformance: false,
    positionKey: 'node-a',
    failVisible: true,
    ...overrides,
  };
}

function projection(overrides = {}) {
  const defaults = {
    P1: { characterId: 'character.dill', positionKey: 'node-shared', motion: motion({ phase: 'moving', animation: 'accepted-move', durationMs: 180, facing: 'right', motionSerial: 4, positionKey: 'node-shared' }) },
    P2: { characterId: 'character.lyca', positionKey: 'node-shared', motion: motion({ phase: 'selected', animation: 'selected-focus', durationMs: 140, facing: 'left', motionSerial: 2, positionKey: 'node-shared' }) },
    P3: { characterId: 'character.player-c', positionKey: 'node-c', motion: motion({ facing: 'up-right', motionSerial: 1, positionKey: 'node-c' }) },
    P4: { characterId: 'character.player-d', positionKey: 'node-d', motion: motion({ phase: 'reacting', animation: 'reaction-impact', durationMs: 160, facing: 'down-left', reaction: 'impact', motionSerial: 7, positionKey: 'node-d' }) },
  };
  const merged = { ...defaults, ...overrides };
  return ['P1', 'P2', 'P3', 'P4'].map((participantId) => ({
    participantId,
    ...merged[participantId],
  }));
}

const fourMarkers = () => [
  marker('P1', '50%', '50%', -54, -34),
  marker('P2', '50%', '50%', 54, -34),
  marker('P3', '50%', '50%', -54, 34),
  marker('P4', '50%', '50%', 54, 34),
];

test('pairs four authoritative markers with exact caller character/motion projection without owning coordinates', () => {
  const projected = projectFourParticipantControlledCharacters(fourMarkers(), projection());

  assert.equal(projected.length, 4);
  assert.deepEqual(projected.map((row) => row.participantId), ['P1', 'P2', 'P3', 'P4']);
  assert.deepEqual(projected.map((row) => row.characterId), [
    'character.dill',
    'character.lyca',
    'character.player-c',
    'character.player-d',
  ]);
  assert.deepEqual(projected.map((row) => row.motion.phase), ['moving', 'selected', 'idle', 'reacting']);
  assert.deepEqual(projected.map((row) => row.motion.facing), ['right', 'left', 'up-right', 'down-left']);
  assert.equal(projected[0].positionKey, 'node-shared');
  assert.equal(projected[1].positionKey, 'node-shared');
  assert.notStrictEqual(projected[0], projected[1]);

  for (const row of projected) {
    assert.equal(row.visible, true);
    assert.equal(Object.hasOwn(row, 'left'), false);
    assert.equal(Object.hasOwn(row, 'top'), false);
    assert.equal(Object.hasOwn(row, 'offsetX'), false);
    assert.equal(Object.hasOwn(row, 'offsetY'), false);
    assert.notEqual(row.characterId, 'partner.naki');
  }
});

test('same-node participants remain independent instead of being deduplicated by board position', () => {
  const projected = projectFourParticipantControlledCharacters(fourMarkers(), projection());
  const shared = projected.filter((row) => row.positionKey === 'node-shared');

  assert.equal(shared.length, 2);
  assert.deepEqual(shared.map((row) => row.participantId), ['P1', 'P2']);
  assert.notEqual(shared[0].characterId, shared[1].characterId);
  assert.notEqual(shared[0].motion.motionSerial, shared[1].motion.motionSerial);
});

test('fails closed on missing, incomplete, duplicate, or identity-less projection instead of manufacturing Naki', () => {
  assert.deepEqual(projectFourParticipantControlledCharacters(fourMarkers(), null), []);
  assert.deepEqual(projectFourParticipantControlledCharacters(fourMarkers(), projection().slice(0, 3)), []);

  const duplicate = projection().map((row, index) => index === 3 ? { ...row, participantId: 'P3' } : row);
  assert.deepEqual(projectFourParticipantControlledCharacters(fourMarkers(), duplicate), []);

  const missingIdentity = projection({
    P2: { characterId: '', positionKey: 'node-shared', motion: motion({ motionSerial: 3, positionKey: 'node-shared' }) },
  });
  assert.deepEqual(projectFourParticipantControlledCharacters(fourMarkers(), missingIdentity), []);

  assert.deepEqual(projectFourParticipantNakiBoardMarkers(fourMarkers()), []);
});

test('preserves reduced-motion and low-performance projection flags without inventing a second motion policy', () => {
  const projected = projectFourParticipantControlledCharacters(fourMarkers(), projection({
    P1: {
      characterId: 'character.dill',
      positionKey: 'node-next',
      motion: motion({
        phase: 'moving',
        animation: 'reduced-move-cue',
        durationMs: 90,
        facing: 'right',
        motionSerial: 8,
        reducedMotion: true,
        lowPerformance: true,
        positionKey: 'node-next',
      }),
    },
  }));

  assert.equal(projected[0].motion.phase, 'moving');
  assert.equal(projected[0].motion.animation, 'reduced-move-cue');
  assert.equal(projected[0].motion.durationMs, 90);
  assert.equal(projected[0].motion.reducedMotion, true);
  assert.equal(projected[0].motion.lowPerformance, true);
  assert.equal(projected[0].motion.motionSerial, 8);
});

test('contract separates controlled-character identity from Advice Partner and never suppresses the authoritative legacy mover', () => {
  const contract = CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING;

  assert.strictEqual(NAKI_4P_BOARD_VISUAL_BINDING, contract);
  assert.equal(contract.role, 'CONTROLLED_CHARACTER');
  assert.equal(contract.projectionInput, 'CALLER_FOUR_PARTICIPANT_MOTION_DIRECTOR_ROWS');
  assert.equal(contract.identityAuthority, 'CALLER_SUPPLIED_OPAQUE_CHARACTER_ID');
  assert.equal(contract.motionAuthority, 'CALLER_PROJECTED_CONTROLLED_CHARACTER_MOTION');
  assert.equal(contract.positionAuthority, 'PARENT_BOARD_PLAYER_MARKER');
  assert.equal(contract.coordinateProjection, 'NONE__VISUAL_IS_CHILD_OF_AUTHORITATIVE_MARKER');
  assert.equal(contract.unknownIdentityPolicy, 'MARKER_ONLY_NO_FAKE_CHARACTER');
  assert.equal(contract.advicePartnerCoupling, false);
  assert.equal(contract.advicePartnerFallback, false);
  assert.equal(contract.legacyBattleRuntimeSuppressed, false);
  assert.equal(contract.syntheticMovementFromDom, false);
  assert.equal(contract.requiresCompleteFourParticipantProjection, true);
  assert.equal(contract.presentationOnly, true);
  assert.equal(contract.gameplayAuthority, false);
  assert.equal(contract.failVisible, true);
});

test('keeps four-character identity surfaces inside the existing board-first footprint budget', () => {
  const footprint = CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.visualFootprint;
  assert.deepEqual(footprint.desktop, { surfaceWidth: 44, surfaceHeight: 56, fallbackWidth: 34, fallbackHeight: 44 });
  assert.deepEqual(footprint.compact, { surfaceWidth: 38, surfaceHeight: 48, fallbackWidth: 30, fallbackHeight: 38 });
  assert.deepEqual(footprint.shortLandscape, { surfaceWidth: 32, surfaceHeight: 40, fallbackWidth: 26, fallbackHeight: 32 });
  assert.deepEqual(footprint.portrait, { surfaceWidth: 34, surfaceHeight: 44, fallbackWidth: 28, fallbackHeight: 36 });

  const maximumSurface = {
    desktop: { width: 44, height: 56 },
    compact: { width: 38, height: 48 },
    shortLandscape: { width: 32, height: 40 },
    portrait: { width: 34, height: 44 },
  };
  for (const [viewport, dimensions] of Object.entries(footprint)) {
    assert.ok(dimensions.surfaceWidth <= maximumSurface[viewport].width);
    assert.ok(dimensions.surfaceHeight <= maximumSurface[viewport].height);
    assert.ok(dimensions.fallbackWidth < dimensions.surfaceWidth);
    assert.ok(dimensions.fallbackHeight < dimensions.surfaceHeight);
  }
});
