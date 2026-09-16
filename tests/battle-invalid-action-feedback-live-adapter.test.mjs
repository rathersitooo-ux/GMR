import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT,
  createBattleInvalidActionFeedbackLiveAdapter,
  projectBattleInvalidActionFeedback,
} from '../browser/battle-invalid-action-feedback-live-adapter.mjs';

const canonicalReject = Object.freeze({
  rejected: true,
  viewerSafe: true,
  viewerSafeReason: 'そのカードは今は出せません',
  internalReason: 'SECRET_SERVER_ONLY_DETAIL',
});

test('fails closed unless rejection and viewer-safe reason are explicitly supplied by caller', () => {
  assert.deepEqual(projectBattleInvalidActionFeedback(null), {
    ok: false,
    reason: 'REJECTION_REQUIRED',
    feedback: null,
  });
  assert.equal(projectBattleInvalidActionFeedback({ rejected: false }).reason, 'REJECTION_NOT_CONFIRMED');
  assert.equal(projectBattleInvalidActionFeedback({ rejected: true, viewerSafe: false, viewerSafeReason: 'x' }).reason, 'VIEWER_SAFE_ASSERTION_REQUIRED');
  assert.equal(projectBattleInvalidActionFeedback({ rejected: true, viewerSafe: true, viewerSafeReason: '   ' }).reason, 'VIEWER_SAFE_REASON_REQUIRED');
});

test('projects caller-owned viewer-safe reason without inferring or exposing hidden reason fields', () => {
  const out = projectBattleInvalidActionFeedback(canonicalReject);
  assert.equal(out.ok, true);
  assert.equal(out.feedback.reasonText, 'そのカードは今は出せません');
  assert.equal(out.feedback.kind, 'INVALID_ACTION');
  assert.equal(out.feedback.visual.state, 'failed');
  assert.equal(out.feedback.visual.cue, 'REJECTED');
  assert.equal(JSON.stringify(out).includes('SECRET_SERVER_ONLY_DETAIL'), false);
  assert.equal(out.feedback.reasonAuthority, false);
  assert.equal(out.feedback.legalityAuthority, false);
});

test('reuses existing input acknowledgement SFX/haptic vocabulary instead of inventing reject authority', () => {
  const out = projectBattleInvalidActionFeedback(canonicalReject);
  assert.equal(out.feedback.inputAcknowledgement.stage, 'INPUT_ACCEPTED');
  assert.equal(out.feedback.inputAcknowledgement.formalSfxKey, 'click');
  assert.equal(out.feedback.inputAcknowledgement.hapticClass, 'TAP');
  assert.equal(BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.reusesExistingInputAcknowledgementCue, true);
  assert.equal(BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.createsNewSfxVocabulary, false);
  assert.equal(BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT.createsNewHapticVocabulary, false);
});

test('muted or haptics-disabled modes preserve viewer-safe text and failed visual meaning', () => {
  const out = projectBattleInvalidActionFeedback(canonicalReject, {
    audioEnabled: false,
    hapticsEnabled: false,
  });
  assert.equal(out.feedback.reasonText, 'そのカードは今は出せません');
  assert.equal(out.feedback.visual.state, 'failed');
  assert.equal(out.feedback.visual.cue, 'REJECTED');
  assert.equal(out.feedback.inputAcknowledgement.formalSfxKey, null);
  assert.equal(out.feedback.inputAcknowledgement.hapticClass, null);
});

test('reduced-motion and low-performance only reduce motion, not rejection meaning', () => {
  const reduced = projectBattleInvalidActionFeedback(canonicalReject, { reducedMotion: true });
  const lowPerf = projectBattleInvalidActionFeedback(canonicalReject, { lowPerformance: true });
  const both = projectBattleInvalidActionFeedback(canonicalReject, { reducedMotion: true, lowPerformance: true });

  assert.equal(reduced.feedback.visual.motionProfile, 'REDUCED');
  assert.equal(lowPerf.feedback.visual.motionProfile, 'LOW_PERF');
  assert.equal(both.feedback.visual.motionProfile, 'REDUCED_LOW_PERF');
  for (const out of [reduced, lowPerf, both]) {
    assert.equal(out.feedback.reasonText, 'そのカードは今は出せません');
    assert.equal(out.feedback.visual.state, 'failed');
    assert.equal(out.feedback.gameStateWrite, false);
  }
});

