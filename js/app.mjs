import { SAMPLE_NOTES } from './core/sample.mjs';
import { cardsFromModelText } from './core/cards.mjs';
import { demoGenerate } from './core/demo.mjs';
import { createHybridRunner, probeOnDeviceCapability, routeReasonText } from './core/router.mjs';
import { serializeDeckJson, escapeHtml } from './core/export.mjs';
import { loadFirebaseConfig, createFirebaseAiEngine } from './firebase-ai.mjs';

const els = {
  modePill: document.getElementById('mode-pill'),
  notes: document.getElementById('notes-input'),
  loadSample: document.getElementById('load-sample'),
  clear: document.getElementById('clear-button'),
  split: document.getElementById('split-button'),
  routeForce: document.getElementById('route-force'),
  inputNote: document.getElementById('input-note'),
  laneOnDevice: document.getElementById('lane-on-device'),
  laneCloud: document.getElementById('lane-cloud'),
  onDeviceState: document.getElementById('on-device-state'),
  cloudState: document.getElementById('cloud-state'),
  lastLeg: document.getElementById('last-leg'),
  lastReason: document.getElementById('last-reason'),
  lastLatency: document.getElementById('last-latency'),
  probeState: document.getElementById('probe-state'),
  privacyBadge: document.getElementById('privacy-badge'),
  privacyText: document.getElementById('privacy-text'),
  runHistory: document.getElementById('run-history'),
  deckStats: document.getElementById('deck-stats'),
  emptyState: document.getElementById('empty-state'),
  cardGrid: document.getElementById('card-grid'),
  exportJson: document.getElementById('export-json'),
  printDeck: document.getElementById('print-deck'),
  printArea: document.getElementById('print-area')
};

const state = {
  config: null,
  probeOverride: null,
  engine: null,
  runHybrid: null,
  cards: [],
  stats: null,
  runs: [],
  deviceInitStarted: false,
  lastOutput: null,
  lastRoute: null
};


function probeWithTimeout(ms = 900) {
  if (state.probeOverride) {
    return Promise.resolve({
      state: state.probeOverride,
      detail: 'demo probe override'
    });
  }
  return Promise.race([
    probeOnDeviceCapability(globalThis),
    new Promise((resolveProbe) => setTimeout(() => resolveProbe({
      state: 'error',
      detail: `capability probe timed out after ${ms} ms`
    }), ms))
  ]);
}

function setInputNote(message, tone = 'normal') {
  els.inputNote.textContent = message;
  els.inputNote.dataset.tone = tone;
}

function normalizeInferenceSource(value) {
  const text = String(value || '').toUpperCase();
  if (text.includes('ON_DEVICE') || text === 'ON-DEVICE' || text === 'DEVICE') return 'on-device';
  if (text.includes('IN_CLOUD') || text === 'CLOUD') return 'cloud';
  return null;
}

function normalizeActualRoute(route, output) {
  const inferred = normalizeInferenceSource(output?.inferenceSource);
  const transport = output?.provider || 'unknown';
  if (!inferred) return { ...route, transport, inferenceSource: output?.inferenceSource || null };
  if (transport === 'demo') {
    return {
      ...route,
      leg: inferred,
      transport,
      inferenceSource: output.inferenceSource
    };
  }
  const reason = inferred === 'on-device' ? 'sdk-reported-on-device' : 'sdk-reported-cloud';
  return {
    ...route,
    leg: inferred,
    reason,
    reasonText: routeReasonText(reason),
    transport,
    inferenceSource: output.inferenceSource
  };
}

async function executeLeg(leg, input) {
  if (state.engine.kind === 'demo') {
    await new Promise((resolve) => setTimeout(resolve, leg === 'on-device' ? 90 : 220));
    const deck = demoGenerate(input.notes);
    return {
      ...deck,
      inferenceSource: leg === 'on-device' ? 'on_device' : 'in_cloud',
      provider: 'demo'
    };
  }

  const generated = await state.engine.generate({ notes: input.notes, requestedLeg: leg });
  const parsed = cardsFromModelText(generated.text, input.notes);
  return {
    ...parsed,
    inferenceSource: generated.inferenceSource,
    provider: 'firebase',
    model: generated.model
  };
}

function makeRunner() {
  return createHybridRunner({
    probe: () => probeWithTimeout(),
    onDevice: (input) => executeLeg('on-device', input),
    cloud: (input) => executeLeg('cloud', input),
    allowRuntimeFallback: true
  });
}

function updateLaneState(activeLeg = null, probeState = 'not probed') {
  els.laneOnDevice.classList.toggle('active-local', activeLeg === 'on-device');
  els.laneCloud.classList.toggle('active-cloud', activeLeg === 'cloud');
  els.onDeviceState.textContent = activeLeg === 'on-device' ? 'active' : probeState;
  els.cloudState.textContent = activeLeg === 'cloud' ? 'active' : 'standby';
}

