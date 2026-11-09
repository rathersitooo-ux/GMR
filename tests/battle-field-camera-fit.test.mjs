import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

// Item 15 (purple gate row clipped on phones / SCORE visibility):
// the live follow camera must widen its distance on narrow viewports so the
// horizontal field of view matches the standard 16:9 framing. Before this,
// portrait used a fixed distance of 12 and the gate row was cut at both ends.
test('live follow camera widens distance on narrow viewports (item 15)', () => {
  const start = html.indexOf('function fieldCamera(viewer)');
  assert.ok(start >= 0);
  const fn = html.slice(start, start + 3000);
  assert.match(
    fn,
    /followDistance=\(profile\.kind==='short-landscape'\?15:17\)\*Math\.max\(1,\(16\/9\)\/Math\.max\(1\.2,Number\(profile\.aspect\)\|\|\(16\/9\)\)\)/,
  );
  assert.doesNotMatch(fn, /followDistance=profile\.kind==='portrait'\?12:/);
});

test('follow distance math keeps desktop framing and fits phone widths', () => {
  const fit = (kind, aspect) =>
    (kind === 'short-landscape' ? 15 : 17) * Math.max(1, (16 / 9) / Math.max(1.2, aspect || 16 / 9));
  // standard 1280x720 framing is unchanged
  assert.ok(Math.abs(fit('standard', 1280 / 720) - 17) < 0.01);
  // portrait profile (aspect clamped to 1.2) widens to about 25
  assert.ok(Math.abs(fit('portrait', 1.2) - 25.2) < 0.1);
  // narrow landscape board (516x390 map, aspect about 1.32) widens past 22
  assert.ok(fit('standard', 516 / 390) > 22);
  // short-landscape keeps its base distance
  assert.equal(fit('short-landscape', 2.16), 15);
});
