import { COMPLETION_CONSEQUENCE, resolveCompletionRule, projectCompletionRule } from './new-base-legacy-seven-win-gate-core.mjs';

export const ROOM_RULE_PRESET = Object.freeze({ STANDARD:'STANDARD', CUSTOM:'CUSTOM' });
export const ROOM_RULE_SCHEMA = 'gameroad.room-rule-settings.v1';
const MIN=3, MAX=7, STYLE_ID='gameroad-room-rules-settings-style';
const CUSTOM=ROOM_RULE_PRESET.CUSTOM, STANDARD=ROOM_RULE_PRESET.STANDARD;
const GOAL=COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH, DIRECT=COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN;

export function resolveRoomRuleSettings({
  preset=STANDARD, completionTargetCount=7, completionConsequence=GOAL, maxReachableCount=7
}={}) {
  if(preset!==STANDARD && preset!==CUSTOM) throw new TypeError('INVALID_ROOM_PRESET');
  if(!Number.isSafeInteger(maxReachableCount) || maxReachableCount<MIN || maxReachableCount>MAX)
    throw new RangeError('INVALID_MAP_CAPACITY');
  if(preset===STANDARD && maxReachableCount!==MAX) throw new RangeError('STANDARD_REQUIRES_SEVEN_SLOTS');
  const target=preset===STANDARD ? 7 : completionTargetCount;
  const consequence=preset===STANDARD ? GOAL : completionConsequence;
  if(!Number.isSafeInteger(target) || target<MIN || target>maxReachableCount)
    throw new RangeError('INVALID_COMPLETION_TARGET');
  if(consequence!==GOAL && consequence!==DIRECT) throw new TypeError('INVALID_COMPLETION_CONSEQUENCE');
  const resolvedRule=resolveCompletionRule({
    completionTargetCount:target, completionConsequence:consequence, maxReachableCount
  });
  return Object.freeze({
    schema:ROOM_RULE_SCHEMA, preset, mapId:'INITIAL_MAP', completionTargetCount:target,
    completionConsequence:consequence, maxReachableCount,
    gateOpenPolicy:'ALL_AT_ONCE', goalReachRequired:consequence===GOAL, resolvedRule
  });
}

function validate(rule) {
  if(!rule || rule.schema!==ROOM_RULE_SCHEMA) throw new TypeError('RULE_SNAPSHOT_REQUIRED');
  return resolveRoomRuleSettings(rule);
}

export function describeRoomRuleSettings(ruleInput) {
  const rule=validate(ruleInput), count=rule.completionTargetCount;
  return Object.freeze({
    name:rule.preset===STANDARD?'初期マップ・標準ルール':'カスタムルーム',
    description:rule.goalReachRequired
      ? '一列に実札'+count+'枚を揃えると全ゲートが開放。その後ゴールマスに到達した人が勝利。'
      : '一列に実札'+count+'枚を揃えた時点で即勝利（旧方式）。',
    count, goalRequired:rule.goalReachRequired
  });
}

export function projectRoomColumnMeter({
  settings, authoritativeCardCount, authoritativeGateOpen=false,
  authoritativeMatchEnded=false
}={}) {
  const rule=validate(settings);
  if(!Number.isSafeInteger(authoritativeCardCount) || authoritativeCardCount<0)
    throw new TypeError('AUTHORITATIVE_CARD_COUNT_REQUIRED');
  if(typeof authoritativeGateOpen!=='boolean' || typeof authoritativeMatchEnded!=='boolean')
    throw new TypeError('AUTHORITATIVE_STATE_BOOLEAN_REQUIRED');
  const projection=projectCompletionRule({
    authoritativeCount:authoritativeCardCount, resolvedRule:rule.resolvedRule
  });
  const target=rule.completionTargetCount, reached=authoritativeCardCount>=target;
  let state='COLLECTING', message='完成まであと'+Math.max(0,target-authoritativeCardCount)+'枚';
  if(reached && rule.goalReachRequired) {
    state=authoritativeGateOpen?'GOAL_OPEN':'GATE_CONFIRMATION_PENDING';
    message=authoritativeGateOpen?'ゲート開放。ゴールマスへ向かおう':'列完成。ゲート開放の確定待ち';
  } else if(reached) {
    state='DIRECT_WIN_CONFIRMATION_PENDING'; message='列完成。勝利結果の確定待ち';
  }
  if(authoritativeMatchEnded) {
    state='MATCH_ENDED'; message='試合終了。確定結果を確認してください';
  }
  return Object.freeze({
    schema:'gameroad.room-column-meter.v1', target, current:authoritativeCardCount,
    meterValue:Math.min(target,authoritativeCardCount),
    percent:Math.round(100*Math.min(target,authoritativeCardCount)/target),
    ruleConsequence:projection.completionConsequence,
    state, message, projectionOnly:true, forwardsTerminalWin:false
  });
}

