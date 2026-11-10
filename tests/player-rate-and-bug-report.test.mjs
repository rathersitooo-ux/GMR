import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRateState, applyMatchResult, displayRate, matchmakingRate, RATE_INITIAL,
} from '../browser/player-rate-core.mjs';
import {
  createBugReportBook, submitReport, judgeReport, contributionCount, reportFingerprint,
} from '../browser/bug-report-core.mjs';

test('レート：勝つと内部も表示も上がる', () => {
  const s0 = createRateState();
  const { state, delta } = applyMatchResult(s0, 1, [1500, 1500, 1500]);
  assert.ok(delta > 0);
  assert.equal(matchmakingRate(state), RATE_INITIAL + delta);
  assert.equal(displayRate(state), RATE_INITIAL + delta);
  assert.equal(state.matches, 1);
});

test('レート：負けると内部は下がるが、表示は減らない', () => {
  let s = createRateState();
  s = applyMatchResult(s, 1, [1500, 1500, 1500]).state; // 先に上げる
  const peak = displayRate(s);
  const r = applyMatchResult(s, 4, [1500, 1500, 1500]);
  assert.ok(r.delta < 0);
  assert.ok(matchmakingRate(r.state) < matchmakingRate(s));
  assert.equal(displayRate(r.state), peak); // 表示は減らない
});

test('レート：格上に勝つ方が、格下に勝つより大きく上がる', () => {
  const s = createRateState();
  const vsStrong = applyMatchResult(s, 1, [1900, 1900, 1900]).delta;
  const vsWeak = applyMatchResult(s, 1, [1100, 1100, 1100]).delta;
  assert.ok(vsStrong > vsWeak);
});

test('バグ報告：成立した一意な報告だけが貢献に数えられる', () => {
  const book = createBugReportBook();
  const a = submitReport(book, { title: 'ボタンが反応しない', body: '準備画面で起きる' });
  const b = submitReport(book, { title: '文字が重なる', body: '結果画面で起きる' });
  assert.equal(contributionCount(book), 0); // まだ成立していない
  judgeReport(book, a.id, 'established');
  assert.equal(contributionCount(book), 1);
  judgeReport(book, b.id, 'rejected');
  assert.equal(contributionCount(book), 1); // 却下は数えない
});

test('バグ報告：同じ内容の再送は重複になり、成立にも進めない', () => {
  const book = createBugReportBook();
  const a = submitReport(book, { title: '落ちる', body: '対戦開始で落ちる' });
  const dup = submitReport(book, { title: '落ちる', body: '対戦開始で落ちる' });
  assert.equal(dup.status, 'duplicate');
  judgeReport(book, dup.id, 'established'); // 重複は成立に進めない
  assert.equal(contributionCount(book), 0);
  judgeReport(book, a.id, 'established');
  assert.equal(contributionCount(book), 1); // 元の1件だけ
  assert.equal(reportFingerprint({ title: '落ちる', body: '対戦開始で落ちる' }), a.fingerprint);
});
