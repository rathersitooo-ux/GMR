// Stable conventional-test import seam for the Home journey adapter.
// The live browser consumer remains browser/home-boot-runtime-mount.mjs, which is already
// part of the public Home artifact train. This file creates no second runtime or authority.
export {
  projectHomeJourneyStopFacts,
  snapshotHomeJourneyProjection,
} from './home-boot-runtime-mount.mjs';
