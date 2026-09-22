import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

const hudStart = html.indexOf('<div class="publicTurnHud" id="publicTurnHud"');
const hudEnd = html.indexOf('<div class="board" id="board">', hudStart);
assert.ok(hudStart >= 0 && hudEnd > hudStart, 'live public HUD must exist');
const hud = html.slice(hudStart, hudEnd);
assert.match(hud, /id="publicPlayerStrip"/);
assert.doesNotMatch(hud, /id="royalUsageStrip"/, 'Royal counts must not occupy the persistent peer HUD');

const detailsStart = html.indexOf('<details class="battleLogDetails" id="battleLogDetails">');
const detailsEnd = html.indexOf('</details>', detailsStart);
assert.ok(detailsStart >= 0 && detailsEnd > detailsStart, 'existing Battle log/details surface must exist');
const details = html.slice(detailsStart, detailsEnd);
assert.match(details, /<summary>対戦ログ<\/summary>/);
assert.match(details, /id="royalUsageStrip"/, 'Royal public counts remain available in Battle details');
assert.match(details, /id="battleLog"/);

assert.match(html, /\.battleLogDetails:not\(\[open\]\) \.royalUsageStrip\{display:none!important\}/);
assert.match(html, /function hudPublicPeers\(m\).*return m\.players\.filter\(p=>p\.id!==viewerId\)/s);
assert.match(html, /royalRoot\.replaceChildren\(\).*publicRoyalUsed\(p\)/s);
assert.match(html, /host\.textContent=m\.log\.join\("\\n"\)/);

console.log('battle-public-hud-detail-hierarchy: PASS');
