import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, '..', 'browser', 'GAMEROAD.html'), 'utf8');

test('room offers a BO1/BO3 series picker and no direct-win choice', () => {
  assert.ok(html.includes('id="friendRuleSeries"'), 'series picker must exist in the lobby');
  assert.ok(html.includes('<option value="1"'), 'BO1 option must exist');
  assert.ok(html.includes('<option value="3"'), 'BO3 option must exist');
  assert.ok(html.includes('>BO1</option>'), 'BO1 label must exist');
  assert.ok(html.includes('>BO3</option>'), 'BO3 label must exist');
  // The 5/7/10 count picker is the other chat's work, not this patch's.
  assert.ok(!html.includes('friendRuleCount'), 'count picker must not be in this patch');
  // Plan A removed the direct-win choice from rooms.
  assert.ok(!html.includes('friendRuleAfter'), 'direct/gate consequence picker must be gone');
  assert.ok(!html.includes('DIRECT_COMPLETION_WIN'), 'no direct-win fallback may remain in the page');
});

test('room rule line shows the gate count and the series', () => {
  assert.ok(html.includes('決まり：${ruleText.title}・${ruleText.seriesLabel}'), 'rule line must show title and series');
  assert.ok(html.includes('id="friendRuleSpectator"'), 'spectator picker stays beside the series picker');
});

test('series choice is held on the room and carried to guests and spectators', () => {
  assert.ok(html.includes('seriesBestOf:FR.seriesBestOf'), 'room state must expose the series');
  assert.ok(html.includes('FR.seriesBestOf=ruleChoices.seriesBestOf'), 'creating a room must keep the picked series');
  assert.ok(html.includes("FR.seriesBestOf=Number(m.completionRule.seriesBestOf)===3?3:1"), 'guests must read the series');
  assert.ok(html.includes("FR.seriesBestOf=Number(m.lobby.completionRule.seriesBestOf)===3?3:1"), 'lobby updates must read the series');
});

test('fallback win rule without the mount is the gate standard, never a direct win', () => {
  const fallback = html.match(/const rule=\{completionTargetCount:7,completionConsequence:'CONNECT_GOAL_PATH',seriesBestOf:1[^\n]*?\}/)?.[0];
  assert.ok(fallback, 'fallback rule must be the 7-card gate standard with BO1');
  assert.ok(html.includes("rule={completionTargetCount:7,completionConsequence:'CONNECT_GOAL_PATH',seriesBestOf:1"), 'fallback rule text must be the gate standard');
});

test('room holds series win counts, reset clears them with the room', () => {
  assert.ok(html.includes('seriesWins:{},seriesWinnerKey:null,seriesCountedMatchId:null,seriesMatchesPlayed:0'), 'FR state and reset must both carry cleared series fields');
  assert.equal(html.split('seriesWins:{},seriesWinnerKey:null').length - 1, 2, 'series fields must exist in the FR definition and in reset()');
  assert.ok(html.includes('function grRoomSeriesReset()'), 'a series reset helper must exist');
  assert.ok(html.includes("FR.roomState='lobby';grRoomSeriesReset();"), 'returning to the lobby must end the series');
});

test('friend room end counts the win once and stores it on the result', () => {
  assert.ok(html.includes('m.lastResult.series=grRoomSeriesRecord(m,winners)'), 'friendEndMatch must record the series win on the result');
  assert.ok(html.includes('function grRoomSeriesRecord(m,winners)'), 'the counting helper must exist');
  assert.ok(html.includes('FR.seriesCountedMatchId===m.id'), 'the same match must never be counted twice');
  assert.ok(html.includes('api.series.recordRoomSeriesMatch'), 'counting must go through the series core when the mount is present');
});

test('series state travels to guests and spectators and shows in the lobby', () => {
  assert.ok(html.includes('series:grRoomSeriesSnapshot()'), 'lobby and projections must carry the series snapshot');
  assert.ok(html.includes('if(pr.series)grRoomSeriesApply(pr.series)'), 'guests and spectators must apply the received series');
  assert.ok(html.includes('if(m.lobby?.series)grRoomSeriesApply(m.lobby.series)'), 'lobby updates must apply the received series');
  assert.ok(html.includes('seriesLine='), 'the lobby must show the win count line');
  assert.ok(html.includes('seriesWins:{...FR.seriesWins},seriesWinnerKey:FR.seriesWinnerKey,seriesMatchesPlayed:FR.seriesMatchesPlayed'), 'QA state must expose the series count');
});

test('rematch continues an open series and starts fresh after it is decided', () => {
  assert.ok(html.includes('if(FR.seriesWinnerKey)grRoomSeriesReset();'), 'a decided series must reset before a rematch starts a new one');
});
