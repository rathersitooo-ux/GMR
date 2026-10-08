import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  renderSaasunaBattleBustup,
  SAASUNA_BUSTUP_ASSETS,
} from '../browser/partner-saasuna-bustup-visuals.mjs';
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
    this.dataset = new Proxy({}, {
      set: (target, property, value) => {
        const nextValue = String(value);
        if (target[property] === nextValue) return true;
        target[property] = nextValue;
        const attributeName = `data-${String(property).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
        this.ownerDocument?.dispatchAttributeChange(this, attributeName);
        return true;
      },
      deleteProperty: (target, property) => {
        const existed = Object.hasOwn(target, property);
        delete target[property];
        if (existed) {
          const attributeName = `data-${String(property).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
          this.ownerDocument?.dispatchAttributeChange(this, attributeName);
        }
        return true;
      },
    });
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
  constructor(reducedMotion = false) {
    this.head = new FakeNode('head');
    this.head.ownerDocument = this;
    this.mutationObservers = new Set();
    this.pendingTimers = new Map();
    this.nextTimerId = 1;
    this.timerNowMs = 0;
    const document = this;
    this.defaultView = {
      matchMedia: () => ({ matches: reducedMotion }),
      MutationObserver: class FakeMutationObserver {
        constructor(callback) {
          this.callback = callback;
          this.targets = [];
          document.mutationObservers.add(this);
        }

        observe(target, options = {}) {
          this.targets.push({ target, attributeFilter: options.attributeFilter || null });
        }

        disconnect() {
          this.targets = [];
          document.mutationObservers.delete(this);
        }
      },
      setTimeout: (callback, delayMs) => {
        const id = this.nextTimerId++;
        this.pendingTimers.set(id, { callback, dueAt: this.timerNowMs + delayMs });
        return id;
      },
      clearTimeout: (id) => this.pendingTimers.delete(id),
    };
  }

  createElement(tagName) {
    const node = new FakeNode(tagName);
    node.ownerDocument = this;
    return node;
  }

  dispatchAttributeChange(target, attributeName) {
    for (const observer of this.mutationObservers) {
      const observesAttribute = observer.targets.some(({ target: observedTarget, attributeFilter }) => (
        observedTarget === target && (!attributeFilter || attributeFilter.includes(attributeName))
      ));
      if (observesAttribute) observer.callback([{ target, attributeName }]);
    }
  }

  advanceTimersBy(ms) {
    this.timerNowMs += ms;
    const dueTimers = [...this.pendingTimers.entries()].filter(([, timer]) => timer.dueAt <= this.timerNowMs);
    for (const [id, timer] of dueTimers) {
      this.pendingTimers.delete(id);
      timer.callback();
    }
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
  const figure = doc.createElement('figure');
  const art = doc.createElement('div');
  art.className = 'partnerAdviceBustupArt';
  const image = doc.createElement('img');
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
  assert.equal(surface.image.dataset.assetFile, SAASUNA_BUSTUP_ASSETS.HAPPY_WAVE.fileName);
  assert.equal(surface.effect.dataset.kind, 'wind-cut');
  assert.equal(surface.image.animations.length, 1);
  assert.match(surface.image.animations[0].keyframes[2].transform, /translate3d/);
  assert.equal(controller.settleTo('IDLE_GENTLE').state, 'IDLE_GENTLE');
  controller.clear();
  assert.equal(bustup.figure.dataset.motionState, undefined);
});

test('state changes retain a crossfade even when the caller has already swapped the key pose', () => {
  const { doc, bustup } = fakeBustup();
  const surface = ensureSaasunaMotionSurface(doc, bustup);
  const controller = createSaasunaMotionController({ doc, bustup, transitionMs: 180 });
  controller.setState({ partnerId: 'partner.saasuna', visualState: 'HAPPY_WAVE' }, { transitionMs: 0 });
  bustup.image.src = SAASUNA_BUSTUP_ASSETS.IDLE_GENTLE.src;
  bustup.image.dataset.assetFile = SAASUNA_BUSTUP_ASSETS.IDLE_GENTLE.fileName;
  controller.setState({ partnerId: 'partner.saasuna', visualState: 'IDLE_GENTLE' });
  assert.ok(surface.crossfadeImage.animations.length >= 1);
  assert.ok(surface.image.animations.length >= 2);
});