function el(doc,tag,txt) {
  const n=doc.createElement(tag); if(txt!==undefined)n.textContent=txt; return n;
}
function injectStyle(doc) {
  if(!doc.head || doc.getElementById?.(STYLE_ID))return;
  const s=el(doc,'style');s.id=STYLE_ID;
  s.textContent='.grRuleScreen{border:1px solid #82978c;border-radius:14px;padding:16px;max-width:580px;background:#172d27;color:#f6f5e9;font:inherit}'+
  '.grRuleScreen fieldset{border:1px solid #759287;border-radius:9px;margin:12px 0;padding:10px}'+
  '.grRuleScreen label{display:flex;gap:9px;align-items:center;margin:8px 0}'+
  '.grRuleScreen input[type=range]{flex:1;accent-color:#efc66e}'+
  '.grRuleScreen button{background:#e3b459;border:0;border-radius:8px;padding:11px;color:#172d27;font-weight:700}'+
  '.grRuleScreen button:disabled{opacity:.5}.grRoomProgress meter{width:100%;height:18px;accent-color:#e3b459}';
  doc.head.appendChild(s);
}

/** Caller decides who edits, persists the authoritative room rule and distributes it.
 * This screen is not an authority and never mutates gameplay by itself.
 */
export function mountRoomRuleSettingsScreen({host,initialSettings,editable=true,onCommit}={}) {
  const doc=host?.ownerDocument;
  if(!host?.replaceChildren || !doc?.createElement)throw new TypeError('ROOM_RULE_HOST_REQUIRED');
  if(editable && typeof onCommit!=='function')throw new TypeError('ROOM_RULE_COMMIT_CALLBACK_REQUIRED');
  injectStyle(doc);
  let rule=validate(initialSettings||resolveRoomRuleSettings()),pending=false,destroyed=false,notice='';
  const root=el(doc,'section');root.className='grRuleScreen';
  root.setAttribute('aria-label','ルームのルール設定');
  host.replaceChildren(root);
  function render(){
    if(destroyed)return;
    root.replaceChildren(el(doc,'h2','ルームルール設定'));
    const field=el(doc,'fieldset');field.appendChild(el(doc,'legend','ルールの種類'));
    for(const [mode,label] of [[STANDARD,'標準：7枚 → 全ゲート開放 → ゴール到達で勝利'],[CUSTOM,'カスタムルール']]){
      const wrap=el(doc,'label'),radio=el(doc,'input');radio.type='radio';
      radio.name='roomRuleMode';radio.value=mode;radio.checked=rule.preset===mode;
      radio.disabled=!editable||pending;wrap.append(radio,el(doc,'span',label));field.appendChild(wrap);
      radio.addEventListener('change',()=>{if(!radio.checked)return;
        rule=resolveRoomRuleSettings({
          preset:mode,completionTargetCount:rule.completionTargetCount,
          completionConsequence:rule.completionConsequence,maxReachableCount:rule.maxReachableCount
        }); notice='変更内容はまだ保存されていません';render();
      });
    }
    root.appendChild(field);
    const countField=el(doc,'fieldset');countField.appendChild(el(doc,'legend','必要枚数の調節メーター'));
    const countLabel=el(doc,'label',undefined),slider=el(doc,'input');
    slider.type='range';slider.min=String(MIN);slider.max=String(rule.maxReachableCount);
    slider.step='1';slider.value=String(rule.completionTargetCount);
    slider.disabled=!editable||pending||rule.preset===STANDARD;
    slider.setAttribute('aria-label','列完成に必要な枚数');
    const value=el(doc,'output',String(rule.completionTargetCount)+'枚');
    countLabel.append(slider,value);countField.appendChild(countLabel);root.appendChild(countField);
    const finish=el(doc,'fieldset');finish.appendChild(el(doc,'legend','列完成後の処理'));
    for(const [c,label] of [[GOAL,'全ゲート開放 → ゴール到達で勝利'],[DIRECT,'即勝利（旧方式・カスタムのみ）']]){
      const wrap=el(doc,'label'),radio=el(doc,'input');radio.type='radio';
      radio.name='roomRuleConsequence';radio.value=c;radio.checked=rule.completionConsequence===c;
      radio.disabled=!editable||pending||rule.preset===STANDARD;
      wrap.append(radio,el(doc,'span',label));finish.appendChild(wrap);
      radio.addEventListener('change',()=>{if(!radio.checked)return;
        rule=resolveRoomRuleSettings({preset:CUSTOM,completionTargetCount:rule.completionTargetCount,
          completionConsequence:c,maxReachableCount:rule.maxReachableCount});
        notice='変更内容はまだ保存されていません';render();
      });
    }
    root.appendChild(finish);
    const preview=el(doc,'p',describeRoomRuleSettings(rule).description);
    const status=el(doc,'p',notice);status.setAttribute('role','status');
    slider.addEventListener('input',()=>{
      rule=resolveRoomRuleSettings({preset:CUSTOM,completionTargetCount:Number(slider.value),
        completionConsequence:rule.completionConsequence,maxReachableCount:rule.maxReachableCount});
      value.textContent=String(rule.completionTargetCount)+'枚';
      preview.textContent=describeRoomRuleSettings(rule).description;
      notice='変更内容はまだ保存されていません';status.textContent=notice;
    });
    root.appendChild(preview);
    if(editable){
      const save=el(doc,'button',pending?'保存確認中':'ルームルールを保存');
      save.type='button';save.disabled=pending;
      save.addEventListener('click',async()=>{
        if(pending)return;
        pending=true;notice='保存・共有の確認中';render();
        try {
          const ack=await onCommit(rule);
          notice=ack?.accepted===true?'ルーム側で保存が確定しました':'保存は確定していません';
        }catch(_){notice='保存に失敗しました。試合のルールは変わっていません';}
        pending=false;render();
      });
      root.appendChild(save);
    }
    root.appendChild(status);
  }
  render();
  return Object.freeze({
    getDraft:()=>rule,
    updateRoomSettings:next=>{rule=validate(next);notice='';render();},
    destroy:()=>{if(destroyed)return false;destroyed=true;host.replaceChildren();return true;},
    gameStateWrite:false,roomPersistenceAuthority:false
  });
}

