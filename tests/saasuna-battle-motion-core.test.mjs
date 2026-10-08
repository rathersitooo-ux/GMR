import assert from 'node:assert/strict';
import {
  SAASUNA_BATTLE_KEYFRAME_SHEET,
  SAASUNA_BATTLE_R2_SPRITES,
  SAASUNA_BATTLE_MOTION_PROFILES,
  SAASUNA_BATTLE_MOTION_RUNTIME,
  SAASUNA_BATTLE_MOTION_STATES,
  createSaasunaBattleMotionController,
  ensureSaasunaBattleMotionStyle,
  resolveSaasunaBattleMotionPlan,
  resolveSaasunaBattleMotionState,
} from '../browser/saasuna-battle-motion-core.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.id = '';
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

class FakeDocument {
  constructor() { this.head = new FakeElement('head'); }
  createElement(tag) { return new FakeElement(tag); }
  getElementById(id) { return this.head.children.find(node => node.id === id) ?? null; }
}

assert.equal(SAASUNA_BATTLE_KEYFRAME_SHEET.columns, 3);
assert.equal(SAASUNA_BATTLE_KEYFRAME_SHEET.rows, 3);
assert.equal(SAASUNA_BATTLE_KEYFRAME_SHEET.provisional, true);
assert.equal(SAASUNA_BATTLE_KEYFRAME_SHEET.formalArt, false);
assert.equal(SAASUNA_BATTLE_MOTION_RUNTIME.keyframeCount, 9);
assert.equal(SAASUNA_BATTLE_MOTION_RUNTIME.r2FramesPerAction, 8);
assert.equal(SAASUNA_BATTLE_R2_SPRITES.magic.releaseFrame, 5);
assert.equal(SAASUNA_BATTLE_R2_SPRITES.ice.durationsMs[3], 85);
assert.equal(SAASUNA_BATTLE_R2_SPRITES.idle.frameCount, 8);
assert.equal(SAASUNA_BATTLE_MOTION_RUNTIME.presentationOnly, true);
assert.equal(SAASUNA_BATTLE_MOTION_RUNTIME.gameplayAuthority, false);
assert.equal(SAASUNA_BATTLE_MOTION_STATES.length, 11);
assert.deepEqual(SAASUNA_BATTLE_MOTION_PROFILES.ICE_SLIDE_LOW.backgroundPosition, '100% 0%');
assert.deepEqual(SAASUNA_BATTLE_MOTION_PROFILES.KNEE_PILLOW.backgroundPosition, '0% 100%');
assert.deepEqual(SAASUNA_BATTLE_MOTION_PROFILES.MATERNAL_HUG.backgroundPosition, '50% 100%');

assert.equal(resolveSaasunaBattleMotionState({ characterId: 'partner.other', phase: 'attack' }), null);
assert.equal(resolveSaasunaBattleMotionState({ characterId: 'partner.saasuna', phase: 'ability', role: 'source' }), 'ICE_SLIDE_LOW');
assert.equal(resolveSaasunaBattleMotionState({ characterId: 'partner.saasuna', phase: 'attack', role: 'target' }), 'HIT_RECOIL');
assert.equal(resolveSaasunaBattleMotionState({ characterId: 'partner.saasuna', motionState: 'knee-pillow' }), 'KNEE_PILLOW');
assert.equal(resolveSaasunaBattleMotionState({ characterId: 'partner.saasuna', phase: 'settle' }), 'RESULT_GLIDE');
assert.equal(resolveSaasunaBattleMotionPlan({ characterId: 'partner.saasuna', motionState: 'maternal_hug' }).formalArt, false);

const document = new FakeDocument();
const figure = new FakeElement('div');
const characterHost = new FakeElement('div');
figure.appendChild(characterHost);
assert.equal(ensureSaasunaBattleMotionStyle(document), true);
assert.equal(ensureSaasunaBattleMotionStyle(document), false);
assert.match(document.head.children[0].textContent, /saasunaBattleLowSlide/);
assert.match(document.head.children[0].textContent, /saasunaBattleSpin/);
assert.match(document.head.children[0].textContent, /saasunaBattleHug/);
assert.match(document.head.children[0].textContent, /prefers-reduced-motion/);

const controller = createSaasunaBattleMotionController({
  doc: document,
  host: figure,
  characterHost,
  characterId: 'partner.saasuna',
  phase: 'ability',
  role: 'source',
});
assert.ok(controller);
assert.equal(figure.dataset.saasunaBattleMotionState, 'ICE_SLIDE_LOW');
assert.equal(figure.dataset.saasunaBattleVisualSource, 'provisional-r2-eight-frame');
assert.equal(figure.dataset.saasunaBattleFrameIndex, '1');
assert.equal(figure.dataset.saasunaBattleFrameSheet, 'SARSNER_STAFF_SPIN_ICE_SLIDE_8F_R2.png');
assert.equal(figure.dataset.saasunaBattleFormalArt, 'false');
assert.equal(characterHost.style.visibility, 'hidden');
const surface = controller.snapshot().surface;
assert.equal(surface.keyframe.dataset.keyframeId, 'ice-slide-low');
assert.equal(surface.keyframe.style.backgroundPosition, '0% 0%');
assert.equal(surface.keyframe.style.backgroundSize, '800% 100%');
assert.equal(surface.ice.hidden, false);
assert.equal(surface.wind.hidden, false);
assert.equal(surface.impact.hidden, true);

