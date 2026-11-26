import { buildDeckFromNotes, cardsFromModelText } from './cards.mjs';

export const DEMO_MODEL = 'studysplit-deterministic-demo-v1';

export function demoGenerate(notes) {
  const deck = buildDeckFromNotes(notes);
  return {
    ...deck,
    provider: 'demo',
    model: DEMO_MODEL,
    text: JSON.stringify({ cards: deck.cards })
  };
}

export function demoGenerateFromModelText(text, notes) {
  const deck = cardsFromModelText(text, notes);
  return {
    ...deck,
    provider: 'demo',
    model: DEMO_MODEL,
    text
  };
}

export function makeDemoLeg(transportLeg) {
  return async function runDemoLeg(input) {
    const notes = typeof input === 'string' ? input : input.notes;
    await new Promise((resolve) => setTimeout(resolve, transportLeg === 'on-device' ? 90 : 220));
    const result = demoGenerate(notes);
    return {
      ...result,
      inferenceSource: transportLeg === 'on-device' ? 'on_device' : 'in_cloud'
    };
  };
}
