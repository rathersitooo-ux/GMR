from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'browser/GAMEROAD.html')
text = path.read_text(encoding='utf-8')

replacements = [
(
'{"id":"GED","display_name":"G・E・D","suit":"DK","rank":"OVER","power":97,"ability_type":"Luna"',
'{"id":"GED","display_name":"G・E・D","suit":"DK","rank":"OVER","power":97,"ability_type":"Vanilla"'
),
(
"function deckSuitInfo(c){const m={SP:['♠','SPADE'],HT:['♥','HEART'],DI:['♦','DIAMOND'],CL:['♣','CLUB'],DCG:['◆','CARD']};return m[c?.suit]||['◇',String(c?.suit||'CARD')]}",
"function deckSuitInfo(c){const m={SP:['♠','SPADE'],HT:['♥','HEART'],DI:['♦','DIAMOND'],CL:['♣','CLUB'],DK:['☾','ルナ'],DCG:['◆','CARD']};return m[c?.suit]||['◇',String(c?.suit||'CARD')]}"
),
(
"const fallback=cloneDeckRecord(state.savedDeck?.main?.length||state.savedDeck?.ex?.length?state.savedDeck:{main:[...DEFAULT_DECK],ex:[]});",
"const fallback=cloneDeckRecord(state.savedDeck);"
),
(
"function deckEligibility(deck){const d=cloneDeckRecord(deck),mainCount=d.main.length;if(mainCount<DECK_RULE.requiredMain)return{usable:false,status:'CARD_COUNT_SHORT',missingCount:DECK_RULE.requiredMain-mainCount};if(mainCount>DECK_RULE.requiredMain)return{usable:false,status:'CARD_COUNT_OVER',excessCount:mainCount-DECK_RULE.requiredMain};const blocked=[...new Set([...d.main,...d.ex].filter(id=>CURRENT_REGULATION_BLOCKED_CARD_IDS.includes(String(id))))];if(blocked.length)return{usable:false,status:'REGULATION_CARD_BLOCKED',blockedCardIds:blocked};const validation=validateDeck(d,{forBattle:true});if(!validation.ok)return{usable:false,status:'RULE_BLOCKED',message:validation.errors[0],validation};return{usable:true,status:'USABLE',validation}}",
"function deckEligibility(deck){const d=cloneDeckRecord(deck),mainCount=d.main.length,blocked=[...new Set([...d.main,...d.ex].filter(id=>CURRENT_REGULATION_BLOCKED_CARD_IDS.includes(String(id))))],blockers=[];let missingCount=0,excessCount=0;if(mainCount<DECK_RULE.requiredMain){missingCount=DECK_RULE.requiredMain-mainCount;blockers.push('CARD_COUNT_SHORT')}else if(mainCount>DECK_RULE.requiredMain){excessCount=mainCount-DECK_RULE.requiredMain;blockers.push('CARD_COUNT_OVER')}if(blocked.length)blockers.push('REGULATION_CARD_BLOCKED');if(blockers.length)return{usable:false,status:blockers[0],blockers,missingCount,excessCount,blockedCardIds:blocked};const validation=validateDeck(d,{forBattle:true});if(!validation.ok)return{usable:false,status:'RULE_BLOCKED',blockers:['RULE_BLOCKED'],message:validation.errors[0],validation,blockedCardIds:blocked};return{usable:true,status:'USABLE',blockers:[],blockedCardIds:[],validation}}"
),
(
"function deckEligibilityMessage(result){if(result.status==='CARD_COUNT_SHORT')return`あと${result.missingCount}枚必要です`;if(result.status==='CARD_COUNT_OVER')return`${result.excessCount}枚多すぎます`;if(result.status==='REGULATION_CARD_BLOCKED'){const names=result.blockedCardIds.map(id=>CARDS[id]?.display_name||id).join('・');return`このレギュレーションでは「${names}」を使用できません`}if(result.status==='RULE_BLOCKED')return result.message||'デッキ条件を確認してください';return'対戦に使用できます'}",
"function deckEligibilityMessage(result){const blockers=Array.isArray(result.blockers)&&result.blockers.length?result.blockers:[result.status],parts=[];if(blockers.includes('CARD_COUNT_SHORT'))parts.push(`あと${result.missingCount}枚必要です`);if(blockers.includes('CARD_COUNT_OVER'))parts.push(`${result.excessCount}枚多すぎます`);if(blockers.includes('REGULATION_CARD_BLOCKED')){const names=(result.blockedCardIds||[]).map(id=>CARDS[id]?.display_name||id).join('・');parts.push(`このレギュレーションでは「${names}」を使用できません`)}if(parts.length)return parts.join('／');if(result.status==='RULE_BLOCKED')return result.message||'デッキ条件を確認してください';return'対戦に使用できます'}"
),
(
"resetExplicitSaveKeys(localStorage,[SAVE_KEY],{confirmed:true})",
"resetExplicitSaveKeys(localStorage,[SAVE_KEY,DECK_LIBRARY_KEY,DECK_SELECTION_KEY],{confirmed:true})"
),
(
"state.savedDeck={main:[...DEFAULT_DECK],ex:[]};state.savedDeckRule={id:null,revision:null};state.deckDraft={main:[...DEFAULT_DECK],ex:[]};state.storage='memory';",
"state.savedDeck={main:[...DEFAULT_DECK],ex:[]};state.savedDeckRule={id:DECK_RULE.id,revision:DECK_RULE.revision};state.deckDraft={main:[...DEFAULT_DECK],ex:[]};state.saveAuthorityDeck=cloneDeckRecord(state.savedDeck);state.saveAuthorityDeckRule={...state.savedDeckRule};state.deckSlots=Array.from({length:DECK_SLOT_COUNT},(_,i)=>i===0?cloneDeckRecord(state.savedDeck):emptyDeckRecord());state.selectedDeckIndex=0;state.storage='memory';"
),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'exact replacement count must be 1, got {count}: {old[:100]}')
    text = text.replace(old, new, 1)

checks = {
    'GED is not misclassified as Luna ability type': '"id":"GED","display_name":"G・E・D","suit":"DK","rank":"OVER","power":97,"ability_type":"Vanilla"',
    'DK renders as Luna crescent': "DK:['☾','ルナ']",
    'explicit empty saved deck is preserved': 'const fallback=cloneDeckRecord(state.savedDeck);',
    'eligibility carries independent blockers': "blockers.push('REGULATION_CARD_BLOCKED')",
    'reset clears deck library key': '[SAVE_KEY,DECK_LIBRARY_KEY,DECK_SELECTION_KEY]',
    'reset reinitializes 12 in-memory slots': 'state.deckSlots=Array.from({length:DECK_SLOT_COUNT}'
}
for label, needle in checks.items():
    if needle not in text:
        raise SystemExit(f'missing postcondition: {label}')

path.write_text(text, encoding='utf-8')
print('deck runtime R2 fixes applied:', ', '.join(checks))
