import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  artForCard,
  createArtRegistry,
  listArtByForm,
  registerArt,
  removeArt,
} from '../browser/card-art-registry-core.mjs';

test('カードは絵の番号で引き、フルアートが優先の形として区別できる', () => {
  const reg = createArtRegistry();
  assert.equal(registerArt(reg, { artId: 'ART001', file: 'provisional-art/black-lotus.jpg', form: 'fullart', cardName: 'ブラックロータス', source: 'Scryfall art_crop' }), true);
  assert.equal(registerArt(reg, { artId: 'ART002', file: 'provisional-art/dm-card.png', form: 'card', cardName: 'デュエマのカード', source: 'wiki' }), true);
  const card = { id: 'X1', artId: 'ART001' };
  assert.equal(artForCard(reg, card).form, 'fullart');
  assert.equal(listArtByForm(reg, 'fullart').length, 1);
  assert.equal(listArtByForm(reg, 'card').length, 1);
});

test('絵の番号が無いカードや未登録の番号は null（仮表示に回す）', () => {
  const reg = createArtRegistry();
  assert.equal(artForCard(reg, { id: 'X2' }), null);
  assert.equal(artForCard(reg, { id: 'X3', artId: 'ART999' }), null);
});

test('形が fullart か card でない登録は受けない', () => {
  const reg = createArtRegistry();
  assert.equal(registerArt(reg, { artId: 'A', file: 'x.png', form: 'thumbnail' }), false);
  assert.equal(registerArt(reg, { artId: '', file: 'x.png', form: 'card' }), false);
});

test('正式カードができたら借り物の絵を外せる', () => {
  const reg = createArtRegistry();
  registerArt(reg, { artId: 'ART001', file: 'a.jpg', form: 'card', cardName: '仮' });
  assert.equal(removeArt(reg, 'ART001'), true);
  assert.equal(artForCard(reg, { artId: 'ART001' }), null);
});
