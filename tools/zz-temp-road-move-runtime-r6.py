from pathlib import Path

html = Path('browser/GAMEROAD.html')
s = html.read_text()

old = "function roadMoveShouldTreatTapAsRoad(p,id){const candidates=compatibleRoadCandidatesForPath(p);if(!candidates.includes(id))return false;const focused=p?.plan?.roadId||null;return !focused||!candidates.includes(focused)}"
new = "function roadMoveShouldTreatTapAsRoad(p,id){return compatibleRoadCandidatesForPath(p).includes(id)}"
if s.count(old) != 1:
    raise SystemExit(f'road candidate routing predicate mismatch: {s.count(old)}')
s = s.replace(old, new, 1)

old = "b.onclick=()=>{if(roadMoveShouldTreatTapAsRoad(me,id))setDirectPlanRole('road');return first10SelectHandCard(id)}"
new = "b.onclick=()=>{if(roadMoveShouldTreatTapAsRoad(me,id)){const road=$('#roadSelect');first10Runtime.manualRoad=true;first10Runtime.roadSelectedAt=performance.now();first10Event('manual_road_select',{cardId:id,reselect:!!road?.value,source:'compatible_candidate'});return first10SetSelect(road,id)}return first10SelectHandCard(id)}"
if s.count(old) != 1:
    raise SystemExit(f'hand candidate click routing mismatch: {s.count(old)}')
s = s.replace(old, new, 1)

html.write_text(s)

test = Path('tests/road-move-bidirectional-live-r6.spec.mjs')
t = test.read_text()
t = t.replace("expect(backed.compatibleRoadIds.length).toBeGreaterThanOrEqual(beforeCount===0?0:beforeCount);", "expect(backed.path.length).toBe(Math.max(1,moved.path.length-1));if(backed.path.length===1)expect(backed.compatibleRoadIds).toEqual([]);else expect(backed.compatibleRoadIds.length).toBeGreaterThanOrEqual(beforeCount);")
if 'compatible_candidate' not in s:
    raise SystemExit('candidate source marker missing')
if "battleId).toBeNull()" not in t:
    raise SystemExit('Battle non-interference assertion missing')

t += r'''

test('compatible Road card taps stay Road-side while a path is drafted',async({page})=>{
  const battle=await openRoadBattle(page);
  await snapshot(page);
  const next=battle.locator('.node.reachable[data-move-distance="1"]').first();
  await expect(next).toBeEnabled();
  await next.click();
  const moved=await snapshot(page);
  expect(moved.battleId).toBeNull();
  expect(moved.compatibleRoadIds.length).toBeGreaterThan(0);
  const ids=moved.compatibleRoadIds.slice(0,2);
  const a=ids[0];
  await battle.locator(`#hand .handCard[data-card-id="${a}"]`).click();
  let focused=await snapshot(page);
  expect(focused.roadId).toBe(a);
  expect(focused.battleId).toBeNull();
  expect(focused.path).toEqual(moved.path);
  if(ids.length>1){
    const b=ids[1];
    await battle.locator(`#hand .handCard[data-card-id="${b}"]`).click();
    focused=await snapshot(page);
    expect(focused.roadId).toBe(b);
    expect(focused.battleId).toBeNull();
    expect(focused.path).toEqual(moved.path);
  }
});

test('Elastic Focus yields only beyond the focused Road upper bound and keeps the path',async({page})=>{
  const battle=await openRoadBattle(page);
  const initial=await snapshot(page);
  const roads=await page.evaluate((ids)=>ids.map(id=>({id,limit:globalThis.normalMoveLimitForRoad?.(id)||0})).filter(x=>x.limit>0),initial.ordinaryRoadIds);
  const ordered=[...roads].sort((a,b)=>a.limit-b.limit||a.id.localeCompare(b.id));
  const low=ordered.find(card=>ordered.some(other=>other.limit>card.limit));
  expect(low).toBeTruthy();
  const supporting=ordered.filter(card=>card.limit>low.limit);
  expect(supporting.length).toBeGreaterThan(0);
  await battle.locator(`#hand .handCard[data-card-id="${low.id}"]`).click();
  await expect.poll(async()=> (await snapshot(page)).roadId).toBe(low.id);
  const focused=await snapshot(page);
  expect(focused.battleId).toBeNull();
  const targetDistance=low.limit+1;
  expect(focused.draftMoveLimit).toBeGreaterThanOrEqual(targetDistance);
  const target=battle.locator(`.node.reachable[data-move-distance="${targetDistance}"]`).first();
  await expect(target).toBeEnabled();
  await target.click();
  const extended=await snapshot(page);
  expect(extended.path.length-1).toBe(targetDistance);
  expect(extended.roadId).toBe(low.id);
  expect(extended.battleId).toBeNull();
  expect(extended.compatibleRoadIds).not.toContain(low.id);
  expect(extended.compatibleRoadIds.length).toBeGreaterThan(0);
  await expect(battle.locator(`#hand .handCard[data-card-id="${low.id}"]`)).toHaveAttribute('data-road-move-state','INVALID_FOCUS');
  const switchId=extended.compatibleRoadIds[0];
  const beforePath=JSON.stringify(extended.path);
  await battle.locator(`#hand .handCard[data-card-id="${switchId}"]`).click();
  await expect.poll(async()=> (await snapshot(page)).roadId).toBe(switchId);
  const switched=await snapshot(page);
  expect(switched.battleId).toBeNull();
  expect(JSON.stringify(switched.path)).toBe(beforePath);
  expect(switched.compatibleRoadIds).toContain(switchId);
  await expect(battle.locator(`#hand .handCard[data-card-id="${switchId}"]`)).toHaveAttribute('data-road-move-state','FOCUSED');
});
'''
test.write_text(t)
print('R6_POSTPATCH_READY')
