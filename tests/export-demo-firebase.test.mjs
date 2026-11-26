import test from 'node:test';
import assert from 'node:assert/strict';
import { exportDeck, printableHtml, serializeDeckJson, escapeHtml } from '../js/core/export.mjs';
import { demoGenerate, makeDemoLeg } from '../js/core/demo.mjs';
import { normalizeFirebaseConfig, buildCardPrompt, CARD_RESPONSE_SCHEMA } from '../js/firebase-ai.mjs';
import { SAMPLE_NOTES } from '../js/core/sample.mjs';

const cards = [
  {
    id: 'card-one',
    question: 'What is osmosis?',
    answer: 'Osmosis is diffusion of water.',
    difficulty: 'easy',
    tags: ['cells'],
    sourceLines: [1],
    duplicates: 0
  },
  {
    id: 'card-two',
    question: 'Why does light matter?',
    answer: 'Light affects the rate because photons excite electrons.',
    difficulty: 'medium',
    tags: [],
    sourceLines: [2, 4],
    duplicates: 1
  }
];

test('export shape is stable and deterministic when exportedAt is fixed', () => {
  const deck = exportDeck(cards, { exportedAt: '2026-11-25T00:00:00.000Z', generator: 'test' });
  assert.equal(deck.schemaVersion, 1);
  assert.equal(deck.app, 'StudySplit');
  assert.equal(deck.exportedAt, '2026-11-25T00:00:00.000Z');
  assert.equal(deck.generator, 'test');
  assert.equal(deck.stats.cardCount, 2);
  assert.equal(deck.stats.duplicateCount, 1);
  assert.equal(deck.stats.difficulty.easy, 1);
  assert.equal(deck.cards[1].order, 1);
  assert.deepEqual(deck.cards[1].sourceLines, [2, 4]);
  assert.equal(serializeDeckJson(cards, { exportedAt: 'fixed' }).endsWith('\n'), true);
});

test('printable export escapes HTML and preserves duplicate metadata', () => {
  assert.equal(escapeHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  const html = printableHtml([
    { ...cards[0], question: '<script>alert(1)</script>', answer: 'safe & sound', duplicates: 1 }
  ], { exportedAt: 'fixed' });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
  assert.equal(html.includes('safe &amp; sound'), true);
  assert.equal(html.includes('1 duplicate collapsed'), true);
  assert.match(html, /StudySplit deck/);
});

test('demo generator is deterministic and collapses the sample duplicate', () => {
  const first = demoGenerate(SAMPLE_NOTES);
  const second = demoGenerate(SAMPLE_NOTES);
  assert.deepEqual(first.cards, second.cards);
  assert.equal(first.provider, 'demo');
  assert.equal(first.model, 'studysplit-deterministic-demo-v1');
  assert.equal(first.stats.inputStatements, 10);
  assert.equal(first.stats.cardCount, 9);
  assert.equal(first.stats.duplicateCount, 1);
  assert.equal(first.cards.every((card) => card.question && card.answer), true);
});

test('demo legs report the requested simulated inference source', async () => {
  const onDevice = makeDemoLeg('on-device');
  const cloud = makeDemoLeg('cloud');
  assert.equal((await onDevice('Photosynthesis is energy conversion.')).inferenceSource, 'on_device');
  assert.equal((await cloud('Photosynthesis is energy conversion.')).inferenceSource, 'in_cloud');
});

test('firebase config normalization keeps demo mode honest', () => {
  assert.equal(normalizeFirebaseConfig({}).demoMode, true);
  assert.equal(normalizeFirebaseConfig({ demoMode: false, firebase: { apiKey: '', projectId: 'x', appId: 'y' } }).demoMode, true);
  assert.equal(normalizeFirebaseConfig({
    demoMode: false,
    firebase: { apiKey: 'real-config-value', projectId: 'project', appId: 'app' }
  }).demoMode, false);
  assert.equal(normalizeFirebaseConfig({
    demoMode: false,
    firebase: { apiKey: 'paste-your-firebase-api-key', projectId: 'project', appId: 'app' }
  }).demoMode, true);
  assert.equal(normalizeFirebaseConfig({}).cloudModel, 'gemini-3.5-flash-lite');
});

test('firebase prompt and schema require atomic structured cards', () => {
  const prompt = buildCardPrompt('Mitochondria produces ATP.');
  assert.equal(prompt.includes('atomic flashcards'), true);
  assert.equal(prompt.includes('Mitochondria produces ATP.'), true);
  assert.equal(prompt.includes('Return only JSON'), true);
  assert.deepEqual(CARD_RESPONSE_SCHEMA.required, ['cards']);
  assert.deepEqual(CARD_RESPONSE_SCHEMA.properties.cards.items.required, ['question', 'answer', 'difficulty']);
});
