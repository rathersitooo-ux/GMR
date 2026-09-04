import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createCurrentBrowserRogueHost,
  createRoguePanelOutsideDismissHandler,
  createRogueRunConsumerController,
} from '../browser/rogue-run-runtime-mount.mjs';

function hostFixture() {
  let screen = 'home';
  let match = null;
  let setupCount = 0;
  let homeCount = 0;
  return {
    host: {
      createRunIdentity: () => ({ runId: 'run-live-1', pathSeed: 'seed-live-1', chapterIdentity: null }),
      readDeckSnapshot: () => ({ main: ['CARD_A'], ex: [] }),
      readHandSnapshot: () => ({ cardIds: ['CARD_A'] }),
      readScreen: () => screen,
      readMatchSnapshot: () => match,
      showSetup: () => { setupCount += 1; screen = 'setup'; },
      showHome: () => { homeCount += 1; screen = 'home'; },
    },
    setScreen: (value) => { screen = value; },
    setMatch: (value) => { match = value; },
    counts: () => ({ setupCount, homeCount }),
  };
}

test('live consumer closes Home route -> existing Battle -> reward skip -> next route -> boss Result', () => {
  const fixture = hostFixture();
  const runtime = createRogueRunConsumerController({ host: fixture.host });

  assert.equal(runtime.start().run.phase, 'AWAITING_ROUTE');
  runtime.chooseRoute('battle');
  assert.equal(fixture.counts().setupCount, 1);

  fixture.setMatch({ matchId: 'match-1', result: null });
  fixture.setScreen('battle');
  assert.equal(runtime.observe(), true);
  assert.equal(runtime.getSnapshot().run.phase, 'AWAITING_BATTLE_RESULT');

  fixture.setMatch({ matchId: 'match-1', result: { winnerIds: ['P1'], receiptId: 'result-1' } });
  fixture.setScreen('result');
  assert.equal(runtime.observe(), true);
  assert.equal(runtime.getSnapshot().run.phase, 'AWAITING_REWARD_DECISION');

  runtime.skipReward();
  assert.equal(runtime.getSnapshot().run.phase, 'AWAITING_ROUTE');
  assert.equal(fixture.counts().homeCount, 1);

  runtime.chooseRoute('boss');
  fixture.setMatch({ matchId: 'match-boss', result: null });
  fixture.setScreen('battle');
  assert.equal(runtime.observe(), true);
  fixture.setMatch({ matchId: 'match-boss', result: { winnerIds: ['P1'], receiptId: 'result-boss' } });
  fixture.setScreen('result');
  assert.equal(runtime.observe(), true);
  assert.equal(runtime.getSnapshot().run.phase, 'COMPLETE');
  assert.deepEqual(runtime.getSnapshot().run.completion, {
    resultHandoff: { screen: 'result', matchId: 'match-boss' },
  });
});

test('Home continue reopens existing Setup when a chosen Rogue route has not started Battle yet', () => {
  const fixture = hostFixture();
  const runtime = createRogueRunConsumerController({ host: fixture.host });

  runtime.start();
  runtime.chooseRoute('battle');
  const chosen = runtime.getSnapshot();
  assert.equal(chosen.run.phase, 'AWAITING_ROUTE');
  assert.equal(chosen.pendingRouteKind, 'battle');
  assert.equal(fixture.counts().setupCount, 1);

  fixture.setScreen('home');
  const resumed = runtime.start();
  assert.equal(fixture.counts().setupCount, 2);
  assert.equal(resumed.run.phase, 'AWAITING_ROUTE');
  assert.equal(resumed.pendingRouteKind, 'battle');
  assert.deepEqual(resumed.run, chosen.run);

  fixture.setMatch({ matchId: 'match-resumed', result: null });
  fixture.setScreen('battle');
  assert.equal(runtime.observe(), true);
  assert.equal(runtime.getSnapshot().run.phase, 'AWAITING_BATTLE_RESULT');
  assert.equal(runtime.getSnapshot().pendingRouteKind, null);
});

test('consumer never invents a reward selection or duplicate Battle result', () => {
  const fixture = hostFixture();
  const runtime = createRogueRunConsumerController({ host: fixture.host });
  runtime.start();
  assert.throws(() => runtime.chooseRoute('event'), /ROUTE_KIND_INVALID/);
  runtime.chooseRoute('battle');
  fixture.setMatch({ matchId: 'match-1', result: null });
  fixture.setScreen('battle');
  runtime.observe();
  fixture.setMatch({ matchId: 'match-1', result: { winnerIds: ['P1'] } });
  fixture.setScreen('result');
  assert.equal(runtime.observe(), true);
  assert.equal(runtime.observe(), false);
  assert.equal(runtime.getSnapshot().run.lastRewardDecision, null);
});

