import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const START_MATCH_PATTERN = /function startMatch\(\)\{.*?syncFromGame\?\.\(\);return state\.match\}/s;

function extractStartMatch() {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  const hit = html.match(START_MATCH_PATTERN);
  assert.ok(hit, 'startMatch function must be uniquely discoverable');
  return hit[0];
}

function runStartMatch({ flag, usable = true }) {
  const code = extractStartMatch();
  let shown = 0;
  const globalStub = {
    GAMEROAD_CREATE_DECK_MATCH_START_SNAPSHOT: () => ({
      setup: { mode: '4p', content: 'normal' },
      deck: { main: ['c1', 'c2'], ex: [], ruleId: 'r', ruleRevision: 1 },
    }),
    GAMEROAD_POST_DRAW_JANKEN_ASSIGNMENT: () => ({}),
    crypto: { getRandomValues(a) { a[0] = 0; return a; } },
  };
  if (flag !== undefined) globalStub.GAMEROAD_RANK_MATCH_SKIP_BATTLE_START = flag;
  const state = {
    savedDeck: ['c1'],
    savedDeckRule: 'r',
    setupMode: '4p',
    setupContent: 'normal',
    playerCharacterId: 'p1',
    selectedPartnerId: 'partner.saasuna',
    match: null,
  };
  const c = {
    globalThis: globalStub,
    window: {},
    battleMount: null,
    battleMountPromise: null,
    state,
    deckEligibility: () => ({ usable }),
    deckEligibilityMessage: () => '',
    toast() {},
    show() {},
    renderSetupDeckStatus() {},
    audioResetForNewMatch() {},
    $: () => null,
    validateDeck: () => true,
    playerCount: () => 4,
    makePlayer: (i) => ({ id: `P${i + 1}` }),
    centerPort: (owner) => `C:${owner}`,
    grCreateSelectionLock: () => ({}),
    grRoomMatchCompletionChoices: () => ({}),
    grBattleReplayBegin() {},
    initRoundRuntime() {},
    log() {},
    grRoomMatchRuleText: () => ({ shortText: '' }),
    setupBattleDetails() {},
    renderBattle() {},
    showBattleStartPresentation() { shown += 1; },
  };
  vm.createContext(c);
  vm.runInContext(code, c);
  const match = c.startMatch();
  return { shown, flagAfter: globalStub.GAMEROAD_RANK_MATCH_SKIP_BATTLE_START, match };
}

test('rank match skips the BATTLE START title and movie, normal matches still show them', () => {
  const ranked = runStartMatch({ flag: true });
  assert.ok(ranked.match, 'the ranked match itself must still start');
  assert.equal(ranked.shown, 0, 'ranked matches must not show the title/movie');
  assert.equal(ranked.flagAfter, false, 'the one-shot flag must be consumed');

  const normal = runStartMatch({ flag: false });
  assert.ok(normal.match, 'a normal match must still start');
  assert.equal(normal.shown, 1, 'a normal match must show the title/movie once');

  const unset = runStartMatch({});
  assert.ok(unset.match);
  assert.equal(unset.shown, 1, 'no flag at all must also show the title/movie');
});

test('a failed ranked start does not leak the skip flag into the next normal match', () => {
  const code = extractStartMatch();
  let shown = 0;
  const globalStub = {
    GAMEROAD_CREATE_DECK_MATCH_START_SNAPSHOT: () => ({
      setup: { mode: '4p', content: 'normal' },
      deck: { main: ['c1', 'c2'], ex: [], ruleId: 'r', ruleRevision: 1 },
    }),
    GAMEROAD_POST_DRAW_JANKEN_ASSIGNMENT: () => ({}),
    crypto: { getRandomValues(a) { a[0] = 0; return a; } },
    GAMEROAD_RANK_MATCH_SKIP_BATTLE_START: true,
  };
  const state = {
    savedDeck: ['c1'],
    savedDeckRule: 'r',
    setupMode: '4p',
    setupContent: 'normal',
    playerCharacterId: 'p1',
    selectedPartnerId: 'partner.saasuna',
    match: null,
  };
  let usable = false;
  const c = {
    globalThis: globalStub,
    window: {},
    battleMount: null,
    battleMountPromise: null,
    state,
    deckEligibility: () => ({ usable }),
    deckEligibilityMessage: () => 'deck unusable',
    toast() {},
    show() {},
    renderSetupDeckStatus() {},
    audioResetForNewMatch() {},
    $: () => null,
    validateDeck: () => true,
    playerCount: () => 4,
    makePlayer: (i) => ({ id: `P${i + 1}` }),
    centerPort: (owner) => `C:${owner}`,
    grCreateSelectionLock: () => ({}),
    grRoomMatchCompletionChoices: () => ({}),
    grBattleReplayBegin() {},
    initRoundRuntime() {},
    log() {},
    grRoomMatchRuleText: () => ({ shortText: '' }),
    setupBattleDetails() {},
    renderBattle() {},
    showBattleStartPresentation() { shown += 1; },
  };
  vm.createContext(c);
  vm.runInContext(code, c);
  assert.equal(c.startMatch(), null, 'an unusable deck must stop the start');
  assert.equal(globalStub.GAMEROAD_RANK_MATCH_SKIP_BATTLE_START, false, 'the flag must be consumed even when the start fails');
  usable = true;
  const match = c.startMatch();
  assert.ok(match, 'the next normal start must run');
  assert.equal(shown, 1, 'the next normal match must show the title/movie');
});

test('startMatch reads and gates on the skip flag in its own body', () => {
  const body = extractStartMatch();
  assert.match(body, /GAMEROAD_RANK_MATCH_SKIP_BATTLE_START===true/);
  assert.match(body, /globalThis\.GAMEROAD_RANK_MATCH_SKIP_BATTLE_START=false/);
  assert.ok(
    body.indexOf('GAMEROAD_RANK_MATCH_SKIP_BATTLE_START=false') < body.indexOf('snapshot=snapshotFactory('),
    'the flag must be consumed at entry, before the snapshot, so a failed start cannot leak it',
  );
  assert.match(body, /if\(!skipBattleStartPresentation\)showBattleStartPresentation\(\)/);
});

test('beginRankMatchBattle raises the skip flag before clicking start', () => {
  const base = readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  const hit = base.match(/function beginRankMatchBattle\(doc\) \{[\s\S]*?\n\}/);
  assert.ok(hit, 'beginRankMatchBattle must be discoverable');
  const body = hit[0];
  assert.match(body, /GAMEROAD_RANK_MATCH_SKIP_BATTLE_START = true/);
  assert.ok(
    body.indexOf('GAMEROAD_RANK_MATCH_SKIP_BATTLE_START = true') < body.indexOf('start.click()'),
    'the flag must be raised before the start click reaches startMatch',
  );
});