test('live adapter delivers visual, existing SFX key and symbolic haptic exactly once', () => {
  const renders = [];
  const sounds = [];
  const haptics = [];
  const adapter = createBattleInvalidActionFeedbackLiveAdapter({
    render: (payload) => renders.push(payload),
    playFormalSfx: (key) => sounds.push(key),
    emitHaptic: (kind) => haptics.push(kind),
  });

  const out = adapter.publish(canonicalReject);
  assert.equal(out.ok, true);
  assert.deepEqual(out.delivery, {
    sequence: 1,
    visual: 'DELIVERED',
    audio: 'DELIVERED',
    haptic: 'DELIVERED',
  });
  assert.equal(renders.length, 1);
  assert.equal(renders[0].reasonText, 'そのカードは今は出せません');
  assert.deepEqual(sounds, ['click']);
  assert.deepEqual(haptics, ['TAP']);
  assert.equal(adapter.getSequence(), 1);
});

test('invalid rejection never fires presentation callbacks', () => {
  let calls = 0;
  const adapter = createBattleInvalidActionFeedbackLiveAdapter({
    render: () => { calls += 1; },
    playFormalSfx: () => { calls += 1; },
    emitHaptic: () => { calls += 1; },
  });

  const out = adapter.publish({ rejected: true, viewerSafe: false, viewerSafeReason: 'internal' });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.equal(adapter.getSequence(), 0);
});

test('presentation callback failures fail soft and never become gameplay blockers', () => {
  const adapter = createBattleInvalidActionFeedbackLiveAdapter({
    render: () => { throw new Error('paint failed'); },
    playFormalSfx: () => { throw new Error('audio failed'); },
    emitHaptic: () => { throw new Error('haptic failed'); },
  });

  const out = adapter.publish(canonicalReject);
  assert.equal(out.ok, true);
  assert.deepEqual(out.delivery, {
    sequence: 1,
    visual: 'FAILED_SOFT',
    audio: 'FAILED_SOFT',
    haptic: 'FAILED_SOFT',
  });
  assert.equal(out.feedback.blocksInput, false);
  assert.equal(out.feedback.gameplayAuthority, false);
});

// Live GAMEROAD consumer regression: keep this inside the conventionally paired adapter test.
const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');

function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0, `missing start: ${start}`);
  assert.ok(b > a, `missing end: ${end}`);
  return source.slice(a, b);
}

const helper = between(html, 'function grBattleInvalidActionFeedback(rejection)', 'function safeClone(x)');

function makeHelperHarness() {
  const toastCalls = [];
  const publishCalls = [];
  let importCalls = 0;
  const adapter = {
    publish(rejection, options) {
      publishCalls.push({ rejection, options });
      return { ok: true };
    },
  };
  const importAdapter = () => {
    importCalls += 1;
    return Promise.resolve({
      createBattleInvalidActionFeedbackLiveAdapter: ({ render }) => {
        assert.equal(typeof render, 'function');
        return adapter;
      },
    });
  };
  const harnessSource = helper.replace(
    "import('./battle-invalid-action-feedback-live-adapter.mjs')",
    '__adapterImport()',
  );
  const createHelper = new Function(
    '__adapterImport',
    'toast',
    'state',
    'grRenderBattleInvalidActionFeedback',
    `let grBattleInvalidFeedbackLoad=null,grBattleInvalidFeedbackClear=0;${harnessSource};return grBattleInvalidActionFeedback;`,
  );
  const run = createHelper(
    importAdapter,
    (message) => toastCalls.push(message),
    { screen: 'battle', settings: { reduceMotion: false, lowPerf: false } },
    () => {},
  );
  return { run, toastCalls, publishCalls, get importCalls() { return importCalls; } };
}

test('invalid-action helper fails closed for plain strings and unsafe or unconfirmed rejection objects', () => {
  const harness = makeHelperHarness();
  for (const rejection of [
    'ロードカードとバトルカードを選択してください',
    { rejected: false, viewerSafe: true, viewerSafeReason: 'unconfirmed' },
    { rejected: true, viewerSafe: false, viewerSafeReason: 'unsafe' },
    { rejected: true, viewerSafe: true },
    { rejected: true, viewerSafe: true, viewerSafeReason: '   ' },
  ]) {
    assert.equal(harness.run(rejection), false);
  }
  assert.deepEqual(harness.toastCalls, []);
  assert.equal(harness.importCalls, 0);
  assert.deepEqual(harness.publishCalls, []);
});

