const STYLE_ID='gameroad-gacha-ritual-style';
const RARITY_LEVEL=Object.freeze({common:0,rare:1,sr:2,ultimate:3,ticket:4});
const RARITY_COPY=Object.freeze({
  common:Object.freeze({word:'通常',sub:'カード'}),
  rare:Object.freeze({word:'希少',sub:'希少カード'}),
  sr:Object.freeze({word:'上位',sub:'上位カード'}),
  ultimate:Object.freeze({word:'最高',sub:'最高位カード'}),
  ticket:Object.freeze({word:'特別',sub:'特別券'}),
});
let activeController=null;

function frozenPlan(plan){Object.freeze(plan.phaseSequence);Object.freeze(plan.concealedIndices);return Object.freeze(plan)}
export function gachaRarityOf(item){
  if(item&&item.ticket)return'ticket';
  const raw=String((item&&item.rarity)||'').toLowerCase();
  return Object.hasOwn(RARITY_LEVEL,raw)?raw:'common';
}
export function gachaRarityLevel(itemOrRarity){
  const rarity=typeof itemOrRarity==='string'?String(itemOrRarity).toLowerCase():gachaRarityOf(itemOrRarity);
  return RARITY_LEVEL[rarity]??0;
}
export function planGachaRitual(resultBundle,{reducedMotion=false,lowPerf=false}={}){
  if(!Array.isArray(resultBundle)||resultBundle.length===0)throw new Error('resultBundle must be a non-empty ordered array');
  const rarities=resultBundle.map(gachaRarityOf);
  let peakIndex=0;
  for(let i=1;i<rarities.length;i+=1)if(gachaRarityLevel(rarities[i])>gachaRarityLevel(rarities[peakIndex]))peakIndex=i;
  const peakRarity=rarities[peakIndex],peakLevel=gachaRarityLevel(peakRarity);
  const motionMode=reducedMotion?'still':lowPerf?'short_fade':'interactive';
  const phaseSequence=peakLevel>=3?['teal','violet','gold']:peakLevel>=2?['teal','violet']:['teal'];
  const concealedIndices=motionMode==='interactive'?rarities.map((r,i)=>gachaRarityLevel(r)>=2?i:-1).filter(i=>i>=0):[];
  return frozenPlan({motionMode,peakRarity,peakIndex,phaseSequence,cracksRequired:4,concealedIndices});
}

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;
  style.textContent='.grGachaRitual{--rc:#a0efd5;--rs:rgba(160,239,213,.25);position:absolute;inset:0;z-index:24;overflow:hidden;display:grid;place-items:center;background:radial-gradient(circle at 50% 52%,rgba(22,87,69,.72),rgba(3,13,11,.96) 64%);isolation:isolate;touch-action:manipulation}'
  +'.grGachaRitual[data-phase="violet"]{--rc:#c8a9ff;--rs:rgba(200,169,255,.28);background:radial-gradient(circle at 50% 52%,rgba(68,40,108,.72),rgba(4,11,16,.97) 66%)}'
  +'.grGachaRitual[data-phase="gold"]{--rc:#ffd27e;--rs:rgba(255,210,126,.31);background:radial-gradient(circle at 50% 52%,rgba(116,81,25,.72),rgba(7,12,10,.97) 66%)}'
  +'.grGachaRitual:before{content:"";position:absolute;inset:-34%;background:repeating-conic-gradient(from 0deg,transparent 0 8deg,var(--rs) 8.4deg 8.8deg,transparent 9.2deg 18deg);opacity:.6;animation:grSpin 18s linear infinite}'
  +'.grHalo{position:absolute;width:min(72vmin,520px);aspect-ratio:1;border-radius:50%;filter:drop-shadow(0 0 24px var(--rs));animation:grFloat 2.7s ease-in-out infinite}'
  +'.grRing{position:absolute;inset:0;border-radius:50%;border:1px solid var(--rc);opacity:.72}.grRing.r1{inset:5%;border-width:2px;animation:grSpin 10s linear infinite}.grRing.r2{inset:16%;border-style:dashed;animation:grSpinR 7s linear infinite}.grRing.r3{inset:27%;border-width:2px;box-shadow:0 0 28px var(--rs) inset;animation:grSpin 5.5s linear infinite}'
  +'.grRing:before{content:"";position:absolute;inset:-5px;border-radius:50%;background:repeating-conic-gradient(from 8deg,var(--rc) 0 1deg,transparent 1.4deg 14deg);mask:radial-gradient(circle,transparent 68%,#000 69% 72%,transparent 73%);opacity:.58}'
  +'.grDiamond{position:absolute;left:50%;top:50%;width:54%;height:54%;border:1px solid var(--rc);transform:translate(-50%,-50%) rotate(45deg);opacity:.5;box-shadow:0 0 22px var(--rs);animation:grDiamond 5s ease-in-out infinite}.grDiamond:after{content:"";position:absolute;inset:18%;border:1px solid var(--rc)}'
  +'.grGauge{position:absolute;left:50%;top:50%;width:38%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);background:conic-gradient(var(--rc) 0 var(--ra,0deg),rgba(255,255,255,.08) var(--ra,0deg) 360deg);mask:radial-gradient(circle,transparent 0 78%,#000 79% 100%);filter:drop-shadow(0 0 12px var(--rc))}'
  +'.grOrb{position:absolute;left:50%;top:50%;width:min(25vmin,174px);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;border:1px solid rgba(255,255,255,.58);background:radial-gradient(circle at 33% 27%,rgba(255,255,255,.9) 0 4%,var(--rc) 8%,rgba(21,67,58,.92) 41%,rgba(3,13,11,.98) 72%);box-shadow:0 0 18px var(--rc),0 0 58px var(--rs),inset -22px -24px 36px rgba(0,0,0,.42);cursor:pointer;z-index:6;color:#fff;display:grid;place-items:center}.grOrb:active{transform:translate(-50%,-50%) scale(.94)}'
  +'.grCore{width:38%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,#fff 0 7%,var(--rc) 11% 28%,transparent 31%);font-size:clamp(24px,5vmin,46px);font-weight:1000;color:#fff;text-shadow:0 0 12px var(--rc)}'
  +'.grCrack{position:absolute;left:50%;top:50%;width:2px;height:49%;transform-origin:50% 0;background:linear-gradient(#fff,var(--rc),transparent);opacity:0;filter:drop-shadow(0 0 4px var(--rc))}.grCrack:nth-child(2){transform:rotate(76deg) skewX(-18deg)}.grCrack:nth-child(3){transform:rotate(154deg) skewX(14deg)}.grCrack:nth-child(4){transform:rotate(232deg) skewX(-10deg)}.grCrack:nth-child(5){transform:rotate(312deg) skewX(18deg)}'
  +'.grGachaRitual[data-cracks="1"] .grCrack:nth-child(2),.grGachaRitual[data-cracks="2"] .grCrack:nth-child(-n+3),.grGachaRitual[data-cracks="3"] .grCrack:nth-child(-n+4),.grGachaRitual[data-cracks="4"] .grCrack{opacity:.92}'
  +'.grPrompt{position:absolute;left:10%;right:10%;bottom:7%;z-index:8;text-align:center;color:#f6fffb;text-shadow:0 2px 8px #000}.grPrompt b{display:block;font-size:clamp(15px,2.4vw,22px)}.grPrompt small{display:block;margin-top:5px;color:rgba(239,255,248,.72);font-size:10px}'
  +'.grParticles{position:absolute;inset:0;pointer-events:none;z-index:7}.grParticle{position:absolute;left:50%;top:50%;width:5px;height:18px;border-radius:2px;background:var(--rc);box-shadow:0 0 9px var(--rc);opacity:0}'
  +'.grGachaRitual.hit .grHalo{animation:grHit .14s ease-out,grFloat 2.7s .14s ease-in-out infinite}.grGachaRitual.burst{animation:grFlash .56s ease-out forwards}.grGachaRitual.burst .grOrb{animation:grOrbBurst .48s cubic-bezier(.18,.8,.2,1) forwards}.grGachaRitual.burst .grHalo{animation:grHaloBurst .56s ease-out forwards}.grGachaRitual.burst .grParticle{opacity:1;animation:grParticle .56s ease-out forwards;animation-delay:var(--pd,0ms)}'
  +'.grGachaCardBack{position:absolute;inset:3px;z-index:4;display:grid;place-items:center;align-content:center;gap:5px;border:1px solid rgba(255,210,126,.74);background:radial-gradient(circle at 50% 42%,rgba(255,210,126,.20),transparent 31%),linear-gradient(145deg,#102f27,#071713);box-shadow:0 0 24px rgba(255,210,126,.16) inset;color:#fff3c5;text-align:center;pointer-events:none}.grGachaCardBack:before{content:"◇";width:48px;height:48px;border:1px solid rgba(255,210,126,.6);transform:rotate(45deg);font-size:0}.grGachaCardBack b{font-size:11px}.grGachaCardBack small{font-size:7px;color:rgba(255,255,255,.62)}'
  +'.packCard.grGachaConcealed{position:relative;border-color:rgba(255,210,126,.72);box-shadow:0 0 18px rgba(255,210,126,.16);animation:grAwait 1.7s ease-in-out infinite}.grGachaRevealAll{min-height:44px;margin-left:auto;white-space:nowrap}'
  +'.grGachaRareReveal{--rr:#c8a9ff;position:absolute;inset:0;z-index:36;overflow:hidden;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,rgba(88,58,132,.68),rgba(2,9,13,.92) 70%);pointer-events:none;animation:grRareVeil .96s ease-out forwards}.grGachaRareReveal[data-rarity="ultimate"],.grGachaRareReveal[data-rarity="ticket"]{--rr:#ffd27e;background:radial-gradient(circle at 50% 45%,rgba(130,91,28,.7),rgba(4,10,9,.93) 72%)}'
  +'.grGachaRareReveal:before{content:"";position:absolute;inset:-25%;background:repeating-conic-gradient(from 0deg,transparent 0 7deg,var(--rr) 7.4deg 7.8deg,transparent 8.2deg 15deg);opacity:.58;animation:grRareRays .96s ease-out forwards}.grRareWord{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.72);font-size:clamp(72px,18vw,190px);font-weight:1000;color:var(--rr);text-shadow:0 0 32px var(--rr),0 12px 0 rgba(0,0,0,.28);white-space:nowrap;animation:grRareWord .62s cubic-bezier(.1,.78,.2,1) forwards}.grRareSub{position:absolute;left:50%;top:60%;transform:translateX(-50%);font-size:11px;font-weight:900;letter-spacing:.22em;color:#fff;opacity:0;animation:grRareSub .42s .22s ease-out forwards}.grRareBand{position:absolute;left:-8%;right:-8%;top:58%;min-height:26%;padding:18px 14%;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(90deg,rgba(11,38,31,.96),rgba(81,65,38,.96),rgba(7,20,17,.96));border-top:2px solid rgba(255,255,255,.75);border-bottom:2px solid rgba(255,255,255,.75);transform:translateX(115%) rotate(-5deg);animation:grRareBand .48s .46s cubic-bezier(.14,.78,.22,1) forwards}.grRareBand small{font-size:9px;color:rgba(255,255,255,.76);font-weight:900}.grRareBand b{margin-top:4px;font-size:clamp(24px,4.5vw,54px);line-height:1;font-weight:1000;color:#fff}'
  +'@keyframes grSpin{to{transform:rotate(360deg)}}@keyframes grSpinR{to{transform:rotate(-360deg)}}@keyframes grFloat{50%{transform:scale(1.025)}}@keyframes grDiamond{50%{transform:translate(-50%,-50%) rotate(135deg) scale(.92)}}@keyframes grHit{50%{transform:scale(1.08)}}@keyframes grFlash{45%{background:#fff}100%{opacity:0}}@keyframes grOrbBurst{55%{transform:translate(-50%,-50%) scale(1.55);filter:brightness(2.6)}100%{transform:translate(-50%,-50%) scale(2.25);opacity:0}}@keyframes grHaloBurst{to{transform:scale(1.9) rotate(28deg);opacity:0}}@keyframes grParticle{to{transform:translate(var(--px),var(--py)) rotate(var(--pr));opacity:0}}@keyframes grAwait{50%{transform:translateY(-3px);box-shadow:0 0 28px rgba(255,210,126,.28)}}@keyframes grRareVeil{0%{opacity:0}10%,78%{opacity:1}100%{opacity:0}}@keyframes grRareRays{to{transform:scale(1.35) rotate(14deg);opacity:0}}@keyframes grRareWord{0%{transform:translate(-50%,-50%) scale(.55);opacity:0}38%,78%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-50%) scale(1.06);opacity:0}}@keyframes grRareSub{to{opacity:1}}@keyframes grRareBand{to{transform:translateX(0) rotate(-5deg)}}'
  +'@media(max-height:470px) and (orientation:landscape){.grHalo{width:min(78vmin,410px)}.grOrb{width:min(30vmin,132px)}.grPrompt{bottom:3%}}@media(max-width:540px) and (orientation:portrait){.grHalo{width:min(88vw,430px)}.grOrb{width:min(34vw,160px)}.grPrompt{bottom:11%}}@media(prefers-reduced-motion:reduce){.grGachaRitual:before,.grRing,.grDiamond,.packCard.grGachaConcealed{animation:none!important}}';
  document.head.appendChild(style);
}
function phaseFor(plan,p){const s=plan.phaseSequence;if(s.length===1)return s[0];if(s.length===2)return p>=.5?s[1]:s[0];return p>=.75?s[2]:p>=.45?s[1]:s[0]}
function particle(i){
  const pts=[[-190,-118,-28],[-135,-190,18],[-62,-216,-12],[24,-222,32],[102,-196,-20],[174,-135,16],[214,-46,-35],[218,54,24],[166,142,-16],[86,202,34],[-12,222,-24],[-108,196,18],[-178,132,-30],[-220,48,20],[-216,-45,-12],[-142,-132,26],[-45,-162,-18],[128,112,22]];
  const p=pts[i%pts.length],n=document.createElement('i');n.className='grParticle';n.style.setProperty('--px',String(p[0])+'px');n.style.setProperty('--py',String(p[1])+'px');n.style.setProperty('--pr',String(p[2])+'deg');n.style.setProperty('--pd',String((i%6)*18)+'ms');return n;
}
function ritualDom(plan){
  const root=document.createElement('div');root.className='grGachaRitual';root.dataset.phase=plan.phaseSequence[0];root.dataset.cracks='0';root.setAttribute('role','group');root.setAttribute('aria-label','召喚演出');
  const halo=document.createElement('div');halo.className='grHalo';
  for(const cn of['r1','r2','r3']){const r=document.createElement('i');r.className='grRing '+cn;halo.appendChild(r)}
  const dia=document.createElement('i');dia.className='grDiamond';halo.appendChild(dia);const gauge=document.createElement('i');gauge.className='grGauge';halo.appendChild(gauge);
  const orb=document.createElement('button');orb.type='button';orb.className='grOrb';orb.setAttribute('aria-label','道を開く');const core=document.createElement('span');core.className='grCore';core.textContent='道';orb.appendChild(core);
  for(let i=0;i<plan.cracksRequired;i+=1){const c=document.createElement('i');c.className='grCrack';orb.appendChild(c)}
  const prompt=document.createElement('div');prompt.className='grPrompt';const b=document.createElement('b');b.textContent='道をタップして開く';const small=document.createElement('small');small.textContent='長押し / Space に対応';prompt.append(b,small);
  const ps=document.createElement('div');ps.className='grParticles';for(let i=0;i<18;i+=1)ps.appendChild(particle(i));root.append(halo,orb,prompt,ps);return{root,orb,prompt};
}
export function cancelActiveGachaRitual(){if(!activeController)return false;activeController.cancel();activeController=null;return true}
export function startGachaRitual({stage,results,reducedMotion=false,lowPerf=false,onComplete}={}){
  if(!(stage instanceof Element))throw new Error('stage element is required');if(typeof onComplete!=='function')throw new Error('onComplete callback is required');ensureStyle();cancelActiveGachaRitual();
  const plan=planGachaRitual(results,{reducedMotion,lowPerf});
  if(plan.motionMode!=='interactive'){const timer=window.setTimeout(onComplete,plan.motionMode==='short_fade'?70:0);const c=Object.freeze({plan,cancel(){window.clearTimeout(timer)}});activeController=c;return c}
  const dom=ritualDom(plan),root=dom.root,orb=dom.orb,prompt=dom.prompt;stage.appendChild(root);let cracks=0,done=false,holdTimer=0,holdInterval=0,finishTimer=0,controller=null;
  const stopHold=()=>{window.clearTimeout(holdTimer);window.clearInterval(holdInterval);holdTimer=0;holdInterval=0};
  const cleanup=()=>{stopHold();window.clearTimeout(finishTimer);window.removeEventListener('keydown',onKey,true);root.remove()};
  const finish=()=>{if(done)return;done=true;stopHold();root.classList.add('burst');prompt.querySelector('b').textContent='開放';finishTimer=window.setTimeout(()=>{cleanup();if(activeController===controller)activeController=null;onComplete()},560)};
  const crack=()=>{if(done)return;cracks=Math.min(plan.cracksRequired,cracks+1);const p=cracks/plan.cracksRequired;root.dataset.cracks=String(cracks);root.dataset.phase=phaseFor(plan,p);root.style.setProperty('--ra',String(Math.round(p*360))+'deg');root.classList.remove('hit');void root.offsetWidth;root.classList.add('hit');orb.setAttribute('aria-label','道を開く '+cracks+'/'+plan.cracksRequired);if(cracks>=plan.cracksRequired)finish()};
  const onKey=e=>{if(e.code!=='Space'||done)return;e.preventDefault();crack()};
  orb.addEventListener('click',crack);orb.addEventListener('pointerdown',()=>{if(done)return;holdTimer=window.setTimeout(()=>{holdInterval=window.setInterval(crack,145)},310)});for(const t of['pointerup','pointercancel','pointerleave'])orb.addEventListener(t,stopHold);window.addEventListener('keydown',onKey,true);
  controller=Object.freeze({plan,crack,cancel(){if(done)return;done=true;cleanup()}});activeController=controller;return controller;
}
function showCutIn(stage,item,rarity){
  stage.querySelector('.grGachaRareReveal')?.remove();const o=document.createElement('div');o.className='grGachaRareReveal';o.dataset.rarity=rarity;o.setAttribute('role','status');o.setAttribute('aria-live','polite');const copy=RARITY_COPY[rarity]||RARITY_COPY.common;
  const w=document.createElement('div');w.className='grRareWord';w.textContent=copy.word;const s=document.createElement('div');s.className='grRareSub';s.textContent=copy.sub;const band=document.createElement('div');band.className='grRareBand';const sm=document.createElement('small');sm.textContent=rarity==='ticket'?'特別な結果':'召喚結果';const name=document.createElement('b');name.textContent=(item&& (item.display_name||item.id))||copy.sub;band.append(sm,name);o.append(w,s,band);stage.appendChild(o);window.setTimeout(()=>o.remove(),960);
}
export function decorateGachaPreview({stage,root,results,reducedMotion=false,lowPerf=false}={}){
  if(!(stage instanceof Element))throw new Error('stage element is required');if(!(root instanceof Element))throw new Error('result root element is required');ensureStyle();const plan=planGachaRitual(results,{reducedMotion,lowPerf});root.closest('.gachaResults')?.querySelector('.grGachaRevealAll')?.remove();if(plan.concealedIndices.length===0)return Object.freeze({plan,concealedCount:0});
  const cards=Array.from(root.children).filter(n=>n.classList&&n.classList.contains('packCard')),concealed=new Set(plan.concealedIndices.filter(i=>cards[i]));let bulk=null;
  const sync=()=>{if(concealed.size===0)bulk?.remove()};const reveal=(i,cut)=>{const card=cards[i];if(!card||!concealed.has(i))return false;concealed.delete(i);card.classList.remove('grGachaConcealed');card.querySelector('.grGachaCardBack')?.remove();if(card.dataset.grOriginalAriaLabel){card.setAttribute('aria-label',card.dataset.grOriginalAriaLabel);delete card.dataset.grOriginalAriaLabel}if(cut)showCutIn(stage,results[i],gachaRarityOf(results[i]));return true};
  for(const i of concealed){const card=cards[i];card.classList.add('grGachaConcealed');card.dataset.grOriginalAriaLabel=card.getAttribute('aria-label')||'';card.setAttribute('aria-label','プレビュー'+(i+1)+' 光るカードを開く');const back=document.createElement('span');back.className='grGachaCardBack';const b=document.createElement('b');b.textContent='開く';const sm=document.createElement('small');sm.textContent='タップ';back.append(b,sm);card.appendChild(back);card.addEventListener('click',e=>{if(!concealed.has(i))return;e.preventDefault();e.stopImmediatePropagation();reveal(i,true);sync()},true)}
  const head=root.closest('.gachaResults')?.querySelector('.gachaResultsHead');if(head){bulk=document.createElement('button');bulk.type='button';bulk.className='btn grGachaRevealAll';bulk.textContent='まとめて開く';bulk.addEventListener('click',()=>{for(const i of[...concealed])reveal(i,false);sync()});head.appendChild(bulk)}
  return Object.freeze({plan,concealedCount:concealed.size,revealAll(){for(const i of[...concealed])reveal(i,false);sync()}});
}
