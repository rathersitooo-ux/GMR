const SCHEMA = 'GAMEROAD_HUMAN_SESSION_RECORDING_V1';
const SAFE_KEYS = new Set(['Enter','Escape','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Backspace','Delete',' ']);
function token(value, max = 192) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}
function safeTarget(target) {
  if (!target || typeof target !== 'object') return { tag:null,id:null,action:null,screen:null,inputType:null };
  const tag = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : null;
  const id = token(target.id ?? '', 96);
  const data = target.dataset && typeof target.dataset === 'object' ? target.dataset : {};
  const action = token(data.action ?? data.go ?? data.back ?? data.screen ?? '', 96);
  const host = typeof target.closest === 'function' ? target.closest('[data-screen]') : null;
  const screen = token(host?.dataset?.screen ?? '', 96);
  const rawType = typeof target.type === 'string' ? target.type.toLowerCase() : '';
  const inputType = ['button','checkbox','radio','range','submit','reset','text','search','email','password','number','tel','url'].includes(rawType) ? rawType : null;
  return { tag,id,action,screen,inputType };
}
function safeKey(event) {
  const key = typeof event?.key === 'string' ? event.key : '';
  if (SAFE_KEYS.has(key)) return key === ' ' ? 'Space' : key;
  return key.length === 1 ? 'Printable' : 'Other';
}
function requireMetadata(input) {
  const sessionId = token(input?.sessionId, 128);
  const buildId = token(input?.buildId, 192);
  const buildHash = token(input?.buildHash, 192);
  const releaseId = token(input?.releaseId, 192);
  if (!sessionId || !buildId || !buildHash || !releaseId) throw new TypeError('HUMAN_SESSION_METADATA_REQUIRED');
  return { sessionId,buildId,buildHash,releaseId,
    runtimePlatform: token(input?.runtimePlatform ?? 'Browser',64) ?? 'Browser',
    inputMode: token(input?.inputMode ?? 'unknown',64) ?? 'unknown' };
}
export function createHumanSessionRecorder({ metadata,eventTarget=null,now=()=>Date.now(),monotonicNow=()=>performance.now() }={}) {
  const base=requireMetadata(metadata), events=[], listeners=[];
  let active=false, sequence=0, startedAt=null, stoppedAt=null;
  const push=(kind,detail={})=>{
    if(!active) return null;
    const row=Object.freeze({sequence:++sequence,kind,at:new Date(now()).toISOString(),elapsedMs:Number(monotonicNow()),...structuredClone(detail)});
    events.push(row); return row;
  };
  const listen=(type,fn)=>{ if(!eventTarget?.addEventListener) return; eventTarget.addEventListener(type,fn,true); listeners.push([type,fn]); };
  function start(){
    if(active) return false; active=true; startedAt=new Date(now()).toISOString();
    listen('pointerdown',e=>push('pointer',{pointerType:token(e?.pointerType??'unknown',32)??'unknown',button:Number.isInteger(e?.button)?e.button:null,target:safeTarget(e?.target)}));
    listen('click',e=>push('click',{target:safeTarget(e?.target)}));
    listen('keydown',e=>push('key',{keyClass:safeKey(e),target:safeTarget(e?.target)}));
    listen('input',e=>push('input',{target:safeTarget(e?.target),valueCaptured:false}));
    listen('change',e=>push('change',{target:safeTarget(e?.target),valueCaptured:false}));
    push('session_start',{stateId:token(metadata?.stateId??'',96)}); return true;
  }
  function mark(kind,detail={}){
    const safe=token(kind,64); if(!safe) throw new TypeError('HUMAN_SESSION_MARK_KIND_INVALID');
    for(const key of Object.keys(detail??{})) if(['value','text','password','secret','token','authorization'].some(word=>key.toLowerCase().includes(word))) throw new TypeError('HUMAN_SESSION_MARK_PRIVATE_FIELD_BLOCKED');
    return push('mark:'+safe,detail);
  }
  function stop(){
    if(!active) return false; push('session_stop'); active=false; stoppedAt=new Date(now()).toISOString();
    for(const [type,fn] of listeners.splice(0)) eventTarget?.removeEventListener?.(type,fn,true); return true;
  }
  function snapshot(extra={}){
    return Object.freeze({schema:SCHEMA,...base,versions:structuredClone(metadata?.versions??null),device:structuredClone(metadata?.device??null),
      participantAlias:token(metadata?.participantAlias??'',96),privacyClass:token(metadata?.privacyClass??'local-private',64)??'local-private',
      startedAt,stoppedAt,active,events:structuredClone(events),battleReplayRef:token(extra?.battleReplayRef??'',256),
      screenVideoRef:token(extra?.screenVideoRef??'',256),domReplayRef:token(extra?.domReplayRef??'',256),externalUpload:false,
      rawInputValuesCaptured:false,gameplayAuthoritative:false});
  }
  return Object.freeze({start,stop,mark,snapshot,state:()=>Object.freeze({active,eventCount:events.length,startedAt,stoppedAt})});
}
export function serializeHumanSessionRecording(recording){
  if(!recording||recording.schema!==SCHEMA||recording.externalUpload!==false||recording.rawInputValuesCaptured!==false) throw new TypeError('HUMAN_SESSION_RECORDING_INVALID');
  return JSON.stringify(recording,null,2);
}
export const HUMAN_SESSION_RECORDER=Object.freeze({schema:SCHEMA,externalUpload:false,rawInputValuesCaptured:false});

function downloadJson(documentRef,filename,text){
  const blob=new Blob([text],{type:'application/json'}),href=URL.createObjectURL(blob),a=documentRef.createElement('a');
  a.href=href;a.download=filename;a.hidden=true;documentRef.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),0);
}
export function mountHumanSessionRecorder(globalRef=globalThis,metadata={}){
  const documentRef=globalRef?.document;if(!documentRef) throw new TypeError('DOCUMENT_REQUIRED');
  if(globalRef.__GAMEROAD_HUMAN_SESSION_RECORDER__) return globalRef.__GAMEROAD_HUMAN_SESSION_RECORDER__;
  const recorder=createHumanSessionRecorder({metadata,eventTarget:documentRef,now:()=>Date.now(),monotonicNow:()=>globalRef.performance?.now?.()??0});
  const api=Object.freeze({
    start:()=>recorder.start(),mark:(kind,detail)=>recorder.mark(kind,detail),stop:()=>recorder.stop(),snapshot:(extra)=>recorder.snapshot(extra),
    exportJson(extra={}){const shot=recorder.snapshot(extra),filename=`gameroad-human-session-${shot.sessionId}.json`;downloadJson(documentRef,filename,serializeHumanSessionRecording(shot));return Object.freeze({ok:true,filename,eventCount:shot.events.length});}
  });
  globalRef.__GAMEROAD_HUMAN_SESSION_RECORDER__=api;return api;
}
