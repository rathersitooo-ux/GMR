import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BATTLE_REPLAY_VERSION_AUTHORITY,
  battleReplayContentVersion,
  battleReplayRulesVersion,
  createBattleReplayVersionAuthority
} from '../browser/battle-replay-version-authority.mjs';

function extractJsonArrayAfter(text, marker) {
  const markerIndex = text.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing marker: ${marker}`);
  const start = text.indexOf('[', markerIndex + marker.length);
  assert.notEqual(start, -1, `missing array after marker: ${marker}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated array after marker: ${marker}`);
}

test('rules authority is the exact runtime rule id and revision', () => {
  assert.equal(battleReplayRulesVersion({ id: 'FIRST_REGULATION', revision: 3 }), 'FIRST_REGULATION@3');
  assert.throws(() => battleReplayRulesVersion({ id: 'FIRST_REGULATION', revision: 0 }), /DECK_RULE_AUTHORITY_INVALID/);
});

test('content authority is stable to object key order and changes with content', () => {
  const left = [{ id: 'A', power: 3, nested: { b: 2, a: 1 } }];
  const reordered = [{ nested: { a: 1, b: 2 }, power: 3, id: 'A' }];
  const changed = [{ id: 'A', power: 4, nested: { a: 1, b: 2 } }];
  assert.equal(battleReplayContentVersion(left), battleReplayContentVersion(reordered));
  assert.notEqual(battleReplayContentVersion(left), battleReplayContentVersion(changed));
});

test('state authority reuses the accepted live-adapter schema instead of inventing another state schema', () => {
  const versions = createBattleReplayVersionAuthority({
    deckRule: { id: 'FIRST_REGULATION', revision: 3 },
    cardData: [{ id: 'A' }]
  });
  assert.equal(versions.state, 'GAMEROAD_BATTLE_REPLAY_LIVE_ADAPTER_V1');
  assert.equal(versions.state, BATTLE_REPLAY_VERSION_AUTHORITY.stateSchema);
});

test('current Browser product has one rule authority and build metadata mirrors it', async () => {
  const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  const currentRule = "const DECK_RULE=Object.freeze({id:'FIRST_REGULATION',revision:3,";
  const currentSaveAuthority = "currentRuleId:'FIRST_REGULATION',currentRuleRevision:3";
  assert.equal(html.split(currentRule).length - 1, 1, 'runtime DECK_RULE authority must be unique');
  assert.equal(html.split(currentSaveAuthority).length - 1, 1, 'save authority must agree with runtime rule revision');
  assert.equal(html.includes("deckRule:'FIRST_REGULATION@2'"), false, 'stale build rule metadata must not survive');
  assert.equal(html.split("deckRule:'FIRST_REGULATION@3'").length - 1, 1, 'build metadata must mirror current runtime rule');
});

test('current Browser card content produces a non-empty deterministic authority bundle', async () => {
  const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  const cards = extractJsonArrayAfter(html, 'window.__CARD_DATA__=');
  assert.ok(cards.length > 0);
  const first = createBattleReplayVersionAuthority({
    deckRule: { id: 'FIRST_REGULATION', revision: 3 },
    cardData: cards
  });
  const second = createBattleReplayVersionAuthority({
    deckRule: { revision: 3, id: 'FIRST_REGULATION' },
    cardData: cards.map(card => ({ ...card }))
  });
  assert.deepEqual(first, second);
  assert.match(first.content, /^GAMEROAD_CARD_CONTENT_FNV1A64:\d+:[0-9a-f]{16}$/);
});
