import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRogueRunConsumerController } from '../browser/rogue-run-runtime-mount.mjs';

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

test('production HTML mounts the Rogue host after the current runtime and imports the live consumer once', () => {
  const html = fs.readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  assert.equal((html.match(/id="gameroad-rogue-run-host-r1"/g) || []).length, 1);
  assert.equal((html.match(/id="gameroad-rogue-run-live-mount-r1"/g) || []).length, 1);
  assert.match(html, /import \{ mountRogueRunRuntime \} from '\.\/rogue-run-runtime-mount\.mjs'/);
  assert.match(html, /GAMEROAD_ROGUE_RUNTIME\s*=\s*mountRogueRunRuntime\(globalThis\.GAMEROAD_ROGUE_HOST\)/);
});
