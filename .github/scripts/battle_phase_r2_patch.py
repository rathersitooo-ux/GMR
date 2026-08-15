from pathlib import Path
import subprocess

PATH = Path("browser/GAMEROAD.html")
GOOD_R2_COMMIT = "915b78485d5064a739396032f37f3a86a2617ae9"
STYLE_START = '<style id="gameroad-battle-phase-presentation-r2-dedicated">'
STYLE_END = "</style>"
SCRIPT_START = '<script id="gameroad-battle-phase-presentation-r2-dedicated-script">'
SCRIPT_END = "</script>"
SENTINEL = "BROWSER-BATTLE-PHASE-PRESENTATION-INTEGRATION-001-R2-DEDICATED-SURFACE"
CUTIN_SENTINEL = "BATTLE-PHASE-R2-CUTIN-HOLD"

current = PATH.read_text(encoding="utf-8")
good = subprocess.check_output(
    ["git", "show", f"{GOOD_R2_COMMIT}:browser/GAMEROAD.html"],
    text=True,
    encoding="utf-8",
)

if current.count(STYLE_START) != 1:
    raise SystemExit(f"current R2 style count={current.count(STYLE_START)}; expected 1")
if good.count(STYLE_START) != 1 or good.count(SCRIPT_START) != 1:
    raise SystemExit("verified pre-fix source does not contain exactly one R2 style/script block")
if good.count(SENTINEL) != 1:
    raise SystemExit("verified pre-fix source lost R2 sentinel")

# Recover the exact known-good dedicated-scene CSS from the pre-fix commit.
g_style_start = good.index(STYLE_START)
g_style_end = good.index(STYLE_END, g_style_start) + len(STYLE_END)
base_style = good[g_style_start:g_style_end]
if "baseRenderBattle=renderBattle" not in good:
    raise SystemExit("verified pre-fix source identity check failed")

cutin_css = r'''
/* BATTLE-PHASE-R2-CUTIN-HOLD: keep unrevealed battle data visually inaccessible until Naki's entry cut-in clears. */
.battlePhaseSurface.cutinHold .battlePhaseCutin{opacity:1!important;transform:none!important;left:0!important;top:8%!important;bottom:0!important;width:100%!important;border-right:0!important;clip-path:none!important;z-index:20!important;background:linear-gradient(102deg,rgba(18,5,28,.99),rgba(83,27,95,.88) 55%,rgba(5,18,15,.72))!important}
.battlePhaseSurface.cutinHold .battlePhaseNaki{inset:2% 22% 0!important}
.battlePhaseSurface.cutinHold .battlePhaseCutinCopy{left:5%!important;bottom:7%!important}
.battlePhaseSurface.cutinHold .battlePhaseResolutionSlot,.battlePhaseSurface.cutinHold .battlePhaseTarget{visibility:hidden!important;pointer-events:none!important}
@media(max-width:700px){.battlePhaseSurface.cutinHold .battlePhaseCutin{top:8%!important;bottom:0!important}.battlePhaseSurface.cutinHold .battlePhaseNaki{inset:4% 10% 0!important}}
'''
rebuilt_style = base_style[:-len(STYLE_END)] + cutin_css + STYLE_END

