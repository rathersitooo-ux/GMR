import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectCurrentBoardDomExplanation,
  applyCurrentBoardDomExplanation,
  BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME,
} from '../browser/battle-board-visible-explanation-runtime.mjs';

function node(positionId, classes = []) {
  const attributes = new Map();
  return {
    dataset: { pos: positionId },
    classList: { contains: (name) => classes.includes(name) },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; },
  };
}

function board(nodes) {
  const attributes = new Map();
  return {
    dataset: {},
    querySelectorAll(selector) {
      assert.equal(selector, '.node[data-pos]');
      return nodes;
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
  };
}

test('projects only directly evidenced reachable board nodes into the existing semantic core', () => {
  const a = node('A');
  const b = node('B', ['reachable']);
  const c = node('C', ['reachable']);
  const root = board([a, b, c]);
  const current = projectCurrentBoardDomExplanation(root);
  assert.equal(current.projection.ok, true);
  assert.deepEqual(current.projection.channels.reachable, ['B', 'C']);
  assert.deepEqual(current.projection.rolesByPosition.B, ['reachable']);
  assert.deepEqual(current.projection.rolesByPosition.C, ['reachable']);
  assert.equal(current.projection.rolesByPosition.A, undefined);
});

test('applies presentation-only reachable roles without writing gameplay state', () => {
  const a = node('A');
  const b = node('B', ['reachable']);
  const root = board([a, b]);
  const result = applyCurrentBoardDomExplanation(root);
  assert.equal(result.active, true);
  assert.equal(result.reachableCount, 1);
  assert.equal(a.getAttribute('data-board-visual-roles'), null);
  assert.equal(b.getAttribute('data-board-visual-roles'), 'reachable');
  assert.equal(root.getAttribute('data-board-visual-explanation'), '1');
  assert.equal(root.dataset.boardVisualExplanationAuthority, 'authoritative-existing-board-dom');
  assert.equal(root.dataset.boardVisualExplanationGameplayAuthority, 'false');
  assert.equal(root.dataset.boardVisualExplanationStateWrite, 'false');
});

test('fails closed when the current board exposes no position nodes', () => {
  const root = board([]);
  const result = applyCurrentBoardDomExplanation(root);
  assert.equal(result.active, false);
  assert.equal(result.reachableCount, 0);
  assert.equal(root.getAttribute('data-board-visual-explanation'), '0');
});

test('runtime contract remains presentation-only and refuses topology or rules inference', () => {
  assert.equal(BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME.presentationOnly, true);
  assert.equal(BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME.gameplayAuthority, false);
  assert.equal(BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME.gameStateWrite, false);
  assert.equal(BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME.topologyInference, false);
  assert.equal(BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME.rulesInference, false);
  assert.deepEqual(BATTLE_BOARD_VISIBLE_EXPLANATION_RUNTIME.directEvidenceRoles, ['reachable']);
});
