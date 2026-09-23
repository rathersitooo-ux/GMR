from pathlib import Path

path=Path("browser/GAMEROAD.html")
s=path.read_text(encoding="utf-8")

anchor="function rarityOf(c){if(!c)return null;if(c.id.startsWith('SP_')||c.id.startsWith('HT_')||c.id.startsWith('DI_')||c.id.startsWith('CL_'))return 'common';return GACHA_RARITY[c.id]||null}"
bridge="""let gachaRitualModulePromise=null;
function gachaRitualModule(){return gachaRitualModulePromise??=import('./gacha-opening-ritual.mjs')}
function gachaPresentationFlags(){return{reducedMotion:!!state.settings.reduceMotion,lowPerf:!!state.settings.lowPerf}}
function decorateCurrentGachaPreview(){const flags=gachaPresentationFlags();return gachaRitualModule().then(m=>m.decorateGachaPreview({stage:$('#gachaStage'),root:$('#packResults'),results:state.lastPackPreview,...flags})).catch(()=>null)}
"""
assert s.count(anchor)==1, "rarity anchor drift"
s=s.replace(anchor,bridge+anchor,1)

tail="root.appendChild(d)})}\nfunction focusGachaResult"
assert s.count(tail)==1, "revealPack tail drift"
s=s.replace(tail,"root.appendChild(d)});decorateCurrentGachaPreview()}\nfunction focusGachaResult",1)

old_open="$('#openPack').onclick=()=>{if(state.gachaBusy)return;state.gachaBusy=true;gachaFocusedId=null;state.lastPackPreview=buildPackPreview();$('#packResults').innerHTML='';$('#gachaResultsView').classList.add('hidden');$('#gachaFocus').classList.add('hidden');$('#openPack').disabled=true;$('#skipPack').classList.remove('hidden');$('#gachaStage').classList.add('playing');if(state.settings.reduceMotion){revealPack();return}playStage(GACHA_VIDEO_A01,()=>{if(!state.gachaBusy)return;playStage(GACHA_VIDEO_B01,revealPack)})};"
new_open="$('#openPack').onclick=()=>{if(state.gachaBusy)return;state.gachaBusy=true;gachaFocusedId=null;state.lastPackPreview=buildPackPreview();$('#packResults').innerHTML='';$('#gachaResultsView').classList.add('hidden');$('#gachaFocus').classList.add('hidden');$('#openPack').disabled=true;$('#skipPack').classList.remove('hidden');$('#gachaStage').classList.add('playing');const flags=gachaPresentationFlags();if(flags.reducedMotion||flags.lowPerf){revealPack();return}gachaRitualModule().then(m=>{if(!state.gachaBusy)return;m.startGachaRitual({stage:$('#gachaStage'),results:state.lastPackPreview,...flags,onComplete:()=>{if(state.gachaBusy)revealPack()}})}).catch(()=>{if(!state.gachaBusy)return;playStage(GACHA_VIDEO_A01,()=>{if(!state.gachaBusy)return;playStage(GACHA_VIDEO_B01,revealPack)})})};"
assert s.count(old_open)==1, "openPack drift"
s=s.replace(old_open,new_open,1)

old_skip="$('#skipPack').onclick=()=>{const v=$('#gachaVideo');v.pause();revealPack()};"
new_skip="$('#skipPack').onclick=()=>{const v=$('#gachaVideo');v.pause();if(gachaRitualModulePromise)gachaRitualModulePromise.then(m=>m.cancelActiveGachaRitual()).catch(()=>{});revealPack()};"
assert s.count(old_skip)==1, "skipPack drift"
s=s.replace(old_skip,new_skip,1)

assert s.count("gacha-opening-ritual.mjs")==1
assert "flags.reducedMotion||flags.lowPerf" in s
assert "decorateCurrentGachaPreview()" in s
path.write_text(s,encoding="utf-8")
print("PATCHED",len(s))
