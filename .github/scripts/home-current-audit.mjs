import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = 'browser/GAMEROAD.html';
const EXPECTED_GIT_BLOB = '40a5454a9b78b7534aaeb1d4e62206324b14dd45';
const EXPECTED_SIZE = 11794881;
const REPORT = 'audit/home-current-audit.json';
const htmlBuffer = await readFile(TARGET);
const html = htmlBuffer.toString('utf8');
const lines = html.split(/\r?\n/);

const gitHash = spawnSync('git', ['hash-object', TARGET], { encoding: 'utf8' }).stdout.trim();
if (gitHash !== EXPECTED_GIT_BLOB) throw new Error(`Git blob mismatch: ${gitHash}`);
if (htmlBuffer.byteLength !== EXPECTED_SIZE) throw new Error(`Byte size mismatch: ${htmlBuffer.byteLength}`);
const sha256 = createHash('sha256').update(htmlBuffer).digest('hex');

function lineNumberAt(index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (html.charCodeAt(i) === 10) line += 1;
  return line;
}

function sanitize(text) {
  return String(text).replace(/data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)/gi, (_full, mime, payload) => {
    const digest = createHash('sha256').update(payload).digest('hex');
    return `<DATA_URI mime=${mime} base64Chars=${payload.length} payloadSha256=${digest}>`;
  });
}

function compactLine(line) {
  const clean = sanitize(line);
  return clean.length <= 12000 ? clean : `${clean.slice(0, 12000)}…<TRUNCATED_AFTER_DATA_REDACTION originalChars=${clean.length}>`;
}

function contextForLine(lineNo, radius = 3) {
  const start = Math.max(1, lineNo - radius);
  const end = Math.min(lines.length, lineNo + radius);
  return {
    startLine: start,
    endLine: end,
    text: lines.slice(start - 1, end).map((line, i) => `${start + i}: ${compactLine(line)}`).join('\n'),
  };
}

function allOccurrences(token, radius = 3) {
  const out = [];
  let from = 0;
  while (true) {
    const index = html.indexOf(token, from);
    if (index < 0) break;
    const line = lineNumberAt(index);
    out.push({ index, line, ...contextForLine(line, radius) });
    from = index + Math.max(1, token.length);
  }
  return out;
}

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

function isExecutableScript(attrs) {
  const type = (attrValue(attrs, 'type') ?? '').trim().toLowerCase();
  if (!type) return true;
  return new Set(['text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript', 'module']).has(type);
}

const sectionMatches = [...html.matchAll(/<section\b([^>]*)>[\s\S]*?<\/section\s*>/gi)];
const homeSectionMatch = sectionMatches.find((m) => {
  const attrs = m[1] ?? '';
  const klass = attrValue(attrs, 'class') ?? '';
  const screen = attrValue(attrs, 'data-screen') ?? '';
  return screen === 'home' || /(?:^|\s)home(?:\s|$)/.test(klass);
});
if (!homeSectionMatch) throw new Error('Home section was not found');
const homeSection = homeSectionMatch[0];
const homeSectionStartLine = lineNumberAt(homeSectionMatch.index ?? 0);
const homeSectionEndLine = homeSectionStartLine + homeSection.split(/\r?\n/).length - 1;

const tokens = [
  'homeRuntime','renderHome','homeLivePartner','partnerInfo','homeMount','homeCharName',
  "mountChar('#homeRuntime'",'mountChar("#homeRuntime"','selectedPartnerId','playerCharacterId',
  'partner.naki','HOME_MOTION_DESTINATIONS','homeMotionOnRender','homeScene','homeCopy','homeLiveCard',
  'homeRail','homeCmd','homeDock','homeMotionField','homeMotionMediaSlot','homeFoot','codexHome',
  'codexHomeVisualLayer','codexHeroRuntime','data-go','navigateDetail'
];
const occurrences = Object.fromEntries(tokens.map((token) => [token, allOccurrences(token, 4)]));
const counts = Object.fromEntries(tokens.map((token) => [token, occurrences[token].length]));
const homeCounts = Object.fromEntries(tokens.map((token) => [token, homeSection.split(token).length - 1]));

