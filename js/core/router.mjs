export const ON_DEVICE = 'on-device';
export const CLOUD = 'cloud';

export function routeReasonText(reason) {
  const reasons = {
    'prompt-api-available': 'Chrome Prompt API reports the local model available',
    'prompt-api-absent': 'Chrome Prompt API is not exposed in this browser',
    'prompt-api-error': 'the on-device capability probe threw, so the call took the safe cloud route',
    'prompt-api-missing-availability': 'the Prompt API object exists without an availability method',
    'model-downloading': 'Gemini Nano is still downloading, so this call cannot be local yet',
    'model-downloadable': 'Gemini Nano can be downloaded but is not local yet',
    'model-unavailable': 'Chrome reports the on-device model unavailable',
    'probe-degraded': 'the probe returned an unrecognized state',
    'forced-on-device': 'the demo route override forced the on-device path',
    'forced-cloud': 'the demo route override forced the cloud fallback path',
    'on-device-error': 'the on-device attempt failed and the runner fell back to cloud',
    'sdk-reported-cloud': 'Firebase AI Logic reported cloud inference',
    'sdk-reported-on-device': 'Firebase AI Logic reported on-device inference'
  };
  return reasons[reason] || reason;
}

export function decideRoute(probeResult, options = {}) {
  if (options.forceLeg === ON_DEVICE) {
    return {
      leg: ON_DEVICE,
      reason: 'forced-on-device',
      probeState: probeResult?.state || 'unknown',
      available: true,
      degraded: false
    };
  }
  if (options.forceLeg === CLOUD) {
    return {
      leg: CLOUD,
      reason: 'forced-cloud',
      probeState: probeResult?.state || 'unknown',
      available: false,
      degraded: false
    };
  }

  const state = probeResult?.state || 'absent';
  if (state === 'available') {
    return { leg: ON_DEVICE, reason: 'prompt-api-available', probeState: state, available: true, degraded: false };
  }
  if (state === 'absent') {
    return { leg: CLOUD, reason: 'prompt-api-absent', probeState: state, available: false, degraded: false };
  }
  if (state === 'error') {
    return { leg: CLOUD, reason: 'prompt-api-error', probeState: state, available: false, degraded: true };
  }
  if (state === 'missing-availability') {
    return { leg: CLOUD, reason: 'prompt-api-missing-availability', probeState: state, available: false, degraded: true };
  }
  if (state === 'downloading') {
    return { leg: CLOUD, reason: 'model-downloading', probeState: state, available: false, degraded: true };
  }
  if (state === 'downloadable') {
    return { leg: CLOUD, reason: 'model-downloadable', probeState: state, available: false, degraded: true };
  }
  if (state === 'unavailable') {
    return { leg: CLOUD, reason: 'model-unavailable', probeState: state, available: false, degraded: false };
  }
  return { leg: CLOUD, reason: 'probe-degraded', probeState: state, available: false, degraded: true };
}

export async function probeOnDeviceCapability(target = globalThis) {
  const languageModel = target?.LanguageModel;
  if (typeof languageModel === 'undefined' || languageModel === null) {
    return { state: 'absent', detail: 'LanguageModel is undefined' };
  }
  if (typeof languageModel.availability !== 'function') {
    return { state: 'missing-availability', detail: 'LanguageModel.availability is missing' };
  }
  try {
    const value = await languageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    });
    if (value === 'available') return { state: 'available', detail: value };
    if (value === 'downloading') return { state: 'downloading', detail: value };
    if (value === 'downloadable') return { state: 'downloadable', detail: value };
    if (value === 'unavailable') return { state: 'unavailable', detail: value };
    return { state: 'degraded', detail: String(value) };
  } catch (error) {
    return { state: 'error', detail: error instanceof Error ? error.message : String(error) };
  }
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function createHybridRunner({
  probe = probeOnDeviceCapability,
  onDevice,
  cloud,
  now = defaultNow,
  allowRuntimeFallback = true,
  probeTimeoutMs = 1200
} = {}) {
  if (typeof onDevice !== 'function') throw new TypeError('createHybridRunner requires an onDevice function');
  if (typeof cloud !== 'function') throw new TypeError('createHybridRunner requires a cloud function');

  return async function runHybrid(input, options = {}) {
    const started = now();
    let probeResult;
    try {
      probeResult = await Promise.race([
        probe(),
        new Promise((resolveProbe) => setTimeout(() => resolveProbe({
          state: 'error',
          detail: `capability probe timed out after ${probeTimeoutMs} ms`
        }), probeTimeoutMs))
      ]);
    } catch (caught) {
      probeResult = {
        state: 'error',
        detail: caught instanceof Error ? caught.message : String(caught)
      };
    }
    const decision = decideRoute(probeResult, options);
    let usedFallback = false;
    let error = null;
    let result;

    if (decision.leg === ON_DEVICE) {
      try {
        result = await onDevice(input);
      } catch (caught) {
        if (!allowRuntimeFallback) throw caught;
        usedFallback = true;
        error = caught instanceof Error ? caught.message : String(caught);
        result = await cloud(input);
      }
    } else {
      result = await cloud(input);
    }

    const ended = now();
    const actualLeg = usedFallback ? CLOUD : decision.leg;
    return {
      output: result,
      route: {
        leg: actualLeg,
        requestedLeg: decision.leg,
        reason: usedFallback ? 'on-device-error' : decision.reason,
        reasonText: routeReasonText(usedFallback ? 'on-device-error' : decision.reason),
        probeState: decision.probeState,
        probeDetail: probeResult?.detail || '',
        latencyMs: Math.max(0, Math.round((ended - started) * 10) / 10),
        fallback: usedFallback,
        error
      }
    };
  };
}
