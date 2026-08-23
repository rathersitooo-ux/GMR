import test from "node:test";
import assert from "node:assert/strict";

import {
  createModeEndpointGraph,
  createTransitionDirector,
  planModeTransition,
} from "../../../browser/mode-transition-core.mjs";

function createGraph() {
  return createModeEndpointGraph({
    endpoints: [
      { id: "home", camera: { anchor: "home" } },
      { id: "cards", camera: { anchor: "cards" } },
      { id: "shop", camera: { anchor: "shop" } },
    ],
    edges: [
      {
        from: "home",
        to: "cards",
        cause: "forward",
        camera: { mode: "spline", path: "home-to-cards" },
        rig: { mode: "full", cue: "follow-card-bundle" },
        ui: { mode: "choreographed", reveal: "scene-first" },
        media: { generatedClip: "bridge-home-cards.webm" },
      },
      {
        from: "cards",
        to: "home",
        cause: "back",
        camera: { mode: "spline", path: "cards-to-home" },
        media: { generatedClip: "bridge-cards-home.webm" },
      },
      {
        from: "home",
        to: "shop",
        cause: "*",
        camera: { mode: "spline", path: "home-to-shop" },
      },
    ],
  });
}

test("director exposes PREPARE -> EXIT -> SWAP -> ENTER -> SETTLE -> IDLE", () => {
  const director = createTransitionDirector();
  const begin = director.begin({ from: "home", to: "cards", cause: "forward" });
  const generation = begin.generation;

  assert.equal(begin.phase, "PREPARE");
  assert.equal(director.advance(generation).state.phase, "EXIT");
  assert.equal(director.advance(generation).state.phase, "SWAP");
  assert.equal(director.advance(generation).state.phase, "ENTER");
  assert.equal(director.advance(generation).state.phase, "SETTLE");

  const settled = director.advance(generation);
  assert.equal(settled.accepted, true);
  assert.equal(settled.state.phase, "IDLE");
  assert.equal(settled.state.to, null);
});

test("rapid A -> B -> C invalidates stale completion from the older generation", () => {
  const director = createTransitionDirector();
  const first = director.begin({ from: "home", to: "cards", cause: "forward" });
  const second = director.interrupt({ from: "home", to: "shop", cause: "forward" });

  assert.ok(second.generation > first.generation);
  assert.equal(second.to, "shop");

  const stale = director.advance(first.generation);
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, "stale-generation");
  assert.equal(stale.state.to, "shop");
  assert.equal(stale.state.phase, "PREPARE");
});

test("Back is planned and executed as a new semantic transition generation", () => {
  const graph = createGraph();
  const director = createTransitionDirector();
  const forwardPlan = planModeTransition(graph, {
    from: "home",
    to: "cards",
    cause: "forward",
  });
  const forward = director.begin(forwardPlan);

  const backPlan = planModeTransition(graph, {
    from: "cards",
    to: "home",
    cause: "back",
  });
  const back = director.interrupt(backPlan);

  assert.ok(back.generation > forward.generation);
  assert.equal(back.from, "cards");
  assert.equal(back.to, "home");
  assert.equal(back.cause, "back");
  assert.equal(back.phase, "PREPARE");
});

test("reducedMotion and lowPerf preserve the destination while removing optional generated media", () => {
  const graph = createGraph();
  const full = planModeTransition(graph, {
    from: "home",
    to: "cards",
    cause: "forward",
  });
  const reduced = planModeTransition(graph, {
    from: "home",
    to: "cards",
    cause: "forward",
    reducedMotion: true,
  });
  const lowPerf = planModeTransition(graph, {
    from: "home",
    to: "cards",
    cause: "forward",
    lowPerf: true,
  });

  assert.equal(full.to, "cards");
  assert.equal(reduced.to, full.to);
  assert.equal(lowPerf.to, full.to);
  assert.equal(full.media.generatedClip, "bridge-home-cards.webm");
  assert.equal(reduced.media.generatedClip, null);
  assert.equal(lowPerf.media.generatedClip, null);
  assert.equal(reduced.camera.mode, "cut-or-short-blend");
  assert.equal(lowPerf.camera.mode, "lite");
});
