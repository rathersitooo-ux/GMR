import fs from 'node:fs';

const path = 'browser/GAMEROAD.html';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error('missing:' + label);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error('duplicate:' + label);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "function allReady(){return FR.hostReady&&guestPids().every(pid=>{const s=slotByPid(pid);return s?.connected&&s.ready})}",
  "function allReady(){return FR.hostReady&&guestPids().every(pid=>{const s=slotByPid(pid);return s?.connected&&s.ready&&!!s.deckSnapshot})}",
  'allReady'
);

replaceOnce(
  "function allocate(cid){let s=slotByClient(cid);if(s)return{s,newMember:false};if(FR.roomState!=='lobby')return{s:null,newMember:false};s=guestPids().map(slotByPid).find(x=>!x.clientId)||guestPids().map(slotByPid).find(x=>!x.connected);if(!s)return{s:null,newMember:false};s.clientId=cid;s.authToken=randomId('auth');s.connected=false;s.ready=false;s.lastSeq=0;return{s,newMember:true}}",
  "function allocate(cid){let s=slotByClient(cid);if(s)return{s,newMember:false};if(FR.roomState!=='lobby')return{s:null,newMember:false};s=guestPids().map(slotByPid).find(x=>!x.clientId)||guestPids().map(slotByPid).find(x=>!x.connected);if(!s)return{s:null,newMember:false};s.clientId=cid;s.authToken=randomId('auth');s.connected=false;s.ready=false;s.deckSnapshot=null;s.lastSeq=0;return{s,newMember:true}}",
  'allocate'
);

replaceOnce(
  "function resetReady(){FR.hostReady=false;for(const s of Object.values(FR.slots))s.ready=false;FR.planValues={};FR.lastMembershipChange=now()}",
  "function resetReady(){FR.hostReady=false;for(const s of Object.values(FR.slots)){s.ready=false;s.deckSnapshot=null}FR.planValues={};FR.lastMembershipChange=now()}",
  'resetReady'
);

replaceOnce(
  "FR.slots=Object.fromEntries(guestPids().map(pid=>[pid,{pid,clientId:null,authToken:null,connected:false,ready:false,lastSeq:0}]));",
  "FR.slots=Object.fromEntries(guestPids().map(pid=>[pid,{pid,clientId:null,authToken:null,connected:false,ready:false,deckSnapshot:null,lastSeq:0}]));",
  'createRoom slots'
);

replaceOnce(
  "function toggleReady(){if(FR.role==='host'){if(FR.roomState!=='lobby')return false;FR.hostReady=!FR.hostReady;sendAllLobby();return true}if(FR.role==='guest'&&FR.assignedPid&&FR.roomState==='lobby'){send({type:'ready',value:!FR.guestReady});return true}return false}",
  "function friendLocalDeckSnapshot(){const snapshotFactory=globalThis.GAMEROAD_CREATE_DECK_MATCH_START_SNAPSHOT;if(typeof snapshotFactory!=='function')throw new Error('MATCH_START_SNAPSHOT_RUNTIME_UNAVAILABLE');return snapshotFactory({savedDeck:state.savedDeck,savedDeckRule:state.savedDeckRule,setupMode:FR.playerCount===4?'4p':'2p',setupContent:FR.contentId||'road_shield',playerCharacterId:state.playerCharacterId,selectedPartnerId:state.selectedPartnerId},{validateDeck})}\nfunction friendValidateRemoteDeckSnapshot(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw)||!raw.deck)throw new Error('FRIEND_DECK_SNAPSHOT_REQUIRED');const snapshotFactory=globalThis.GAMEROAD_CREATE_DECK_MATCH_START_SNAPSHOT;if(typeof snapshotFactory!=='function')throw new Error('MATCH_START_SNAPSHOT_RUNTIME_UNAVAILABLE');return snapshotFactory({savedDeck:{main:Array.isArray(raw.deck.main)?raw.deck.main:[],ex:Array.isArray(raw.deck.ex)?raw.deck.ex:[]},savedDeckRule:state.savedDeckRule,setupMode:FR.playerCount===4?'4p':'2p',setupContent:FR.contentId||'road_shield',playerCharacterId:raw.selection?.playerCharacterId??null,selectedPartnerId:raw.selection?.selectedPartnerId??null},{validateDeck})}\nfunction toggleReady(){if(FR.role==='host'){if(FR.roomState!=='lobby')return false;FR.hostReady=!FR.hostReady;sendAllLobby();return true}if(FR.role==='guest'&&FR.assignedPid&&FR.roomState==='lobby'){const value=!FR.guestReady;if(!value){send({type:'ready',value:false});return true}let deckSnapshot;try{deckSnapshot=friendLocalDeckSnapshot()}catch(e){FR.lastReject='invalid_deck';const message=String(e?.message||e),prefix='MATCH_START_DECK_INVALID:';toast(message.startsWith(prefix)?'札組を修正: '+message.slice(prefix.length):'対戦用の札組を確認できません');renderLobby();return false}send({type:'ready',value:true,deckSnapshot});return true}return false}",
  'toggleReady'
);

