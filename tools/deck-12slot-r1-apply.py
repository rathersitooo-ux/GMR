from pathlib import Path
import re

path = Path('browser/GAMEROAD.html')
text = path.read_text(encoding='utf-8')
original = text


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, got {count}')
    text = text.replace(old, new, 1)


def regex_once(pattern, replacement, label):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 regex match, got {count}')

old_default = 'window.__DEFAULT_DECK__=["SP_A","SP_2","SP_3","SP_4","SP_5","SP_6","HT_A","HT_2","HT_3","HT_4","HT_5","HT_6","DI_A","DI_2","DI_3","DI_4","DI_5","DI_6","CL_A","CL_2","CL_3","CL_4","CL_5","CL_6","SP_7","HT_7"];'
new_default = 'window.__DEFAULT_DECK__=["SP_A","SP_2","SP_3","SP_4","SP_5","SP_6","SP_7","SP_8","SP_9","SP_10","SP_J","SP_Q","SP_K","CL_A","CL_2","CL_3","CL_4","CL_5","CL_6","CL_7","CL_8","CL_9","CL_10","DI_A","DI_2","DI_3","DI_4","DI_5","DI_6","DI_7","DI_8","DI_9","DI_10","HT_A","HT_2","HT_3","HT_4","HT_5","HT_6","HT_7"];'
replace_once(old_default, new_default, 'default-deck-40')

anchor = "const saveRecoveryRuntime={inspection:null,classification:null,write:null,reset:null};"
helpers = r'''const saveRecoveryRuntime={inspection:null,classification:null,write:null,reset:null};
const DECK_SLOT_COUNT=12;
function deckStorageRecord(deck,rule={}){if(!deck||!Array.isArray(deck.main)||!Array.isArray(deck.ex))throw Error('DECK_SLOT_DECK_INVALID');const id=rule?.id??rule?.ruleId??null,revision=rule?.revision??rule?.ruleRevision??null;if((id===null)!==(revision===null))throw Error('DECK_SLOT_RULE_PARTIAL');if(id!==null&&(typeof id!=='string'||!Number.isInteger(revision)||revision<0))throw Error('DECK_SLOT_RULE_INVALID');return{main:deck.main.map(String),ex:deck.ex.map(String),ruleId:id,ruleRevision:revision}}
function emptyDeckStorageRecord(){return{main:[],ex:[],ruleId:null,ruleRevision:null}}
function cloneDeckStorageList(list){return list.map((d,i)=>{if(!d||!Array.isArray(d.main)||!Array.isArray(d.ex))throw Error('DECK_SLOT_'+(i+1)+'_INVALID');return deckStorageRecord(d,d)})}
function freshDeckStorageList(){const list=Array.from({length:DECK_SLOT_COUNT},emptyDeckStorageRecord);list[0]=deckStorageRecord({main:[...DEFAULT_DECK],ex:[]},DECK_RULE);return list}
function legacyDeckStorageList(deck,rule){const list=Array.from({length:DECK_SLOT_COUNT},emptyDeckStorageRecord);list[0]=deckStorageRecord(deck,rule);return list}
function validateDeckStorageList(list,index){if(!Array.isArray(list)||list.length!==DECK_SLOT_COUNT)throw Error('DECK_LIST_INVALID');if(!Number.isInteger(index)||index<0||index>=DECK_SLOT_COUNT)throw Error('ACTIVE_DECK_INDEX_INVALID');return cloneDeckStorageList(list)}
function installDeckStorage(list,index){const safe=validateDeckStorageList(list,index),active=safe[index];state.deckList=safe;state.activeDeckIndex=index;state.savedDeck={main:[...active.main],ex:[...active.ex]};state.savedDeckRule={id:active.ruleId,revision:active.ruleRevision};return active}
function ensureDeckStorageRuntime(){if(Array.isArray(state.deckList)&&state.deckList.length===DECK_SLOT_COUNT&&Number.isInteger(state.activeDeckIndex)&&state.activeDeckIndex>=0&&state.activeDeckIndex<DECK_SLOT_COUNT)return;installDeckStorage(legacyDeckStorageList(state.savedDeck,state.savedDeckRule),0)}
function syncActiveDeckStorage(){ensureDeckStorageRuntime();const list=cloneDeckStorageList(state.deckList);list[state.activeDeckIndex]=deckStorageRecord(state.savedDeck,state.savedDeckRule);state.deckList=list;return list}
function compatibilityDeckStorageRecord(){const list=syncActiveDeckStorage(),ordered=[state.activeDeckIndex,...Array.from({length:DECK_SLOT_COUNT},(_,i)=>i).filter(i=>i!==state.activeDeckIndex)];for(const i of ordered){const d=list[i];if(d.ruleId===DECK_RULE.id&&d.ruleRevision===DECK_RULE.revision&&validateDeck({main:d.main,ex:d.ex}).ok)return deckStorageRecord(d,d)}return deckStorageRecord(state.savedDeck,state.savedDeckRule)}
function saveDeckStoragePayload(){const list=syncActiveDeckStorage();return{deckList:cloneDeckStorageList(list),activeDeckIndex:state.activeDeckIndex}}
function decodeParsedDeckStorage(d){if(Object.prototype.hasOwnProperty.call(d,'deckList')){const index=d.activeDeckIndex;return{list:validateDeckStorageList(d.deckList,index),index}}if(d.deck&&Array.isArray(d.deck.main)&&Array.isArray(d.deck.ex)){return{list:legacyDeckStorageList(d.deck,{id:typeof d.deck.ruleId==='string'?d.deck.ruleId:null,revision:Number.isInteger(d.deck.ruleRevision)?d.deck.ruleRevision:null}),index:0}}throw Error('DECK_SLOT_SOURCE_REQUIRED')}
function selectStoredDeck(index,{persist=true}={}){ensureDeckStorageRuntime();if(!Number.isInteger(index)||index<0||index>=DECK_SLOT_COUNT)return{ok:false,reason:'ACTIVE_DECK_INDEX_INVALID'};if(typeof deckDirty==='function'&&deckDirty())return{ok:false,reason:'UNSAVED_DECK_DRAFT'};syncActiveDeckStorage();installDeckStorage(state.deckList,index);state.deckDraft={main:[...state.savedDeck.main],ex:[...state.savedDeck.ex]};clearDeckDraftSession();const persisted=persist?save():null;renderCards();renderSetupDeckStatus();return{ok:true,index,persisted}}
'''
replace_once(anchor, helpers, 'deck-slot-helpers')