async function renderInitialProbe() {
  const probe = await probeWithTimeout();
  const force = els.routeForce.value;
  els.probeState.textContent = probe.detail ? `${probe.state} · ${probe.detail}` : probe.state;
  updateLaneState(force === 'on-device' ? 'on-device' : force === 'cloud' ? 'cloud' : null, probe.state);
  return probe;
}

function renderRoute(route) {
  els.lastLeg.textContent = route.leg;
  els.lastLeg.className = route.leg;
  els.lastReason.textContent = `${route.reasonText} · ${route.transport} transport`;
  els.lastLatency.textContent = `${route.latencyMs.toFixed(1)} ms`;
  els.probeState.textContent = route.probeDetail ? `${route.probeState} · ${route.probeDetail}` : route.probeState;
  updateLaneState(route.leg, route.probeState);

  const allLocal = state.runs.length > 0 && state.runs.every((run) => run.leg === 'on-device');
  els.privacyBadge.hidden = !allLocal;
  if (allLocal) {
    els.privacyText.textContent = route.transport === 'demo'
      ? 'Demo calls stayed on the on-device path'
      : 'Every call stayed on-device';
  }

  const item = document.createElement('li');
  const strong = document.createElement('strong');
  strong.textContent = route.leg;
  const detail = document.createElement('span');
  detail.className = 'mono';
  detail.textContent = ` ${route.latencyMs.toFixed(1)} ms · ${route.reason}`;
  item.append(strong, detail);
  els.runHistory.prepend(item);
  while (els.runHistory.children.length > 7) els.runHistory.lastElementChild.remove();
}

function renderDeck() {
  const cards = state.cards;
  const stats = state.stats;
  els.emptyState.hidden = cards.length > 0;
  els.exportJson.disabled = cards.length === 0;
  els.printDeck.disabled = cards.length === 0;

  if (!cards.length) {
    els.deckStats.textContent = 'No cards yet';
    els.cardGrid.replaceChildren();
    return;
  }

  const difficulty = stats?.difficulty || { easy: 0, medium: 0, hard: 0 };
  const duplicates = stats?.duplicateCount ?? cards.reduce((sum, card) => sum + (card.duplicates || 0), 0);
  const duplicateLabel = duplicates === 1 ? 'duplicate' : 'duplicates';
  els.deckStats.innerHTML = `<strong>${cards.length}</strong> cards · <strong>${duplicates}</strong> ${duplicateLabel} collapsed · ${difficulty.easy} easy, ${difficulty.medium} medium, ${difficulty.hard} hard`;

  const fragment = document.createDocumentFragment();
  cards.forEach((card, index) => {
    const article = document.createElement('article');
    article.className = 'flashcard';
    article.innerHTML = `
      <div class="flashcard-top">
        <h3>${escapeHtml(card.question)}</h3>
        <span class="difficulty ${escapeHtml(card.difficulty)}">${escapeHtml(card.difficulty)}</span>
      </div>
      <p>${escapeHtml(card.answer)}</p>
      <div class="card-meta">
        <span>#${index + 1}</span>
        ${card.duplicates ? `<span>${card.duplicates} duplicate${card.duplicates === 1 ? '' : 's'} collapsed</span>` : ''}
        ${card.sourceLines?.length ? `<span>source line${card.sourceLines.length === 1 ? '' : 's'} ${card.sourceLines.map(escapeHtml).join(', ')}</span>` : ''}
      </div>`;
    fragment.appendChild(article);
  });
  els.cardGrid.replaceChildren(fragment);
}

function routeSummary() {
  return {
    totalRuns: state.runs.length,
    onDeviceRuns: state.runs.filter((run) => run.leg === 'on-device').length,
    cloudRuns: state.runs.filter((run) => run.leg === 'cloud').length,
    allOnDevice: state.runs.length > 0 && state.runs.every((run) => run.leg === 'on-device'),
    last: state.runs.at(-1) || null
  };
}

function downloadJson() {
  if (!state.cards.length) return;
  const json = serializeDeckJson(state.cards, {
    generator: state.lastOutput?.provider || 'unknown',
    routeSummary: routeSummary()
  });
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'studysplit-deck.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function printDeck() {
  if (!state.cards.length) return;
  const exportedAt = new Date().toISOString();
  els.printArea.innerHTML = `
    <h1>StudySplit deck</h1>
    <div class="print-meta">${state.cards.length} cards · exported ${escapeHtml(exportedAt)}</div>
    ${state.cards.map((card, index) => `
      <section class="print-card">
        <h2>${index + 1}. ${escapeHtml(card.question)}</h2>
        <p>${escapeHtml(card.answer)}</p>
        <footer>${escapeHtml(card.difficulty)}${card.duplicates ? ` · ${card.duplicates} duplicate${card.duplicates === 1 ? '' : 's'} collapsed` : ''}</footer>
      </section>`).join('')}`;
  window.print();
}