test('invalid-action helper forwards the supplied structured rejection unchanged', async () => {
  const harness = makeHelperHarness();
  const rejection = Object.freeze({
    rejected: true,
    viewerSafe: true,
    viewerSafeReason: '  supplied viewer-safe message  ',
  });
  assert.equal(harness.run(rejection), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.importCalls, 1);
  assert.equal(harness.toastCalls[0], rejection.viewerSafeReason);
  assert.equal(harness.publishCalls.length, 1);
  assert.strictEqual(harness.publishCalls[0].rejection, rejection);
  assert.strictEqual(harness.publishCalls[0].rejection.viewerSafeReason, rejection.viewerSafeReason);
  assert.deepEqual(harness.publishCalls[0].options, {
    audioEnabled: false,
    hapticsEnabled: false,
    visualEnabled: true,
    reducedMotion: false,
    lowPerformance: false,
  });
});

test('invalid-action helper consumes only structured viewer-safe authority rejection', () => {
  assert.match(helper, /typeof rejection!=='object'\|\|Array\.isArray\(rejection\)/);
  assert.match(helper, /rejection\.rejected!==true\|\|rejection\.viewerSafe!==true/);
  assert.match(helper, /typeof rejection\.viewerSafeReason!=='string'\|\|rejection\.viewerSafeReason\.trim\(\)===''/);
  assert.match(helper, /toast\(rejection\.viewerSafeReason\)/);
  assert.match(helper, /adapter\.publish\(rejection,options\)/);
  assert.doesNotMatch(helper, /Object\.freeze\(\{rejected:true,viewerSafe:true/);
  assert.doesNotMatch(helper, /viewerSafeReason:text|String\(reason\|\|/);
  assert.match(helper, /audioEnabled:false,hapticsEnabled:false,visualEnabled:true/);
  assert.match(helper, /reducedMotion:!!state\.settings\?\.reduceMotion/);
  assert.match(helper, /lowPerformance:!!state\.settings\?\.lowPerf/);
  assert.doesNotMatch(helper, /legalPlan\(|reasonCode|legality|new Map|switch\s*\(|navigator\.vibrate|audioEmitSfx|playFormalSfx|emitHaptic|new Audio|state\.[A-Za-z_$][\w$]*\s*=/);
});

test('the six existing plan rejection authority branches construct exact structured viewer-safe messages inline', () => {
  const normal = between(html, 'async function commitPlans(){', 'globalThis.GAMEROAD_READY_PLAN_COMMIT');
  const host = between(html, 'async function submitHostPlan(){', 'function submitGuestPlan(){');
  const guest = between(html, 'function submitGuestPlan(){', 'async function maybeResolvePlans(){');
  const expected = [
    [normal, 'ロードカードとバトルカードを選択してください'],
    [normal, '別の札を選択してください'],
    [normal, '通常移動可能歩数を超えています'],
    [normal, '経路が連続していません'],
    [host, '予約内容を確認してください'],
    [guest, '予約内容を確認してください'],
  ];
  for (const [branch, message] of expected) {
    assert.ok(
      branch.includes(`return grBattleInvalidActionFeedback({rejected:true,viewerSafe:true,viewerSafeReason:'${message}'});`),
      `missing exact structured rejection: ${message}`,
    );
  }
  const marker = /grBattleInvalidActionFeedback\(\{rejected:true,viewerSafe:true,viewerSafeReason:'[^']+'\}\)/g;
  assert.equal((normal.match(marker) || []).length, 4);
  assert.equal((host.match(marker) || []).length, 1);
  assert.equal((guest.match(marker) || []).length, 1);
  assert.doesNotMatch(`${normal}${host}${guest}`, /grBattleInvalidActionFeedback\(['"]/);
  assert.doesNotMatch(host + guest, /viewerSafeReason:v\.reason|reasonMap|switch\s*\(v\.reason\)/);
});

test('feedback remains presentation-only and reuses existing ready/toast surfaces', () => {
  assert.match(helper, /toast\(rejection\.viewerSafeReason\)/);
  assert.match(html, /#readyPlan\.grInvalidFeedback\{outline:2px solid currentColor/);
  assert.match(html, /function grRenderBattleInvalidActionFeedback/);
  assert.match(html, /motionProfile==='NORMAL'/);
  assert.doesNotMatch(helper, /legalPlan\(|state\.match\s*=|navigator\.vibrate|audioEmitSfx/);
});

test('public package still contains the reused adapter dependency', () => {
  assert.match(build, /browser\/battle-invalid-action-feedback-live-adapter\.mjs/);
  assert.match(build, /browser\/battle-interaction-feedback-runtime\.mjs/);
});
