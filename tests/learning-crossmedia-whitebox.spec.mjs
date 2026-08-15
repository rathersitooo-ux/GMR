import { test, expect } from '@playwright/test';

const URL='/browser/learning-crossmedia-whitebox.html';
function runtimeGuard(page){const pageErrors=[];const consoleErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});return{assertClean(){expect(pageErrors).toEqual([]);expect(consoleErrors).toEqual([])}}}
async function snap(page){return page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.snapshot())}
async function solveBounded(page){
  return page.evaluate(()=>{const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;const f=api.getFixture();for(const e of f.evidence){api.inspectEvidence(e.id);api.linkEvidence(e.id,e.lane)}return api.decide('BOUNDED_SUPPORT')});
}

test('A/B fixtures share one interaction contract and equal information structure',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'証拠ボード／復元解釈 whitebox R2'})).toBeVisible();
  const a=await snap(page);expect(a.contractVersion).toBe('LEARNX-R2-INTERACTION-V1');expect(a.evidenceCount).toBe(3);expect(a.decisionCount).toBe(3);expect(a.candidate).toBe(false);
  await page.getByRole('button',{name:'B Spinosaurus候補'}).click();const b=await snap(page);
  expect(b.contractVersion).toBe(a.contractVersion);expect(b.evidenceCount).toBe(a.evidenceCount);expect(b.decisionCount).toBe(a.decisionCount);expect(b.lanes).toEqual(a.lanes);expect(b.candidate).toBe(true);expect(b.sourceVersion).toBe('DINO-EVIDENCE-R1-2026-08-15');
  await expect(page.locator('#candidateWarning')).toContainText('Human未受理');runtime.assertClean();
});

test('blind or repeated decisions do not reveal an answer or create a success state',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  const first=await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('BOUNDED_SUPPORT'));expect(first).toBe('NEEDS_EVIDENCE');let s=await snap(page);expect(s.recordVisible).toBe(false);expect(s.blindAttempts).toBe(1);
  const second=await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('BOUNDED_SUPPORT'));expect(second).toBe('NEEDS_EVIDENCE');s=await snap(page);expect(s.blindAttempts).toBe(2);expect(s.outcome).not.toBe('COHERENT_BOUNDARY');runtime.assertClean();
});

test('same evidence reasoning flow closes A and B without changing gameplay logic',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  expect(await solveBounded(page)).toBe('COHERENT_BOUNDARY');const a=await snap(page);expect(a.recordVisible).toBe(true);expect(Object.keys(a.links)).toHaveLength(a.evidenceCount);
  await page.getByRole('button',{name:'B Spinosaurus候補'}).click();expect(await solveBounded(page)).toBe('COHERENT_BOUNDARY');const b=await snap(page);expect(b.contractVersion).toBe(a.contractVersion);expect(Object.values(b.links)).toContain('UNKNOWN_OR_DEBATED');
  await expect(page.locator('#recordSource')).toContainText('candidate・Human未受理');runtime.assertClean();
});

test('overclaim is surfaced as a boundary problem rather than rewarded',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'B Spinosaurus候補'}).click();
  await page.evaluate(()=>{const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;for(const e of api.getFixture().evidence){api.inspectEvidence(e.id);api.linkEvidence(e.id,e.lane)}});
  expect(await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('OVERCLAIM'))).toBe('OVERCLAIM_BOUNDARY');await expect(page.locator('#status')).toContainText('議論中');
  const s=await snap(page);expect(s.recordVisible).toBe(true);expect(s.outcome).not.toBe('COHERENT_BOUNDARY');runtime.assertClean();
});

test('missing source/version fails closed and cannot be promoted by input',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  const broken=await page.evaluate(()=>{const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;const f=api.fixtures().spinosaurus;f.sourceVersion='';return api.loadFixtureForTest(f)});
  expect(broken.outcome).toBe('FAIL_CLOSED');expect(broken.validation).toBe('SOURCE_INCOMPLETE');expect(await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('BOUNDED_SUPPORT'))).toBe('FAIL_CLOSED');
  await expect(page.locator('#status')).toContainText('判定を停止');await expect(page.locator('button[data-decision]')).toBeDisabled();runtime.assertClean();
});
