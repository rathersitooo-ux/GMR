import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT,
  installBattleNakiFeLiveDomAdapter,
  readBattleNakiFeLiveDomProjection
} from '../browser/battle-naki-fe-live-dom-adapter.mjs';

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(value) { return this.values.has(value); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
}

class FakeNode {
  constructor({ id = '', textContent = '', classes = [], dataset = {} } = {}) {
    this.id = id; this.textContent = textContent; this.dataset = { ...dataset };
    this.classList = new FakeClassList(classes); this.attributes = new Map(); this.listeners = new Map();
    this.options = []; this.value = ''; this.parentNode = null; this.hidden = false;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, callback) { const list = this.listeners.get(name) ?? []; list.push(callback); this.listeners.set(name, list); }
  removeEventListener(name, callback) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter(row => row !== callback)); }
  querySelector(selector) {
    if (selector.includes('player-name') || selector.includes('playerName') || selector === '.name') return this.nameNode ?? null;
    return null;
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map(); this.screen = new FakeNode({ classes: ['active'] });
    this.resolution = new FakeNode({ id: 'battleResolution', classes: ['battlePhaseLive'], dataset: { stage: 'focus', eventId: 'event-1' } });
    this.target = new FakeNode({ id: 'targetPlayer' }); this.target.value = 'P4';
    this.target.options = [new FakeNode({ textContent: 'P4' })];
    this.target.options[0].value = 'P4'; this.target.options[0].selected = true;
    this.rows = [
      new FakeNode({ classes: ['active'], dataset: { playerName: 'Naki' } }),
      new FakeNode({ dataset: { playerName: 'Mira' } }),
      new FakeNode({ dataset: { playerName: 'Rin' } }),
      new FakeNode({ dataset: { playerName: 'Saa' } })
    ];
    this.markers = [
      new FakeNode({ dataset: { participantId: 'P1', characterId: 'partner.naki', element: 'dark' } }),
      new FakeNode({ dataset: { participantId: 'P2', characterId: 'partner.mira', element: 'fire' } }),
      new FakeNode({ dataset: { participantId: 'P3', characterId: 'partner.rin', element: 'water' } }),
      new FakeNode({ dataset: { participantId: 'P4', characterId: 'partner.saasuna', element: 'wind' } })
    ];
    this.body = new FakeNode();
  }
  querySelector(selector) {
    if (selector === 'section.screen.battle[data-screen="battle"]' || selector === '.screen.battle') return this.screen;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '#players .player') return this.rows;
    if (selector === '[data-board-controlled-character]') return this.markers;
    return [];
  }
  getElementById(id) {
    if (id === 'battleResolution') return this.resolution;
    if (id === 'targetPlayer') return this.target;
    if (id === 'battlePhaseSurface') return null;
    return null;
  }
  addEventListener(name, callback) { const list = this.listeners.get(name) ?? []; list.push(callback); this.listeners.set(name, list); }
  removeEventListener(name, callback) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter(row => row !== callback)); }
}

function makeGlobal(document) {
  const listeners = new Map();
  return {
    document,
    addEventListener(name, callback) { const list = listeners.get(name) ?? []; list.push(callback); listeners.set(name, list); },
    removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) ?? []).filter(row => row !== callback)); }
  };
}

{
  const document = new FakeDocument();
  const projection = readBattleNakiFeLiveDomProjection(makeGlobal(document));
  assert.equal(projection.ok, true);
  assert.equal(projection.phase, 'attack');
  assert.equal(projection.stage, 'focus');
  assert.equal(projection.causalPhase, 'stance');
  assert.equal(projection.sourceId, 'P1');
  assert.equal(projection.targetId, 'P4');
  assert.equal(projection.sourceCharacter, 'partner.naki');
  assert.equal(projection.targetCharacter, 'partner.saasuna');
  assert.equal(projection.sourceElement, 'dark');
  assert.deepEqual(projection.participants.map(row => row.id), ['P1', 'P2', 'P3', 'P4']);
  assert.equal(projection.presentationOnly, true);
  assert.equal(projection.gameStateWrite, false);
  document.resolution.classList.add('noMotion'); document.body.classList.add('low-perf');
  const staticProjection = readBattleNakiFeLiveDomProjection(makeGlobal(document));
  assert.equal(staticProjection.reducedMotion, true);
  assert.equal(staticProjection.lowPerf, true);
  assert.equal(staticProjection.staticOnly, true);
}

{
  const document = new FakeDocument(); const globalRef = makeGlobal(document);
  const phases = []; const hitstops = []; const timers = []; const mounted = []; let destroys = 0;
  const assets = Object.freeze({ nakiIdle: 'idle-data', nakiAttack: 'attack-data', groundRun: 'ground-data' });
  const setTimeoutFn = (callback, ms) => { const timer = { callback, ms, cleared: false }; timers.push(timer); return timer; };
  const clearTimeoutFn = timer => { if (timer) timer.cleared = true; };
  const fire = ms => {
    const timer = [...timers].reverse().find(row => !row.cleared && row.ms === ms);
    assert.ok(timer, `expected a live ${ms}ms timer`); timer.cleared = true; timer.callback();
  };
  const adapter = installBattleNakiFeLiveDomAdapter(globalRef, {
    documentRef: document, assets, setTimeoutFn, clearTimeoutFn,
    mountScene(projection, sceneAssets) {
      mounted.push({ projection, sceneAssets });
      return {
        setPhase(phase) { phases.push(phase); return true; },
        setHitstop(enabled) { hitstops.push(enabled); return true; },
        destroy() { destroys += 1; }
      };
    }
  });
  assert.equal(adapter.ok, true);
  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].projection.sourceCharacter, 'partner.naki');
  assert.equal(mounted[0].sceneAssets, assets);
  assert.deepEqual(phases, ['stance']);
  adapter.refresh(); assert.equal(mounted.length, 1);

  document.resolution.dataset.stage = 'reveal'; adapter.refresh();
  document.resolution.dataset.stage = 'read'; adapter.refresh();
  assert.deepEqual(phases.slice(-2), ['stance', 'anticipation']);
  document.resolution.dataset.stage = 'compare'; adapter.refresh();
  assert.equal(phases.at(-1), 'release');
  fire(148); assert.equal(phases.at(-1), 'impact');
  fire(26); assert.equal(hitstops.at(-1), true);
  fire(62); assert.equal(hitstops.at(-1), false);
  document.resolution.dataset.stage = 'winner'; adapter.refresh();
  assert.equal(phases.at(-1), 'reaction');
  document.resolution.dataset.stage = 'settle'; adapter.refresh();
  assert.equal(phases.at(-1), 'return');
  fire(240);
  assert.equal(destroys, 1);
  assert.equal(adapter.snapshot().active, false);
  assert.equal(adapter.destroy(), true);
}

