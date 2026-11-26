import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeckFromNotes,
  cardsFromModelText,
  dedupeCards,
  inferTopic,
  normalizeCard,
  questionFromStatement,
  splitNotesToCards,
  splitStatements,
  tagDifficulty,
  tokenJaccard
} from '../js/core/cards.mjs';

test('splitStatements reads bullets, lines, and sentence boundaries', () => {
  const statements = splitStatements('Chapter title:\n- Photosynthesis is a process. It stores energy.\n2. Water is required.');
  assert.equal(statements.length, 3);
  assert.equal(statements[0].text, 'Photosynthesis is a process.');
  assert.equal(statements[1].text, 'It stores energy.');
  assert.equal(statements[2].line, 3);
});

test('question generation recognizes definitions, causes, comparisons, numbers, lists, and default ideas', () => {
  assert.equal(questionFromStatement('Photosynthesis is the conversion of light energy into chemical energy.'), 'What is photosynthesis?');
  assert.equal(questionFromStatement('Light intensity affects the rate because more photons excite electrons.'), 'Why does light intensity matter?');
  assert.equal(questionFromStatement('C4 plants differ from CAM plants in where carbon is fixed.'), 'How do C4 plants compare?');
  assert.equal(questionFromStatement('The retina contains about 120 million rods.'), 'What number or date matters for retina?');
  assert.equal(questionFromStatement('Cellular respiration includes glycolysis, the Krebs cycle, and oxidative phosphorylation.'), 'What are the key parts of cellular respiration?');
  assert.equal(questionFromStatement('Enzymes lower activation energy.'), 'What is the key idea about enzymes?');
});

test('topic inference strips leading articles and uses the defining subject', () => {
  assert.equal(inferTopic('The mitochondria is the site of aerobic respiration.'), 'mitochondria');
  assert.equal(inferTopic('C4 plants separate carbon fixation in space.'), 'C4 plants');
  assert.equal(inferTopic('').length > 0, true);
});

test('difficulty tagging separates easy, medium, and hard cards', () => {
  assert.equal(tagDifficulty({ question: 'What is osmosis?', answer: 'Osmosis is diffusion of water.' }), 'easy');
  assert.equal(tagDifficulty({
    question: 'Why does light intensity matter?',
    answer: 'Light intensity affects photosynthesis because photons excite electrons in chlorophyll molecules.'
  }), 'medium');
  assert.equal(tagDifficulty({
    question: 'How does photorespiration compare?',
    answer: 'Photorespiration is costly because rubisco oxygenation competes with carboxylation, consumes energy, releases carbon dioxide, and lowers sugar production in hot dry conditions.'
  }), 'hard');
});

test('note splitting creates normalized cards with source lines', () => {
  const cards = splitNotesToCards('Photosynthesis is the conversion of light energy.\nPhotosynthesis is the conversion of light energy.');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, 'What is photosynthesis?');
  assert.equal(cards[0].difficulty, 'easy');
  assert.deepEqual(cards[0].sourceLines, [1]);
  assert.equal(cards[0].origin, 'heuristic');
  assert.match(cards[0].id, /^card-/);
});

test('dedupe collapses exact and near duplicates without losing provenance', () => {
  const exact = dedupeCards([
    { question: 'What is osmosis?', answer: 'Osmosis is diffusion of water.', sourceLines: [1] },
    { question: 'What is osmosis?', answer: 'Osmosis is diffusion of water.', sourceLines: [4] }
  ]);
  assert.equal(exact.cards.length, 1);
  assert.equal(exact.duplicateCount, 1);
  assert.deepEqual(exact.cards[0].sourceLines, [1, 4]);
  assert.equal(exact.cards[0].duplicates, 1);

  const nearScore = tokenJaccard(
    'What is photosynthesis? Photosynthesis is the conversion of light energy.',
    'What is photosynthesis? Photosynthesis is conversion of light energy.'
  );
  assert.equal(nearScore >= 0.88, true);
});

test('buildDeckFromNotes reports atomic input, card, duplicate, and difficulty counts', () => {
  const deck = buildDeckFromNotes('Photosynthesis is the conversion of light energy.\nPhotosynthesis is the conversion of light energy.\nLight intensity affects the rate because photons excite electrons.');
  assert.equal(deck.stats.inputStatements, 3);
  assert.equal(deck.stats.cardCount, 2);
  assert.equal(deck.stats.duplicateCount, 1);
  assert.equal(deck.stats.difficulty.easy >= 1, true);
  assert.equal(deck.duplicateGroups.length, 1);
});

test('model JSON is normalized and malformed model output falls back deterministically', () => {
  const good = cardsFromModelText('{"cards":[{"question":"What is osmosis?","answer":"Osmosis is diffusion of water.","difficulty":"easy","tags":["cells"]}]}', 'fallback');
  assert.equal(good.parser, 'model-json');
  assert.equal(good.cards.length, 1);
  assert.equal(good.cards[0].origin, 'model');
  assert.deepEqual(good.cards[0].tags, ['cells']);

  const bad = cardsFromModelText('not json', 'Photosynthesis is the conversion of light energy.');
  assert.equal(bad.parser, 'heuristic-fallback');
  assert.equal(bad.cards.length, 1);
});

test('normalizeCard validates content and keeps declared difficulty only when known', () => {
  assert.equal(normalizeCard({ question: '', answer: 'x' }), null);
  assert.equal(normalizeCard({ question: 'q', answer: 'a', difficulty: 'impossible' }).difficulty, 'easy');
  assert.equal(normalizeCard({ question: 'q', answer: 'a', difficulty: 'hard' }).difficulty, 'hard');
});