function ensureDeviceInitialization() {
  if (state.deviceInitStarted || !state.engine) return;
  state.deviceInitStarted = true;
  try {
    const pending = state.engine.initialize((value) => {
      if (Number.isFinite(value)) {
        els.probeState.textContent = `downloading · ${Math.round(value * 10000) / 100}%`;
      }
    });
    Promise.resolve(pending).catch((error) => {
      setInputNote(`On-device initialization did not complete. Cloud fallback remains available. ${error.message || error}`, 'warning');
    });
  } catch (error) {
    setInputNote(`On-device initialization did not start. Cloud fallback remains available. ${error.message || error}`, 'warning');
  }
}

async function splitNotes() {
  const notes = els.notes.value.trim();
  if (!notes) {
    setInputNote('Paste notes or load the sample before splitting.', 'warning');
    els.notes.focus();
    return;
  }
  if (!state.runHybrid) {
    setInputNote('The hybrid runner is still loading. Try again in a moment.', 'warning');
    return;
  }

  els.split.disabled = true;
  els.split.textContent = 'Splitting...';
  setInputNote('Probing the on-device capability, then routing the prompt.', 'normal');
  ensureDeviceInitialization();

  try {
    const force = els.routeForce.value === 'auto' ? undefined : els.routeForce.value;
    const result = await state.runHybrid({ notes }, { forceLeg: force });
    const output = result.output;
    const route = normalizeActualRoute(result.route, output);
    state.cards = output.cards || [];
    state.stats = output.stats || null;
    state.lastOutput = output;
    state.lastRoute = route;
    state.runs.push(route);
    renderRoute(route);
    renderDeck();
    const parserNote = output.parser === 'heuristic-fallback' ? ' The model response needed the deterministic parser fallback.' : '';
    setInputNote(`${state.cards.length} cards ready through the ${route.leg} leg.${parserNote}`, 'normal');
  } catch (error) {
    console.error(error);
    setInputNote(`Split failed before a deck could be built. ${error.message || error}`, 'warning');
  } finally {
    els.split.disabled = false;
    els.split.textContent = 'Split into cards';
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  if (params.get('sample') === '1') els.notes.value = SAMPLE_NOTES;
  const forced = params.get('force');
  if (['auto', 'on-device', 'cloud'].includes(forced)) els.routeForce.value = forced;
  const probeOverride = params.get('probe');
  const probeOverrideValid = ['available', 'absent', 'downloading', 'downloadable', 'unavailable', 'error', 'degraded'].includes(probeOverride);

  els.loadSample.addEventListener('click', () => {
    els.notes.value = SAMPLE_NOTES;
    els.notes.focus();
    setInputNote('Sample photosynthesis notes loaded. They include one duplicate sentence.', 'normal');
  });
  els.clear.addEventListener('click', () => {
    els.notes.value = '';
    state.cards = [];
    state.stats = null;
    renderDeck();
    els.notes.focus();
  });
  els.split.addEventListener('click', splitNotes);
  els.exportJson.addEventListener('click', downloadJson);
  els.printDeck.addEventListener('click', printDeck);
  els.routeForce.addEventListener('change', renderInitialProbe);

  try {
    state.config = await loadFirebaseConfig('./firebase-config.json');
    if (params.get('demo') === '1') state.config.demoMode = true;
    state.engine = await createFirebaseAiEngine(state.config);
    state.runHybrid = makeRunner();

    if (state.engine.kind === 'demo') {
      if (probeOverrideValid) state.probeOverride = probeOverride;
      els.modePill.textContent = 'demo mode';
      els.modePill.classList.remove('firebase');
      setInputNote('Demo mode is active, so cards are generated deterministically without a Firebase key. Route overrides can show both hybrid paths.', 'normal');
    } else {
      els.modePill.textContent = 'Firebase wired';
      els.modePill.classList.add('firebase');
      setInputNote('Firebase AI Logic is wired through PREFER_ON_DEVICE with App Check initialization.', 'normal');
    }
    await renderInitialProbe();
  } catch (error) {
    console.error(error);
    els.modePill.textContent = 'demo mode';
    setInputNote(`Firebase could not initialize, so demo mode is active. ${error.message || error}`, 'warning');
    state.engine = await createFirebaseAiEngine({ demoMode: true });
    if (probeOverrideValid) state.probeOverride = probeOverride;
    state.runHybrid = makeRunner();
    await renderInitialProbe();
  }

  window.__studysplit = {
    state,
    probe: () => probeWithTimeout(),
    split: splitNotes
  };

  if (params.get('autorun') === '1') {
    setTimeout(() => els.split.click(), 250);
  }
}

init();
