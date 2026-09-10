import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COMPLETION_CONSEQUENCE,
  projectCompletionRule,
  resolveCompletionRule,
} from '../browser/new-base-legacy-seven-win-gate-core.mjs';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');

test('arbitrary positive N can be a direct room victory threshold', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 11,
    completionConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN,
  });
  assert.equal(projectCompletionRule({ authoritativeCount: 10, resolvedRule: rule }).forwardCompletionWin, false);
  const reached = projectCompletionRule({ authoritativeCount: 11, resolvedRule: rule });
  assert.equal(reached.forwardCompletionWin, true);
  assert.equal(reached.terminalByCompletionRule, true);
});

test('same configurable N can remain a nonterminal GOAL gate', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 5,
    completionConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH,
  });
  const reached = projectCompletionRule({ authoritativeCount: 5, resolvedRule: rule });
  assert.equal(reached.forwardCompletionWin, false);
  assert.equal(reached.connectGoalPath, true);
  assert.equal(reached.goalReachStillRequired, true);
  assert.equal(reached.terminalByCompletionRule, false);
});

test('friend-room host owns and synchronizes the direct-win target', () => {
  assert.match(html, /completionTargetCount:7,slots:/);
  assert.match(html, /function setFriendCompletionTarget\(value\)/);
  assert.match(html, /id="friendWinCount" type="number" min="1" step="1"/);
  assert.match(html, /completionConsequence:'DIRECT_COMPLETION_WIN'/);
  assert.match(html, /completionRule:clone\(m\.completionRule\|\|null\)/);
  assert.match(html, /completionRule:clone\(pr\.completionRule\|\|null\)/);
  assert.match(html, /setWinCount:setFriendCompletionTarget/);
});

test('existing live checkWin consumes merged completion core exactly at the result seam', () => {
  assert.match(html, /async function checkWin\(\)/);
  assert.match(html, /await import\('\.\/new-base-legacy-seven-win-gate-core\.mjs'\)/);
  assert.match(html, /projectCompletionRule\(\{authoritativeCount:/);
  assert.match(html, /:await checkWin\(\)/);
  assert.match(html, /completionConsequence!==COMPLETION_CONSEQUENCE\.DIRECT_COMPLETION_WIN\)return\[\]/);
});

test('public package includes dynamic completion core', () => {
  assert.match(build, /source: 'browser\/new-base-legacy-seven-win-gate-core\.mjs'/);
  assert.match(build, /output: 'new-base-legacy-seven-win-gate-core\.mjs'/);
});
