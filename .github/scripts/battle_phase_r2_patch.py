from pathlib import Path

PATH = Path("browser/GAMEROAD.html")
SENTINEL = "BROWSER-BATTLE-PHASE-PRESENTATION-INTEGRATION-001-R2-DEDICATED-SURFACE"
DRAWER_ANCHOR = '<aside class="battleDrawer" id="battleDrawer"'
BODY_ANCHOR = "</body>"

text = PATH.read_text(encoding="utf-8")

if SENTINEL in text:
    raise SystemExit("R2 sentinel already present; refusing duplicate patch")
if text.count(DRAWER_ANCHOR) != 1:
    raise SystemExit(f"battleDrawer anchor count={text.count(DRAWER_ANCHOR)}; expected 1")
if text.count(BODY_ANCHOR) != 1:
    raise SystemExit(f"body anchor count={text.count(BODY_ANCHOR)}; expected 1")

surface = '''<section id="battlePhaseSurface" class="battlePhaseSurface" aria-label="バトルフェイズ専用画面" aria-live="polite" hidden><div class="battlePhaseBackdrop" aria-hidden="true"></div><header class="battlePhaseHeader"><span>BATTLE PHASE</span><b id="battlePhaseRound">第1巡</b><small id="battlePhaseStage">戦闘開始</small></header><div class="battlePhaseCutin" id="battlePhaseCutin" aria-label="緋累ナキ カットイン"><div class="battlePhaseNaki" id="battlePhaseNaki"></div><div class="battlePhaseCutinCopy"><span>PARTNER CUT-IN</span><strong>緋累ナキ</strong></div></div><div class="battlePhaseTarget" id="battlePhaseTarget"></div><div class="battlePhaseResolutionSlot" id="battlePhaseResolutionSlot"></div></section>'''
text = text.replace(DRAWER_ANCHOR, surface + DRAWER_ANCHOR, 1)

