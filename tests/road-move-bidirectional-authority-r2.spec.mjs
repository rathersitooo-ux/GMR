import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');

test('R2 source contract keeps one authority, upper-bound Road semantics, and Battle invariants',()=>{
  expect(html).toContain('ROAD-MOVE-BIDIRECTIONAL-R2');
  expect(html).toContain('steps<=normalMoveLimitForRoad(id)');
  expect(html).toContain("compatibleRoadIds.length>1?'使用するロードカードを選択してください'");
  expect(html).toContain("if(me.plan.roadId===me.plan.battleId){toast('別の札を選択してください')");
  expect(html).toContain("removeHand(p,p.plan.battleId)");
  expect(html).not.toContain('if(r!==me.plan.roadId){me.plan.roadId=r||null;me.plan.path=[me.position]}');
  for(const state of ['NORMAL','COMPATIBLE','FOCUSED','INVALID_FOCUS'])expect(html).toContain(state);
  expect(html).toContain('@media(prefers-reduced-motion:reduce)');
});

async function installLegalBattleDeck(page){return page.evaluate(()=>{const t=window.__GAMEROAD_TEST__;const publicMain=new Set(t.deckPublic().filter(c=>c.slot==='main').map(c=>c.id));const standard=window.__CARD_DATA__.filter(c=>publicMain.has(c.id)&&/^(SP|HT|DI|CL)$/.test(c.suit)&&/^(A|[2-9]|10|J|Q|K)$/.test(String(c.rank))).map(c=>c.id);const royal=['SP_J','SP_Q','SP_K'],nonRoyal=standard.filter(id=>!t.isRoyalCard(id)),main=[...nonRoyal.slice(0,37),...royal];t.deckSetDraft(main,[]);return t.deckCommit()})}

test('player can move first, sees Road candidates, then focuses a Road without losing the path',async({page})=>{
  const response=await page.goto('/browser/GAMEROAD.html',{waitUntil:'domcontentloaded'});expect(response?.ok()).toBeTruthy();await page.waitForTimeout(800);
  expect(await installLegalBattleDeck(page)).toBeTruthy();
  const setupGo=page.locator('[data-home-target="setup"]:visible,[data-go="setup"]:visible').first();await expect(setupGo).toBeVisible();await setupGo.click();
  const setup=page.locator('section[data-screen="setup"]');await expect(setup).toBeVisible();await setup.locator('[data-content="road_shield"]').click();await setup.locator('[data-mode="2p"]').click();await setup.locator('#startMatch').click();
  const battle=page.locator('section[data-screen="battle"]');await expect(battle).toBeVisible();await expect(battle.locator('#phaseTitle')).toContainText('行動を計画');
  const road=battle.locator('#roadSelect');await expect(road).toHaveValue('');
  const snapshot0=await page.evaluate(()=>window.__GAMEROAD_DIRECT_CARD_TEST__.snapshot());expect(snapshot0.draftMoveLimit).toBeGreaterThan(0);
  const next=battle.locator('.node.reachable[data-move-distance="1"]').first();await expect(next).toBeEnabled();await next.click();
  const moved=await page.evaluate(()=>window.__GAMEROAD_DIRECT_CARD_TEST__.snapshot());expect(moved.path.length).toBeGreaterThan(1);expect(moved.compatibleRoadIds.length).toBeGreaterThan(0);expect(moved.roadId).toBeNull();await expect(road).toHaveValue('');
  const candidates=battle.locator('#hand .handCard[data-road-move-state="COMPATIBLE"],#hand .handCard.roadMoveSoft');expect(await candidates.count()).toBeGreaterThan(0);
  const beforePath=JSON.stringify(moved.path);await candidates.first().click();
  await expect.poll(()=>page.evaluate(()=>window.__GAMEROAD_DIRECT_CARD_TEST__.snapshot().roadId)).not.toBeNull();
  const focused=await page.evaluate(()=>window.__GAMEROAD_DIRECT_CARD_TEST__.snapshot());expect(JSON.stringify(focused.path)).toBe(beforePath);expect(focused.compatibleRoadIds).toContain(focused.roadId);
  const focusedCard=battle.locator(`#hand .handCard[data-card-id="${focused.roadId}"]`);await expect(focusedCard).toHaveAttribute('data-road-move-state','FOCUSED');
});
