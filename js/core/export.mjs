import { difficultyCounts } from './cards.mjs';

export function exportDeck(cards, options = {}) {
  const exportedAt = options.exportedAt || new Date().toISOString();
  return {
    schemaVersion: 1,
    app: 'StudySplit',
    exportedAt,
    generator: options.generator || 'unknown',
    routeSummary: options.routeSummary || null,
    stats: {
      cardCount: cards.length,
      duplicateCount: cards.reduce((sum, card) => sum + (card.duplicates || 0), 0),
      difficulty: difficultyCounts(cards)
    },
    cards: cards.map((card, index) => ({
      id: card.id,
      question: card.question,
      answer: card.answer,
      difficulty: card.difficulty,
      tags: card.tags || [],
      sourceLines: card.sourceLines || [],
      duplicates: card.duplicates || 0,
      order: index
    }))
  };
}

export function serializeDeckJson(cards, options = {}) {
  return `${JSON.stringify(exportDeck(cards, options), null, 2)}\n`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printableHtml(cards, options = {}) {
  const title = options.title || 'StudySplit deck';
  const exportedAt = options.exportedAt || new Date().toISOString();
  const items = cards.map((card, index) => `
    <section class="print-card">
      <h2>${index + 1}. ${escapeHtml(card.question)}</h2>
      <p>${escapeHtml(card.answer)}</p>
      <footer>${escapeHtml(card.difficulty)}${card.duplicates ? ` · ${card.duplicates} duplicate${card.duplicates === 1 ? '' : 's'} collapsed` : ''}</footer>
    </section>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .meta { color: #444; font-size: 12px; margin-bottom: 24px; }
  .print-card { break-inside: avoid; border: 1px solid #999; border-radius: 8px; padding: 14px 16px; margin: 0 0 12px; }
  .print-card h2 { font-size: 16px; margin: 0 0 8px; }
  .print-card p { font-size: 13px; line-height: 1.45; margin: 0; }
  .print-card footer { color: #555; font-size: 11px; margin-top: 10px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${cards.length} cards · exported ${escapeHtml(exportedAt)}</div>
${items}
</body>
</html>`;
}
