import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../browser/battle-current-player-ui-runtime.mjs', import.meta.url), 'utf8');
const marker = '@media(max-width:520px) and (orientation:portrait){';
const ownerRule = '.screen.battle[${ROOT_ATTR}="1"] [${ZONE_ATTR}="current-action"]{transform:translateY(6px)!important}';
const genericOwner = '[${ZONE_ATTR}="current-action"]{position:absolute!important;z-index:32!important;top:calc(var(--gr-ui-edge) + clamp(42px,9vh,72px))!important;left:var(--gr-ui-edge)!important;right:auto!important;bottom:auto!important;max-width:min(38vw,310px)!important;transform:none!important;';

const mediaIndex = source.indexOf(marker);
const ruleIndex = source.indexOf(ownerRule);
assert.ok(mediaIndex >= 0, 'portrait media owner must exist');
assert.ok(ruleIndex > mediaIndex, 'portrait current-action override must live after portrait media marker');
assert.ok(source.includes(genericOwner), 'generic layout owner remains transform:none!important');
assert.equal(source.match(/transform:translateY\(6px\)!important/g)?.length, 1, 'only the bounded portrait owner override is added');
console.log('battle-current-action-portrait-layout-owner: owner-layer override regression passed');
