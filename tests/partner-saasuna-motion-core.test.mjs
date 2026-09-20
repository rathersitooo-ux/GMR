import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAASUNA_MOTION_PROFILES,
  SAASUNA_MOTION_STATES,
  createSaasunaMotionController,
  ensureSaasunaMotionSurface,
  resolveSaasunaMotionPlan,
  resolveSaasunaMotionState,
} from '../browser/partner-saasuna-motion-core.mjs';

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.className = '';
    this.parentElement = null;
    this.attributes = new Map();
    this.animations = [];
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  querySelector(selector) {
    const match = selector.match(/^\[data-role="([^"]+)"\]$/);
    const classMatch = selector.match(/^\.([\w-]+)$/);
    const matches = (node) => match
      ? node.dataset.role === match[1]
      : classMatch && node.className === classMatch[1];
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child)) return child;
        const nested = visit(child);
        if (nested) return nested;
      }
      return null;
    };
    return visit(this);
  }

  animate(keyframes, timing) {
    const animation = {
      keyframes,
      timing,
      cancel() {},
      pause() {},
      finished: Promise.resolve(),
    };
    this.animations.push(animation);
    return animation;
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeNode('head');
  }

  createElement(tagName) {
    return new FakeNode(tagName);
  }

  getElementById(id) {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const nested = visit(child);
        if (nested) return nested;
      }
      return null;
    };
    return visit(this.head);
  }
}

function fakeBustup() {
  const doc = new FakeDocument();
  const figure = new FakeNode('figure');
  const art = new FakeNode('div');
  art.className = 'partnerAdviceBustupArt';
  const image = new FakeNode('img');
  art.append(image);
  figure.append(art);
  return { doc, bustup: { figure, image } };
}

test('nine accepted Saasuna states each have a timed motion profile', () => {
  const expected = [
    'HAPPY_WAVE', 'CURIOUS_CONFUSED', 'SHH', 'GUIDE_PRESENT', 'IDLE_GENTLE',
    'SURPRISED', 'TOUCH_CRY', 'HAPPY_SMILE', 'SAD_DOWNCAST',
  ];
  assert.deepEqual([...SAASUNA_MOTION_STATES].sort(), [...expected].sort());
  for (const state of expected) {
    const profile = SAASUNA_MOTION_PROFILES[state];
    assert.ok(profile.durationMs > 0, `${state} needs duration`);
    assert.equal(profile.phases.riseMs + profile.phases.peakMs + profile.phases.settleMs, profile.durationMs);
    assert.ok(profile.keyframes.length >= 4, `${state} needs derived in-betweens`);
    assert.equal(profile.keyframes[0].offset, 0);
    assert.equal(profile.keyframes.at(-1).offset, 1);
  }
});

test('motion state resolution follows the current Advice context without cross-character fallback', () => {
  assert.equal(resolveSaasunaMotionState({ partnerId: 'partner.saasuna' }), 'IDLE_GENTLE');
  assert.equal(resolveSaasunaMotionState({ partnerId: 'partner.saasuna', reactionActive: true }), 'SURPRISED');
  assert.equal(resolveSaasunaMotionState({ partnerId: 'partner.saasuna', visualState: 'SHH' }), 'SHH');
  assert.equal(resolveSaasunaMotionState({ partnerId: 'partner.other', visualState: 'HAPPY_WAVE' }), null);
  assert.equal(resolveSaasunaMotionPlan({ partnerId: 'partner.saasuna', visualState: 'TOUCH_CRY' }).returnState, 'SAD_DOWNCAST');
});

test('motion controller adds only whole-layer transition/effect surfaces', () => {
  const { doc, bustup } = fakeBustup();
  const surface = ensureSaasunaMotionSurface(doc, bustup);
  assert.ok(surface?.crossfadeImage);
  assert.ok(surface?.effect);
  const controller = createSaasunaMotionController({ doc, bustup, transitionMs: 0 });
  const plan = controller.setState({ partnerId: 'partner.saasuna', visualState: 'HAPPY_WAVE' });
  assert.equal(plan.state, 'HAPPY_WAVE');
  assert.equal(bustup.figure.dataset.motionState, 'HAPPY_WAVE');
  assert.equal(surface.image.dataset.assetFile, 'HAPPY_WAVE.png');
  assert.equal(surface.effect.dataset.kind, 'wind-cut');
  assert.equal(surface.image.animations.length, 1);
  assert.match(surface.image.animations[0].keyframes[2].transform, /translate3d/);
  assert.equal(controller.settleTo('IDLE_GENTLE').state, 'IDLE_GENTLE');
  controller.clear();
  assert.equal(bustup.figure.dataset.motionState, undefined);
});
