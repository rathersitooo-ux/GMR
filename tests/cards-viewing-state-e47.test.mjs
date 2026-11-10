// E47 (28番): カードを見る状態を保つ。
// カード詳細 (inspector / .cardPreview) は data-inspector="open" のときだけ表示される。
// 追加する操作 (ボタン追加・スワイプ追加) が r4SetInspector(false) で詳細を閉じていたため、
// 追加後も見ていたカードの詳細が開いたままになることを、GAMEROAD.html の実文で確かめる。
// 明示的な閉じる操作 (#r4PreviewClose) とドロワーとの相互排他は変えていない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function htmlSource() {
  return readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('E47: adding the selected card keeps the card inspector open', async () => {
  const source = await htmlSource();
  const handler = sliceBetween(source, "$('#addSelectedCard').addEventListener('click'", "$('#saveDeck')");
  assert.equal(handler.includes('r4SetInspector(false)'), false);
  assert.ok(handler.includes('recentDeckCardId=id'));
  assert.ok(handler.includes('renderCards()'));
  assert.ok(handler.includes('focusRecentDeckCard()'));
});

test('E47: swipe-adding a card keeps the card inspector open', async () => {
  const source = await htmlSource();
  const finish = sliceBetween(
    source,
    'const finish=(ev,cancelled)=>{',
    "e.addEventListener('pointerup'",
  );
  assert.equal(finish.includes('r4SetInspector(false)'), false);
  assert.ok(finish.includes('grDeckSwipePresentSuccess(e,c.id)'));
  assert.ok(finish.includes('renderCards()'));
  assert.ok(finish.includes('focusRecentDeckCard()'));
});

test('E47: the inspector still closes only from its explicit close control', async () => {
  const source = await htmlSource();
  assert.ok(source.includes("$('#r4PreviewClose').addEventListener('click',()=>r4SetInspector(false))"));
  const closes = source.match(/r4SetInspector\(false\)/g) || [];
  assert.equal(closes.length, 1);
});

test('E47: renderCards still re-renders the selected card preview', async () => {
  const source = await htmlSource();
  assert.ok(source.includes('function renderCardPreview(){const c=CARDS[state.selectedCardId]'));
  const renderCards = sliceBetween(source, 'function renderCards(){', 'function filterCards(){');
  assert.ok(renderCards.includes('renderCardPreview()'));
});

test('E47: opening a card from the collection still opens the inspector', async () => {
  const source = await htmlSource();
  assert.ok(source.includes("state.selectedCardId=c.id;r4SetInspector(true);renderCards()"));
});
