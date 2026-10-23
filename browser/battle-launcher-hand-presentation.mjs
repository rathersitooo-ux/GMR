// R22 presentation only. The match receipt and original hand buttons own cards.
const BODY = new URL('./assets/visual/battle-ui/launcher-r22/receiver.png', import.meta.url).href;
const CLAMP = new URL('./assets/visual/battle-ui/launcher-r22/clamp.png', import.meta.url).href;
const FLAME = new URL('./assets/visual/battle-ui/launcher-r22/charged-flame.png', import.meta.url).href;
const SELECTOR = 'section.screen.battle[data-launcher-r22="1"]';
const PAD = `${SELECTOR} [data-battle-janken-slidepad="1"]`;
const CSS = `
${PAD}{left:auto!important;right:16px!important;bottom:58px!important;top:auto!important;width:338px!important;height:222px!important;transform:none!important;z-index:47!important}
${PAD} .grJankenInputModePicker,${PAD} .grJankenLoadPreview,${PAD} .grJankenReceiverArt,${PAD} .grJankenControlArt{display:none!important}
${PAD} .grJankenSlidePadHandle{position:absolute!important;left:auto!important;right:12px!important;bottom:0!important;width:62px!important;height:62px!important;min-height:0!important;padding:0!important;border:0!important;border-radius:50%!important;background:radial-gradient(circle,#d9fcff 0,#3cdbff 24%,#1762bb 55%,#05294a 74%)!important;font-size:0!important;box-shadow:0 0 14px #53dfff88,inset 0 0 0 3px #a7e3ef!important;pointer-events:none!important;opacity:1!important;filter:none!important;transform:none!important;overflow:visible!important}
${PAD} .grPowerEnergy{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;transform:none!important;overflow:visible!important;opacity:1!important}
${PAD} .grPowerEnergy img{width:100%!important;height:100%!important;inset:0!important;transform:none!important;border-radius:50%;object-fit:cover}
${PAD} .grJankenSlidePadSlot{display:block!important;position:absolute!important;left:var(--launcher-x)!important;right:auto!important;top:0!important;bottom:auto!important;width:88px!important;height:148px!important;min-height:0!important;padding:0!important;border:0!important;border-radius:8px!important;background:none!important;box-shadow:none!important;transform:none!important;translate:none!important;rotate:none!important;opacity:1!important;filter:none!important;visibility:visible!important;overflow:visible!important;pointer-events:auto!important;transition:opacity 180ms,transform 260ms cubic-bezier(.2,.8,.2,1)!important;touch-action:none!important}
${PAD} .grJankenSlidePadSlot.rock{--launcher-x:8px}${PAD} .grJankenSlidePadSlot.scissors{--launcher-x:113px}${PAD} .grJankenSlidePadSlot.paper{--launcher-x:218px}
${PAD}[data-expanded] .grJankenSlidePadSlot:is(.rock,.scissors,.paper){transform:none!important}
${PAD} .grJankenSlidePadSlot:disabled{pointer-events:none!important}
${PAD} .grLauncherReceiver{display:block!important;position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;z-index:0}
${PAD} .grLauncherClamp{display:block!important;position:absolute;left:6%;bottom:8%;width:88%;height:30px;object-fit:fill;pointer-events:none;z-index:5;transform:translateY(var(--clamp-y,0px));transition:transform 100ms}
${PAD} .grJankenSlidePadSuit,${PAD} .grJankenSlidePadCard,${PAD} .grJankenSlidePadHand{display:none!important}
${PAD} .grJankenSlidePadPhysicalCardHost{position:absolute!important;left:13px!important;top:35px!important;right:auto!important;bottom:auto!important;display:block!important;width:62px!important;height:88px!important;padding:0!important;overflow:visible!important;border:0!important;background:none!important;z-index:3!important;transform:translate(var(--gr-janken-pull-x,0px),var(--gr-janken-pull-y,0px))!important;translate:none!important;pointer-events:none!important;transition:transform 150ms cubic-bezier(.2,.8,.2,1)}
${PAD} .grJankenSlidePadPhysicalCard{position:relative!important;inset:auto!important;width:100%!important;height:100%!important;margin:0!important;transform:none!important;opacity:1!important;visibility:visible!important;display:flex!important;pointer-events:none!important}
${PAD} .grJankenSlidePadRoleBadge{display:block!important;position:absolute!important;left:5px!important;right:5px!important;top:auto!important;bottom:-17px!important;height:20px!important;padding:3px 0!important;z-index:6!important;border:1px solid #7badc8!important;border-radius:4px!important;background:#08283de8!important;color:#effbff!important;text-align:center!important;font:700 11px/14px system-ui!important;pointer-events:none!important}
${PAD} .grJankenSlidePadSlot[data-launcher-state="empty"] .grLauncherReceiver{filter:saturate(.28) brightness(.6)}
${PAD} .grJankenSlidePadSlot[data-pull-dragging="true"]{z-index:10!important}
${PAD} .grJankenSlidePadSlot[data-pull-dragging="true"] .grJankenSlidePadPhysicalCardHost{transition:none}
${PAD} .grJankenSlidePadSlot:is([data-launcher-state="charged"],[data-launcher-state="ready"]) .grJankenSlidePadPhysicalCard{filter:brightness(1.3) drop-shadow(0 -6px 5px #3de5ff) drop-shadow(0 -14px 8px #1c93ff)!important}
${PAD} .grJankenSlidePadSlot:is([data-launcher-state="charged"],[data-launcher-state="ready"]) .grJankenSlidePadPhysicalCardHost::after{content:"";position:absolute;left:-28%;top:-32%;width:156%;height:140%;background:url("${FLAME}") center/100% 100% no-repeat;pointer-events:none;z-index:5;animation:grLauncherFlame 650ms ease-in-out infinite alternate}
@keyframes grLauncherFlame{from{opacity:.7;translate:0 1px}to{opacity:1;translate:0 -2px}}
${PAD} .grJankenSlidePadSlot[data-launcher-state="ready"]{--clamp-y:8px}
${PAD}[data-launcher-cycle="flight"] .grJankenSlidePadSlot[data-cycle-selected="true"] .grJankenSlidePadPhysicalCardHost{opacity:0!important}
${PAD}[data-launcher-cycle="returning"] .grJankenSlidePadPhysicalCardHost,${PAD}[data-launcher-cycle="retracting"] .grJankenSlidePadPhysicalCardHost{opacity:0!important}
${PAD}[data-janken-turn-used="true"] .grJankenSlidePadSlot{pointer-events:none!important}
${PAD}[data-launcher-cycle="retracting"] .grJankenSlidePadSlot{transform:translateY(35px) scaleY(.65)!important;opacity:0!important}
${PAD}[data-launcher-cycle="retracted"]{display:none!important;pointer-events:none!important}
${SELECTOR} #hand .handCard[data-launcher-returning="true"]{visibility:hidden!important;pointer-events:none!important}
${PAD} .grLauncherInstruction{position:absolute;left:8px;bottom:10px;width:225px;color:#d6ecf3;text-shadow:0 1px 3px #001c29;font:600 11px/1.6 system-ui;pointer-events:none}
${PAD}[data-launcher-cycle] .grLauncherInstruction{visibility:hidden}
${SELECTOR} [data-gr-current-ui-zone="partner-visual"]{pointer-events:none!important}
@media(max-width:540px) and (orientation:portrait){${SELECTOR} #battleAdvicePartnerStage{left:6px!important;bottom:130px!important;top:auto!important;width:52px!important;height:84px!important}${PAD}{right:calc((100% - 338px)/2)!important;bottom:196px!important}}
@media(max-height:430px) and (orientation:landscape){${SELECTOR} #battleMap{right:328px!important}${PAD}{right:8px!important;bottom:130px!important;width:310px!important;height:168px!important} ${PAD} .grJankenSlidePadSlot{width:68px!important;height:114px!important} ${PAD} .grJankenSlidePadSlot.rock{--launcher-x:5px}${PAD} .grJankenSlidePadSlot.scissors{--launcher-x:90px}${PAD} .grJankenSlidePadSlot.paper{--launcher-x:175px}${PAD} .grJankenSlidePadPhysicalCardHost{left:10px!important;top:26px!important;width:48px!important;height:68px!important}${PAD} .grLauncherClamp{height:24px}${PAD} .grJankenSlidePadRoleBadge{bottom:-15px!important;font-size:10px!important}${PAD} .grJankenSlidePadHandle{width:46px!important;height:46px!important;right:0!important;bottom:36px!important}${PAD} .grLauncherInstruction{display:none!important}}
@media(prefers-reduced-motion:reduce){${PAD} *{transition:none!important;animation:none!important}}
`;
export function mountLauncherHandPresentation({root, host, slotNodes, handle, powerEnergy, globalRef}) {
  const doc=root.ownerDocument;
  if(!doc.getElementById('gameroad-launcher-r22-style')) { const style=doc.createElement('style');style.id='gameroad-launcher-r22-style';style.textContent=CSS;doc.head.appendChild(style); }
  let enabled=false, cycle=0;
  const animations=new Set(), ghosts=new Set();
  async function animateOwned(node,frames,options){const animation=node.animate(frames,options);animations.add(animation);try{await animation.finished;}finally{animations.delete(animation);}}
  const markCycle=phase=>{host.dataset.launcherCycle=phase;host.dataset.launcherTrace=(host.dataset.launcherTrace?host.dataset.launcherTrace+',':'')+phase;};
  const reduce=()=>globalRef.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const instruction=doc.createElement('span');instruction.className='grLauncherInstruction';instruction.textContent='札をオーブへ → 引き離して放す';host.appendChild(instruction);
  for(const node of slotNodes.values()) for(const [name,url] of [['grLauncherReceiver',BODY],['grLauncherClamp',CLAMP]]) {const img=doc.createElement('img');img.className=name;img.src=url;img.alt='';img.draggable=false;img.setAttribute('aria-hidden','true');node.appendChild(img);}
  const nextFrame=()=>new Promise(resolve=>(globalRef.requestAnimationFrame??(fn=>globalRef.setTimeout(fn,0)))(resolve));
  const api={
    get enabled(){return enabled;},
    enable(value){if(enabled===value)return;enabled=value;root.dataset.launcherR22=value?'1':'0';if(value){handle.appendChild(powerEnergy);handle.tabIndex=-1;handle.setAttribute('aria-hidden','true');}},
    reset(){cycle+=1;for(const animation of animations){try{animation.cancel?.();}catch{}}animations.clear();for(const ghost of ghosts)ghost.remove();ghosts.clear();delete host.dataset.launcherCycle;delete host.dataset.launcherTrace;host.__gameroadLauncherFlightSettled=null;for(const n of slotNodes.values()){delete n.dataset.chargeHistory;delete n.dataset.cycleSelected;}for(const n of root.querySelectorAll('[data-launcher-returning]'))delete n.dataset.launcherReturning;},
    rects(){return {orbRect:handle.getBoundingClientRect(),battleRect:root.getBoundingClientRect()};},
    drag(node,phase,dx,dy){if(node.dataset.launcherState!==phase){node.dataset.launcherState=phase;node.dataset.chargeHistory=(node.dataset.chargeHistory?node.dataset.chargeHistory+',':'')+phase;}node.style.setProperty('--gr-janken-pull-x',dx+'px');node.style.setProperty('--gr-janken-pull-y',dy+'px');powerEnergy.dataset.contact=String(phase==='charged'||phase==='ready');instruction.textContent=phase==='ready'?'放して発射':phase==='charged'?'引き離して発射準備':'札をオーブへ → 引き離して放す';},
    resetDrag(node){node.style.removeProperty('--gr-janken-pull-x');node.style.removeProperty('--gr-janken-pull-y');powerEnergy.dataset.contact='false';node.dataset.launcherState=host.dataset.jankenTurnUsed==='true'?'using':'loaded';instruction.textContent='札をオーブへ → 引き離して放す';},
    captureReturns(selectedId){if(!enabled)return [];return [...slotNodes.values()].flatMap(node=>{const card=node.querySelector('.grJankenSlidePadPhysicalCard');const id=node.dataset.cardId;if(!card||!id||id===selectedId)return [];const clone=card.cloneNode(true);const sources=[card,...card.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];sources.forEach((source,i)=>{const style=globalRef.getComputedStyle(source);for(const key of ['background','border','border-radius','color','font','line-height','padding','box-sizing','display','flex-direction','align-items','justify-content','gap','margin','text-align'])copies[i].style.setProperty(key,style.getPropertyValue(key),'important');});return [{id,rect:card.getBoundingClientRect(),clone}];});},
    release(cards, selectedHand, done){
      if(!enabled)return;
      const token=++cycle;markCycle('flight');
      for(const [hand,node] of slotNodes){node.dataset.cycleSelected=String(hand===selectedHand);node.disabled=true;}
      for(const entry of cards){const real=[...root.querySelectorAll('#hand .handCard')].find(n=>n.dataset.cardId===entry.id);if(real)real.dataset.launcherReturning='true';}
      host.__gameroadLauncherFlightSettled=async()=>{
        if(token!==cycle)return;
        host.__gameroadLauncherFlightSettled=null;
        markCycle('returning');await nextFrame();if(token!==cycle)return;await nextFrame();if(token!==cycle)return;
        await Promise.all(cards.map(async entry=>{
          if(token!==cycle)return;
          const real=[...root.querySelectorAll('#hand .handCard')].find(n=>n.dataset.cardId===entry.id);
          if(!real)return;const end=real.getBoundingClientRect(),ghost=entry.clone;
          ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.disabled=true;ghost.inert=true;for(const n of ghost.querySelectorAll('[id]'))n.removeAttribute('id');
          const rect=entry.rect;Object.assign(ghost.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',pointerEvents:'none',zIndex:'222',display:'flex',visibility:'visible',transform:'none',translate:'none'});
          ghosts.add(ghost);doc.body.appendChild(ghost);
          try{if(!reduce()&&ghost.animate)await animateOwned(ghost,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${end.left-rect.left}px,${end.top-rect.top}px) scale(${end.width/rect.width},${end.height/rect.height})`,opacity:1}],{duration:340,easing:'cubic-bezier(.25,.8,.25,1)',fill:'forwards'});}catch{}finally{ghost.remove();ghosts.delete(ghost);if(token===cycle)delete real.dataset.launcherReturning;}
        }));
        if(token!==cycle)return;
        markCycle('retracting');
        const first=slotNodes.values().next().value;
        try{if(!reduce()&&first?.animate)await animateOwned(first,[{opacity:1},{opacity:0}],{duration:260});}catch{}
        if(token!==cycle)return;
        markCycle('retracted');done?.();
        for(const card of root.querySelectorAll('#hand .handCard:not([data-janken-reserved="true"])')) if(!reduce())card.animate?.([{opacity:.65,translate:'0 12px'},{opacity:1,translate:'0 0'}],{duration:220,easing:'ease-out'});
      };
    }
  };
  return api;
}
