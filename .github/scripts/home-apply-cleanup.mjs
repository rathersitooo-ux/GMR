import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const TARGET='browser/GAMEROAD.html';
const EXPECTED_BLOB='40a5454a9b78b7534aaeb1d4e62206324b14dd45';
const EXPECTED_SIZE=11794881;
const buf=await readFile(TARGET);
let html=buf.toString('utf8');
const before=html;
const blob=spawnSync('git',['hash-object',TARGET],{encoding:'utf8'}).stdout.trim();
if(blob!==EXPECTED_BLOB||buf.byteLength!==EXPECTED_SIZE)throw Error(`pre-patch identity mismatch ${blob}/${buf.byteLength}`);

const count=(text,needle)=>text.split(needle).length-1;
const dataGoElementCount=text=>[...text.matchAll(/<[^>]+\bdata-go\s*=/gi)].length;
const digest=text=>createHash('sha256').update(text).digest('hex');
function mustCount(needle,n,label=needle){const got=count(html,needle);if(got!==n)throw Error(`precondition ${label}: expected ${n}, got ${got}`)}
function replaceExact(from,to,label){const n=count(html,from);if(n!==1)throw Error(`replace ${label}: expected exactly 1 source, got ${n}`);html=html.replace(from,to)}

const stateDeclBefore=before.match(/const state=\{[^\n]+\};/)?.[0];
const rosterBefore=before.match(/const PROD_CHARS=\[[\s\S]*?\];/)?.[0];
const saveLoadBefore=before.match(/function save\(\)\{[^\n]+\}\nfunction load\(\)\{[^\n]+\}/)?.[0];
if(!stateDeclBefore||!rosterBefore||!saveLoadBefore)throw Error('failed to snapshot protected state/roster/save-load regions');
const protectedHashes={state:digest(stateDeclBefore),roster:digest(rosterBefore),saveLoad:digest(saveLoadBefore)};
const baselineCounts={
  partnerNaki:count(before,'partner.naki'),
  selectedPartnerId:count(before,'selectedPartnerId'),
  playerCharacterId:count(before,'playerCharacterId'),
  dataGoElements:dataGoElementCount(before),
  navigateDetail:count(before,'navigateDetail'),
};
if(baselineCounts.partnerNaki!==11||baselineCounts.selectedPartnerId!==29||baselineCounts.playerCharacterId!==28)throw Error(`unexpected protected baseline counts ${JSON.stringify(baselineCounts)}`);

mustCount('<html lang="ja">',1,'initial html tag');
mustCount('id="homeRuntime"',1);
mustCount('id="homeCharName"',1);
mustCount('id="homeLivePartner"',1);
mustCount('homeMount',2);
mustCount("mountChar('#homeRuntime'",1);
mustCount("publicPartner=document.getElementById('homeLivePartner')?.textContent?.trim();",1,'battle Home-DOM partner dependency');
mustCount("home:{primary:this.rect('.homeCmd.main'),character:this.rect('#homeRuntime'),live:this.rect('#homeLiveCard')}",1,'stale Home visual QA selectors');
mustCount("setText('#homeLiveField','3列カードフィールド');setText('.homeCmd.main[data-go=\"setup\"] small','盤面から試合を開始');patchSetup();",1,'stale legacy Home language patch');

