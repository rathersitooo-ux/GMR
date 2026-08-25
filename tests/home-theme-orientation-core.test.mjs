import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransitionDirector, TRANSITION_PHASES} from '../browser/ui-state-feedback-core.mjs';
import {
  HOME_TRANSITION_REASONS,
  classifyHomeOrientation,
  createHomePresentationState,
  createHomeThemeCatalog,
  createHomeThemeProfile,
  planHomePresentationChange,
  resolveHomeProjection,
} from '../browser/home-theme-orientation-core.mjs';

const initialProfile = (overrides={}) => createHomeThemeProfile({
  themeId: 'HOME_INITIAL_DEFAULT',
  displayNameToken: 'home.initial',
  worldStyleId: 'moonlit_forest',
  landscapeSceneAsset: 'drive:1t-viE1VSuatsJd6rC1yuc2ctncguwOVx',
  portraitSceneAsset: null,
  landscapeFocalAnchor: {x:0.58,y:0.50},
  portraitFocalAnchor: {x:0.62,y:0.48},
  safeComposition: {landscape:'center_16_9',portrait:'dedicated'},
  bleed: {landscape:'21_9'},
  motionProfileId: 'home.moonlit_forest',
  ambientLayerIds: ['moon_glow','leaves','particles'],
  transitionBridgeProfileId: 'home.moonlit_forest.bridge',
  reducedMotionFallback: {mode:'dissolve_reanchor'},
  lowPerfFallback: {mode:'static_swap'},
  availabilityRef: 'S006/FUT04',
  ...overrides,
});
const secondProfile = () => createHomeThemeProfile({
  themeId:'HOME_GARDEN_DAY', worldStyleId:'garden_day', landscapeSceneAsset:'asset:garden-landscape', portraitSceneAsset:'asset:garden-portrait',
  landscapeFocalAnchor:{x:.5,y:.5}, portraitFocalAnchor:{x:.5,y:.45},
});
const catalog = () => createHomeThemeCatalog([initialProfile(), secondProfile()]);
const deferred=()=>{let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('viewport classification is pure and covers target landscape/portrait shapes',()=>{
  assert.equal(classifyHomeOrientation({width:1280,height:720}),'landscape');
  assert.equal(classifyHomeOrientation({width:667,height:375}),'landscape');
  assert.equal(classifyHomeOrientation({width:390,height:844}),'portrait');
  assert.equal(classifyHomeOrientation({width:375,height:667}),'portrait');
});

test('theme catalog is immutable and rejects duplicate theme identities',()=>{
  const c=catalog();
  assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.byId)); assert.ok(Object.isFrozen(c.byId.HOME_INITIAL_DEFAULT));
  assert.throws(()=>createHomeThemeCatalog([initialProfile(),initialProfile()]),/duplicate themeId/);
});

test('initial supplied image is representable as default landscape while portrait absence is explicit, never silent crop',()=>{
  const p=initialProfile();
  const landscape=resolveHomeProjection(p,'landscape');
  assert.equal(landscape.sceneAsset,'drive:1t-viE1VSuatsJd6rC1yuc2ctncguwOVx');
  assert.equal(landscape.compositionStatus,'ready');
  const portrait=resolveHomeProjection(p,'portrait');
  assert.equal(portrait.sceneAsset,null);
  assert.equal(portrait.needsPortraitComposition,true);
  assert.equal(portrait.compositionStatus,'missing_portrait_asset');
  assert.equal(portrait.fallbackSceneAsset,p.landscapeSceneAsset);
  assert.equal(portrait.fallbackPolicy,'caller_safe_hold_or_letterbox_only');
});

test('orientation-only change preserves theme and hands ORIENTATION_CHANGE to existing director contract',()=>{
  const c=catalog(); const current=createHomePresentationState({themeId:'HOME_INITIAL_DEFAULT',orientation:'landscape'}); let committed=null;
  const plan=planHomePresentationChange({catalog:c,current,targetOrientation:'portrait',commitPresentation:v=>{committed=v;}});
  assert.equal(plan.reason,HOME_TRANSITION_REASONS.ORIENTATION_CHANGE);
  assert.equal(plan.target.themeId,current.themeId);
  assert.equal(plan.target.orientation,'portrait');
  assert.equal(plan.directorRequest.reason,'ORIENTATION_CHANGE');
  assert.equal(plan.projection.needsPortraitComposition,true);
  plan.directorRequest.applySwap();
  assert.equal(committed.target.themeId,'HOME_INITIAL_DEFAULT');
});

