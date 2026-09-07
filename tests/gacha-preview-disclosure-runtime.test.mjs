import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GACHA_PREVIEW_NOTICE_ID,
  GACHA_PREVIEW_NOTICE_TEXT,
  ensureGachaPreviewDisclosure,
} from '../browser/gacha-preview-disclosure-runtime.mjs';

function createFakeDocument({withOpenButton = true} = {}) {
  const byId = new Map();
  const screen = {
    id: 'gachaScreen',
    children: [],
    prepend(node) {
      this.children.unshift(node);
      byId.set(node.id, node);
    },
    appendChild(node) {
      this.children.push(node);
      byId.set(node.id, node);
    },
  };
  byId.set(screen.id, screen);

  let openButton = null;
  let controls = null;
  if (withOpenButton) {
    controls = {
      children: [],
      insertBefore(node, before) {
        const index = this.children.indexOf(before);
        this.children.splice(index < 0 ? this.children.length : index, 0, node);
        node.parentNode = this;
        byId.set(node.id, node);
      },
    };
    openButton = {id: 'openPack', parentNode: controls};
    controls.children.push(openButton);
    byId.set(openButton.id, openButton);
  }

  return {
    document: {
      getElementById(id) { return byId.get(id) || null; },
      createElement(tagName) {
        return {
          tagName: String(tagName).toUpperCase(),
          style: {},
          attributes: {},
          setAttribute(key, value) { this.attributes[key] = value; },
        };
      },
    },
    screen,
    controls,
    openButton,
  };
}

test('fails soft when the document or Gacha screen is unavailable', () => {
  assert.equal(ensureGachaPreviewDisclosure(undefined), null);
  assert.equal(ensureGachaPreviewDisclosure({}), null);
  assert.equal(ensureGachaPreviewDisclosure({getElementById: () => null, createElement: () => ({})}), null);
});

test('inserts the preview-only authority note immediately before the existing open-pack control', () => {
  const fixture = createFakeDocument();
  const note = ensureGachaPreviewDisclosure(fixture.document);

  assert.ok(note);
  assert.equal(note.id, GACHA_PREVIEW_NOTICE_ID);
  assert.equal(note.textContent, GACHA_PREVIEW_NOTICE_TEXT);
  assert.equal(note.attributes.role, 'note');
  assert.equal(note.attributes['data-gacha-authority'], 'preview-only');
  assert.deepEqual(fixture.controls.children, [note, fixture.openButton]);
});

test('repeated Gacha entry is idempotent and never stacks duplicate notices', () => {
  const fixture = createFakeDocument();
  const first = ensureGachaPreviewDisclosure(fixture.document);
  const second = ensureGachaPreviewDisclosure(fixture.document);

  assert.equal(second, first);
  assert.equal(fixture.controls.children.filter((node) => node.id === GACHA_PREVIEW_NOTICE_ID).length, 1);
});

test('falls back to the Gacha screen without inventing or requiring an open-pack control', () => {
  const fixture = createFakeDocument({withOpenButton: false});
  const note = ensureGachaPreviewDisclosure(fixture.document);

  assert.ok(note);
  assert.equal(fixture.screen.children[0], note);
});
