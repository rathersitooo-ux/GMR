import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GLOBAL_JOURNEY_SCHEMA,
  GLOBAL_JOURNEY_STOP_STATES,
  projectGlobalJourney,
  summarizeGlobalJourney,
} from '../browser/global-journey-projection-core.mjs';

test('global journey preserves caller order and projects only authoritative visible facts', () => {
  const projection = projectGlobalJourney({
    journeyKey: '2026-09-15',
    stops: [
      { id: 'battle', label: '対戦', state: 'completed', authoritative: true, visible: true, sourceRef: 'battle-result:match-1' },
      { id: 'fossil', label: '発掘', state: 'available', authoritative: true, visible: true, sourceRef: 'fossil:current' },
      { id: 'rhythm', label: '音楽', state: 'ahead', authoritative: true, visible: true, sourceRef: 'rhythm:current' },
      { id: 'hidden', label: '未公開', state: 'available', authoritative: true, visible: false, sourceRef: 'hidden:current' },
      { id: 'guess', label: '推測', state: 'completed', authoritative: false, visible: true, sourceRef: 'guess' },
    ],
  });

  assert.equal(projection.schema, GLOBAL_JOURNEY_SCHEMA);
  assert.deepEqual(projection.route.map((stop) => stop.id), ['battle', 'fossil', 'rhythm']);
  assert.deepEqual(projection.route.map((stop) => stop.state), ['completed', 'available', 'ahead']);
  assert.equal(projection.completedStopCount, 1);
  assert.equal(projection.availableStopCount, 1);
  assert.equal(projection.aheadStopCount, 1);
});

test('global journey never invents completion from a mode name or partial activity hint', () => {
  const projection = projectGlobalJourney({
    journeyKey: 'today',
    stops: [
      { id: 'battle', label: '対戦', authoritative: true, visible: true, sourceRef: 'battle:open' },
      { id: 'gacha', label: 'ガチャ', state: 'completed', authoritative: true, visible: true },
      { id: 'cards', label: 'カード', state: 'visited', authoritative: true, visible: true, sourceRef: 'cards:visited' },
    ],
  });

  assert.deepEqual(projection.route, []);
  assert.equal(projection.completedStopCount, 0);
});

test('global journey does not reorder gacha, battle, or any other mode', () => {
  const projection = projectGlobalJourney({
    journeyKey: 'today',
    stops: [
      { id: 'shop', label: 'ショップ', state: 'available', authoritative: true, visible: true, sourceRef: 'shop' },
      { id: 'gacha', label: 'ガチャ', state: 'completed', authoritative: true, visible: true, sourceRef: 'gacha' },
      { id: 'battle', label: '対戦', state: 'available', authoritative: true, visible: true, sourceRef: 'battle' },
    ],
  });

  assert.deepEqual(projection.route.map((stop) => stop.id), ['shop', 'gacha', 'battle']);
});

test('global journey exposes no navigation, gameplay, save, reward, currency, Daily Tour, or Story authority', () => {
  const projection = projectGlobalJourney({
    journeyKey: 'today',
    stops: [
      { id: 'battle', label: '対戦', state: 'available', authoritative: true, visible: true, sourceRef: 'battle' },
    ],
  });

  assert.equal(projection.presentationOnly, true);
  assert.equal(projection.interactive, false);
  assert.equal(projection.requiresHomeTransit, false);
  assert.equal(projection.createsNavigationAuthority, false);
  assert.equal(projection.createsGameplayAuthority, false);
  assert.equal(projection.createsSaveAuthority, false);
  assert.equal(projection.createsRewardAuthority, false);
  assert.equal(projection.createsCurrency, false);
  assert.equal(projection.mutatesDailyTour, false);
  assert.equal(projection.mutatesStory, false);
  assert.equal(projection.route[0].interactive, false);
  assert.equal(projection.route[0].navigationAuthority, false);
});

test('global journey rejects duplicate authoritative stop identities', () => {
  assert.throws(() => projectGlobalJourney({
    journeyKey: 'today',
    stops: [
      { id: 'battle', label: '対戦', state: 'available', authoritative: true, visible: true, sourceRef: 'battle:1' },
      { id: 'battle', label: '対戦', state: 'completed', authoritative: true, visible: true, sourceRef: 'battle:2' },
    ],
  }), /duplicate journey stop id/);
});

test('global journey summary is derived from explicit stop states only', () => {
  const projection = projectGlobalJourney({
    journeyKey: 'today',
    stops: [
      { id: 'battle', label: '対戦', state: GLOBAL_JOURNEY_STOP_STATES.COMPLETED, authoritative: true, visible: true, sourceRef: 'battle' },
      { id: 'fossil', label: '発掘', state: GLOBAL_JOURNEY_STOP_STATES.COMPLETED, authoritative: true, visible: true, sourceRef: 'fossil' },
    ],
  });
  const summary = summarizeGlobalJourney(projection);
  assert.deepEqual(summary, {
    journeyKey: 'today',
    stopCount: 2,
    completedStopCount: 2,
    availableStopCount: 0,
    aheadStopCount: 0,
    settled: true,
    presentationOnly: true,
  });
});
