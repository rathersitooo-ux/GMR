// season-festival-core.mjs -- S1-08a + S1-08b
// Festival (monthly, 3 teams). Vote once, yobi tokens, 5-department scoring
// totalling 57 points, title steps, shells (win 24 / lose 21 at top title).
// Same-team battles never count toward contribution. Multiplier draws take
// an injected random value (0..1) so they are deterministic in tests.
// Server-side counting is decision-waiting: this core is the local,
// single-player record that the server record must match later.

import { FESTIVAL_DEPARTMENT_POINTS, FESTIVAL_TITLE_STEPS, festivalQuestionForMonth } from './season-s1-config.mjs';

const SCHEMA = 'gameroad.season-festival.v1';
const DEPARTMENTS = Object.freeze(['yobiTokens', 'votes', 'openBattles', 'soloBattles', 'specialBattles']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export function createFestivalState({ month } = {}) {
  const question = festivalQuestionForMonth(month);
  return freeze({
    schema: SCHEMA,
    month,
    question: question.question,
    choices: Object.freeze([...question.choices]),
    grand: question.grand === true,
    vote: null,
    yobiTokens: 0,
    // contribution[dept][teamIndex] = raw amount (votes, tokens, wins...)
    contribution: freeze(Object.fromEntries(DEPARTMENTS.map((dept) => [dept, Object.freeze([0, 0, 0])]))),
    titleStep: 0,
    festivalPoints: 0,
  });
}

export function voteFestival(state, choiceIndex) {
  if (!state || state.schema !== SCHEMA) throw new TypeError('FESTIVAL_STATE_REQUIRED');
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 2) throw new TypeError('CHOICE_INVALID');
  if (state.vote !== null) return freeze({ state, voted: false, reason: 'ALREADY_VOTED' });
  return freeze({
    state: freeze({ ...state, vote: choiceIndex }),
    voted: true,
    reason: 'OK',
    reward: freeze({ kind: 'festival-look', id: 'festival-team-look', note: '本祭の終わりで返却。集めた育成の品は残る。' }),
  });
}

export function addYobiTokens(state, amount) {
  if (!state || state.schema !== SCHEMA) throw new TypeError('FESTIVAL_STATE_REQUIRED');
  if (!Number.isInteger(amount) || amount < 0) throw new TypeError('AMOUNT_INVALID');
  return freeze({ ...state, yobiTokens: state.yobiTokens + amount });
}

// Record one battle's contribution. Same-team battles (isSameTeam) are
// ignored by rule, and the caller is told so.
export function recordFestivalBattle(state, { department, teamIndex, amount = 1, isSameTeam = false } = {}) {
  if (!state || state.schema !== SCHEMA) throw new TypeError('FESTIVAL_STATE_REQUIRED');
  if (!DEPARTMENTS.includes(department)) throw new TypeError('DEPARTMENT_INVALID');
  if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex > 2) throw new TypeError('TEAM_INVALID');
  if (!Number.isInteger(amount) || amount < 0) throw new TypeError('AMOUNT_INVALID');
  if (isSameTeam) return freeze({ state, recorded: false, reason: 'SAME_TEAM_IGNORED' });
  const dept = state.contribution[department];
  const nextDept = Object.freeze(dept.map((value, index) => (index === teamIndex ? value + amount : value)));
  return freeze({
    state: freeze({ ...state, contribution: freeze({ ...state.contribution, [department]: nextDept }) }),
    recorded: true,
    reason: 'OK',
  });
}

// Department winners split the department's points. A tie shares the points
// (floor); any remainder is left unassigned so the total never exceeds 57.
export function computeDepartmentPoints(state) {
  if (!state || state.schema !== SCHEMA) throw new TypeError('FESTIVAL_STATE_REQUIRED');
  const points = [0, 0, 0];
  const breakdown = {};
  for (const dept of DEPARTMENTS) {
    const values = state.contribution[dept];
    const max = Math.max(...values);
    const winners = values.map((value, index) => (value === max && max > 0 ? index : -1)).filter((index) => index >= 0);
    const deptPoints = FESTIVAL_DEPARTMENT_POINTS[dept];
    if (winners.length > 0) {
      const share = Math.floor(deptPoints / winners.length);
      for (const winner of winners) points[winner] += share;
    }
    breakdown[dept] = freeze({ points: deptPoints, winners: Object.freeze(winners) });
  }
  return freeze({ points: Object.freeze(points), total: points[0] + points[1] + points[2], breakdown: freeze(breakdown) });
}

export function festivalWinner(state) {
  const computed = computeDepartmentPoints(state);
  const max = Math.max(...computed.points);
  const winners = computed.points.map((value, index) => (value === max ? index : -1)).filter((index) => index >= 0);
  return freeze({ ...computed, winners: Object.freeze(winners), isTie: winners.length > 1 });
}

// Title steps: 5 steps. Each festival battle win moves the step up by 1
// (capped at the top step). Shells depend on the step and on win/lose.
export function advanceFestivalTitle(state, wins) {
  if (!state || state.schema !== SCHEMA) throw new TypeError('FESTIVAL_STATE_REQUIRED');
  if (!Number.isInteger(wins) || wins < 0) throw new TypeError('WINS_INVALID');
  const step = Math.min(FESTIVAL_TITLE_STEPS.length - 1, state.titleStep + wins);
  return freeze({ ...state, titleStep: step, festivalPoints: state.festivalPoints + wins });
}

export function festivalShells(state, won) {
  if (!state || state.schema !== SCHEMA) throw new TypeError('FESTIVAL_STATE_REQUIRED');
  const step = FESTIVAL_TITLE_STEPS[state.titleStep];
  return won === true ? step.shellsWin : step.shellsLose;
}

export function festivalTitleLabel(state) {
  if (!state || state.schema !== SCHEMA) throw new TypeError('FESTIVAL_STATE_REQUIRED');
  return FESTIVAL_TITLE_STEPS[state.titleStep].label;
}

// 10x / 100x battle draw. randomValue is injected (0..1): <0.10 -> 10x,
// and with a mark held, <0.02 -> 100x. No randomness inside the core.
export function drawFestivalMultiplier({ randomValue, hasMark = false } = {}) {
  if (typeof randomValue !== 'number' || randomValue < 0 || randomValue >= 1) throw new TypeError('RANDOM_INVALID');
  if (hasMark && randomValue < 0.02) return 100;
  if (randomValue < 0.1) return 10;
  return 1;
}
