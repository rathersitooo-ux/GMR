import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const TARGET='browser/GAMEROAD.html';
const EXPECTED='40a5454a9b78b7534aaeb1d4e62206324b14dd45';
const buf=await readFile(TARGET);const html=buf.toString('utf8');
const blob=spawnSync('git',['hash-object',TARGET],{encoding:'utf8'}).stdout.trim();
if(blob!==EXPECTED||buf.byteLength!==11794881)throw Error(`identity mismatch ${blob}/${buf.byteLength}`);
const lines=html.split(/\r?\n/);
function lineAt(idx){let n=1;for(let i=0;i<idx;i++)if(html.charCodeAt(i)===10)n++;return n}
const rows=[];
for(const sm of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)){
 const css=sm[1]||'',base=(sm.index||0)+sm[0].indexOf(css);
 for(const r of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const sel=(r[1]||'').trim(),body=(r[2]||'').trim();
  if(/codexHome|codexHeroRuntime|codexPartnerChip|codexBattleCta|codexCenter|codexBattleCrest|codexRankLabel/.test(sel)||/^(?:html,body|body|\.app|\.top|\.pill|:root)$/.test(sel))rows.push({line:lineAt(base+(r.index||0)),selector:sel,body});
 }
}
const homeSection=[...html.matchAll(/<section\b([^>]*)>[\s\S]*?<\/section\s*>/gi)].find(m=>/data-screen=["']home["']/.test(m[0]))?.[0]||'';
const legacy=['homeScene','homeCopy','homeLiveCard','homeRail','homeCmd','homeDock','homeMotionField','homeMotionMediaSlot','homeFoot'];
const report={blob,bytes:buf.byteLength,rows,liveHomeLegacyDom:Object.fromEntries(legacy.map(x=>[x,new RegExp(`class=["'][^"']*(?:^|\\s)${x}(?:\\s|$)`,`i`).test(homeSection)]))};
await mkdir('audit',{recursive:true});await writeFile('audit/home-codex-css-audit.json',JSON.stringify(report,null,2)+'\n','utf8');
console.log('HOME_CODEX_CSS_AUDIT_OK',JSON.stringify({blob,bytes:buf.byteLength,rowCount:rows.length,legacy:report.liveHomeLegacyDom}));
