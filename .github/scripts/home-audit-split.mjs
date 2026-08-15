import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const TARGET = 'browser/GAMEROAD.html';
const EXPECTED_BLOB = '40a5454a9b78b7534aaeb1d4e62206324b14dd45';
const EXPECTED_SIZE = 11794881;
const buf = await readFile(TARGET);
const html = buf.toString('utf8');
const lines = html.split(/\r?\n/);
const blob = spawnSync('git', ['hash-object', TARGET], { encoding: 'utf8' }).stdout.trim();
if (blob !== EXPECTED_BLOB || buf.byteLength !== EXPECTED_SIZE) throw new Error(`current Browser identity mismatch ${blob}/${buf.byteLength}`);

function lineNo(index) {
  let n = 1;
  for (let i = 0; i < index; i += 1) if (html.charCodeAt(i) === 10) n += 1;
  return n;
}
function redact(s) {
  return String(s).replace(/data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)/gi, (_m, mime, p) => `<DATA_URI ${mime} chars=${p.length} sha256=${createHash('sha256').update(p).digest('hex')}>`);
}
function ctx(n, radius = 8) {
  const a = Math.max(1, n - radius), b = Math.min(lines.length, n + radius);
  return lines.slice(a - 1, b).map((x, i) => `${a + i}: ${redact(x).slice(0, 8000)}`).join('\n');
}
function occurrences(token) {
  const out = [];
  let pos = 0;
  while ((pos = html.indexOf(token, pos)) >= 0) {
    out.push({ index: pos, line: lineNo(pos) });
    pos += Math.max(1, token.length);
  }
  return out;
}

const jsTokens = [
  'renderHome','homeRuntime','homeLivePartner','partnerInfo','homeMount','homeCharName',
  "mountChar('#homeRuntime'",'selectedPartnerId','playerCharacterId','partner.naki',
  'HOME_MOTION_DESTINATIONS','homeMotionOnRender','navigateDetail','publicPartner',
  'battlePartnerName','codexHomeVisualLayer','codexHeroRuntime'
];
let js = `sourceBlob=${blob}\nbytes=${buf.byteLength}\nsha256=${createHash('sha256').update(buf).digest('hex')}\nlines=${lines.length}\n`;
for (const token of jsTokens) {
  const occ = occurrences(token);
  js += `\n===== TOKEN ${token} COUNT ${occ.length} =====\n`;
  for (const item of occ) js += `\n--- ${token} line ${item.line} index ${item.index} ---\n${ctx(item.line)}\n`;
}

const cssTokens = ['.homeScene','.homeCopy','.homeLiveCard','.homeRail','.homeCmd','.homeDock','.homeMotionField','.homeMotionMediaSlot','.homeFoot','.codexHome','.codexHomeVisualLayer','.codexHeroRuntime'];
let css = `sourceBlob=${blob}\n`;
for (const token of cssTokens) {
  const occ = occurrences(token);
  css += `\n===== CSS TOKEN ${token} COUNT ${occ.length} =====\n`;
  for (const item of occ) css += `\n--- ${token} line ${item.line} ---\n${ctx(item.line, 5)}\n`;
}

const deps = {
  sourceBlob: blob,
  bytes: buf.byteLength,
  scriptSrcs: [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]),
  linkHrefs: [...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]),
  fetchCalls: [...html.matchAll(/\bfetch\s*\(([^\n\r)]{0,400})\)/g)].map(m => ({ line: lineNo(m.index ?? 0), expression: redact(m[1].trim()) })),
  dynamicImports: [...html.matchAll(/\bimport\s*\(([^\n\r)]{0,400})\)/g)].map(m => ({ line: lineNo(m.index ?? 0), expression: redact(m[1].trim()) })),
  dataGoTargets: [...new Set([...html.matchAll(/\bdata-go\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]))].sort(),
};

await mkdir('audit', { recursive: true });
await writeFile('audit/home-current-js-context.txt', js, 'utf8');
await writeFile('audit/home-current-css-context.txt', css, 'utf8');
await writeFile('audit/home-current-dependencies.json', JSON.stringify(deps, null, 2) + '\n', 'utf8');
console.log('HOME_AUDIT_SPLIT_OK', JSON.stringify({ blob, bytes: buf.byteLength, jsChars: js.length, cssChars: css.length, deps }));
