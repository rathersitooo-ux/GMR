import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
const gate='.github/workflows/gameroad-required-gate.yml';
let text=readFileSync(gate,'utf8');
const oldClass=[
'              browser/battle-replay-core.mjs|\\',
'              tests/battle-replay-core.test.mjs)',
'                replay=true'
].join('\n');
const newClass=[
'              browser/battle-replay-core.mjs|\\',
'              tests/battle-replay-core.test.mjs|\\',
'              browser/battle-replay-live-adapter.mjs|\\',
'              tests/battle-replay-live-adapter.test.mjs)',
'                replay=true'
].join('\n');
if(text.split(oldClass).length-1!==1)throw new Error('classification anchor not unique');
text=text.replace(oldClass,newClass);
const oldTest='run: node --test tests/battle-replay-core.test.mjs';
const newTest='run: node --test tests/battle-replay-core.test.mjs tests/battle-replay-live-adapter.test.mjs';
if(text.split(oldTest).length-1!==1)throw new Error('test anchor not unique');
text=text.replace(oldTest,newTest);
writeFileSync('evidence/gameroad-required-gate-r4-candidate.yml',text,'utf8');
