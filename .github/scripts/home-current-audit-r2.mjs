import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = 'browser/GAMEROAD.html';
const EXPECTED_GIT_BLOB = '7bff1a088b7c756edf17a3f1c7e2918db93ac390';
const EXPECTED_SIZE = 11816471;
const REPORT = 'audit/home-current-audit-r2.json';
const buf = await readFile(TARGET);
const html = buf.toString('utf8');
const lines = html.split(/\r?\n/);
const gitHash = spawnSync('git', ['hash-object', TARGET], { encoding:'utf8' }).stdout.trim();
if (gitHash !== EXPECTED_GIT_BLOB) throw new Error(`Git blob mismatch ${gitHash}`);
if (buf.byteLength !== EXPECTED_SIZE) throw new Error(`Byte size mismatch ${buf.byteLength}`);
const sha256 = createHash('sha256').update(buf).digest('hex');
const digest = s => createHash('sha256').update(String(s)).digest('hex');
function lineAt(index){let n=1;for(let i=0;i<index;i++) if(html.charCodeAt(i)===10)n++;return n;}
function compact(s,n=500){s=String(s).replace(/data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)/gi,(_m,mime,p)=>`<DATA_URI mime=${mime} chars=${p.length} sha256=${digest(p)}>`);return s.length<=n?s:s.slice(0,n)+`…<${s.length}>`;}
function context(line,r=2){const a=Math.max(1,line-r),b=Math.min(lines.length,line+r);return {startLine:a,endLine:b,text:lines.slice(a-1,b).map((x,i)=>`${a+i}: ${compact(x)}`).join('\n')};}
function occurrences(token){const out=[];let from=0;for(;;){const i=html.indexOf(token,from);if(i<0)break;const line=lineAt(i);out.push({index:i,line,...context(line)});from=i+Math.max(1,token.length);}return out;}
function attr(attrs,name){return attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1] ?? null;}
function executable(attrs){const t=(attr(attrs,'type')??'').trim().toLowerCase();return !t || ['text/javascript','application/javascript','text/ecmascript','application/ecmascript','module'].includes(t);}

const sections=[...html.matchAll(/<section\b([^>]*)>[\s\S]*?<\/section\s*>/gi)];
const hm=sections.find(m=>(attr(m[1]??'','data-screen')??'')==='home' || /(?:^|\s)home(?:\s|$)/.test(attr(m[1]??'','class')??''));
if(!hm) throw new Error('Home section not found');
const home=hm[0], homeStart=lineAt(hm.index??0), homeEnd=homeStart+home.split(/\r?\n/).length-1;
const tokens=['homeRuntime','renderHome','homeLivePartner','partnerInfo','homeMount','homeCharName',"mountChar('#homeRuntime'",'selectedPartnerId','playerCharacterId','partner.naki','HOME_MOTION_DESTINATIONS','homeMotionOnRender','homeScene','homeCopy','homeLiveCard','homeRail','homeCmd','homeDock','homeMotionField','homeMotionMediaSlot','homeFoot','codexHome','codexHomeVisualLayer','codexHeroRuntime','data-go','navigateDetail','publicPartner'];
const all=Object.fromEntries(tokens.map(t=>[t,occurrences(t)]));
const counts=Object.fromEntries(tokens.map(t=>[t,all[t].length]));
const homeCounts=Object.fromEntries(tokens.map(t=>[t,home.split(t).length-1]));

const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
const exec=scripts.filter(m=>executable(m[1]??''));
const syntax=[];const dir=await mkdtemp(join(tmpdir(),'home-r2-'));
try{for(let i=0;i<exec.length;i++){const type=(attr(exec[i][1]??'','type')??'').trim().toLowerCase();const p=join(dir,`s${i}${type==='module'?'.mjs':'.js'}`);await writeFile(p,exec[i][2]??'','utf8');const c=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});syntax.push({index:i+1,type:type||'classic',ok:c.status===0,error:c.status===0?null:compact(c.stderr||c.stdout||'',1200)});}}finally{await rm(dir,{recursive:true,force:true});}
if(!syntax.every(x=>x.ok)) throw new Error('Executable script syntax failure');

const css=[];for(const sm of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)){const s=sm[1]??'', base=(sm.index??0)+sm[0].indexOf(s);for(const r of s.matchAll(/([^{}]+)\{([^{}]*)\}/g)){const sel=(r[1]??'').trim();if(!tokens.some(t=>sel.includes(`.${t}`)) && !/\.home\b/.test(sel))continue;css.push({line:lineAt(base+(r.index??0)),selector:compact(sel,1200),body:compact((r[2]??'').trim(),2400)});}}
const scriptSrcs=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
const linkHrefs=[...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
const fetchCalls=[...html.matchAll(/\bfetch\s*\(([^\n\r)]{0,500})\)/g)].map(m=>({line:lineAt(m.index??0),expression:compact(m[1].trim())}));
const importCalls=[...html.matchAll(/\bimport\s*\(([^\n\r)]{0,500})\)/g)].map(m=>({line:lineAt(m.index??0),expression:compact(m[1].trim())}));
const dataGo=[...new Set([...html.matchAll(/\bdata-go\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]))].sort();
const homeIds=[...new Set([...home.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]))].sort();
const homeClasses=[...new Set([...home.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)].flatMap(m=>m[1].split(/\s+/).filter(Boolean)))].sort();
const stateDecl=html.match(/const state=\{[^\n]+\};/)?.[0]??null;
const roster=html.match(/const PROD_CHARS=\[[\s\S]*?\];/)?.[0]??null;
const saveLoad=html.match(/function save\(\)\{[^\n]+\}\nfunction load\(\)\{[^\n]+\}/)?.[0]??null;
if(!stateDecl||!roster||!saveLoad) throw new Error('Protected state/roster/save regions not found');
const report={source:{repository:'rathersitooo-ux/GMR',branch:process.env.GITHUB_REF_NAME??null,head:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),target:TARGET,gitBlob:gitHash,bytes:buf.byteLength,sha256,lineCount:lines.length,scannedFromByte:0,scannedThroughByteExclusive:buf.byteLength},wholeFile:{scriptBlocks:scripts.length,executableScriptBlocks:exec.length,syntaxPass:true,syntax},home:{startLine:homeStart,endLine:homeEnd,sha256:digest(home),text:compact(home,20000),ids:homeIds,classes:homeClasses,tokenCounts:homeCounts},wholeFileTokenCounts:counts,allRelevantOccurrences:all,cssRelatedRules:css,dependencies:{scriptSrcs,linkHrefs,fetchCalls,importCalls},navigation:{dataGoTargets:dataGo},protected:{stateSha256:digest(stateDecl),rosterSha256:digest(roster),saveLoadSha256:digest(saveLoad)}};
await mkdir('audit',{recursive:true});await writeFile(REPORT,JSON.stringify(report,null,2)+'\n','utf8');
console.log(`HOME_R2_AUDIT_OK blob=${gitHash} bytes=${buf.byteLength} lines=${lines.length} scripts=${scripts.length}/${exec.length} css=${css.length}`);console.log(JSON.stringify(counts));