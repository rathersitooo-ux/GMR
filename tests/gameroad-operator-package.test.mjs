import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGameroadOperatorPackage } from '../tools/gameroad-operator-package.mjs';

test('GAMEROAD Operator package is internally consistent', () => {
  const result = validateGameroadOperatorPackage();
  assert.equal(result.ok, true, result.errors.join('\n'));
});