test('a new state still plays when the live renderer requests no restart for repeated renders', () => {
  const { doc, bustup } = fakeBustup();
  const controller = createSaasunaMotionController({ doc, bustup, transitionMs: 0 });
  controller.setState({ partnerId: 'partner.saasuna', visualState: 'HAPPY_WAVE' });
  controller.setState({ partnerId: 'partner.saasuna', visualState: 'SURPRISED' }, { restart: false });
  const imageAnimations = controller.snapshot().surface.image.animations;
  assert.equal(imageAnimations.at(-1).timing.duration, SAASUNA_MOTION_PROFILES.SURPRISED.durationMs);
  assert.equal(imageAnimations.at(-1).timing.iterations, 1);
});

test('motion controller follows the live touch-cry renderer through SAD_DOWNCAST afterglow', () => {
  const { doc, bustup } = fakeBustup();
  const root = doc.createElement('section');
  const renderArgs = {
    root,
    bustup,
    partnerId: 'partner.saasuna',
    battleActive: true,
    quickRouteId: 'idea',
    nowMs: 0,
  };
  const initial = renderSaasunaBattleBustup(renderArgs);
  const controller = createSaasunaMotionController({ doc, bustup, transitionMs: 0 });
  controller.setState({ partnerId: 'partner.saasuna', visualState: initial.state }, { restart: false });

  bustup.figure.dataset.touchCryVisible = 'true';
  assert.equal(bustup.figure.dataset.state, 'TOUCH_CRY');
  assert.equal(controller.snapshot().state, 'TOUCH_CRY');
  assert.equal(controller.snapshot().surface.image.dataset.assetFile, SAASUNA_BUSTUP_ASSETS.TOUCH_CRY.fileName);
  assert.equal(controller.snapshot().surface.effect.dataset.kind, 'tear');

  delete bustup.figure.dataset.touchCryVisible;
  assert.equal(bustup.figure.dataset.state, 'SAD_DOWNCAST');
  assert.equal(controller.snapshot().state, 'SAD_DOWNCAST');
  doc.advanceTimersBy(1199);
  assert.equal(controller.snapshot().state, 'SAD_DOWNCAST');
  doc.advanceTimersBy(1);

  assert.equal(bustup.figure.dataset.state, 'GUIDE_PRESENT');
  assert.equal(controller.snapshot().state, 'GUIDE_PRESENT');
});

test('reduced motion keeps the final pose and suppresses the transient effect', () => {
  const doc = new FakeDocument(true);
  const figure = new FakeNode('figure');
  const art = new FakeNode('div');
  art.className = 'partnerAdviceBustupArt';
  const image = new FakeNode('img');
  art.append(image);
  figure.append(art);
  const bustup = { figure, image };
  const surface = ensureSaasunaMotionSurface(doc, bustup);
  const controller = createSaasunaMotionController({ doc, bustup });
  controller.setState({ partnerId: 'partner.saasuna', visualState: 'HAPPY_WAVE' });
  assert.equal(controller.snapshot().reducedMotion, true);
  assert.equal(surface.image.animations.length, 0);
  assert.equal(surface.effect.hidden, true);
  assert.match(surface.image.style.transform, /scale\(1\)/);
});

test('the live Advice mount consumes the resolved bust-up state instead of inventing a second state authority', () => {
  const source = readFileSync(new URL('../browser/partner-advice-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /createSaasunaMotionController/);
  assert.match(source, /bustupPresentation\.state/);
  assert.match(source, /saasunaMotion\.setState/);
  assert.match(source, /saasunaMotion\.clear/);
});
