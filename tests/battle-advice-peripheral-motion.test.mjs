import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME,
} from '../browser/battle-board-visual-explanation-runtime-mount.mjs';

const sourcePath = fileURLToPath(new URL('../browser/battle-board-visual-explanation-runtime-mount.mjs', import.meta.url));

test('Advice Partner motion stays short, presentation-only, and does not animate initial compact state', () => {
  const motion = BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.partnerAdvicePeripheralMotion;
  assert.ok(motion);
  assert.equal(motion.presentationOnly, true);
  assert.equal(motion.initialMotion, false);
  assert.equal(motion.expandMs, 180);
  assert.equal(motion.collapseMs, 140);
  assert.equal(motion.contentRevealMs, 120);
  assert.equal(motion.restartOnSameStateSync, false);
  assert.equal(motion.reducedMotionPreservesState, true);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.gameplayAuthority, false);
  assert.equal(BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME.automaticExecution, false);
});

test('Battle Advice CSS uses separate expand/collapse timing and keeps reduced-motion fail-safe', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /data-player-focus-motion-ready/);
  assert.match(source, /--gameroad-partner-advice-motion-ms:\$\{PARTNER_ADVICE_EXPAND_MS\}ms/);
  assert.match(source, /--gameroad-partner-advice-motion-ms:\$\{PARTNER_ADVICE_COLLAPSE_MS\}ms/);
  assert.match(source, /transition:width var\(--gameroad-partner-advice-motion-ms\)/);
  assert.match(source, /@keyframes gameroadPartnerAdviceReveal/);
  assert.match(source, /@keyframes gameroadPartnerAdviceReaction/);
  assert.match(source, /@keyframes gameroadPartnerAdvicePlayerReply/);
  assert.match(source, /prefers-reduced-motion:reduce/);
  assert.match(source, /transition:none!important;animation:none!important/);
  assert.match(source, /if \(!motionReady\) root\.setAttribute\?\.\(PARTNER_ADVICE_MOTION_READY_ATTR, 'true'\)/);
  assert.doesNotMatch(source, /setTimeout\(|setInterval\(/);
  assert.doesNotMatch(source, /transition:[^`]*backdrop-filter/);
});