{
  const document = new FakeDocument(); document.target.value = 'slot-four';
  document.target.options[0].value = 'slot-four'; document.target.options[0].textContent = 'Saa';
  assert.equal(readBattleNakiFeLiveDomProjection(makeGlobal(document)).targetId, 'P4');
  document.target.options[0].textContent = 'Unmapped name';
  assert.equal(readBattleNakiFeLiveDomProjection(makeGlobal(document)).reason, 'source_or_target_unresolved');
}

{
  const document = new FakeDocument(); const globalRef = makeGlobal(document);
  const phases = []; const timers = [];
  const setTimeoutFn = (callback, ms) => { const timer = { callback, ms, cleared: false }; timers.push(timer); return timer; };
  const clearTimeoutFn = timer => { if (timer) timer.cleared = true; };
  const fire = ms => {
    const timer = [...timers].reverse().find(row => !row.cleared && row.ms === ms);
    assert.ok(timer, `expected a live ${ms}ms timer`); timer.cleared = true; timer.callback();
  };
  const adapter = installBattleNakiFeLiveDomAdapter(globalRef, {
    documentRef: document, setTimeoutFn, clearTimeoutFn,
    mountScene() { return { setPhase(phase) { phases.push(phase); }, setHitstop() {}, destroy() {} }; }
  });
  document.resolution.dataset.stage = 'compare'; adapter.refresh();
  document.resolution.dataset.stage = 'winner'; adapter.refresh();
  assert.deepEqual(phases, ['stance', 'release'], 'winner state must wait for the pending release and impact');
  fire(148); assert.equal(phases.at(-1), 'impact');
  fire(26); fire(62); assert.equal(phases.at(-1), 'reaction');
  adapter.destroy();
}

{
  const document = new FakeDocument(); document.rows[1].classList.add('active');
  assert.equal(readBattleNakiFeLiveDomProjection(makeGlobal(document)).reason, 'active_actor_unresolved');
  document.rows[1].classList.remove('active'); document.screen.classList.remove('active');
  assert.equal(readBattleNakiFeLiveDomProjection(makeGlobal(document)).reason, 'battle_phase_not_live');
  document.resolution.dataset.battlePhaseLive = 'true';
  assert.equal(readBattleNakiFeLiveDomProjection(makeGlobal(document)).ok, true);
}

assert.equal(BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT.participantCount, 4);
assert.equal(BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT.stageAuthority, '#battleResolution[data-stage] + .battlePhaseLive');
assert.deepEqual(BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT.stageMapping, { focus: 'stance', reveal: 'stance', read: 'anticipation', compare: 'release-impact', winner: 'reaction', settle: 'return' });
assert.equal(BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT.ambiguousActorOrTarget, 'FAIL_CLOSED');
assert.equal(BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT.gameStateWrite, false);
assert.deepEqual(BATTLE_NAKI_FE_LIVE_DOM_ADAPTER_CONTRACT.staticImports, []);

{
  const profile = await readFile(new URL('../browser/profile-presentation-runtime-mount.mjs', import.meta.url), 'utf8');
  const adapterBytes = await readFile(new URL('../browser/battle-naki-fe-live-dom-adapter.mjs', import.meta.url));
  assert.ok(profile.includes(adapterBytes.toString('utf8')), 'prepackaged profile entrypoint must carry the exact tested Battle adapter source');
  assert.ok(profile.includes('installBattleNakiFeLiveDomAdapter(window, { documentRef: document, assets: BATTLE_NAKI_FE_LIVE_ASSETS });'));
  const assets = [
    ['BATTLE_NAKI_IDLE_SPRITE_BASE64', '../browser/assets/partners/naki-idol/battle/primary-r1/naki-idol-battle-idle-3x3.png'],
    ['BATTLE_NAKI_SONG_ATTACK_SPRITE_BASE64', '../browser/assets/partners/naki-idol/battle/primary-r1/naki-idol-battle-song-attack-3x3.png'],
    ['BATTLE_ELEMENT_GROUND_RUN_SPRITE_BASE64', '../browser/assets/partners/naki-idol/vfx/ground/elemental-ground-run-7x3.png']
  ];
  for (const [constant, relativePath] of assets) {
    const asset = await readFile(new URL(relativePath, import.meta.url));
    const match = profile.match(new RegExp(`const ${constant} = '([^']+)';`));
    assert.ok(match, `${constant} must be embedded in the prepackaged entrypoint`);
    assert.equal(match[1], asset.toString('base64'));
  }
}

console.log('battle-naki-fe-live-dom-adapter tests passed');