replaceExact('<html lang="ja">','<html lang="ja" class="grCodexHomeActive">','initial Home shell class');
replaceExact(
  '.home.codexHome{position:absolute;inset:0;overflow:hidden;background:linear-gradient(135deg,rgb(28,34,62) 0%,rgb(18,24,38) 55%,rgb(10,14,24) 100%)!important;color:#f4f6ff}',
  '.home.codexHome{position:absolute;inset:0;overflow:hidden;background:linear-gradient(135deg,rgb(28,34,62) 0%,rgb(18,24,38) 55%,rgb(10,14,24) 100%)!important;color:#f4f6ff}html.grCodexHomeActive .app{background:linear-gradient(135deg,#10162b,#121827 58%,#080c16)}html.grCodexHomeActive .top{background:linear-gradient(180deg,rgba(10,14,26,.94),rgba(10,14,26,.34),transparent)}html.grCodexHomeActive .pill{border-color:rgba(180,196,240,.26);background:rgba(22,28,50,.76)}',
  'Codex Home scoped shell override'
);
replaceExact(
  '.codexHomeVisualLayer{position:absolute;left:13%;top:16%;width:74%;height:72%;overflow:hidden}',
  '.codexHomeVisualLayer{position:absolute;left:13%;top:16%;width:74%;height:72%;overflow:hidden;border-radius:24px;isolation:isolate;background:linear-gradient(155deg,rgba(62,76,124,.36),rgba(34,42,72,.62) 48%,rgba(12,18,34,.82));box-shadow:inset 0 0 0 1px rgba(148,168,230,.12)}',
  'technical Home backdrop fallback'
);
replaceExact('.codexHeroRuntime{position:absolute!important;left:8%!important;top:2%!important;bottom:auto!important;width:84%!important;height:94%!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;z-index:3!important}','', 'obsolete Codex Home character runtime CSS');
replaceExact('.codexHeroRuntime .grtc-image{max-width:100%;height:94%!important;object-fit:contain;filter:drop-shadow(18px 24px 24px rgba(0,0,0,.42))}','', 'obsolete Codex Home character image CSS');
replaceExact('.codexHeroRuntime .heroFallback{font-size:90px;opacity:.22}','', 'obsolete Codex Home character fallback CSS');
replaceExact('.codexHomeMachineState{display:none!important}','', 'obsolete Home machine character state CSS');

replaceExact('<div class="codexHomeVisualLayer">','<div class="codexHomeVisualLayer" data-formal-background="missing">','formal background missing marker');
replaceExact('      <div id="homeRuntime" class="heroRuntime codexHeroRuntime"></div>\n','', 'Home selected-partner runtime DOM');
replaceExact('<button type="button" class="codexPartnerChip" data-go="characters"><span id="homeLivePartner">相棒</span></button>','<button type="button" class="codexPartnerChip" data-go="characters"><span>パートナー</span></button>','generic Home partner chip');
replaceExact('  <div class="codexHomeMachineState" aria-hidden="true"><span id="homeCharName"></span></div>\n','', 'obsolete Home character machine state DOM');
replaceExact('homeMount=null,','', 'obsolete Home mount variable');
replaceExact("state.screen=name;$$('.screen')","state.screen=name;document.documentElement.classList.toggle('grCodexHomeActive',name==='home');$$('.screen')",'Home shell class lifecycle');
replaceExact("  setText('#homeLiveField','3列カードフィールド');setText('.homeCmd.main[data-go=\"setup\"] small','盤面から試合を開始');patchSetup();","  patchSetup();",'remove legacy Home language no-ops');
replaceExact("const partner=partnerInfo(),player=playerCharInfo();$('#homeCharName').textContent=partner.name;$('#homeLivePartner')&&($('#homeLivePartner').textContent=partner.name);$('#homeLivePlayer')&&($('#homeLivePlayer').textContent=player.name);const last=state.history?.[0];$('#homeLiveResult')&&($('#homeLiveResult').textContent=last?`${last.rank}位 / ${last.rounds}巡`:'未対戦');homeMount=await mountChar('#homeRuntime',partner.id,'idle');homeMotionOnRender()}","homeMotionOnRender()}",'decouple Home render from selected partner/player');
replaceExact("publicPartner=document.getElementById('homeLivePartner')?.textContent?.trim();","publicPartner=(typeof partnerInfo==='function'?partnerInfo()?.name:'')?.trim();",'Battle partner name direct state lookup');
replaceExact("home:{primary:this.rect('.homeCmd.main'),character:this.rect('#homeRuntime'),live:this.rect('#homeLiveCard')}","home:{primary:this.rect('.codexBattleCta'),character:null,live:this.rect('.codexHomeCenterStage')}",'current Home visual shell QA selectors');