replaceOnce(
  "if(m.type==='ready'){if(FR.roomState!=='lobby'){reject(cid,'room_not_lobby');return}s.ready=!!m.value;sendAllLobby();return}",
  "if(m.type==='ready'){if(FR.roomState!=='lobby'){reject(cid,'room_not_lobby');return}if(!m.value){s.ready=false;s.deckSnapshot=null;sendAllLobby();return}try{s.deckSnapshot=friendValidateRemoteDeckSnapshot(m.deckSnapshot);s.ready=true}catch(e){s.ready=false;s.deckSnapshot=null;reject(cid,'invalid_deck',String(e?.message||e));sendAllLobby();return}sendAllLobby();return}",
  'host ready'
);

replaceOnce(
  "function returnLobby(){if(FR.role!=='host'||!['result','playing'].includes(FR.roomState))return false;FR.roomState='lobby';FR.hostReady=false;for(const s of Object.values(FR.slots))s.ready=false;FR.planValues={};",
  "function returnLobby(){if(FR.role!=='host'||!['result','playing'].includes(FR.roomState))return false;FR.roomState='lobby';FR.hostReady=false;for(const s of Object.values(FR.slots)){s.ready=false;s.deckSnapshot=null}FR.planValues={};",
  'returnLobby'
);

replaceOnce(
  "function startMatch(){const eligibility=deckEligibility(state.savedDeck);",
  "function startMatch(deckByPlayer=null){const eligibility=deckEligibility(state.savedDeck);",
  'startMatch signature'
);

replaceOnce(
  "const n=playerCount(snapshot.setup.mode),ps=[],diagnosticCpuDeck=[...snapshot.deck.main];for(let i=0;i<n;i++)ps.push(makePlayer(i,i===0,i===0?[...snapshot.deck.main]:diagnosticCpuDeck));",
  "const n=playerCount(snapshot.setup.mode),ps=[],diagnosticCpuDeck=[...snapshot.deck.main];for(let i=0;i<n;i++){const pid='P'+(i+1),boundDeck=Array.isArray(deckByPlayer?.[pid])?[...deckByPlayer[pid]]:null;ps.push(makePlayer(i,i===0,boundDeck||(i===0?[...snapshot.deck.main]:diagnosticCpuDeck)))}",
  'startMatch per-seat deck'
);

replaceOnce(
  "function hostStart(){if(FR.role!=='host'||FR.roomState!=='lobby'||!allReady())return false;FR.roomState='playing';FR.matchNo++;FR.planValues={};FR.baseProgression=Number(state.progression?.battlePoints||0);FR.baseHistoryLength=state.history.length;state.setupMode=FR.playerCount===4?'4p':'2p';state.setupContent=FR.contentId||'road_shield';const m=startMatch();if(!m){FR.roomState='lobby';return false}",
  "function hostStart(){if(FR.role!=='host'||FR.roomState!=='lobby'||!allReady())return false;const guestDecks={};for(const pid of guestPids()){const s=slotByPid(pid);try{const snap=friendValidateRemoteDeckSnapshot(s?.deckSnapshot);s.deckSnapshot=snap;guestDecks[pid]=[...snap.deck.main]}catch(e){if(s){s.ready=false;s.deckSnapshot=null;reject(s.clientId,'invalid_deck',String(e?.message||e))}sendAllLobby();return false}}FR.roomState='playing';FR.matchNo++;FR.planValues={};FR.baseProgression=Number(state.progression?.battlePoints||0);FR.baseHistoryLength=state.history.length;state.setupMode=FR.playerCount===4?'4p':'2p';state.setupContent=FR.contentId||'road_shield';const m=startMatch(guestDecks);if(!m){FR.roomState='lobby';return false}",
  'hostStart'
);

const required = [
  "send({type:'ready',value:true,deckSnapshot})",
  "s.deckSnapshot=friendValidateRemoteDeckSnapshot(m.deckSnapshot);s.ready=true",
  "guestDecks[pid]=[...snap.deck.main]",
  "const m=startMatch(guestDecks);",
  "Array.isArray(deckByPlayer?.[pid])"
];
for (const needle of required) {
  if (!source.includes(needle)) throw new Error('postcondition:' + needle);
}

fs.writeFileSync(path, source);
console.log(JSON.stringify({ ok: true, bytes: Buffer.byteLength(source) }));
