import test from 'node:test';
import assert from 'node:assert/strict';
import { transformReadyPlanProductionHtml } from '../scripts/apply-ui-feedback-ready-plan-production-r9.mjs';

const fixture = `<!doctype html><html><body><button id="readyPlan">準備完了</button><script>
async function commitPlans(){const m=state.match;if(m.busy)return;const me=m.players[0];updatePlanFromSelect();if(!me.plan?.roadId||!me.plan?.battleId){toast('ロードカードとバトルカードを選択してください');return}if(me.plan.roadId===me.plan.battleId){toast('別の札を選択してください');return}const path=me.plan.path||[me.position];if(path.length-1>normalMoveLimitForRoad(me.plan.roadId)){toast('通常移動可能歩数を超えています');return}for(let i=1;i<path.length;i++){if(!neighbors(path[i-1],me).includes(path[i])||path.slice(0,i).includes(path[i])){toast('経路が連続していません');return}}const quickAcceptedAt=quickNow(m);m.busy=true;try{if(!battleMount)await updateBattleAvatar();const used=new Set([path.at(-1)]);m.players.slice(1).forEach(p=>p.plan=botPlan(p,used));m.players.forEach(p=>{if(!p.hand.includes(p.plan.roadId)||!p.hand.includes(p.plan.battleId))throw Error('reservation-not-owned')});quickAcceptPlan(m,me,quickAcceptedAt);m.lastBattleResolution=null;m.phase='reveal';renderBattle();m.phase='move';renderBattle();const act=m.players.find(p=>p.id===m.activeId);m.phase='target';m.busy=false;renderBattle();if(!act.human){autoTarget(act);await resolveBattle()}}catch(e){m.busy=false;log('stopped');renderBattle();throw e}}
$('#readyPlan').onclick=()=>{commitPlans().catch(e=>console.error(e))};
</script></body></html>`;

test('replaces the legacy onclick with the existing binder production mount', () => {
  const output = transformReadyPlanProductionHtml(fixture);
  assert.equal(output.includes("$('#readyPlan').onclick="), false);
  assert.equal(output.includes('globalThis.GAMEROAD_READY_PLAN_COMMIT=commitPlans;'), true);
  assert.equal(output.includes('bindReadyPlanFeedbackControl({'), true);
  assert.equal(output.includes('createReadyPlanFeedbackAdapter({'), true);
  assert.equal(output.includes('accepted: accepted === true,'), true);
  assert.equal(output.includes('globalThis.GAMEROAD_READY_PLAN_FEEDBACK_BINDING = binding;'), true);
  assert.equal(output.includes('return true}catch(e){'), true);
  assert.equal(output.includes('if(m.busy)return false;'), true);
  assert.equal(output.includes("toast('別の札を選択してください');return false"), true);
});

test('fails closed when the legacy onclick anchor is absent', () => {
  assert.throws(
    () => transformReadyPlanProductionHtml(fixture.replace("$('#readyPlan').onclick=()=>{commitPlans().catch(e=>console.error(e))};", '')),
    /legacy-readyPlan-onclick/,
  );
});

test('fails closed on duplicate legacy responsibility', () => {
  const duplicate = fixture.replace('</script>', "$('#readyPlan').onclick=()=>{commitPlans().catch(e=>console.error(e))};\n</script>");
  assert.throws(() => transformReadyPlanProductionHtml(duplicate), /expected=1 actual=2/);
});

test('fails closed if the production marker already exists', () => {
  assert.throws(
    () => transformReadyPlanProductionHtml(fixture.replace('</body>', '<div id="gameroad-ui-feedback-ready-plan-production-r9"></div></body>')),
    /module-marker-precondition/,
  );
});
