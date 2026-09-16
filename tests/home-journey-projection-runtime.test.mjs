import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  projectHomeJourneyStopFacts,
  snapshotHomeJourneyProjection,
} from '../browser/home-boot-runtime-mount.mjs';
import { projectGlobalJourney } from '../browser/global-journey-projection-core.mjs';

test('Home route adapter maps visible enabled/disabled routes to available/ahead only', () => {
  const stops = projectHomeJourneyStopFacts([
    { id: 'setup', label: 'Battle', visible: true, disabled: false },
    { id: 'cards', label: 'Cards', visible: true, disabled: true },
    { id: 'shop', label: 'Shop', visible: true, disabled: false },
  ]);

  assert.deepEqual(stops.map((stop) => stop.id), ['setup', 'cards', 'shop']);
  assert.deepEqual(stops.map((stop) => stop.label), ['対戦', 'カード', 'ショップ']);
  assert.deepEqual(stops.map((stop) => stop.state), ['available', 'ahead', 'available']);
  assert.equal(stops.some((stop) => stop.state === 'completed'), false);
});

test('Home route adapter ignores hidden routes and never treats selected/visited hints as completion', () => {
  const stops = projectHomeJourneyStopFacts([
    { id: 'partner', label: 'Partner', visible: false, disabled: false, selected: true, visited: true },
    { id: 'characters', label: 'Characters', visible: true, disabled: false, selected: true, visited: true },
  ]);

  assert.deepEqual(stops.map((stop) => stop.id), ['characters']);
  assert.equal(stops[0].label, 'キャラクター');
  assert.equal(stops[0].state, 'available');
  assert.equal(stops[0].authoritative, true);
  assert.equal(stops[0].visible, true);
  assert.equal(stops[0].sourceRef, 'home-route:characters:available');
});

test('Home route adapter output is accepted by the merged global journey semantic contract', () => {
  const stops = projectHomeJourneyStopFacts([
    { id: 'setup', visible: true, disabled: false },
    { id: 'cards', visible: true, disabled: true },
  ]);
  const projection = projectGlobalJourney({ journeyKey: 'home-visible-routes', stops });

  assert.deepEqual(projection.route.map((stop) => stop.id), ['setup', 'cards']);
  assert.deepEqual(projection.route.map((stop) => stop.state), ['available', 'ahead']);
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
});

test('Home route adapter fails closed on duplicate visible route identity', () => {
  assert.throws(() => projectHomeJourneyStopFacts([
    { id: 'cards', visible: true, disabled: false },
    { id: 'cards', visible: true, disabled: true },
  ]), /duplicate Home journey route id/);
});

test('Home route adapter validates its input and keeps unknown route labels caller-derived', () => {
  assert.throws(() => projectHomeJourneyStopFacts(null), /routes must be an array/);
  const stops = projectHomeJourneyStopFacts([
    { id: 'custom', label: '特別地点', visible: true, disabled: false },
  ]);
  assert.equal(stops[0].label, '特別地点');
  assert.equal(stops[0].state, 'available');
});

test('Home journey runtime remains noninteractive and stays off the DOMContentLoaded critical path', () => {
  const source = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /mountStudyRunFromCurrentBrowser\(\);[\s\S]*setTimeout\(\(\) => \{[\s\S]*mountHomeJourneyProjection\(\);[\s\S]*\}, 0\);/);
  assert.match(source, /homeJourneyRuntime\.observer\.observe\(home,/);
  assert.equal(source.includes('homeJourneyRuntime.observer.observe(document.body'), false);
  assert.equal(source.includes('queueMicrotask'), false);
  assert.match(source, /pointer-events:none/);
  assert.match(source, /completedStateInferred: false/);
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('sessionStorage'), false);

  const snapshot = snapshotHomeJourneyProjection();
  assert.equal(snapshot.presentationOnly, true);
  assert.equal(snapshot.interactive, false);
  assert.equal(snapshot.completedStateInferred, false);
});