new_script = r'''<script id="gameroad-battle-phase-presentation-r2-dedicated-script">
(()=>{
 const root=document.querySelector('.screen.battle'),surface=document.getElementById('battlePhaseSurface'),slot=document.getElementById('battlePhaseResolutionSlot'),map=document.getElementById('battleMap'),box=document.getElementById('battleResolution'),roundEl=document.getElementById('battlePhaseRound'),stageEl=document.getElementById('battlePhaseStage'),targetEl=document.getElementById('battlePhaseTarget'),naki=document.getElementById('battlePhaseNaki');
 if(!root||!surface||!slot||!map||!box||!roundEl||!stageEl||!targetEl||!naki)return;
 const stageName={focus:'戦闘開始',reveal:'カード公開',read:'カード読取',compare:'パワー比較',winner:'勝者確定',settle:'列へ反映'};
 let cutinKey='',cutinTimer=0,nakiMount=null,nakiMountPromise=null;
 function reducedPresentation(){return matchMedia('(prefers-reduced-motion: reduce)').matches||document.querySelector('#reduceMotion')?.textContent?.includes('ON')||document.querySelector('#lowPerf')?.textContent?.includes('ON')}
 function roundCopy(){const source=box.querySelector('.resolutionHead .k')?.textContent||'';return source.match(/第\d+巡/)?.[0]||roundEl.textContent||'第1巡'}
 function publicCompareCopy(){const raw=(box.querySelector('.resolutionCompare')?.textContent||'').replace(/\s+/g,' ').trim();const players=box.querySelectorAll('.resolutionPlayer').length;const team=/組A/.test(raw)&&/組B/.test(raw);const mode=team?'2対2チーム比較':players===4?'4人全員比較':'';return [raw,mode].filter(Boolean).join(' / ')}
 function clearNaki(){
   if(cutinTimer){clearTimeout(cutinTimer);cutinTimer=0}
   surface.classList.remove('cutinHold');
   const runtime=window.GameRoadThreeCharRuntime;
   try{if(nakiMount&&runtime?.unmount)runtime.unmount(nakiMount)}catch(e){console.warn('battle-phase-naki-unmount',e)}
   nakiMount=null;nakiMountPromise=null;naki.replaceChildren();delete naki.dataset.characterId;
 }
 function mountNaki(){
   naki.dataset.characterId='partner.naki';
   const runtime=window.GameRoadThreeCharRuntime;
   if(runtime?.mount){
     try{
       const mounted=runtime.mount(naki,{characterId:'partner.naki',state:'dot_break_entry',assetMode:'embedded',performance:reducedPresentation()?'low':'normal',allowNetwork:false});
       nakiMountPromise=Promise.resolve(mounted).then(handle=>{nakiMount=handle||null;return handle}).catch(e=>{console.warn('battle-phase-naki-cutin',e);if(!naki.childElementCount){const d=document.createElement('div');d.className='heroFallback';d.textContent='緋';naki.appendChild(d)}});
     }catch(e){console.warn('battle-phase-naki-cutin',e)}
   }
   if(!runtime?.mount&&!naki.childElementCount){const d=document.createElement('div');d.className='heroFallback';d.textContent='緋';naki.appendChild(d)}
 }
 function startCutin(key){
   if(cutinKey===key)return;
   cutinKey=key;surface.classList.add('cutinHold');surface.dataset.stage='focus';stageEl.textContent=stageName.focus;
   mountNaki();
   if(cutinTimer)clearTimeout(cutinTimer);
   cutinTimer=setTimeout(()=>{cutinTimer=0;surface.classList.remove('cutinHold');syncShell()},reducedPresentation()?180:520);
 }
 function syncShell(){
   const live=box.classList.contains('battlePhaseLive')&&!box.hidden;
   root.classList.toggle('dedicatedBattlePhase',live);surface.hidden=!live;
   if(!live){
     surface.dataset.stage='';cutinKey='';targetEl.textContent='';
     if(box.parentElement!==map)map.insertBefore(box,map.querySelector('.battleInfo'));
     clearNaki();return;
   }
   if(box.parentElement!==slot)slot.appendChild(box);
   const internalStage=box.dataset.stage||'focus',round=roundCopy(),compare=publicCompareCopy();
   roundEl.textContent=round;targetEl.textContent=compare;
   if(internalStage==='focus')startCutin(`${round}|${compare}`);
   if(surface.classList.contains('cutinHold')){surface.dataset.stage='focus';stageEl.textContent=stageName.focus;return}
   surface.dataset.stage=internalStage;stageEl.textContent=stageName[internalStage]||'戦闘';
 }
 const observer=new MutationObserver(syncShell);
 observer.observe(box,{attributes:true,attributeFilter:['class','hidden','data-stage'],childList:true,subtree:true});
 window.__GAMEROAD_BATTLE_PHASE_R2__={
   sync:syncShell,
   snapshot:()=>{const r=surface.getBoundingClientRect(),br=box.getBoundingClientRect();return{live:root.classList.contains('dedicatedBattlePhase'),stage:surface.dataset.stage||null,surfaceHidden:surface.hidden,cutinHold:surface.classList.contains('cutinHold'),boardVisibility:getComputedStyle(map).visibility,boardPointer:getComputedStyle(map).pointerEvents,resolutionParent:box.parentElement?.id||null,nakiCharacter:naki.dataset.characterId||null,nakiNodes:naki.childElementCount,surfaceRect:[r.x,r.y,r.width,r.height],resolutionRect:[br.x,br.y,br.width,br.height],docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}}
 };
 syncShell();
})();
</script>'''

# Replace the entire potentially malformed R2 style+script tail in one operation.
c_style_start = current.index(STYLE_START)
c_script_start = current.index(SCRIPT_START, c_style_start)
c_script_end = current.index(SCRIPT_END, c_script_start) + len(SCRIPT_END)
rebuilt_block = rebuilt_style + "\n" + new_script
fixed = current[:c_style_start] + rebuilt_block + current[c_script_end:]

block = fixed[c_style_start:c_style_start + len(rebuilt_block)]
checks = {
    "style": fixed.count(STYLE_START),
    "script": fixed.count(SCRIPT_START),
    "sentinel": fixed.count(SENTINEL),
    "surface": fixed.count('id="battlePhaseSurface"'),
    "cutin_hold": block.count(CUTIN_SENTINEL),
    "probe": block.count("__GAMEROAD_BATTLE_PHASE_R2__"),
    "observer": block.count("new MutationObserver(syncShell)"),
    "naki_character": block.count("characterId:'partner.naki'"),
    "naki_state": block.count("state:'dot_break_entry'"),
}
bad = {key: value for key, value in checks.items() if value != 1}
if bad:
    raise SystemExit(f"post-rebuild uniqueness failure: {bad}")
for forbidden in (
    "baseRenderBattle=renderBattle",
    "baseSetBattlePresentation=setBattlePresentation",
    "mountChar('#battlePhaseNaki",
    "state.match",
):
    if forbidden in block:
        raise SystemExit(f"private-runtime dependency still present: {forbidden}")
if "</style>\n<script id=\"gameroad-battle-phase-presentation-r2-dedicated-script\">" not in rebuilt_block:
    raise SystemExit("R2 style/script boundary is malformed")

PATH.write_text(fixed, encoding="utf-8")
print("R2 block rebuilt from verified source", checks)
