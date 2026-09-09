import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../tools/chatgpt-current-autohook/GAMEROAD_CURRENT_AutoHook.user.js', import.meta.url),
  'utf8',
);

test('CURRENT authority pointers and duplicate guards stay embedded', () => {
  assert.match(source, /14CYoFblBecfUqrnFKfdWayHsi8cnAbsrfFzNxZ0OvkY/);
  assert.match(source, /17xKynlDewWeYHK1xsObex70VoR7YPh6Kn06y57HZV_s/);
  assert.match(source, /【GAMEROAD CURRENT AUTOHOOK】/);
  assert.match(source, /【全会話共通・CURRENT BOOTLOADER】/);
  assert.match(source, /needsInjection/);
});

test('ChatGPT Web send paths are intercepted before native send', () => {
  assert.match(source, /@match\s+https:\/\/chatgpt\.com\/\*/);
  assert.match(source, /handleSubmit/);
  assert.match(source, /handleKeydown/);
  assert.match(source, /handleSendIntent/);
  assert.match(source, /pointerdown/);
  assert.match(source, /mousedown/);
  assert.match(source, /click/);
  assert.match(source, /stopImmediatePropagation/);
});

test('double-send prevention and distribution-branch update path are present', () => {
  assert.match(source, /pendingComposers/);
  assert.match(source, /bypassButtons/);
  assert.match(source, /gameroadCurrentAutohookBypass/);
  assert.match(source, /raw\.githubusercontent\.com\/rathersitooo-ux\/GMR\/feat\/chatgpt-current-autohook-free-r2\/tools\/chatgpt-current-autohook\/GAMEROAD_CURRENT_AutoHook\.user\.js/);
});
