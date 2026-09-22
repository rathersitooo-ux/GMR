import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  HOME_RANK_MATCH_ENTRY_LABEL,
  activateHomeRankMatchEntry,
} from '../browser/home-boot-runtime-base-r3.mjs';

test('Home rank entry commits through the existing setup route instead of opening a second waiting surface', () => {
  let setupClicks = 0;
  const setupRoute = { click() { setupClicks += 1; } };
  const home = {
    querySelector(selector) {
      return selector === '.homePadChoice[data-home-target="setup"]' ? setupRoute : null;
    },
  };
  const documentSource = {
    querySelector(selector) {
      return selector === 'section[data-screen="home"]' ? home : null;
    },
  };

  assert.equal(HOME_RANK_MATCH_ENTRY_LABEL, 'ランクマッチ');
  assert.equal(activateHomeRankMatchEntry(documentSource), true);
  assert.equal(setupClicks, 1);
});

test('Home rank entry fails closed when the canonical setup route is unavailable', () => {
  const home = { querySelector() { return null; } };
  const documentSource = {
    querySelector(selector) {
      return selector === 'section[data-screen="home"]' ? home : null;
    },
  };
  assert.equal(activateHomeRankMatchEntry(documentSource), false);
});

test('Home rank entry is a real button and preselects the existing rank mode without inventing ranked rules', () => {
  const source = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("button.type = 'button';"));
  assert.ok(source.includes("button.dataset.homeRankMatchEntry = 'true';"));
  assert.ok(source.includes("button.className = 'homeUtilityBtn gameroadHomeRankMatchEntry';"));
  assert.ok(source.includes("rankMatchRuntime.selectedMode = 'rank';"));
  assert.ok(source.includes("home.querySelector('.homePadChoice[data-home-target=\"setup\"]')"));
  assert.ok(source.includes("'.gameroadHomeRankMatchEntry{min-width:44px;min-height:44px;"));
  assert.equal(source.includes('data-home-rank-match-entry="true"][data-rank-waiting'), false);
});
