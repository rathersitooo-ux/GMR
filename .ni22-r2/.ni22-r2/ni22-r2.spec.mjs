// Transient evidence-only discovery shim.
// The workflow generates ../ni22-r2.spec.mjs at runtime; Playwright's testDir is
// resolved from the config directory, so this nested file imports that generated spec.
import '../ni22-r2.spec.mjs';