controller.setState({ motionState: 'KNEE_PILLOW' });
assert.equal(figure.dataset.saasunaBattleMotionState, 'KNEE_PILLOW');
assert.equal(surface.keyframe.dataset.keyframeId, 'knee-pillow');
assert.equal(surface.keyframe.style.backgroundPosition, '0% 100%');
assert.equal(surface.ice.hidden, true);
assert.equal(surface.wind.hidden, true);
controller.setState({ motionState: 'HIT_RECOIL' });
assert.equal(surface.impact.hidden, false);
assert.equal(surface.ice.hidden, true);
assert.equal(surface.wind.hidden, true);

controller.destroy();
assert.equal(surface.surface.parentNode, null);
assert.equal(characterHost.style.visibility, '');
assert.equal(figure.dataset.saasunaBattleMotionState, undefined);

assert.equal(createSaasunaBattleMotionController({
  doc: document,
  host: figure,
  characterId: 'partner.other',
}), null);

const scheduled = new Map();
let timerId = 0;
const controlledClock = {
  setTimeout(callback, ms) {
    const id = ++timerId;
    scheduled.set(id, { callback, ms });
    return id;
  },
  clearTimeout(id) { scheduled.delete(id); }
};
const actorDocument = new FakeDocument();
const actorFigure = new FakeElement('div');
const actor = createSaasunaBattleMotionController({
  doc: actorDocument, host: actorFigure, characterId: 'partner.saasuna',
  role: 'source', phase: 'attack', clock: controlledClock
});
assert.equal(actorFigure.dataset.saasunaBattleFrameSheet, 'SARSNER_MAGIC_ATTACK_8F_R2.png');
assert.equal(actorFigure.dataset.saasunaBattleFrameIndex, '1');
assert.equal([...scheduled.values()][0]?.ms, 100);
actor.setState({ causalPhase: 'stance', actionPhase: 'attack', motionState: 'IDLE_GENTLE' });
for (let i = 0; i < 4; i += 1) {
  const [id, next] = scheduled.entries().next().value;
  scheduled.delete(id);
  next.callback();
}
assert.equal(actorFigure.dataset.saasunaBattleFrameIndex, '5');
const activeTimer = scheduled.keys().next().value;
actor.setState({ causalPhase: 'release', actionPhase: 'attack', motionState: 'MAGIC_RELEASE' });
assert.equal(actorFigure.dataset.saasunaBattleFrameIndex, '5', 'causal stage never restarts the source frames');
assert.equal(scheduled.keys().next().value, activeTimer);
actor.setState({ causalPhase: 'return', actionPhase: 'attack', motionState: 'IDLE_GENTLE' });
assert.equal(actorFigure.dataset.saasunaBattleFrameSheet, 'SARSNER_APPEAL_IDLE_8F_R2.png');
assert.equal(actorFigure.dataset.saasunaBattleFrameIndex, '1');
actor.destroy();
assert.equal(scheduled.size, 0);
assert.equal(actorFigure.dataset.saasunaBattleFrameSheet, undefined);

const targetDocument = new FakeDocument();
const targetFigure = new FakeElement('div');
const target = createSaasunaBattleMotionController({
  doc: targetDocument, host: targetFigure, characterId: 'partner.saasuna',
  role: 'target', phase: 'idle', clock: controlledClock
});
target.setState({ causalPhase: 'impact', motionState: 'HIT_RECOIL' });
assert.equal(targetFigure.dataset.saasunaBattleVisualSource, 'provisional-keyframe-sheet',
  'dodge art cannot stand in for a target hit');
assert.equal(target.snapshot().surface.impact.hidden, false);
target.destroy();
assert.equal(scheduled.size, 0);
const stillDocument = new FakeDocument();
stillDocument.defaultView = { matchMedia: () => ({ matches: true }) };
const stillFigure = new FakeElement('div');
const still = createSaasunaBattleMotionController({
  doc: stillDocument, host: stillFigure, characterId: 'partner.saasuna',
  role: 'source', phase: 'attack', clock: controlledClock
});
assert.equal(stillFigure.dataset.saasunaBattleFrameIndex, '5');
assert.equal(scheduled.size, 0, 'reduced motion does not schedule frame playback');
still.destroy();