new_save_pack = r'''function savePack(){normalizeAudioSettings();state.partnerProfiles=normalizePartnerProfiles(state.partnerProfiles);const slotPayload=saveDeckStoragePayload(),compat=compatibilityDeckStorageRecord();return{v:3,playerCharacterId:state.playerCharacterId,partner:{schema:PARTNER_PROFILE_SCHEMA,selectedId:state.selectedPartnerId,profiles:state.partnerProfiles},settings:state.settings,history:state.history.slice(0,30),progression:{battlePoints:Math.max(0,Math.floor(Number(state.progression?.battlePoints)||0))},setupMode:state.setupMode,setupContent:state.setupContent,deck:compat,deckList:slotPayload.deckList,activeDeckIndex:slotPayload.activeDeckIndex}}'''
regex_once(r"function savePack\(\)\{.*?\}\nfunction saveProjection", new_save_pack + "\nfunction saveProjection", 'savePack')

new_apply = r'''function applyParsedSave(d){const deckStorage=decodeParsedDeckStorage(d);if(d.v<=2){const legacy=PROD_CHARS.some(c=>c.id===d.selectedCharacter)?d.selectedCharacter:'partner.naki';state.selectedPartnerId=legacy;state.playerCharacterId=legacy;state.partnerProfiles=normalizePartnerProfiles(null)}else{if(PROD_CHARS.some(c=>c.id===d.playerCharacterId))state.playerCharacterId=d.playerCharacterId;if(PROD_CHARS.some(c=>c.id===d.partner?.selectedId))state.selectedPartnerId=d.partner.selectedId;state.partnerProfiles=normalizePartnerProfiles(d.partner?.profiles)}if(d.settings)Object.assign(state.settings,d.settings);normalizeAudioSettings();if(Array.isArray(d.history))state.history=d.history.slice(0,30);state.progression={battlePoints:Math.max(0,Math.floor(Number(d.progression?.battlePoints)||0))};if(['2p','4p','2v2'].includes(d.setupMode))state.setupMode=d.setupMode;if(['road_shield','honey_hunt'].includes(d.setupContent))state.setupContent=d.setupContent;installDeckStorage(deckStorage.list,deckStorage.index);state.deckDraft={main:[...state.savedDeck.main],ex:[...state.savedDeck.ex]}}'''
regex_once(r"function applyParsedSave\(d\)\{.*?\}\nfunction prepareCurrentPackCommit", new_apply + "\nfunction prepareCurrentPackCommit", 'applyParsedSave')

