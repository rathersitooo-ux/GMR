// M-046: ボタンの押した時の反応。
// .btn / .modeBtn / .contentBtn / #readyPlan / .railBtn に :active が無く、
// 押しても見た目が変わらなかった。homePadChoice と同じ形（少し沈んで暗くなる）で
// 押した時の反応を付けたことを、GAMEROAD.html の実文で確かめる。
// #readyPlan だけ斜めの見た目（skewX(-5deg)）を保つため、:active でも skew を残す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function htmlSource() {
  return readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
}

test('M-046: .btn has a visible :active press feedback', async () => {
  const source = await htmlSource();
  assert.ok(source.includes('.btn:active{transform:translateY(1px);filter:brightness(.85);transition:none}'));
});

test('M-046: .modeBtn and .contentBtn have a visible :active press feedback', async () => {
  const source = await htmlSource();
  assert.ok(source.includes('.modeBtn:active,.contentBtn:active{transform:translateY(1px) scale(.985);filter:brightness(.88);transition:none}'));
});

test('M-046: #readyPlan keeps its skew while pressed and darkens', async () => {
  const source = await htmlSource();
  assert.ok(source.includes('.planBox #readyPlan:active{transform:skewX(-5deg) translateY(1px);filter:brightness(.82);transition:none}'));
});

test('M-046: .railBtn has a visible :active press feedback', async () => {
  const source = await htmlSource();
  assert.ok(source.includes('.battleRail .railBtn:active{transform:translateY(1px);filter:brightness(.85);transition:none}'));
});

test('M-046: the press feedback rules sit next to the existing homePadChoice :active', async () => {
  const source = await htmlSource();
  const anchor = source.indexOf('.homePadChoice:active,.homePadChoice.pressed{transform:translateY(1px) scale(.985);transition:none}');
  assert.ok(anchor >= 0, 'missing homePadChoice :active anchor');
  const block = source.slice(anchor, anchor + 600);
  assert.ok(block.includes('M-046'));
  assert.ok(block.includes('.btn:active'));
  assert.ok(block.includes('.battleRail .railBtn:active'));
});
