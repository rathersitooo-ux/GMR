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

test('projects one shared Naki binding across all four distinct actual-board participants', () => {
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
    assert.equal(row.left, '50%');
    assert.equal(row.top, '50%');
    assert.notEqual(row.offsetX === 0 && row.offsetY === 0, true);
  }

  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.actualBoardMarkerRoot, '#boardPlayers');
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.presentationOnly, true);
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.gameplayAuthority, false);
  assert.equal(NAKI_4P_BOARD_VISUAL_BINDING.failVisible, true);
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