new_save = r'''function save(){const pack=savePack(),read=readStorage(localStorage,SAVE_KEY);if(read.status!=='read'){memorySave=JSON.stringify(pack);markStorageReadFailure(read.reason);return false}const inspection=inspectRawSave(read.rawValue),classification=classifySave(inspection);if(classification.status!=='current'){memorySave=JSON.stringify(pack);state.storage='memory';saveRecoveryRuntime.write={status:'blocked',reason:classification.reason};$('#storageStatus')&&($('#storageStatus').textContent='この起動中に保存');return false}if(pack.deck.ruleId!==DECK_RULE.id||pack.deck.ruleRevision!==DECK_RULE.revision||!validateDeck({main:pack.deck.main,ex:pack.deck.ex}).ok){state.storage='memory';saveRecoveryRuntime.write={status:'blocked',reason:'NO_CURRENT_LEGAL_COMPATIBILITY_DECK'};return false}const prepared=prepareCurrentPackCommit(inspection,classification,pack);if(prepared.status!=='prepared'){state.storage='memory';saveRecoveryRuntime.write=prepared;return false}const latest=readStorage(localStorage,SAVE_KEY);if(latest.status!=='read'||latest.rawValue!==read.rawValue){state.storage='memory';saveRecoveryRuntime.write={status:'failed',reason:latest.status==='read'?'SAVE_CHANGED_DURING_WRITE':latest.reason};return false}const written=writePreparedSaveVerified(localStorage,SAVE_KEY,prepared);saveRecoveryRuntime.write=written;if(written.status!=='saved'){memorySave=prepared.serialized;state.storage='memory';$('#storageStatus')&&($('#storageStatus').textContent='この起動中に保存');return false}memorySave=prepared.serialized;state.storage='localStorage';$('#saveState')&&($('#saveState').textContent='保存済み');$('#storageStatus')&&($('#storageStatus').textContent='端末保存');return true}'''
regex_once(r"function save\(\)\{.*?\}\nfunction load", new_save + "\nfunction load", 'save')

new_load = r'''function load(){const read=readStorage(localStorage,SAVE_KEY);if(read.status!=='read'){markStorageReadFailure(read.reason);ensureDeckStorageRuntime();state.deckDraft={main:[...state.savedDeck.main],ex:[...state.savedDeck.ex]};recoverDeckDraftSession();return saveRecoveryRuntime.classification}state.storage='localStorage';memorySave=read.rawValue;const inspection=inspectRawSave(read.rawValue),classification=classifySave(inspection);if(classification.status==='missing'){installDeckStorage(freshDeckStorageList(),0);state.deckDraft={main:[...state.savedDeck.main],ex:[...state.savedDeck.ex]}}else if((classification.status==='current'||classification.status==='recognized_legacy')&&inspection.parsed)applyParsedSave(inspection.parsed);normalizeAudioSettings();state.partnerProfiles=normalizePartnerProfiles(state.partnerProfiles);state.progression=state.progression&&typeof state.progression==='object'?state.progression:{battlePoints:0};recoverDeckDraftSession();if(classification.status!=='current')state.storage='memory';return classification}'''
regex_once(r"function load\(\)\{.*?\}\nwindow\.__GAMEROAD_SAVE_RECOVERY__", new_load + "\nwindow.__GAMEROAD_SAVE_RECOVERY__", 'load')

expose_anchor = "window.__GAMEROAD_SAVE_RECOVERY__={snapshot:()=>JSON.parse(JSON.stringify(saveRecoveryRuntime)),authority:{...SAVE_AUTHORITY}};"
expose = expose_anchor + "\nwindow.__GAMEROAD_DECK_SLOT_STORAGE__={snapshot:()=>{ensureDeckStorageRuntime();return JSON.parse(JSON.stringify({deckList:state.deckList,activeDeckIndex:state.activeDeckIndex}))},select:(index,options)=>selectStoredDeck(index,options),slotCount:DECK_SLOT_COUNT};"
replace_once(expose_anchor, expose, 'slot-runtime-exposure')