const scriptMatches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const executableScripts = scriptMatches.filter((m) => isExecutableScript(m[1] ?? ''));
const syntaxResults = [];
const tempDir = await mkdtemp(join(tmpdir(), 'gameroad-home-audit-'));
try {
  for (let i = 0; i < executableScripts.length; i += 1) {
    const attrs = executableScripts[i][1] ?? '';
    const type = (attrValue(attrs, 'type') ?? '').trim().toLowerCase();
    const tempFile = join(tempDir, `script-${String(i + 1).padStart(3, '0')}${type === 'module' ? '.mjs' : '.js'}`);
    await writeFile(tempFile, executableScripts[i][2] ?? '', 'utf8');
    const check = spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
    syntaxResults.push({ index: i + 1, type: type || 'classic', ok: check.status === 0, error: check.status === 0 ? null : sanitize((check.stderr || check.stdout || '').trim().slice(0, 2000)) });
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

const scriptSrcs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const linkHrefs = [...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const fetchCalls = [...html.matchAll(/\bfetch\s*\(([^\n\r)]{0,400})\)/g)].map((m) => ({ line: lineNumberAt(m.index ?? 0), expression: sanitize(m[1].trim()) }));
const importCalls = [...html.matchAll(/\bimport\s*\(([^\n\r)]{0,400})\)/g)].map((m) => ({ line: lineNumberAt(m.index ?? 0), expression: sanitize(m[1].trim()) }));
const staticImports = [...html.matchAll(/\bimport\s+(?:[^'";]+\s+from\s+)?["']([^"']+)["']/g)].map((m) => ({ line: lineNumberAt(m.index ?? 0), source: m[1] }));
const dataGoTargets = [...new Set([...html.matchAll(/\bdata-go\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))].sort();
const homeIds = [...new Set([...homeSection.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]))].sort();
const homeClasses = [...new Set([...homeSection.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)].flatMap((m) => m[1].split(/\s+/).filter(Boolean)))].sort();

const classTokens = ['home','codexHome','homeScene','homeCopy','homeLiveCard','homeRail','homeCmd','homeDock','homeMotionField','homeMotionMediaSlot','homeFoot'];
const cssRelatedRules = [];
for (const styleMatch of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
  const styleText = styleMatch[1] ?? '';
  const styleBaseIndex = (styleMatch.index ?? 0) + styleMatch[0].indexOf(styleText);
  for (const rule of styleText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? '').trim();
    if (!classTokens.some((token) => selector.includes(`.${token}`))) continue;
    cssRelatedRules.push({
      line: lineNumberAt(styleBaseIndex + (rule.index ?? 0)),
      selector: sanitize(selector).slice(0, 2000),
      body: sanitize((rule[2] ?? '').trim()).slice(0, 12000),
    });
  }
}

const report = {
  source: {
    repository: 'rathersitooo-ux/GMR', branch: process.env.GITHUB_REF_NAME ?? null,
    auditedHead: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
    target: TARGET, gitBlob: gitHash, bytes: htmlBuffer.byteLength, sha256, lineCount: lines.length,
  },
  wholeFileAudit: {
    scannedFromByte: 0, scannedThroughByteExclusive: htmlBuffer.byteLength,
    scriptBlocks: scriptMatches.length, executableScriptBlocks: executableScripts.length,
    executableSyntaxPass: syntaxResults.every((x) => x.ok), syntaxResults,
  },
  homeSection: {
    startLine: homeSectionStartLine, endLine: homeSectionEndLine,
    textWithEmbeddedDataRedacted: sanitize(homeSection), ids: homeIds, classes: homeClasses, tokenCounts: homeCounts,
  },
  wholeFileTokenCounts: counts,
  allRelevantOccurrences: occurrences,
  cssRelatedRules,
  dependencies: { scriptSrcs, linkHrefs, fetchCalls, importCalls, staticImports },
  navigation: { dataGoTargets },
};

await mkdir('audit', { recursive: true });
await writeFile(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`HOME_CURRENT_AUDIT_OK blob=${gitHash} bytes=${htmlBuffer.byteLength} lines=${lines.length}`);
console.log(`tokens=${JSON.stringify(counts)}`);
console.log(`home=${homeSectionStartLine}-${homeSectionEndLine} cssRules=${cssRelatedRules.length} scripts=${scriptMatches.length}/${executableScripts.length}`);
