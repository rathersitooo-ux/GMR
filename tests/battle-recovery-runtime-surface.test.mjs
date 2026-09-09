import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT,
  mountBattleRecoveryRuntimeSurface,
} from '../browser/battle-recovery-runtime-surface.mjs';
import {
  BATTLE_RECOVERY_LOCAL_STAGE,
  BATTLE_RECOVERY_STATUS,
} from '../browser/battle-recovery-presentation-core.mjs';

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.className = '';
    this.textContent = '';
    this.id = '';
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'data-battle-recovery-runtime-surface') {
      this.dataset.battleRecoveryRuntimeSurface = text;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector) {
    if (selector === '[data-battle-recovery-runtime-surface="1"]') {
      if (this.getAttribute('data-battle-recovery-runtime-surface') === '1') return this;
      for (const child of this.children) {
        const match = child.querySelector?.(selector);
        if (match) return match;
      }
    }
    return null;
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
        const match = visit(child);
        if (match) return match;
      }
      return null;
    };
    return visit(this.head);
  }
}

function fixture({ reducedMotion = false, lowPerf = false } = {}) {
  const document = new FakeDocument();
  const host = new FakeNode('section');
  host.dataset.lowPerf = String(lowPerf);
  const locks = [];
  const globalRef = {
    document,
    matchMedia: () => ({ matches: reducedMotion }),
  };
  const runtime = mountBattleRecoveryRuntimeSurface(globalRef, {
    host,
    setLocalInputLocked: (locked, projection) => {
      locks.push({ locked, status: projection.status });
    },
  });
  return { document, host, locks, runtime };
}

test('READY is hidden and projects caller input unlock without inventing authority', () => {
  const { runtime, locks } = fixture();
  const projection = runtime.sync({ status: BATTLE_RECOVERY_STATUS.READY });

  assert.equal(projection.visible, false);
  assert.equal(projection.inputLockRequired, false);
  assert.equal(runtime.root.hidden, true);
  assert.equal(runtime.root.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(locks, [{ locked: false, status: BATTLE_RECOVERY_STATUS.READY }]);
  assert.equal(runtime.gameplayAuthority, false);
  assert.equal(runtime.networkAuthority, false);
  assert.equal(runtime.controlAuthority, false);
  assert.equal(runtime.gameStateWrite, false);
});

test('WAITING renders the existing compact copy and fail-closed local input lock', () => {
  const { runtime, locks } = fixture();
  const projection = runtime.sync({ status: BATTLE_RECOVERY_STATUS.WAITING });

  assert.equal(projection.label, '待機中');
  assert.equal(projection.detail, '現在の状態を待っています');
  assert.equal(projection.blocksBoard, false);
  assert.equal(runtime.root.hidden, false);
  assert.equal(runtime.root.children[0].textContent, '待機中');
  assert.equal(runtime.root.children[1].textContent, '現在の状態を待っています');
  assert.equal(runtime.root.dataset.status, BATTLE_RECOVERY_STATUS.WAITING);
  assert.equal(runtime.root.dataset.inputLocked, 'true');
  assert.deepEqual(locks, [{ locked: true, status: BATTLE_RECOVERY_STATUS.WAITING }]);
});

test('RECONNECTING requests authoritative refresh but never triggers network policy itself', () => {
  const { runtime } = fixture();
  const projection = runtime.sync({ status: BATTLE_RECOVERY_STATUS.RECONNECTING });

  assert.equal(projection.label, '再接続中');
  assert.equal(projection.requiresAuthoritativeRefresh, true);
  assert.equal(runtime.root.dataset.authoritativeRefreshRequired, 'true');
  assert.equal(runtime.retriesNetwork, false);
  assert.equal(runtime.computesTimeout, false);
});

test('STALE_INPUT_REJECTED exposes uncommitted clear intent without clearing or rolling back itself', () => {
  const { runtime } = fixture();
  const projection = runtime.sync({
    status: BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.UNCOMMITTED,
  });

  assert.equal(projection.clearUncommittedLocalStage, true);
  assert.equal(projection.rollbackAuthoritativeCommit, false);
  assert.equal(runtime.root.dataset.clearUncommittedLocalStage, 'true');
  assert.equal(runtime.clearsLocalStage, false);
  assert.equal(runtime.root.children[0].textContent, '状態が更新されました');
  assert.equal(runtime.root.children[1].textContent, '最新の対戦状態に戻ります');
});

test('committed local stage is never exposed as clearable after stale rejection', () => {
  const { runtime } = fixture();
  const projection = runtime.sync({
    status: BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.COMMITTED,
  });

  assert.equal(projection.clearUncommittedLocalStage, false);
  assert.equal(projection.rollbackAuthoritativeCommit, false);
  assert.equal(runtime.root.dataset.clearUncommittedLocalStage, 'false');
});

test('reduced-motion and low-performance modes preserve semantic status with static cues', () => {
  const reduced = fixture({ reducedMotion: true });
  const reducedProjection = reduced.runtime.sync({ status: BATTLE_RECOVERY_STATUS.WAITING });
  assert.equal(reducedProjection.motionMode, 'REDUCED_STATIC');
  assert.equal(reducedProjection.visualCue, 'STATIC_STATUS');

  const low = fixture({ lowPerf: true });
  const lowProjection = low.runtime.sync({ status: BATTLE_RECOVERY_STATUS.RECONNECTING });
  assert.equal(lowProjection.motionMode, 'LOW_PERF_STATIC');
  assert.equal(lowProjection.visualCue, 'STATIC_STATUS');
});

test('mount is idempotent for the same host and destroy does not assume input authority', () => {
  const document = new FakeDocument();
  const host = new FakeNode('section');
  const globalRef = { document, matchMedia: () => ({ matches: false }) };
  const lock = () => {};
  const first = mountBattleRecoveryRuntimeSurface(globalRef, { host, setLocalInputLocked: lock });
  const second = mountBattleRecoveryRuntimeSurface(globalRef, { host, setLocalInputLocked: lock });
  assert.equal(second, first);

  first.sync({ status: BATTLE_RECOVERY_STATUS.RECONNECTING });
  assert.equal(first.destroy(), true);
  assert.equal(first.destroy(), false);
  assert.throws(
    () => first.sync({ status: BATTLE_RECOVERY_STATUS.READY }),
    /BATTLE_RECOVERY_RUNTIME_DESTROYED/,
  );
});

test('invalid status is rejected by the existing recovery core', () => {
  const { runtime } = fixture();
  assert.throws(() => runtime.sync({ status: 'MAYBE' }), /status is not supported/);
});

test('contract remains presentation-only and caller-authoritative', () => {
  assert.equal(BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT.projectionCore, 'EXISTING_BATTLE_RECOVERY_PRESENTATION_CORE_ONLY');
  assert.equal(BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT.statusAuthority, 'CALLER');
  assert.equal(BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT.clearsLocalStage, false);
  assert.equal(BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT.rollsBackAuthoritativeCommit, false);
  assert.equal(BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT.triggersReconnect, false);
  assert.equal(BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT.gameStateWrite, false);
});