new_commit = r'''function commitDeck(){const v=validateDeck(state.deckDraft);if(!v.ok){toast(v.errors[0]);renderCards();return false}ensureDeckStorageRuntime();const nextDeck={main:[...state.deckDraft.main],ex:[...state.deckDraft.ex],ruleId:DECK_RULE.id,ruleRevision:DECK_RULE.revision},nextProjection={saveRevision:3,ruleId:DECK_RULE.id,ruleRevision:DECK_RULE.revision,deckSize:state.deckDraft.main.length,deckLegal:true},read=readStorage(localStorage,SAVE_KEY);if(read.status!=='read'){markStorageReadFailure(read.reason);toast('端末保存を確認できません。札組は保存していません');renderCards();return false}const inspection=inspectRawSave(read.rawValue),classification=classifySave(inspection),prepared=prepareExplicitDeckCommit({inspection,currentClassification:classification,path:['deck'],nextDeckRecord:nextDeck,nextProjection,authority:SAVE_AUTHORITY});if(prepared.status!=='prepared'){saveRecoveryRuntime.write=prepared;state.storage='memory';toast('保存データを保護するため札組を上書きしません');renderCards();return false}const currentPack=savePack(),nextDeckList=cloneDeckStorageList(currentPack.deckList);nextDeckList[state.activeDeckIndex]=deckStorageRecord(nextDeck,nextDeck);currentPack.deck=nextDeck;currentPack.deckList=nextDeckList;currentPack.activeDeckIndex=state.activeDeckIndex;const stampedRoot={...mergeKnownPack(prepared.nextRoot,currentPack),v:3},stampedPrepared={...prepared,serialized:JSON.stringify(stampedRoot),nextRoot:stampedRoot},latest=readStorage(localStorage,SAVE_KEY);if(latest.status!=='read'||latest.rawValue!==read.rawValue){saveRecoveryRuntime.write={status:'failed',reason:latest.status==='read'?'SAVE_CHANGED_DURING_WRITE':latest.reason};state.storage='memory';toast('保存状態が変わったため札組を上書きしません');renderCards();return false}const written=writePreparedSaveVerified(localStorage,SAVE_KEY,stampedPrepared);saveRecoveryRuntime.write=written;if(written.status!=='saved'){state.storage='memory';toast(written.originalPreserved===false?'保存に失敗し、元データの復元も確認できません':'保存に失敗しました。元の保存データを維持します');renderCards();return false}memorySave=stampedPrepared.serialized;state.storage='localStorage';installDeckStorage(nextDeckList,state.activeDeckIndex);state.deckDraft={main:[...state.savedDeck.main],ex:[...state.savedDeck.ex]};clearDeckDraftSession();renderCards();renderSetupDeckStatus();if(typeof ctxSet==='function')ctxSet('DECK_SAVED',{kind:'ok',ttl:2200});toast('札組を端末へ保存しました');return true}'''
regex_once(r"function commitDeck\(\)\{.*?\}\nfunction restoreDeck", new_commit + "\nfunction restoreDeck", 'commitDeck')

new_reset = r'''$('#resetSave').onclick=()=>{if(!window.confirm('端末のGAMEROAD保存を初期化します。よろしいですか？'))return false;const rr=resetExplicitSaveKeys(localStorage,[SAVE_KEY],{confirmed:true});saveRecoveryRuntime.reset=rr;if(rr.status!=='reset'){state.storage='memory';renderSettings();toast('保存の初期化に失敗しました。元の保存データを維持します');return false}memorySave=null;clearDeckDraftSession();state.history=[];state.progression={battlePoints:0};state.setupMode='2p';state.setupContent='road_shield';state.selectedPartnerId='partner.naki';state.playerCharacterId='partner.naki';state.characterSelectionRole='partner';state.partnerProfiles=normalizePartnerProfiles(null);state.settings={reduceMotion:false,lowPerf:false,audio:{...AUDIO_DEFAULTS}};state.lastPackPreview=[];state.gachaBusy=false;installDeckStorage(freshDeckStorageList(),0);state.deckDraft={main:[...state.savedDeck.main],ex:[...state.savedDeck.ex]};state.storage='memory';audioStopMusic('reset');audioRuntime.seenEvents.clear();renderSettings();renderCards();renderSetupDeckStatus();toast('保存を初期化しました');return true};wireAudioSettings();'''
regex_once(r"\$\('#resetSave'\)\.onclick=\(\)=>\{.*?\};wireAudioSettings\(\);", new_reset, 'resetSave')

if text == original:
    raise SystemExit('no changes applied')

checks = {
    'starter40': new_default,
    'slot-count': 'const DECK_SLOT_COUNT=12;',
    'deck-list-save': 'deckList:slotPayload.deckList,activeDeckIndex:slotPayload.activeDeckIndex',
    'legacy-projection': 'legacyDeckStorageList(d.deck',
    'fresh-slot-init': "installDeckStorage(freshDeckStorageList(),0)",
    'slot-runtime': 'window.__GAMEROAD_DECK_SLOT_STORAGE__=',
}
for label, needle in checks.items():
    if text.count(needle) < 1:
        raise SystemExit(f'{label}: postcondition missing')

path.write_text(text, encoding='utf-8')
print('DECK_12_SLOT_PATCH_OK', len(original), '->', len(text))
