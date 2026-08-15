import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const target='browser/GAMEROAD.html', expected='40a5454a9b78b7534aaeb1d4e62206324b14dd45';
const buf=await readFile(target),html=buf.toString('utf8'),lines=html.split(/\r?\n/),blob=spawnSync('git',['hash-object',target],{encoding:'utf8'}).stdout.trim();
if(blob!==expected||buf.byteLength!==11794881)throw Error(`identity mismatch ${blob}/${buf.byteLength}`);
const slice=(a,b)=>lines.slice(a-1,b).map((x,i)=>`${a+i}: ${x.replace(/data:[^;"']+;base64,[A-Za-z0-9+/=]+/g,'<DATA_URI_REDACTED>')}`).join('\n');
const text=[`blob=${blob} bytes=${buf.byteLength}`,`\n===== renderHome and adjacent state/motion =====\n${slice(1048,1100)}`,`\n===== visual shell QA =====\n${slice(1398,1403)}`,`\n===== battle dock partner =====\n${slice(2408,2430)}`].join('\n');
await mkdir('audit',{recursive:true});await writeFile('audit/home-patch-context.txt',text,'utf8');console.log('HOME_PATCH_CONTEXT_OK');