/** Use only authoritative match count, gate status and terminal result. */
export function mountRoomColumnProgressMeter({host,settings}={}) {
  const doc=host?.ownerDocument;
  if(!host?.replaceChildren||!doc?.createElement)throw new TypeError('ROOM_METER_HOST_REQUIRED');
  const roomRule=validate(settings);injectStyle(doc);
  const root=el(doc,'section');root.className='grRoomProgress';
  root.setAttribute('aria-label','列の完成メーター');
  const title=el(doc,'p','列の完成進捗'),meter=el(doc,'meter');
  meter.min=0;meter.max=roomRule.completionTargetCount;meter.value=0;
  meter.setAttribute('aria-label','必要枚数までの列進捗');
  const count=el(doc,'p','0 / '+roomRule.completionTargetCount+'枚'),status=el(doc,'p','');
  status.setAttribute('role','status');
  root.append(title,meter,count,status);host.replaceChildren(root);
  let destroyed=false;
  return Object.freeze({
    update:data=>{
      if(destroyed)throw new Error('METER_DESTROYED');
      const projected=projectRoomColumnMeter({...data,settings:roomRule});
      meter.value=projected.meterValue;
      count.textContent=projected.current+' / '+projected.target+'枚';
      status.textContent=projected.message;
      return projected;
    },
    destroy:()=>{if(destroyed)return false;destroyed=true;host.replaceChildren();return true;},
    gameStateWrite:false,terminalAuthority:false
  });
}
