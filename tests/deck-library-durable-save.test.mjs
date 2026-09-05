import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

function sliceFunction(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`\nfunction ${nextName}(`, start);
  assert.ok(start >= 0, `${name} start missing`);
  assert.ok(end > start, `${name} end missing`);
  return html.slice(start, end);
}

const writeDeckLibrarySource = sliceFunction('writeDeckLibrary', 'restoreLocalRawVerified');
const commitDeckSource = sliceFunction('commitDeck', 'restoreDeck');

test('Deck library durable writer reuses the current verified write/readback/rollback authority', () => {
  assert.match(html, /DECK_SAVE_RECOVERY_CORE\s*}\s*=\s*globalThis\.GAMEROAD_DECK_SAVE_RECOVERY_CORE/);
  assert.match(writeDeckLibrarySource, /writePreparedSaveVerified\(localStorage,DECK_LIBRARY_KEY,prepared\)/);
  assert.match(writeDeckLibrarySource, /schema:DECK_SAVE_RECOVERY_CORE\.schema/);
  assert.match(writeDeckLibrarySource, /return written/);
});

function makeContext({ rootStatus = 'saved', libraryStatus = 'saved', usable = true, rollbackOk = true } = {}) {
  const events = [];
  const oldDeck = { main: ['old'], ex: [] };
  const draft = { main: ['new'], ex: [] };
  let readCount = 0;
  const state = {
    deckDraft: structuredClone(draft),
    deckSlots: [structuredClone(oldDeck), { main: [], ex: [] }],
    selectedDeckIndex: 0,
    savedDeck: structuredClone(oldDeck),
    savedDeckRule: { id: 'R', revision: 1 },
    storage: 'localStorage',
    saveAuthorityDeck: structuredClone(oldDeck),
    saveAuthorityDeckRule: { id: 'R', revision: 1 },
  };
  const context = vm.createContext({
    state,
    DECK_RULE: { id: 'R', revision: 2 },
    SAVE_KEY: 'save',
    SAVE_AUTHORITY: {},
    localStorage: {},
    memorySave: 'old-memory',
    saveRecoveryRuntime: { write: null },
    cloneDeckRecord(deck) { return { main: [...(deck?.main || [])], ex: [...(deck?.ex || [])] }; },
    deckStorageCheck() { return { ok: true }; },
    deckEligibility() { return { usable }; },
    readStorage() {
      readCount += 1;
      events.push(`read:${readCount}`);
      return { status: 'read', rawValue: 'old-root' };
    },
    inspectRawSave() { return {}; },
    classifySave() { return {}; },
    prepareExplicitDeckCommit() {
      return {
        status: 'prepared',
        schema: 'gameroad.deck-save-recovery.v1',
        serialized: '{"prepared":true}',
        nextRoot: { prior: true },
      };
    },
    savePack() { return {}; },
    mergeKnownPack(root, pack) { return { ...root, ...pack }; },
    writePreparedSaveVerified() {
      events.push('root-write');
      return rootStatus === 'saved'
        ? { status: 'saved', reason: 'STORAGE_WRITE_READBACK_OK' }
        : { status: 'failed', reason: 'STORAGE_READBACK_MISMATCH', rolledBack: true };
    },
    writeDeckLibrary() {
      events.push('library-write');
      return libraryStatus === 'saved'
        ? { status: 'saved', reason: 'STORAGE_WRITE_READBACK_OK' }
        : { status: 'failed', reason: 'STORAGE_READBACK_MISMATCH', rolledBack: true };
    },
    restoreLocalRawVerified(key, raw) {
      events.push(`rollback:${key}:${raw}`);
      return rollbackOk;
    },
    markStorageReadFailure(reason) { events.push(`read-failure:${reason}`); },
    clearDeckDraftSession() { events.push('clear-draft'); },
    renderCards() {},
    renderSetupDeckStatus() {},
    toast(message) { events.push(`toast:${message}`); },
    ctxSet() {},
    selectedDeckNumber() { return 1; },
  });
  vm.runInContext(`${commitDeckSource};globalThis.__commitDeck=commitDeck;`, context);
  return { context, state, events, commit: context.__commitDeck };
}

test('formal root receipt failure leaves Deck slots/saved copy dirty and never writes the library', () => {
  const { state, events, commit } = makeContext({ rootStatus: 'failed', libraryStatus: 'saved', usable: true });
  assert.equal(commit(), false);
  assert.deepEqual(state.deckSlots[0], { main: ['old'], ex: [] });
  assert.deepEqual(state.savedDeck, { main: ['old'], ex: [] });
  assert.deepEqual(state.deckDraft, { main: ['new'], ex: [] });
  assert.equal(events.includes('library-write'), false);
  assert.equal(events.includes('clear-draft'), false);
});

test('library receipt failure compensates the already-written formal root and keeps the draft dirty', () => {
  const { state, events, commit } = makeContext({ rootStatus: 'saved', libraryStatus: 'failed', usable: true, rollbackOk: true });
  assert.equal(commit(), false);
  assert.ok(events.indexOf('root-write') < events.indexOf('library-write'));
  assert.ok(events.includes('rollback:save:old-root'));
  assert.deepEqual(state.deckSlots[0], { main: ['old'], ex: [] });
  assert.deepEqual(state.savedDeck, { main: ['old'], ex: [] });
  assert.deepEqual(state.deckDraft, { main: ['new'], ex: [] });
  assert.equal(events.includes('clear-draft'), false);
});

test('only both durable receipts advance an eligible Deck to saved state', () => {
  const { state, events, commit } = makeContext({ rootStatus: 'saved', libraryStatus: 'saved', usable: true });
  assert.equal(commit(), true);
  assert.ok(events.indexOf('root-write') < events.indexOf('library-write'));
  assert.deepEqual(state.deckSlots[0], { main: ['new'], ex: [] });
  assert.deepEqual(state.savedDeck, { main: ['new'], ex: [] });
  assert.equal(events.filter((entry) => entry === 'clear-draft').length, 1);
});

test('an incomplete/non-battle Deck slot needs only its verified library receipt', () => {
  const { state, events, commit } = makeContext({ libraryStatus: 'saved', usable: false });
  assert.equal(commit(), true);
  assert.equal(events.includes('root-write'), false);
  assert.equal(events.includes('library-write'), true);
  assert.deepEqual(state.deckSlots[0], { main: ['new'], ex: [] });
  assert.deepEqual(state.savedDeck, { main: ['new'], ex: [] });
  assert.equal(events.filter((entry) => entry === 'clear-draft').length, 1);
});

test('rollback failure is never converted into saved state or dirty clear', () => {
  const { state, events, commit } = makeContext({ rootStatus: 'saved', libraryStatus: 'failed', usable: true, rollbackOk: false });
  assert.equal(commit(), false);
  assert.deepEqual(state.savedDeck, { main: ['old'], ex: [] });
  assert.deepEqual(state.deckDraft, { main: ['new'], ex: [] });
  assert.equal(events.includes('clear-draft'), false);
  assert.match(String(state.storage), /memory/);
});
