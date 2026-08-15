import { test, expect } from '@playwright/test';

const URL='/browser/learning-crossmedia-whitebox.html';
function runtimeGuard(page){const pageErrors=[];const consoleErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});return{assertClean(){expect(pageErrors).toEqual([]);expect(consoleErrors).toEqual([])}}}
async function snap(page){return page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.snapshot())}
async function solveBounded(page){
  return page.evaluate(()=>{const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;const f=api.getFixture();for(const e of f.evidence){api.inspectEvidence(e.id);api.linkEvidence(e.id,e.lane)}return api.decide('BOUNDED_SUPPORT')});
}

test('A/B fixtures share one interaction contract while Spinosaurus is rebound to Drive CURRENT authority',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'証拠ボード／復元解釈 whitebox R2'})).toBeVisible();
  const a=await snap(page);expect(a.contractVersion).toBe('LEARNX-R2-INTERACTION-V1');expect(a.evidenceCount).toBe(3);expect(a.decisionCount).toBe(3);expect(a.candidate).toBe(false);
  await page.getByRole('button',{name:'B Spinosaurus CURRENT'}).click();const b=await snap(page);
  expect(b.contractVersion).toBe(a.contractVersion);expect(b.evidenceCount).toBe(a.evidenceCount);expect(b.decisionCount).toBe(a.decisionCount);expect(b.lanes).toEqual(a.lanes);
  expect(b.candidate).toBe(false);expect(b.authority).toBe('DRIVE_CURRENT');expect(b.sourceVersion).toBe('SPINOSAURUS-LEARNING-CURRENT-20260723');expect(b.migrationVisible).toBe(true);
  await expect(page.locator('#authorityNotice')).toContainText('Drive CURRENT');await expect(page.locator('#authorityNotice')).not.toContainText('Human未受理');runtime.assertClean();
});

test('blind or repeated decisions do not reveal an answer or create a success state',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  const first=await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('BOUNDED_SUPPORT'));expect(first).toBe('NEEDS_EVIDENCE');let s=await snap(page);expect(s.recordVisible).toBe(false);expect(s.blindAttempts).toBe(1);
  const second=await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('BOUNDED_SUPPORT'));expect(second).toBe('NEEDS_EVIDENCE');s=await snap(page);expect(s.blindAttempts).toBe(2);expect(s.outcome).not.toBe('COHERENT_BOUNDARY');runtime.assertClean();
});

test('same evidence reasoning flow closes A and CURRENT B without changing gameplay logic',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  expect(await solveBounded(page)).toBe('COHERENT_BOUNDARY');const a=await snap(page);expect(a.recordVisible).toBe(true);expect(Object.keys(a.links)).toHaveLength(a.evidenceCount);
  await page.getByRole('button',{name:'B Spinosaurus CURRENT'}).click();expect(await solveBounded(page)).toBe('COHERENT_BOUNDARY');const b=await snap(page);expect(b.contractVersion).toBe(a.contractVersion);expect(Object.values(b.links)).toContain('UNKNOWN_OR_DEBATED');
  await expect(page.locator('#recordSource')).toContainText('Drive CURRENT');runtime.assertClean();
});

test('overclaim is surfaced as a boundary problem rather than rewarded',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'B Spinosaurus CURRENT'}).click();
  await page.evaluate(()=>{const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;for(const e of api.getFixture().evidence){api.inspectEvidence(e.id);api.linkEvidence(e.id,e.lane)}});
  expect(await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('OVERCLAIM'))).toBe('OVERCLAIM_BOUNDARY');await expect(page.locator('#status')).toContainText('議論中');
  const s=await snap(page);expect(s.recordVisible).toBe(true);expect(s.outcome).not.toBe('COHERENT_BOUNDARY');runtime.assertClean();
});

