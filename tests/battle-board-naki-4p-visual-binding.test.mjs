import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NAKI_4P_BOARD_VISUAL_BINDING,
  projectFourParticipantNakiBoardMarkers
} from '../browser/battle-board-naki-4p-visual-binding.mjs';

function marker(participantId, left, top, ox, oy, groupCount = 4) {
  return {
    dataset: { player: participantId, groupCount: String(groupCount) },
    style: {
      left,
      top,
      getPropertyValue(name) {
        if (name === '--ox') return `${ox}px`;
        if (name === '--oy') return `${oy}px`;
        return '';
      }
    }
  };
}

test('projects four distinct Naki identities without creating independent board coordinates', () => {
  const input = [
    marker('P1', '50%', '50%', -54, -34),
    marker('P2', '50%', '50%', 54, -34),
    marker('P3', '50%', '50%', -54, 34),
    marker('P4', '50%', '50%', 54, 34)
  ];

  const projected = projectFourParticipantNakiBoardMarkers(input);
  assert.equal(projected.length, 4);
  assert.deepEqual(projected.map(row => row.participantId), ['P1', 'P2', 'P3', 'P4']);
  assert.equal(new Set(projected.map(row => row.participantId)).size, 4);

  for (const [index, participantId] of ['P1', 'P2', 'P3', 'P4'].entries()) {
    const row = projected[index];
    assert.equal(row.participantId, participantId);
    assert.equal(row.characterId, 'partner.naki');
    assert.equal(row.visible, true);
    assert.equal(Object.hasOwn(row, 'left'), false);
    assert.equal(Object.hasOwn(row, 'top'), false);
    assert.equal(Object.hasOwn(row, 'offsetX'), false);
    assert.equal(Object.hasOwn(row, 'offsetY'), false);
  }

  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.actualBoardMarkerRoot, '#boardPlayers');
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.actualBoardMarkerSelector, '.boardPlayerToken[data-player]');
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.battleFocusChromeSelector, 'body:has(.battle.active) .top');
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.battleFocusChromePolicy, 'SUPPRESS_GLOBAL_BANNER_DURING_ACTIVE_BATTLE_ONLY');
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.positionAuthority, 'PARENT_BOARD_PLAYER_MARKER');
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.coordinateProjection, 'NONE__VISUAL_IS_CHILD_OF_AUTHORITATIVE_MARKER');
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.presentationOnly, true);
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.gameplayAuthority, false);
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.failVisible, true);
});

test('keeps the four-character presentation inside a bounded footprint so the board remains primary', () => {
  const footprint = NAKI_4P_BOARD_VISUAL_BINDING.visualFootprint;
  assert.deepEqual(footprint.desktop, { surfaceWidth: 54, surfaceHeight: 68, fallbackWidth: 42, fallbackHeight: 54 });
  assert.deepEqual(footprint.compact, { surfaceWidth: 48, surfaceHeight: 60, fallbackWidth: 38, fallbackHeight: 48 });
  assert.deepEqual(footprint.shortLandscape, { surfaceWidth: 42, surfaceHeight: 52, fallbackWidth: 34, fallbackHeight: 44 });
  assert.deepEqual(footprint.portrait, { surfaceWidth: 46, surfaceHeight: 58, fallbackWidth: 36, fallbackHeight: 46 });

  for (const dimensions of Object.values(footprint)) {
    assert.ok(dimensions.surfaceWidth <= 54);
    assert.ok(dimensions.surfaceHeight <= 68);
    assert.ok(dimensions.fallbackWidth < dimensions.surfaceWidth);
    assert.ok(dimensions.fallbackHeight < dimensions.surfaceHeight);
  }
});

test('rejects incomplete or duplicate participant projections instead of inventing board identity', () => {
  const incomplete = [
    marker('P1', '20%', '20%', 0, 0, 1),
    marker('P2', '40%', '40%', 0, 0, 1),
    marker('P3', '60%', '60%', 0, 0, 1)
  ];
  assert.deepEqual(projectFourParticipantNakiBoardMarkers(incomplete), []);

  const duplicate = [
    marker('P1', '20%', '20%', 0, 0, 1),
    marker('P1', '30%', '30%', 0, 0, 1),
    marker('P3', '60%', '60%', 0, 0, 1),
    marker('P4', '80%', '80%', 0, 0, 1)
  ];
  assert.deepEqual(projectFourParticipantNakiBoardMarkers(duplicate), []);
});