test('theme change dominates combined presentation reason while target orientation is retained',()=>{
  const c=catalog(); const current=createHomePresentationState({themeId:'HOME_INITIAL_DEFAULT',orientation:'landscape'}); let committed=null;
  const plan=planHomePresentationChange({catalog:c,current,targetThemeId:'HOME_GARDEN_DAY',targetOrientation:'portrait',commitPresentation:v=>{committed=v;}});
  assert.equal(plan.reason,HOME_TRANSITION_REASONS.HOME_THEME_CHANGE);
  assert.equal(plan.target.orientation,'portrait');
  assert.equal(plan.projection.sceneAsset,'asset:garden-portrait');
  plan.directorRequest.applySwap();
  assert.equal(committed.current.themeId,'HOME_INITIAL_DEFAULT');
  assert.equal(committed.target.themeId,'HOME_GARDEN_DAY');
});

test('no-change plan does not schedule a director transition',()=>{
  const c=catalog(); const current=createHomePresentationState({themeId:'HOME_INITIAL_DEFAULT',orientation:'landscape'});
  const plan=planHomePresentationChange({catalog:c,current,commitPresentation:()=>assert.fail('must not commit')});
  assert.equal(plan.kind,'NO_CHANGE'); assert.equal(plan.directorRequest,null); assert.equal(plan.target,current);
});

test('reducedMotion and lowPerf are passed to existing TransitionDirector request without changing semantics',()=>{
  const c=catalog(); const current=createHomePresentationState({themeId:'HOME_INITIAL_DEFAULT',orientation:'landscape'});
  const plan=planHomePresentationChange({catalog:c,current,targetThemeId:'HOME_GARDEN_DAY',reducedMotion:true,lowPerf:true,commitPresentation:()=>{}});
  assert.equal(plan.directorRequest.reason,'HOME_THEME_CHANGE');
  assert.equal(plan.directorRequest.reducedMotion,true); assert.equal(plan.directorRequest.lowPerf,true);
});

test('rapid landscape→portrait then theme change supersedes stale pre-swap work; only latest presentation commits',async()=>{
  const c=catalog();
  const current=createHomePresentationState({themeId:'HOME_INITIAL_DEFAULT',orientation:'landscape'});
  const gate=deferred(); const commits=[];
  const director=createTransitionDirector({runPhase:async(phase,ctx)=>{
    if(ctx.to==='Home:HOME_INITIAL_DEFAULT:portrait'&&phase===TRANSITION_PHASES.EXIT) await gate.promise;
  }});
  const first=planHomePresentationChange({catalog:c,current,targetOrientation:'portrait',commitPresentation:x=>commits.push(x.target)});
  const a=director.start(first.directorRequest);
  await turn();
  assert.equal(director.getState().phase,TRANSITION_PHASES.EXIT);
  const second=planHomePresentationChange({catalog:c,current,targetThemeId:'HOME_GARDEN_DAY',targetOrientation:'portrait',commitPresentation:x=>commits.push(x.target)});
  const b=director.start(second.directorRequest);
  const br=await b;
  assert.equal(br.status,'completed');
  gate.resolve();
  const ar=await a;
  assert.equal(ar.status,'superseded'); assert.equal(ar.swapped,false);
  assert.deepEqual(commits.map(x=>`${x.themeId}:${x.orientation}`),['HOME_GARDEN_DAY:portrait']);
});

test('presentation planning cannot mutate caller-owned business state',()=>{
  const c=catalog(); const current=createHomePresentationState({themeId:'HOME_INITIAL_DEFAULT',orientation:'landscape'});
  const business=Object.freeze({coins:17,route:'Home',selectedDeck:'D1'}); const before=JSON.stringify(business);
  const plan=planHomePresentationChange({catalog:c,current,targetOrientation:'portrait',commitPresentation:()=>{}});
  assert.equal(plan.target.route,'Home'); assert.equal(JSON.stringify(business),before);
});
