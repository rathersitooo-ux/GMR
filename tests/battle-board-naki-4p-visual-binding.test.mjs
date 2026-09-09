import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING,
  NAKI_4P_BOARD_VISUAL_BINDING,
  projectFourParticipantControlledCharacters,
  projectFourParticipantNakiBoardMarkers,
} from '../browser/battle-board-naki-4p-visual-binding.mjs';

function marker(participantId, character, groupCount = 4) {
  return {
    dataset: {
      player: participantId,
      character: character ?? '',
      groupCount: String(groupCount),
    },
  };
}

test('uses each authoritative board marker character instead of hardcoding one Advice Partner', () => {
  const input = [
    marker('P1', 'partner.naki'),
    marker('P2', 'partner.saasuna'),
    marker('P3', 'partner.mato'),
    marker('P4', 'partner.creator.miku'),
  ];

  const projected = projectFourParticipantControlledCharacters(input);
  assert.equal(projected.length, 4);
  assert.deepEqual(projected.map(row => row.participantId), ['P1', 'P2', 'P3', 'P4']);
  assert.deepEqual(projected.map(row => row.characterId), [
    'partner.naki',
    'partner.saasuna',
    'partner.mato',
    'partner.creator.miku',
  ]);
  assert.equal(new Set(projected.map(row => row.characterId)).size, 4);
  assert.ok(projected.every(row => row.identityState === 'authoritative-marker-character'));

  for (const row of projected) {
    assert.equal(row.visible, true);
    assert.equal(Object.hasOwn(row, 'left'), false);
    assert.equal(Object.hasOwn(row, 'top'), false);
    assert.equal(Object.hasOwn(row, 'offsetX'), false);
    assert.equal(Object.hasOwn(row, 'offsetY'), false);
  }
});

test('does not impersonate Naki when one participant character identity is missing', () => {
  const projected = projectFourParticipantControlledCharacters([
    marker('P1', 'partner.naki'),
    marker('P2', ''),
    marker('P3', 'partner.mato'),
    marker('P4', 'partner.creator.miku'),
  ]);
  assert.equal(projected[1].participantId, 'P2');
  assert.equal(projected[1].characterId, null);
  assert.equal(projected[1].identityState, 'participant-generic');
});

test('preserves actual parent board marker as movement coordinate authority', () => {
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.actualBoardMarkerRoot, '#boardPlayers');
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.actualBoardMarkerSelector, '.boardPlayerToken[data-player]');
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.markerCharacterDataset, 'data-character');
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.positionAuthority, 'PARENT_BOARD_PLAYER_MARKER');
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.coordinateProjection, 'NONE__VISUAL_IS_CHILD_OF_AUTHORITATIVE_MARKER');
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.identityAuthority, 'AUTHORITATIVE_BOARD_MARKER_CHARACTER');
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.advicePartnerRole, 'SEPARATE_NOT_A_FALLBACK');
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.presentationOnly, true);
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.gameplayAuthority, false);
  assert.equal(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.failVisible, true);
});

test('keeps four controlled-character visuals inside the existing board-first footprint budget', () => {
  const footprint = CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING.visualFootprint;
  assert.deepEqual(footprint.desktop, { surfaceWidth: 44, surfaceHeight: 56, fallbackWidth: 34, fallbackHeight: 44 });
  assert.deepEqual(footprint.compact, { surfaceWidth: 38, surfaceHeight: 48, fallbackWidth: 30, fallbackHeight: 38 });
  assert.deepEqual(footprint.shortLandscape, { surfaceWidth: 32, surfaceHeight: 40, fallbackWidth: 26, fallbackHeight: 32 });
  assert.deepEqual(footprint.portrait, { surfaceWidth: 34, surfaceHeight: 44, fallbackWidth: 28, fallbackHeight: 36 });
});

test('keeps compatibility exports without retaining Naki-specific identity semantics', () => {
  assert.equal(projectFourParticipantNakiBoardMarkers, projectFourParticipantControlledCharacters);
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING, CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING);
  assert.equal(Object.hasOwn(CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING, 'characterId'), false);
});

test('rejects incomplete or duplicate participant sets instead of inventing controlled-character slots', () => {
  assert.deepEqual(projectFourParticipantControlledCharacters([
    marker('P1', 'partner.naki'),
    marker('P2', 'partner.saasuna'),
    marker('P3', 'partner.mato'),
  ]), []);

  assert.deepEqual(projectFourParticipantControlledCharacters([
    marker('P1', 'partner.naki'),
    marker('P1', 'partner.saasuna'),
    marker('P3', 'partner.mato'),
    marker('P4', 'partner.creator.miku'),
  ]), []);
});
