import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_JANKEN_INPUT_MODE,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';
import {
  BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT,
  BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY,
  createBattleJankenInputModeSetting,
} from '../browser/battle-janken-input-mode-setting-core.mjs';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test('reuses the existing three input mode ids without a second mode authority', () => {
  assert.deepEqual(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.validModes, [
    BATTLE_JANKEN_INPUT_MODE.CARD_PULL,
    BATTLE_JANKEN_INPUT_MODE.LAUNCHER,
    BATTLE_JANKEN_INPUT_MODE.PLAIN,
  ]);
  assert.equal(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.defaultMode, BATTLE_JANKEN_INPUT_MODE.LAUNCHER);
  assert.equal(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.cardIdentityAuthority, false);
  assert.equal(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.targetAuthority, false);
  assert.equal(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.orderAuthority, false);
  assert.equal(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.winnerAuthority, false);
  assert.equal(BATTLE_JANKEN_INPUT_MODE_SETTING_CONTRACT.gameStateWrite, false);
});

test('missing preference resolves to launcher and repairs writable storage', () => {
  const storage = fakeStorage();
  const setting = createBattleJankenInputModeSetting({ storage });
  const result = setting.read();

  assert.equal(result.mode, BATTLE_JANKEN_INPUT_MODE.LAUNCHER);
  assert.equal(result.source, 'DEFAULT_REPAIRED');
  assert.equal(storage.values.get(BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY), BATTLE_JANKEN_INPUT_MODE.LAUNCHER);
  assert.equal(result.options.filter((option) => option.active).length, 1);
  assert.equal(result.options.find((option) => option.active).id, BATTLE_JANKEN_INPUT_MODE.LAUNCHER);
});

test('reads an existing valid card-pull preference unchanged', () => {
  const storage = fakeStorage({
    [BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY]: BATTLE_JANKEN_INPUT_MODE.CARD_PULL,
  });
  const result = createBattleJankenInputModeSetting({ storage }).read();

  assert.equal(result.mode, BATTLE_JANKEN_INPUT_MODE.CARD_PULL);
  assert.equal(result.source, 'STORAGE');
  assert.equal(result.persistence, 'STORAGE');
});

test('invalid stored preference is repaired to the existing default mode', () => {
  const storage = fakeStorage({
    [BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY]: 'not-a-mode',
  });
  const result = createBattleJankenInputModeSetting({ storage }).read();

  assert.equal(result.mode, BATTLE_JANKEN_INPUT_MODE.LAUNCHER);
  assert.equal(result.source, 'DEFAULT_REPAIRED');
  assert.equal(storage.values.get(BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY), BATTLE_JANKEN_INPUT_MODE.LAUNCHER);
});

test('writes plain mode as a presentation preference only', () => {
  const storage = fakeStorage();
  const setting = createBattleJankenInputModeSetting({ storage });
  const result = setting.write(BATTLE_JANKEN_INPUT_MODE.PLAIN);

  assert.equal(result.mode, BATTLE_JANKEN_INPUT_MODE.PLAIN);
  assert.equal(result.source, 'SETTING_WRITE');
  assert.equal(result.gameStateWrite, false);
  assert.equal(storage.values.get(BATTLE_JANKEN_INPUT_MODE_SETTING_STORAGE_KEY), BATTLE_JANKEN_INPUT_MODE.PLAIN);
});

test('storage write failure falls back to memory and keeps the selected mode', () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error('quota denied'); },
  };
  const setting = createBattleJankenInputModeSetting({ storage });
  const written = setting.write(BATTLE_JANKEN_INPUT_MODE.CARD_PULL);
  const reread = setting.read();

  assert.equal(written.mode, BATTLE_JANKEN_INPUT_MODE.CARD_PULL);
  assert.equal(written.source, 'MEMORY_WRITE');
  assert.equal(written.storageHealthy, false);
  assert.equal(reread.mode, BATTLE_JANKEN_INPUT_MODE.CARD_PULL);
  assert.equal(reread.source, 'MEMORY');
});

test('storage read failure fails soft to the existing default without throwing', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() {},
  };
  const result = createBattleJankenInputModeSetting({ storage }).read();

  assert.equal(result.mode, BATTLE_JANKEN_INPUT_MODE.LAUNCHER);
  assert.equal(result.source, 'MEMORY_AFTER_READ_FAILURE');
  assert.equal(result.storageHealthy, false);
});
