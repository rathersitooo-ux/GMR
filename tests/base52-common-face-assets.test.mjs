import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE52_COMMON_FACE_SOURCE,
  parseBase52CanonicalCardId,
  resolveBase52CommonFaceAsset,
  buildBase52CommonFaceManifest,
} from '../browser/base52-common-face-assets.mjs';

const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const ids=['SP','HT','DI','CL'].flatMap((prefix)=>ranks.map((rank)=>`${prefix}_${rank}`));

test('Base52 common face source stays pinned and prototype-only', ()=>{
  assert.equal(BASE52_COMMON_FACE_SOURCE.repository,'Webisso/playing-cards');
  assert.equal(BASE52_COMMON_FACE_SOURCE.commit,'50a3f7be7d6b7248da5f5c56533e1c5414aefb40');
  assert.equal(BASE52_COMMON_FACE_SOURCE.license,'MIT');
  assert.equal(BASE52_COMMON_FACE_SOURCE.runtimeFetch,true);
  assert.equal(BASE52_COMMON_FACE_SOURCE.formalAssetAccepted,false);
});

test('Base52 canonical parser matches current 52 ID syntax only', ()=>{
  assert.deepEqual(parseBase52CanonicalCardId('SP_A'),{
    canonicalCardId:'SP_A',prefix:'SP',suit:'spades',suitSymbol:'♠',colorFamily:'black',rank:'A'
  });
  for(const value of ['SP_1','SP_11','DK_A','sp_a','SP_OVER','GED','']) assert.equal(parseBase52CanonicalCardId(value),null);
});

test('Base52 asset mapping is immutable-source HTTPS and covers all 52', ()=>{
  for(const id of ids){
    const asset=resolveBase52CommonFaceAsset(id);
    assert.ok(asset,id);
    assert.match(asset.assetUrl,new RegExp('^https://raw\\.githubusercontent\\.com/Webisso/playing-cards/50a3f7be7d6b7248da5f5c56533e1c5414aefb40/svg/'));
    assert.equal(asset.formalAssetAccepted,false);
  }
  assert.match(resolveBase52CommonFaceAsset('HT_10').assetUrl,/10_of_hearts\.svg$/);
  assert.match(resolveBase52CommonFaceAsset('DI_Q').assetUrl,/queen_of_diamonds\.svg$/);
});

test('Base52 common face manifest fails closed on incomplete or duplicate coverage', ()=>{
  const manifest=buildBase52CommonFaceManifest(ids);
  assert.equal(manifest.count,52);
  assert.equal(new Set(manifest.entries.map((x)=>x.canonicalCardId)).size,52);
  assert.equal(new Set(manifest.entries.map((x)=>`${x.suit}:${x.rank}`)).size,52);
  assert.throws(()=>buildBase52CommonFaceManifest(ids.slice(1)),/BASE52_EXACTLY_52_REQUIRED/);
  assert.throws(()=>buildBase52CommonFaceManifest([...ids.slice(0,51),ids[0]]),/BASE52_CANONICAL_ID_DUPLICATE|BASE52_RANK_SUIT_DUPLICATE/);
});
