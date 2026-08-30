import test from 'node:test';
import assert from 'node:assert/strict';
import { probeSaasunaLiveConvaiPublic } from '../tools/saasuna-live-convai-public-probe.mjs';

test('public Saasuna conversation observes a live Convai provider response', async () => {
  const result = await probeSaasunaLiveConvaiPublic();
  console.log(`SAASUNA_LIVE_CONVAI_PROBE_RESULT=${JSON.stringify(result)}`);
  assert.equal(
    result.liveProviderObserved,
    true,
    `live Convai provider response was not observed: ${JSON.stringify(result)}`,
  );
});