late_patch = r'''
<style id="gameroad-battle-phase-presentation-r2-dedicated">
/* BROWSER-BATTLE-PHASE-PRESENTATION-INTEGRATION-001-R2-DEDICATED-SURFACE
   Presentation only. resolveBattle remains the gameplay authority. */
.battlePhaseSurface[hidden]{display:none!important}
.battle.dedicatedBattlePhase .battleMap,.battle.dedicatedBattlePhase .battleDrawer{visibility:hidden!important;pointer-events:none!important}
.battle.dedicatedBattlePhase .battlePhaseSurface{display:block!important;visibility:visible!important;pointer-events:auto!important}
.battlePhaseSurface{position:absolute;inset:0;z-index:120;overflow:hidden;background:radial-gradient(circle at 22% 47%,rgba(117,44,132,.38),transparent 31%),radial-gradient(circle at 78% 50%,rgba(211,168,62,.16),transparent 34%),linear-gradient(118deg,#080914 0%,#171126 42%,#071714 100%);isolation:isolate}
.battlePhaseBackdrop{position:absolute;inset:-8%;pointer-events:none;background:linear-gradient(105deg,transparent 0 34%,rgba(255,255,255,.045) 34.5% 35%,transparent 35.5% 62%,rgba(213,168,62,.07) 62.5% 63%,transparent 63.5%),repeating-linear-gradient(112deg,transparent 0 38px,rgba(255,255,255,.018) 39px 40px);transform:skewX(-5deg)}
.battlePhaseHeader{position:absolute;z-index:4;left:4%;right:4%;top:4%;height:54px;display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:14px;border-bottom:1px solid rgba(255,232,173,.38);letter-spacing:.09em}.battlePhaseHeader span{font-size:clamp(17px,2.3vw,32px);font-weight:1000;color:#fff0ae}.battlePhaseHeader b{font-size:12px;color:#f5fff9}.battlePhaseHeader small{justify-self:end;font-size:10px;color:#c9d9d4}
.battlePhaseCutin{position:absolute;z-index:3;left:2%;top:14%;bottom:7%;width:38%;overflow:hidden;border-right:1px solid rgba(255,232,173,.24);clip-path:polygon(0 0,94% 0,100% 50%,94% 100%,0 100%);background:linear-gradient(104deg,rgba(22,7,31,.96),rgba(79,27,92,.56) 66%,rgba(5,18,15,.06));opacity:.12;transform:translateX(-3%);transition:opacity .16s ease,transform .16s ease}.battlePhaseSurface[data-stage="focus"] .battlePhaseCutin{opacity:1;transform:none}
.battlePhaseNaki{position:absolute;inset:4% 5% 4% 0;display:flex;align-items:flex-end;justify-content:center}.battlePhaseNaki .grtc-root{width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center}.battlePhaseNaki .grtc-image{max-width:100%;width:auto;height:100%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 18px 24px rgba(0,0,0,.48))}.battlePhaseNaki .heroFallback{font-size:clamp(90px,17vw,250px);font-weight:1000;color:rgba(255,255,255,.86)}
.battlePhaseCutinCopy{position:absolute;left:6%;bottom:5%;display:grid;gap:1px;text-shadow:0 2px 12px rgba(0,0,0,.8)}.battlePhaseCutinCopy span{font-size:8px;letter-spacing:.16em;color:#dec6e8}.battlePhaseCutinCopy strong{font-size:clamp(20px,3vw,44px);line-height:1;color:#fff}
.battlePhaseTarget{position:absolute;z-index:5;left:43%;right:4%;top:13%;min-height:44px;padding:9px 12px;border-left:3px solid #ffe08a;background:linear-gradient(90deg,rgba(10,30,25,.88),rgba(10,30,25,.24));font-size:11px;font-weight:900;color:#eaf8f3;letter-spacing:.03em}
.battlePhaseResolutionSlot{position:absolute;z-index:6;left:43%;right:4%;top:23%;bottom:6%;display:grid;align-items:center}
.battle .battlePhaseSurface .battleResolution.battlePhaseLive{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;transform:none!important;width:100%!important;min-height:250px!important;max-height:min(66vh,560px)!important;margin:0!important;padding:18px!important;overflow:auto!important;display:grid!important;grid-template-columns:1fr!important;gap:14px!important;border:1px solid rgba(255,225,150,.48)!important;border-left:5px solid #d4a83e!important;border-radius:14px!important;background:linear-gradient(145deg,rgba(4,18,15,.96),rgba(18,41,35,.94))!important;box-shadow:0 24px 70px rgba(0,0,0,.5)!important;pointer-events:auto!important}
.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionHead{position:relative!important;width:auto!important;height:auto!important;margin:0!important;overflow:visible!important;clip:auto!important;white-space:normal!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;min-height:54px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionHead .k{font-size:9px!important;color:#cfddd8!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionWinner{font-size:clamp(20px,3vw,40px)!important;line-height:1.05!important;white-space:normal!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCompare{font-size:10px!important;line-height:1.5!important;white-space:normal!important;text-align:right!important;color:#c8ded6!important;max-width:48%!important}
.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayers{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;grid-auto-flow:row!important;grid-auto-columns:auto!important;gap:8px!important;padding:0!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayer{min-height:118px!important;padding:10px!important;display:grid!important;grid-template-rows:auto 1fr auto!important;align-content:start!important;border:1px solid rgba(221,243,235,.22)!important;border-top:4px solid rgba(221,243,235,.38)!important;border-radius:9px!important;background:rgba(5,31,25,.74)!important;overflow:hidden!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayer.win{border-color:#ffe08a!important;box-shadow:0 0 0 2px rgba(255,224,138,.16),0 0 24px rgba(255,211,102,.18)!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayerTop{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:6px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayerTop b{position:static!important;width:auto!important;height:auto!important;overflow:visible!important;clip:auto!important;font-size:10px!important;white-space:normal!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionScore{font-size:28px!important;line-height:1!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCards{display:flex!important;justify-content:flex-start!important;align-content:flex-start!important;gap:4px!important;margin-top:8px!important;overflow:visible!important;flex-wrap:wrap!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCard{width:auto!important;height:auto!important;min-width:46px!important;min-height:34px!important;padding:4px 6px!important;display:inline-flex!important;gap:3px!important;place-items:initial!important;border:1px solid rgba(255,238,196,.45)!important;border-radius:4px!important;background:rgba(0,0,0,.22)!important;color:#f7fff9!important;font-size:8px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCard em{position:static!important;width:auto!important;height:auto!important;overflow:visible!important;clip:auto!important;font-size:6px!important;color:#b9cbc5!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCard b{font-size:11px!important;color:#fff!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionGain{position:static!important;width:auto!important;height:auto!important;overflow:visible!important;clip:auto!important;font-size:8px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionAdvance{position:static!important;justify-self:end!important;right:auto!important;bottom:auto!important;width:auto!important;min-width:110px!important;height:46px!important;min-height:46px!important;padding:0 16px!important;border-radius:7px!important;font-size:11px!important}
.battlePhaseSurface[data-stage="focus"] .battlePhaseResolutionSlot{left:43%;top:28%}.battlePhaseSurface[data-stage="focus"] .battleResolution .resolutionPlayers{display:none!important}.battlePhaseSurface[data-stage="focus"] .battleResolution{min-height:180px!important;align-content:center!important}
@media(max-width:700px){.battlePhaseHeader{left:3%;right:3%;top:2%;height:46px;gap:7px}.battlePhaseHeader span{font-size:17px}.battlePhaseHeader small{font-size:8px}.battlePhaseCutin{left:0;top:10%;bottom:50%;width:100%;border-right:0;border-bottom:1px solid rgba(255,232,173,.24);clip-path:polygon(0 0,100% 0,100% 90%,50% 100%,0 90%)}.battlePhaseNaki{inset:0 24% 2%}.battlePhaseCutinCopy{left:4%;bottom:8%}.battlePhaseTarget{left:3%;right:3%;top:47%;min-height:38px;padding:7px 9px;font-size:9px}.battlePhaseResolutionSlot,.battlePhaseSurface[data-stage="focus"] .battlePhaseResolutionSlot{left:3%;right:3%;top:56%;bottom:3%;align-items:stretch}.battle .battlePhaseSurface .battleResolution.battlePhaseLive{min-height:0!important;max-height:none!important;height:100%!important;padding:9px!important;gap:7px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionHead{min-height:36px!important;gap:6px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionWinner{font-size:15px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCompare{font-size:7px!important;max-width:55%!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayers{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayer{min-height:58px!important;padding:4px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionScore{font-size:18px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCards{margin-top:3px!important;gap:2px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionCard{min-width:34px!important;min-height:24px!important;padding:2px 3px!important;font-size:6px!important}.battlePhaseSurface[data-stage="focus"] .battlePhaseResolutionSlot{top:61%}.battlePhaseSurface[data-stage="focus"] .battleResolution{height:auto!important;min-height:110px!important;max-height:34vh!important}}
@media(max-height:470px) and (orientation:landscape){.battlePhaseHeader{top:2%;height:36px}.battlePhaseCutin{top:11%;bottom:4%;width:34%}.battlePhaseTarget{left:37%;top:12%;font-size:8px}.battlePhaseResolutionSlot,.battlePhaseSurface[data-stage="focus"] .battlePhaseResolutionSlot{left:37%;top:25%;bottom:3%}.battle .battlePhaseSurface .battleResolution.battlePhaseLive{min-height:0!important;max-height:none!important;height:100%!important;padding:7px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionPlayer{min-height:54px!important;padding:4px!important}.battle .battlePhaseSurface .battleResolution.battlePhaseLive .resolutionAdvance{height:42px!important;min-height:42px!important}}
@media(prefers-reduced-motion:reduce){.battlePhaseCutin{transition:none!important}.battlePhaseBackdrop{transform:none!important}}
body.low-perf .battlePhaseBackdrop{background:none!important}.battle.dedicatedBattlePhase .battlePhaseSurface{contain:layout paint}
</style>
<script id="gameroad-battle-phase-presentation-r2-dedicated-script">
(()=>{
 const root=document.querySelector('.screen.battle'),surface=document.getElementById('battlePhaseSurface'),slot=document.getElementById('battlePhaseResolutionSlot'),map=document.getElementById('battleMap'),box=document.getElementById('battleResolution'),roundEl=document.getElementById('battlePhaseRound'),stageEl=document.getElementById('battlePhaseStage'),targetEl=document.getElementById('battlePhaseTarget'),naki=document.getElementById('battlePhaseNaki');
 if(!root||!surface||!slot||!map||!box)return;
 let cutinKey='';
 const stageName={focus:'戦闘開始',reveal:'カード公開',read:'カード読取',compare:'パワー比較',winner:'勝者確定',settle:'列へ反映'};
 function targetCopy(m,p){const a=m.players.find(x=>x.id===p.attackerId),d=m.players.find(x=>x.id===p.defenderId),lane=p.lane==='L'?'左列':p.lane==='C'?'中央列':'右列',shield=p.shield==='L'?'左シールド':p.shield==='C'?'中央シールド':'右シールド',mode=m.mode==='4p'?' / 4人全員比較':m.mode==='2v2'?' / 2対2チーム比較':'';return `${a?.name||p.attackerId} → ${d?.name||p.defenderId} / ${lane} / ${shield}${mode}`}
 function syncShell(){
   const m=state.match,p=m?.battlePresentation,live=state.screen==='battle'&&m?.phase==='resolve'&&!!p;
   root.classList.toggle('dedicatedBattlePhase',live);surface.hidden=!live;
   if(live){
     if(box.parentElement!==slot)slot.appendChild(box);
     surface.dataset.stage=p.stage||'focus';roundEl.textContent=`第${p.round||m.round}巡`;stageEl.textContent=stageName[p.stage]||'戦闘';targetEl.textContent=targetCopy(m,p);
     if(p.stage==='focus'){
       const key=`${p.round}:${p.attackerId}:${p.defenderId}:${p.lane}:${p.shield}`;
       if(cutinKey!==key){cutinKey=key;Promise.resolve(mountChar('#battlePhaseNaki','partner.naki','dot_break_entry')).catch(e=>console.warn('battle-phase-naki-cutin',e))}
     }
   }else{
     surface.dataset.stage='';cutinKey='';if(box.parentElement!==map)map.insertBefore(box,map.querySelector('.battleInfo'));if(naki?.childNodes?.length)naki.replaceChildren();
   }
 }
 const baseRenderBattle=renderBattle;
 renderBattle=function(...args){syncShell();const out=baseRenderBattle.apply(this,args);syncShell();return out};
 const baseSetBattlePresentation=setBattlePresentation;
 setBattlePresentation=async function(stage,base={},wait=BATTLE_PRESENTATION_STEP_MS){const cutinHold=stage==='focus'&&!battlePresentationRuntime.fast?Math.max(Number(wait)||0,(state.settings.reduceMotion||state.settings.lowPerf)?180:520):wait;return baseSetBattlePresentation(stage,base,cutinHold)};
 window.__GAMEROAD_BATTLE_PHASE_R2__={sync:syncShell,snapshot:()=>{const r=surface.getBoundingClientRect(),br=box.getBoundingClientRect();return{live:root.classList.contains('dedicatedBattlePhase'),stage:surface.dataset.stage||null,surfaceHidden:surface.hidden,boardVisibility:getComputedStyle(map).visibility,boardPointer:getComputedStyle(map).pointerEvents,resolutionParent:box.parentElement?.id||null,nakiCharacter:naki?.dataset?.characterId||null,nakiNodes:naki?.childElementCount||0,surfaceRect:[r.x,r.y,r.width,r.height],resolutionRect:[br.x,br.y,br.width,br.height],docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}}};
 syncShell();
})();
</script>
'''

text = text.replace(BODY_ANCHOR, late_patch + "\n" + BODY_ANCHOR, 1)

checks = {
    "sentinel": text.count(SENTINEL),
    "surface": text.count('id="battlePhaseSurface"'),
    "slot": text.count('id="battlePhaseResolutionSlot"'),
    "hook": text.count("__GAMEROAD_BATTLE_PHASE_R2__"),
    "naki_state": text.count("mountChar('#battlePhaseNaki','partner.naki','dot_break_entry')"),
}
bad = {key: value for key, value in checks.items() if value != 1}
if bad:
    raise SystemExit(f"post-patch uniqueness failure: {bad}")

PATH.write_text(text, encoding="utf-8")
print("R2 guarded patch applied", checks)
