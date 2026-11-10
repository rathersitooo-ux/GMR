import test from 'node:test';
import assert from 'node:assert/strict';

import { projectGoalResultLead } from '../browser/goal-result-render-core.mjs';
import {
  createNewBaseGoalTerminalState,
  applyAuthoritativeNewBaseGoalArrival,
  createNewBaseGoalResultPresentation
} from '../browser/new-base-goal-result-core.mjs';

/**
 * Regression for the renderResult follow-up to the 1010 goal-arrival handoff:
 * renderResult must read the goal outcome and show it on the result screen.
 * The live Result presentation (m.goalResultPresentation) only arrives when
 * the arrival animation completes, which is AFTER endMatch -> renderResult
 * already ran. The terminal state (m.goalTerminalState) is set synchronously
 * before endMatch, and its finalizedResult has the same content as the
 * presentation's clone. renderResult therefore reads the presentation first
 * and falls back to the terminal state.
 */

const PLAYERS = [
  { id: 'P1', name: 'あなた', human: true },
  { id: 'P2', name: 'ポポ', human: false },
  { id: 'P3', name: 'ミルフィー', human: false },
  { id: 'P4', name: 'ナキ', human: false }
];

function goalEvent(overrides = {}) {
  return {
    eventId: 'goal-event-render-1',
    type: 'GOAL_REACHED',
    authoritative: true,
    matchId: 'match-1',
    resultId: 'result-1',
    actorId: 'P2',
    goalId: 'goal:shared',
    winnerIds: ['P2'],
    ...overrides
  };
}

function realFinalizedResults() {
  const state = createNewBaseGoalTerminalState({ matchId: 'match-1' });
  const applied = applyAuthoritativeNewBaseGoalArrival(state, goalEvent());
  assert.equal(applied.accepted, true);
  const presentation = createNewBaseGoalResultPresentation(applied.state, {
    presentationId: 'result-1'
  });
  return {
    fromTerminalState: applied.state.finalizedResult,
    fromPresentation: presentation.finalizedResult
  };
}

test('real chain: presentation finalizedResult projects the goal lead', () => {
  const { fromPresentation } = realFinalizedResults();
  const lead = projectGoalResultLead(fromPresentation, PLAYERS);
  assert.equal(lead.actorId, 'P2');
  assert.equal(lead.actorName, 'ポポ');
  assert.deepEqual(lead.winnerIds, ['P2']);
  assert.equal(lead.leadText, 'ゴール到達で決着');
  assert.equal(lead.arrivalSentence, 'ポポがゴールに到達。');
  assert.equal(Object.isFrozen(lead), true);
});

test('real chain: terminal-state finalizedResult projects the same lead', () => {
  const { fromTerminalState, fromPresentation } = realFinalizedResults();
  const lead = projectGoalResultLead(fromTerminalState, PLAYERS);
  const fromPresentationLead = projectGoalResultLead(fromPresentation, PLAYERS);
  assert.deepEqual(lead, fromPresentationLead);
});

test('human actor is shown as あなた', () => {
  const { fromPresentation } = realFinalizedResults();
  const lead = projectGoalResultLead(
    { ...fromPresentation, goalArrival: { ...fromPresentation.goalArrival, actorId: 'P1' }, winnerIds: ['P1'] },
    PLAYERS
  );
  assert.equal(lead.actorName, 'あなた');
  assert.equal(lead.arrivalSentence, 'あなたがゴールに到達。');
});

test('2v2 winners are kept in order', () => {
  const lead = projectGoalResultLead(
    {
      terminalReason: 'GOAL_REACHED',
      winnerIds: ['P2', 'P3'],
      goalArrival: { actorId: 'P2', eventId: 'e1', goalId: 'goal:shared' }
    },
    PLAYERS
  );
  assert.deepEqual(lead.winnerIds, ['P2', 'P3']);
  assert.equal(lead.actorId, 'P2');
});

test('non-goal results and malformed inputs project to null', () => {
  const good = {
    terminalReason: 'GOAL_REACHED',
    winnerIds: ['P2'],
    goalArrival: { actorId: 'P2', eventId: 'e1', goalId: 'goal:shared' }
  };
  assert.equal(projectGoalResultLead(null, PLAYERS), null);
  assert.equal(projectGoalResultLead([], PLAYERS), null);
  assert.equal(projectGoalResultLead('x', PLAYERS), null);
  assert.equal(projectGoalResultLead({ ...good, terminalReason: 'TIME_UP' }, PLAYERS), null);
  assert.equal(projectGoalResultLead({ ...good, winnerIds: [] }, PLAYERS), null);
  assert.equal(projectGoalResultLead({ ...good, winnerIds: ['P2', 'P2'] }, PLAYERS), null);
  assert.equal(projectGoalResultLead({ ...good, winnerIds: 'P2' }, PLAYERS), null);
  assert.equal(projectGoalResultLead({ ...good, goalArrival: null }, PLAYERS), null);
  assert.equal(projectGoalResultLead({ ...good, goalArrival: { actorId: '' } }, PLAYERS), null);
  assert.equal(projectGoalResultLead({ ...good, goalArrival: { actorId: 'P9' } }, PLAYERS), null);
  assert.equal(projectGoalResultLead(good, []), null);
  assert.equal(projectGoalResultLead(good, null), null);
  assert.equal(projectGoalResultLead(good, [{ id: 'P2', name: '' }]), null);
});

test('input is not mutated', () => {
  const input = {
    terminalReason: 'GOAL_REACHED',
    winnerIds: ['P2'],
    goalArrival: { actorId: 'P2', eventId: 'e1', goalId: 'goal:shared' }
  };
  const before = JSON.stringify(input);
  projectGoalResultLead(input, PLAYERS);
  assert.equal(JSON.stringify(input), before);
});
