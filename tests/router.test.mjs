import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHybridRunner,
  decideRoute,
  probeOnDeviceCapability,
  routeReasonText
} from '../js/core/router.mjs';

test('decision table routes every probe state deterministically', () => {
  assert.equal(decideRoute({ state: 'available' }).leg, 'on-device');
  assert.equal(decideRoute({ state: 'available' }).reason, 'prompt-api-available');
  assert.equal(decideRoute({ state: 'absent' }).leg, 'cloud');
  assert.equal(decideRoute({ state: 'absent' }).reason, 'prompt-api-absent');
  assert.equal(decideRoute({ state: 'error' }).leg, 'cloud');
  assert.equal(decideRoute({ state: 'error' }).degraded, true);
  assert.equal(decideRoute({ state: 'missing-availability' }).reason, 'prompt-api-missing-availability');
  assert.equal(decideRoute({ state: 'downloading' }).reason, 'model-downloading');
  assert.equal(decideRoute({ state: 'downloadable' }).reason, 'model-downloadable');
  assert.equal(decideRoute({ state: 'unavailable' }).reason, 'model-unavailable');
  assert.equal(decideRoute({ state: 'strange' }).reason, 'probe-degraded');
  assert.equal(decideRoute({ state: 'strange' }).degraded, true);
});

test('forced legs override the probe result', () => {
  assert.equal(decideRoute({ state: 'absent' }, { forceLeg: 'on-device' }).leg, 'on-device');
  assert.equal(decideRoute({ state: 'absent' }, { forceLeg: 'on-device' }).reason, 'forced-on-device');
  assert.equal(decideRoute({ state: 'available' }, { forceLeg: 'cloud' }).leg, 'cloud');
  assert.equal(decideRoute({ state: 'available' }, { forceLeg: 'cloud' }).reason, 'forced-cloud');
});

test('capability probe handles absent, present, throwing, and degraded LanguageModel implementations', async () => {
  assert.deepEqual(await probeOnDeviceCapability({}), { state: 'absent', detail: 'LanguageModel is undefined' });
  assert.equal((await probeOnDeviceCapability({ LanguageModel: { availability: async () => 'available' } })).state, 'available');
  assert.equal((await probeOnDeviceCapability({ LanguageModel: {} })).state, 'missing-availability');
  assert.equal((await probeOnDeviceCapability({ LanguageModel: { availability: async () => { throw new Error('denied'); } } })).state, 'error');
  assert.equal((await probeOnDeviceCapability({ LanguageModel: { availability: async () => 'unexpected' } })).state, 'degraded');
});

test('hybrid runner executes the selected leg and reports latency', async () => {
  const calls = [];
  let tick = 0;
  const run = createHybridRunner({
    probe: async () => ({ state: 'available', detail: 'test' }),
    onDevice: async (input) => { calls.push(['device', input]); return { ok: 'device' }; },
    cloud: async (input) => { calls.push(['cloud', input]); return { ok: 'cloud' }; },
    now: () => { tick += 12.34; return tick; }
  });
  const result = await run({ notes: 'x' });
  assert.deepEqual(calls, [['device', { notes: 'x' }]]);
  assert.equal(result.route.leg, 'on-device');
  assert.equal(result.route.requestedLeg, 'on-device');
  assert.equal(result.route.latencyMs, 12.3);
  assert.equal(result.route.fallback, false);
});

test('hybrid runner chooses cloud when the probe throws or stalls', async () => {
  const calls = [];
  const throwingRun = createHybridRunner({
    probe: async () => { throw new Error('probe exploded'); },
    onDevice: async () => { calls.push('device'); return 'device'; },
    cloud: async () => { calls.push('cloud'); return 'cloud'; },
    now: () => 1
  });
  const thrown = await throwingRun({ notes: 'x' });
  assert.deepEqual(calls, ['cloud']);
  assert.equal(thrown.route.leg, 'cloud');
  assert.equal(thrown.route.reason, 'prompt-api-error');
  assert.equal(thrown.route.probeDetail, 'probe exploded');

  const stalledRun = createHybridRunner({
    probe: () => new Promise(() => {}),
    onDevice: async () => 'device',
    cloud: async () => 'cloud',
    now: () => 1,
    probeTimeoutMs: 5
  });
  const stalled = await stalledRun({ notes: 'x' });
  assert.equal(stalled.route.leg, 'cloud');
  assert.equal(stalled.route.probeDetail, 'capability probe timed out after 5 ms');
});

test('hybrid runner falls back to cloud if the on-device execution errors', async () => {
  const calls = [];
  const run = createHybridRunner({
    probe: async () => ({ state: 'available' }),
    onDevice: async () => { calls.push('device'); throw new Error('nano failed'); },
    cloud: async () => { calls.push('cloud'); return { ok: true }; },
    now: (() => { let t = 0; return () => (t += 5); })
  });
  const result = await run({ notes: 'x' });
  assert.deepEqual(calls, ['device', 'cloud']);
  assert.equal(result.route.leg, 'cloud');
  assert.equal(result.route.reason, 'on-device-error');
  assert.equal(result.route.error, 'nano failed');
  assert.equal(result.route.fallback, true);
});

test('runner validates its legs and reason text is human readable', () => {
  assert.throws(() => createHybridRunner({ cloud: async () => null }), /onDevice/);
  assert.throws(() => createHybridRunner({ onDevice: async () => null }), /cloud/);
  assert.equal(routeReasonText('prompt-api-absent'), 'Chrome Prompt API is not exposed in this browser');
  assert.equal(routeReasonText('unknown-reason'), 'unknown-reason');
});
