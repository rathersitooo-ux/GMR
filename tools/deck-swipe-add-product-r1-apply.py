from pathlib import Path

HTML = Path('browser/GAMEROAD.html')
SMOKE = Path('tests/browser-runtime-smoke.spec.mjs')

html = HTML.read_text(encoding='utf-8')

helper_anchor = "function renderCards(){"
helper = r'''const GR_DECK_SWIPE_ADD_THRESHOLD_PX=44;
const GR_DECK_SWIPE_ADD_AXIS_RATIO=1.2;
let grDeckSwipeGesture=null,grDeckSwipeSuppressClickUntil=0;
function grDeckSwipeResetVisual(e){if(!e)return;e.style.transform='';delete e.dataset.swipeAdd}
function bindCollectionSwipeAdd(e,c,inside){
  e.style.touchAction='pan-y';
  e.addEventListener('pointerdown',ev=>{if(ev.pointerType==='mouse'&&ev.button!==0)return;grDeckSwipeGesture={pointerId:ev.pointerId,id:c.id,startX:ev.clientX,startY:ev.clientY,lastX:ev.clientX,lastY:ev.clientY,el:e};try{e.setPointerCapture(ev.pointerId)}catch(_){}});
  e.addEventListener('pointermove',ev=>{const g=grDeckSwipeGesture;if(!g||g.pointerId!==ev.pointerId||g.el!==e)return;g.lastX=ev.clientX;g.lastY=ev.clientY;const dx=g.lastX-g.startX,dy=g.lastY-g.startY;if(dx>6&&dx>Math.abs(dy)*1.05){e.dataset.swipeAdd='tracking';e.style.transform=`translateX(${Math.min(dx,58)}px)`}else if(Math.abs(dy)>=Math.abs(dx)){grDeckSwipeResetVisual(e)}});
  const finish=(ev,cancelled)=>{const g=grDeckSwipeGesture;if(!g||g.pointerId!==ev.pointerId||g.el!==e)return;grDeckSwipeGesture=null;grDeckSwipeResetVisual(e);if(cancelled)return;const dx=ev.clientX-g.startX,dy=ev.clientY-g.startY;if(dx<GR_DECK_SWIPE_ADD_THRESHOLD_PX||dx<Math.abs(dy)*GR_DECK_SWIPE_ADD_AXIS_RATIO)return;grDeckSwipeSuppressClickUntil=performance.now()+420;ev.preventDefault();const r=addDeckCard(c.id);if(!r.ok){toast(r.error);return renderCards()}recentDeckCardId=c.id;r4SetInspector(false);renderCards();focusRecentDeckCard();toast(inside?'札組登録済み':'札組へ追加しました')};
  e.addEventListener('pointerup',ev=>finish(ev,false));
  e.addEventListener('pointercancel',ev=>finish(ev,true));
  e.onclick=ev=>{if(performance.now()<grDeckSwipeSuppressClickUntil){ev.preventDefault();return}state.selectedCardId=c.id;r4SetInspector(true);renderCards()};
}
'''
if 'GR_DECK_SWIPE_ADD_THRESHOLD_PX' not in html:
    if html.count(helper_anchor) != 1:
        raise SystemExit(f'expected one renderCards anchor, got {html.count(helper_anchor)}')
    html = html.replace(helper_anchor, helper + helper_anchor, 1)

old = "e.setAttribute('aria-label',`${c.display_name}${inside?' 札組登録済み':' 詳細を開く'}`);e.onclick=()=>{state.selectedCardId=c.id;r4SetInspector(true);renderCards()};g.appendChild(e)"
new = "e.setAttribute('aria-label',`${c.display_name}${inside?' 札組登録済み':' 詳細を開く'}`);bindCollectionSwipeAdd(e,c,inside);g.appendChild(e)"
if old in html:
    html = html.replace(old, new, 1)
elif new not in html:
    raise SystemExit('collection card click anchor not found')

HTML.write_text(html, encoding='utf-8')

smoke = SMOKE.read_text(encoding='utf-8')
marker = '// DECK_SWIPE_ADD_PRODUCT_R1'
block = r'''

// DECK_SWIPE_ADD_PRODUCT_R1
test('deck editor right swipe adds once without stealing vertical, left, or tap gestures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/browser/GAMEROAD.html', { waitUntil: 'load' });
  await page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    t.deckSetDraft([], []);
    t.show('cards');
  });

  const gesture = async (id, dx, dy) => {
    const card = page.locator(`#collectionGrid .slot[data-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    expect(box, `${id} card box`).not.toBeNull();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  };

  await gesture('SP_A', 72, 4);
  let state = await page.evaluate(() => ({
    main: [...window.__GAMEROAD_TEST__.state.deckDraft.main],
    draftSession: sessionStorage.getItem(window.__GAMEROAD_TEST__.deckDraftSessionKey()),
  }));
  expect(state.main).toEqual(['SP_A']);
  expect(state.draftSession).not.toBeNull();

  await page.waitForTimeout(450);
  await gesture('SP_A', 72, 2);
  state = await page.evaluate(() => [...window.__GAMEROAD_TEST__.state.deckDraft.main]);
  expect(state).toEqual(['SP_A']);

  await gesture('SP_2', 3, 78);
  await gesture('SP_3', -70, 2);
  state = await page.evaluate(() => [...window.__GAMEROAD_TEST__.state.deckDraft.main]);
  expect(state).toEqual(['SP_A']);

  await page.waitForTimeout(450);
  await page.locator('#collectionGrid .slot[data-id="SP_4"]').click();
  expect(await page.evaluate(() => window.__GAMEROAD_TEST__.state.selectedCardId)).toBe('SP_4');

  const cap = await page.evaluate(() => {
    const t = window.__GAMEROAD_TEST__;
    const ids = t.deckPublic().filter((card) => card.slot === 'main').map((card) => card.id);
    if (ids.length < 41) throw new Error('need at least 41 public main cards');
    t.deckSetDraft(ids.slice(0, 40), []);
    t.show('cards');
    return { candidate: ids[40], before: t.state.deckDraft.main.length };
  });
  expect(cap.before).toBe(40);
  await gesture(cap.candidate, 72, 1);
  expect(await page.evaluate(() => window.__GAMEROAD_TEST__.state.deckDraft.main.length)).toBe(40);
});
'''
if marker not in smoke:
    smoke += block
SMOKE.write_text(smoke, encoding='utf-8')

print('deck swipe Product Mount patch applied')
