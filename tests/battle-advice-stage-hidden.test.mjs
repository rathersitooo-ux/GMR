import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const runtime = await readFile(
  new URL('../browser/battle-current-player-ui-runtime.mjs', import.meta.url),
  'utf8',
);
const adviceMount = await readFile(
  new URL('../browser/partner-advice-runtime-mount.mjs', import.meta.url),
  'utf8',
);

test('battle hides the big advice partner standing image; the board token and advice text stay', () => {
  // The stage is created later by the R8 inline script, so the current-player
  // UI zone rule alone cannot hide it (no zone attribute yet). Hide by id here.
  assert.match(
    html,
    /#battleAdvicePartnerStage\{display:none!important\}/,
    'base CSS hides the advice partner stage during battle',
  );
  // Belt and braces: the current-player UI zone rule hides it too when tagged.
  // (The file holds the template placeholder ${ZONE_ATTR}; the injected style
  // resolves it to data-gr-current-ui-zone.)
  assert.match(
    runtime,
    /\[\$\{ZONE_ATTR\}="partner-visual"\]\{display:none!important\}/,
    'current-player UI zone hides the partner visual',
  );
  // The advice text panel itself is not hidden (created by its own mount).
  assert.ok(
    adviceMount.includes('partnerAdviceChatPresentation'),
    'advice text panel still exists',
  );
  // The controlled character on the board is not hidden.
  assert.ok(html.includes('battleRuntime'), 'board character mount still exists');
});