const stateDeclAfter=html.match(/const state=\{[^\n]+\};/)?.[0];
const rosterAfter=html.match(/const PROD_CHARS=\[[\s\S]*?\];/)?.[0];
const saveLoadAfter=html.match(/function save\(\)\{[^\n]+\}\nfunction load\(\)\{[^\n]+\}/)?.[0];
if(!stateDeclAfter||!rosterAfter||!saveLoadAfter)throw Error('protected regions missing after patch');
const afterHashes={state:digest(stateDeclAfter),roster:digest(rosterAfter),saveLoad:digest(saveLoadAfter)};
for(const key of Object.keys(protectedHashes))if(protectedHashes[key]!==afterHashes[key])throw Error(`protected ${key} region changed`);

const afterCounts={
  homeRuntime:count(html,'homeRuntime'),homeCharName:count(html,'homeCharName'),homeLivePartner:count(html,'homeLivePartner'),homeMount:count(html,'homeMount'),codexHeroRuntime:count(html,'codexHeroRuntime'),
  partnerNaki:count(html,'partner.naki'),selectedPartnerId:count(html,'selectedPartnerId'),playerCharacterId:count(html,'playerCharacterId'),dataGoElements:dataGoElementCount(html),navigateDetail:count(html,'navigateDetail')
};
for(const key of ['homeRuntime','homeCharName','homeLivePartner','homeMount','codexHeroRuntime'])if(afterCounts[key]!==0)throw Error(`${key} remains after patch: ${afterCounts[key]}`);
for(const key of ['partnerNaki','selectedPartnerId','playerCharacterId','dataGoElements','navigateDetail'])if(afterCounts[key]!==baselineCounts[key])throw Error(`protected count changed ${key}: ${baselineCounts[key]} -> ${afterCounts[key]}`);
if(count(html,"mountChar('#homeRuntime'")!==0)throw Error('Home mount call remains');
if(count(html,"document.getElementById('homeLivePartner')")!==0)throw Error('Battle still depends on Home DOM partner label');
if(count(html,"publicPartner=(typeof partnerInfo==='function'?partnerInfo()?.name:'')?.trim();")!==1)throw Error('Battle selected-partner state lookup missing');
if(count(html,'data-formal-background="missing"')!==1)throw Error('formal background missing marker incorrect');
if(count(html,'grCodexHomeActive')<5)throw Error('Home scoped shell lifecycle/CSS not fully installed');

const homeSection=html.match(/<section\b[^>]*data-screen=["']home["'][^>]*>[\s\S]*?<\/section\s*>/i)?.[0];
if(!homeSection)throw Error('Home section missing after patch');
for(const legacy of ['homeScene','homeCopy','homeLiveCard','homeRail','homeCmd','homeDock','homeMotionField','homeMotionMediaSlot','homeFoot']){
  const classRe=new RegExp(`class=["'][^"']*(?:^|\\s)${legacy}(?:\\s|$)`,`i`);
  if(classRe.test(homeSection))throw Error(`legacy Home DOM class remains: ${legacy}`);
}
if(/partner\.naki|selectedPartnerId|playerCharacterId/.test(homeSection))throw Error('Home markup gained partner state coupling');
const homeTargets=[...homeSection.matchAll(/data-home-target=["']([^"']+)["']/gi)].map(m=>m[1]).sort();
const expectedTargets=['cards','characters','setup','shop'];
if(JSON.stringify(homeTargets)!==JSON.stringify(expectedTargets))throw Error(`Home main targets changed: ${JSON.stringify(homeTargets)}`);

await writeFile(TARGET,html,'utf8');
const post=await readFile(TARGET);
const postBlob=spawnSync('git',['hash-object',TARGET],{encoding:'utf8'}).stdout.trim();
if(postBlob===EXPECTED_BLOB)throw Error('patch produced no Browser blob change');
console.log('HOME_CLEANUP_PATCH_OK',JSON.stringify({preBlob:EXPECTED_BLOB,postBlob,preBytes:buf.byteLength,postBytes:post.byteLength,protectedHashes,baselineCounts,afterCounts,homeTargets}));