test('missing source/version fails closed and cannot be promoted by input',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  const broken=await page.evaluate(()=>{const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;const f=api.fixtures().spinosaurus;f.sourceVersion='';return api.loadFixtureForTest(f)});
  expect(broken.outcome).toBe('FAIL_CLOSED');expect(broken.validation).toBe('SOURCE_INCOMPLETE');expect(await page.evaluate(()=>window.__LEARNING_CROSSMEDIA_WHITEBOX__.decide('BOUNDED_SUPPORT'))).toBe('FAIL_CLOSED');
  await expect(page.locator('#status')).toContainText('判定を停止');
  const decisionButtons=page.locator('button[data-decision]');expect(await decisionButtons.count()).toBe(3);for(let i=0;i<3;i++)await expect(decisionButtons.nth(i)).toBeDisabled();runtime.assertClean();
});

test('historical reconstruction display migrates to current without mutating identity ownership or acquisition provenance',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'B Spinosaurus CURRENT'}).click();
  const result=await page.evaluate(()=>{
    const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;const input=structuredClone(api.DEFAULT_HISTORICAL_SAVE);const before=JSON.stringify(input);const migrated=api.migrateReconstructionSave(input);
    return {migrated,before,after:JSON.stringify(input),versions:api.RECONSTRUCTION_VERSIONS,identity:api.RECONSTRUCTION_IDENTITY};
  });
  expect(result.migrated.ok).toBe(true);expect(result.before).toBe(result.after);
  const p=result.migrated.projection;expect(p.cardId).toBe(result.identity.cardId);expect(p.speciesId).toBe(result.identity.speciesId);expect(p.owned).toBe(true);
  expect(p.acquiredUnderVersion).toBe(result.versions.historical.id);expect(p.previousDisplayVersion).toBe(result.versions.historical.id);expect(p.displayVersion).toBe(result.versions.current.id);
  expect(p.resolvedCanonVersion).toBe(result.versions.current.id);expect(p.historicalVersions).toContain(result.versions.historical.id);expect(p.migrationApplied).toBe(true);
  await page.getByRole('button',{name:'旧復元版saveを現在表示へ移行'}).click();await expect(page.locator('#migrationStatus')).toContainText('実saveは未変更');await expect(page.locator('#migrationAcquired')).toContainText(result.versions.historical.id);runtime.assertClean();
});

test('already-current projection is idempotent and still retains historical acquisition provenance',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(()=>{
    const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;const v=api.RECONSTRUCTION_VERSIONS;
    const save={...api.DEFAULT_HISTORICAL_SAVE,displayVersion:v.current.id,resolvedCanonVersion:v.current.id,historicalVersions:[v.historical.id]};
    return api.migrateReconstructionSave(save);
  });
  expect(result.ok).toBe(true);expect(result.projection.migrationApplied).toBe(false);expect(result.projection.acquiredUnderVersion).toContain('HISTORICAL');expect(result.projection.displayVersion).toContain('CURRENT');expect(result.projection.historicalVersions).toHaveLength(1);runtime.assertClean();
});

test('unknown reconstruction version and conflicting canon lock fail closed',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  const results=await page.evaluate(()=>{
    const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;
    const unknown=api.migrateReconstructionSave({...api.DEFAULT_HISTORICAL_SAVE,displayVersion:'UNKNOWN-RECONSTRUCTION-VERSION'});
    const conflict=api.migrateReconstructionSave({...api.DEFAULT_HISTORICAL_SAVE,resolvedCanonVersion:'OTHER-CURRENT'});
    return {unknown,conflict};
  });
  expect(results.unknown).toEqual({ok:false,reason:'UNKNOWN_RECONSTRUCTION_VERSION',projection:null});
  expect(results.conflict).toEqual({ok:false,reason:'VERSION_CONFLICT',projection:null});runtime.assertClean();
});

test('conflicting version registry fails closed instead of selecting an arbitrary current version',async({page})=>{
  const runtime=runtimeGuard(page);await page.goto(URL,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(()=>{
    const api=window.__LEARNING_CROSSMEDIA_WHITEBOX__;
    const badRegistry={historical:{id:'HIST',role:'HISTORICAL'},currentA:{id:'CURRENT-A',role:'CURRENT'},currentB:{id:'CURRENT-B',role:'CURRENT'}};
    return api.migrateReconstructionSave(api.DEFAULT_HISTORICAL_SAVE,badRegistry);
  });
  expect(result).toEqual({ok:false,reason:'VERSION_REGISTRY_CONFLICT',projection:null});runtime.assertClean();
});
