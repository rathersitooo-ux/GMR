import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

function between(start, end) {
  const i = html.indexOf(start);
  assert.notEqual(i, -1, `missing start anchor: ${start}`);
  const j = html.indexOf(end, i + start.length);
  assert.notEqual(j, -1, `missing end anchor: ${end}`);
  return html.slice(i, j);
}

test('新フィールドは既存フィールドとは別に選択でき、対戦へ固定される', () => {
  assert.match(html, /data-field=["']FIELD-01["'][^>]*>草原<\/button>/);
  assert.match(html, /data-field=["']FIELD-10["'][^>]*>新フィールド<\/button>/);
  assert.match(html, /setupField:normalizeBattleFieldId\(state\.setupField\)/);
  assert.match(html, /state\.match=\{id:'M'\+Date\.now\(\),mode:snapshot\.setup\.mode,contentId:snapshot\.setup\.content,fieldId,round:1/);
  assert.match(html, /for\(const p of ps\)p\.position=battleFieldStartPosition\(fieldId\)/);
});

test('Gateはマス・node・stopではなく境界線だけである', () => {
  assert.match(html, /gateRole:'BOUNDARY_EDGE_ONLY'/);
  assert.match(html, /const SYMMETRIC_FIELD_GATE_BOUNDARY_Z=-3\.1/);
  assert.doesNotMatch(html, /SYMMETRIC_FIELD_(?:GATE_NODE|GATE_CELL|GATE_STOP)/);
  const nodeBlock = between('const SYMMETRIC_FIELD_NODE_IDS=Object.freeze([', 'const SYMMETRIC_FIELD_EDGES=Object.freeze([');
  assert.doesNotMatch(nodeBlock, /GATE/i);
});

test('共有フィールドは左右対称で、中央上だけShieldへ直結しない', () => {
  const ports = between('const SYMMETRIC_FIELD_PORTS=Object.freeze({', 'const SYMMETRIC_FIELD_START_ID=');
  assert.doesNotMatch(ports, /'F:U:4'/);
  assert.match(ports, /'P1:L':'F:U:0'/);
  assert.match(ports, /'P4:R':'F:U:8'/);
  assert.match(ports, /'P2:R':'F:U:3'/);
  assert.match(ports, /'P3:L':'F:U:5'/);
  assert.match(html, /const SYMMETRIC_FIELD_START_ID='F:D:4'/);
  assert.match(html, /const SYMMETRIC_FIELD_GOAL_VISUAL_COLUMNS=9/);
});

test('新フィールドの共有ノードは既存Shield・進行列authorityへ直接接続する', () => {
  assert.match(html, /if\(id\.startsWith\('F:'\)\)\{[\s\S]*?symmetricFieldNeighbors\(id\)[\s\S]*?centerPort\(p\.id,l,viewer\)===id/);
  assert.match(html, /if\(symmetricFieldActive\(\)\)return SYMMETRIC_FIELD_PORTS\[`\$\{owner\}:\$\{lane\}`\]\|\|null/);
  assert.match(html, /for\(let depth=1;depth<=7;depth\+\+\)/);
});