test('consumer ignores an unrelated Result until the started Rogue match Result arrives', () => {
  const fixture = hostFixture();
  const runtime = createRogueRunConsumerController({ host: fixture.host });
  runtime.start();
  runtime.chooseRoute('battle');

  fixture.setMatch({ matchId: 'match-run', result: null });
  fixture.setScreen('battle');
  assert.equal(runtime.observe(), true);
  assert.equal(runtime.getSnapshot().run.phase, 'AWAITING_BATTLE_RESULT');
  assert.equal(runtime.getSnapshot().run.battleHandoff.matchId, 'match-run');

  fixture.setMatch({ matchId: 'match-other', result: { winnerIds: ['P2'], receiptId: 'result-other' } });
  fixture.setScreen('result');
  assert.equal(runtime.observe(), false);
  assert.equal(runtime.getSnapshot().run.phase, 'AWAITING_BATTLE_RESULT');
  assert.equal(runtime.getSnapshot().run.battleHandoff.matchId, 'match-run');

  fixture.setMatch({ matchId: 'match-run', result: { winnerIds: ['P1'], receiptId: 'result-run' } });
  assert.equal(runtime.observe(), true);
  assert.equal(runtime.getSnapshot().run.phase, 'AWAITING_REWARD_DECISION');
});

test('current Browser host projects existing deck, hand, screen, match result, and navigation only', () => {
  let shown = null;
  const documentSource = {
    querySelector(selector) {
      return selector === '.screen.active[data-screen]' ? { dataset: { screen: 'home' } } : null;
    },
  };
  const qa = {
    state: {
      saveAuthorityDeck: { main: ['CARD_A'], ex: [] },
      savedDeck: { main: ['OLD_CARD'], ex: [] },
      match: {
        id: 'match-current',
        players: [{ id: 'P1', human: true, hand: ['CARD_A', 'CARD_B'] }],
        lastResult: {
          headline: 'WIN',
          grade: 'S',
          points: { P1: 7 },
          ranking: [{ player: { id: 'P1' }, rank: 1, depth: 7 }],
        },
      },
    },
    show(screen) { shown = screen; },
  };

  const host = createCurrentBrowserRogueHost({ qa, documentSource });
  assert.ok(host);
  assert.deepEqual(host.readDeckSnapshot(), { main: ['CARD_A'], ex: [] });
  assert.deepEqual(host.readHandSnapshot(), { cardIds: ['CARD_A', 'CARD_B'] });
  assert.equal(host.readScreen(), 'home');
  assert.deepEqual(host.readMatchSnapshot(), {
    matchId: 'match-current',
    result: {
      headline: 'WIN',
      grade: 'S',
      points: { P1: 7 },
      ranking: [{ participantId: 'P1', rank: 1, depth: 7 }],
    },
  });
  host.showSetup();
  assert.equal(shown, 'setup');
  host.showHome();
  assert.equal(shown, 'home');
});

test('Rogue modal outside dismiss closes once, keeps inside clicks, and consumes the underlay click', () => {
  const inside = { id: 'inside' };
  const outside = { id: 'outside' };
  const panel = {
    hidden: false,
    contains(target) { return target === inside; },
  };
  let dismissCount = 0;
  const dismiss = createRoguePanelOutsideDismissHandler({
    panel,
    onDismiss() {
      dismissCount += 1;
      panel.hidden = true;
    },
  });
  const counts = { prevent: 0, stop: 0, immediate: 0 };
  const eventFor = (target) => ({
    target,
    preventDefault() { counts.prevent += 1; },
    stopPropagation() { counts.stop += 1; },
    stopImmediatePropagation() { counts.immediate += 1; },
  });

  assert.equal(dismiss(eventFor(inside)), false);
  assert.equal(dismissCount, 0);
  assert.deepEqual(counts, { prevent: 0, stop: 0, immediate: 0 });

  assert.equal(dismiss(eventFor(outside)), true);
  assert.equal(dismissCount, 1);
  assert.deepEqual(counts, { prevent: 1, stop: 1, immediate: 1 });

  assert.equal(dismiss(eventFor(outside)), false);
  assert.equal(dismissCount, 1);
  assert.deepEqual(counts, { prevent: 1, stop: 1, immediate: 1 });
});

test('already-loaded Home runtime mounts the Rogue consumer once without rewriting production HTML', () => {
  const homeBoot = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.equal((homeBoot.match(/mountRogueRunFromCurrentBrowser/g) || []).length, 2);
  assert.match(homeBoot, /import \{ mountRogueRunFromCurrentBrowser \} from '\.\/rogue-run-runtime-mount\.mjs';/);
  assert.match(homeBoot, /refreshHomeBootPresentation\(\);\s*mountRogueRunFromCurrentBrowser\(\);/);

  const build = fs.readFileSync(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /source: 'browser\/rogue-run-core\.mjs'.*output: 'rogue-run-core\.mjs'/);
  assert.match(build, /source: 'browser\/rogue-run-runtime-mount\.mjs'.*output: 'rogue-run-runtime-mount\.mjs'/);

  const runtimeMount = fs.readFileSync(new URL('../browser/rogue-run-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(runtimeMount, /documentSource\.addEventListener\('click', dismissOnOutsideClick, true\);/);
  assert.match(runtimeMount, /documentSource\.removeEventListener\('click', dismissOnOutsideClick, true\);/);
  assert.match(runtimeMount, /entry\.addEventListener\('click', \(\) => \{ panelDismissed = false; controller\.start\(\); render\(\); \}\);/);
});
