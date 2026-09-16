import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SAASUNA_BUSTUP_ASSETS,
  resolveSaasunaAdviceBustupState,
} from '../browser/partner-saasuna-bustup-visuals.mjs';

const EXPECTED_HASHES = Object.freeze({
  HAPPY_WAVE: 'b172a471ff5953d85ca0dcd7ab092f3ced7c9f65e149f5797fdf0f16c67326c7',
  CURIOUS_CONFUSED: 'c6972e617a76fa58b66041ce6d0369b547642076f57d3ebd08dfc7fd65a70303',
  SHH: 'ab2bcfca5fe92fa7b287a85f9972492b00a3177d2fde0aa8856dda9ff71aafb3',
  GUIDE_PRESENT: 'd4354493238d73fbc79a3e5dfbc762edf89be668bfdb694152ba1122523616d7',
  IDLE_GENTLE: '14ec3b5616ce856c92aba13095610c89d3737c2de19cc9e47cb4b434cba2b0c8',
  SURPRISED: '61ff4416f733ef896d49a8dd63310ce5226c1dbc495e3214d0897098ad0f80d3',
  TOUCH_CRY: 'bb400cf8f550c780c68d3c76a5830aebc84cdff527369042c66d91912ffe1962',
  HAPPY_SMILE: 'ed885a72ce3b959e95b3a3b1412794253e3aef3d48d1a51707eee777c83b349e',
  SAD_DOWNCAST: 'd19dc17ceea6b70b8437a5c6707ab9476aa5b83f825b291ad92f895e42296732',
});

test('Saasuna Battle bust-up registry contains the exact nine accepted transparent assets', () => {
  assert.deepEqual(Object.keys(SAASUNA_BUSTUP_ASSETS).sort(), Object.keys(EXPECTED_HASHES).sort());  for (const [state, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    const entry = SAASUNA_BUSTUP_ASSETS[state];
    assert.ok(entry?.fileName?.endsWith('.png'));
    const actualHash = createHash('sha256').update(readFileSync(new URL(entry.src))).digest('hex');
    assert.equal(actualHash, expectedHash, `${state} must match the accepted Drive asset`);
  }
});

test('Battle presentation selects only context-appropriate Saasuna bust-ups automatically', () => {
  const base = { partnerId: 'partner.saasuna' };
  assert.equal(resolveSaasunaAdviceBustupState(base), 'IDLE_GENTLE');
  assert.equal(resolveSaasunaAdviceBustupState({ ...base, adviceActive: true }), 'HAPPY_SMILE');
  assert.equal(resolveSaasunaAdviceBustupState({ ...base, quickRouteId: 'casual' }), 'HAPPY_WAVE');
  assert.equal(resolveSaasunaAdviceBustupState({ ...base, quickRouteId: 'situation' }), 'CURIOUS_CONFUSED');
  assert.equal(resolveSaasunaAdviceBustupState({ ...base, quickRouteId: 'idea' }), 'GUIDE_PRESENT');
  assert.equal(resolveSaasunaAdviceBustupState({ ...base, tutorialActive: true }), 'GUIDE_PRESENT');
  assert.equal(resolveSaasunaAdviceBustupState({ ...base, reactionActive: true }), 'SURPRISED');
  assert.equal(resolveSaasunaAdviceBustupState({ partnerId: 'partner.other' }), null);
  assert.ok(SAASUNA_BUSTUP_ASSETS.SHH && SAASUNA_BUSTUP_ASSETS.TOUCH_CRY && SAASUNA_BUSTUP_ASSETS.SAD_DOWNCAST);
});
