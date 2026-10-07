import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const marker = '/* GAMEROAD_BATTLE_PRECOMMIT_CLEAR_LIVE_R2 */';
const start = html.indexOf(marker);
const end = html.indexOf('window.GAMEROAD_PARTNER_STATE', start);
assert.ok(start >= 0 && end > start, 'precommit-clear live block must remain mounted');
const source = html.slice(start, end);

test('first Road or Battle reservation resyncs full-clear availability after the existing plan handler settles', () => {
  assert.match(
    source,
    /for\(const id of \['roadSelect','battleSelect'\]\)\$\('#'\+id\)\?\.addEventListener\('change',\(\)=>queueMicrotask\(grSyncBattlePrecommitClear\)\)/,
  );
  assert.match(
    source,
    /function grBattlePlanDraftHasValue\(me\).*Boolean\(p\.roadId\|\|p\.battleId\|\|/,
  );
  assert.match(
    source,
    /const planClearable=phase==='plan'.*grBattlePlanDraftHasValue\(me\)/,
  );
});

test('full clear remains distinct from one-step route undo and keeps the existing global clear path', () => {
  assert.ok(html.includes("id=\"clearPath\""), 'one-step route undo remains present');
  assert.match(source, /b\.setAttribute\('aria-label','選択をすべて解除'\)/);
  assert.match(source, /api\.clearBattlePrecommitSelection\(\{phase:'plan'/);
  assert.match(source, /me\.plan=\{\.\.\.result\.next\.plan,path:\[\.\.\.result\.next\.plan\.path\]\}/);
});
