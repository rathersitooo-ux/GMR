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
  const first=await snapshot(page);
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
'''
test.write_text(t)
print('R6_POSTPATCH_READY')
