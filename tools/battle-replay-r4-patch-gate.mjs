import { readFileSync, writeFileSync } from 'node:fs';

const path = '.github/workflows/gameroad-required-gate.yml';
let text = readFileSync(path, 'utf8');

const classificationOld = [
  '              browser/battle-replay-core.mjs|\\',
  '              tests/battle-replay-core.test.mjs)',
  '                replay=true'
].join('\n');
const classificationNew = [
  '              browser/battle-replay-core.mjs|\\',
  '              tests/battle-replay-core.test.mjs|\\',
  '              browser/battle-replay-live-adapter.mjs|\\',
  '              tests/battle-replay-live-adapter.test.mjs)',
  '                replay=true'
].join('\n');
if (text.split(classificationOld).length - 1 !== 1) {
  throw new Error('replay classification anchor is not unique');
}
text = text.replace(classificationOld, classificationNew);

const testOld = 'run: node --test tests/battle-replay-core.test.mjs';
const testNew = 'run: node --test tests/battle-replay-core.test.mjs tests/battle-replay-live-adapter.test.mjs';
if (text.split(testOld).length - 1 !== 1) {
  throw new Error('replay test command anchor is not unique');
}
text = text.replace(testOld, testNew);
writeFileSync(path, text, 'utf8');
