const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'for', 'to', 'from', 'by', 'with',
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'as', 'at', 'into', 'their', 'its', 'this', 'that'
]);

export function normalizeSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function stableHash(value) {
  const input = String(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

function stripBullet(line) {
  return line
    .replace(/^\s*(?:[-*+]|\u2022|\d+[.)])\s+/, '')
    .replace(/^\s*(?:note|remember|key idea)\s*[-:]\s*/i, '')
    .trim();
}

function splitSentences(line) {
  const matches = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return matches.map((part) => part.trim()).filter(Boolean);
}

export function splitStatements(notes) {
  const lines = String(notes ?? '').replace(/\r\n?/g, '\n').split('\n');
  const statements = [];
  lines.forEach((rawLine, lineIndex) => {
    const cleaned = stripBullet(rawLine);
    if (!cleaned || cleaned.length < 8) return;
    if (/^#{1,6}\s+/.test(cleaned)) return;
    if (/^[A-Z][A-Za-z0-9 /-]{1,60}:$/.test(cleaned)) return;
    for (const sentence of splitSentences(cleaned)) {
      const text = normalizeSpace(sentence).replace(/[;,]$/, '.');
      if (text.length < 8) continue;
      statements.push({
        text,
        line: lineIndex + 1,
        excerpt: text.slice(0, 96)
      });
    }
  });
  return statements;
}

const PROPER_TOPIC_WORDS = new Set(['Calvin', 'Krebs', 'ATP', 'NADPH', 'C4', 'CAM']);
const COUNTABLE_TOPIC_ENDINGS = new Set(['equation', 'reaction', 'reactions', 'cycle', 'process', 'pathway', 'stage', 'step', 'system', 'membrane']);

function topicNeedsArticle(topic) {
  const words = topic.toLowerCase().split(' ');
  return COUNTABLE_TOPIC_ENDINGS.has(words.at(-1)) && words.length > 1;
}

function trimTopic(topic) {
  let out = normalizeSpace(topic)
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[.,;:]+$/, '')
    .trim();
  const words = out.split(' ').filter(Boolean);
  if (words.length > 8) out = words.slice(0, 8).join(' ');
  const firstWord = out.split(' ')[0];
  const preserveCase = PROPER_TOPIC_WORDS.has(firstWord) || /[A-Z]/.test(firstWord.slice(1)) || /\d/.test(firstWord);
  if (/^[A-Z][a-z]/.test(out) && !preserveCase) out = out[0].toLowerCase() + out.slice(1);
  return out.length > 72 ? `${out.slice(0, 69).trim()}...` : out;
}

export function inferTopic(statement) {
  const text = normalizeSpace(statement);
  const comparison = text.match(/^(.{2,90}?)\s+(?:differs from|differ from|differs|differ|unlike|compared with|compared to|whereas)\s+/i);
  if (comparison) return trimTopic(comparison[1]);
  const definition = text.match(/^(.{2,90}?)\s+(?:is|are|means|refers to|is defined as|was|were)\s+/i);
  if (definition) return trimTopic(definition[1]);
  const action = text.match(/^(.{2,80}?)\s+(?:causes|leads to|produces|requires|uses|creates|controls|separates?|lowers?|affects?|stores?|converts?|occurs?|contains?|includes?|consists?|has|have|holds?)\s+/i);
  if (action) return trimTopic(action[1]);
  const significant = text
    .replace(/["'()]/g, '')
    .split(' ')
    .filter((word) => word && !STOPWORDS.has(word.toLowerCase().replace(/[^a-z0-9]/gi, '')))
    .slice(0, 4)
    .join(' ');
  return trimTopic(significant || text.split(' ').slice(0, 4).join(' ') || 'this idea');
}

export function questionFromStatement(statement) {
  const text = normalizeSpace(statement);
  const topic = inferTopic(text);
  if (/\b(?:differs?|difference|unlike|compared|whereas|while)\b/i.test(text)) {
    const plural = /(?:plants|reactions|processes|systems|types|steps|parts)$/.test(topic.toLowerCase());
    return `How ${plural ? 'do' : 'does'} ${topic} compare?`;
  }
  const definition = text.match(/^(.{2,90}?)\s+(is|are|means|refers to|is defined as)\s+/i);
  if (definition) {
    const verb = definition[2].toLowerCase() === 'are' ? 'are' : 'is';
    const article = verb === 'is' && topicNeedsArticle(topic) ? 'the ' : '';
    return `What ${verb} ${article}${topic}?`;
  }
  if (/\b(?:because|since|therefore|as a result|leads to|causes?)\b/i.test(text)) {
    return `Why does ${topic} matter?`;
  }
  if (/\b(?:\d{4}|\d+(?:\.\d+)?%?)\b/.test(text)) {
    return `What number or date matters for ${topic}?`;
  }
  if ((text.match(/,/g) || []).length >= 2 || /\b(?:steps?|stages?|parts?|types?)\b/i.test(text)) {
    return `What are the key parts of ${topic}?`;
  }
  const article = topicNeedsArticle(topic) ? 'the ' : '';
  return `What is the key idea about ${article}${topic}?`;
}

function wordCount(text) {
  return normalizeSpace(text).split(' ').filter(Boolean).length;
}

export function tagDifficulty(input) {
  const question = normalizeSpace(input.question ?? '');
  const answer = normalizeSpace(input.answer ?? '');
  const combined = `${question} ${answer}`;
  const words = wordCount(answer);
  let score = 0;

  if (words <= 12) score -= 1;
  if (words >= 18) score += 1;
  if (words >= 32) score += 2;
  if (/\b(?:because|therefore|although|except|whereas|depends|interact|contrast|compare)\b/i.test(combined)) score += 1;
  if (/\b(?:\d{4}|\d+(?:\.\d+)?%?)\b/.test(combined) || /[A-Za-z]\s*[=+/-]\s*[A-Za-z0-9]/.test(combined)) score += 1;
  const technical = combined.split(/[^A-Za-z-]+/).filter((word) => word.length >= 12).length;
  if (technical >= 1) score += 1;
  if (technical >= 3) score += 1;
  if ((answer.match(/,/g) || []).length >= 3 || answer.includes(';')) score += 1;

  if (score <= 0) return 'easy';
  if (score <= 2) return 'medium';
  return 'hard';
}

export function normalizeCard(input, index = 0) {
  const question = normalizeSpace(input.question ?? '');
  const answer = normalizeSpace(input.answer ?? '');
  if (!question || !answer) return null;
  const difficulty = ['easy', 'medium', 'hard'].includes(input.difficulty)
    ? input.difficulty
    : tagDifficulty({ question, answer });
  const id = `card-${stableHash(`${question}|${answer}`).toString(36)}`;
  return {
    id,
    question,
    answer,
    difficulty,
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => normalizeSpace(tag)).filter(Boolean).slice(0, 5) : [],
    sourceLines: Array.isArray(input.sourceLines) ? [...new Set(input.sourceLines.map(Number).filter(Number.isFinite))].sort((a, b) => a - b) : [],
    duplicates: Math.max(0, Number(input.duplicates) || 0),
    origin: input.origin || 'heuristic',
    order: Number.isFinite(input.order) ? input.order : index
  };
}

export function splitNotesToCards(notes) {
  return splitStatements(notes).map((statement, index) => normalizeCard({
    question: questionFromStatement(statement.text),
    answer: statement.text,
    sourceLines: [statement.line],
    origin: 'heuristic',
    order: index
  }, index)).filter(Boolean);
}

function tokenSet(text) {
  return new Set(
    normalizeSpace(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word && !STOPWORDS.has(word))
  );
}

export function tokenJaccard(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let intersection = 0;
  for (const token of sa) if (sb.has(token)) intersection += 1;
  return intersection / (sa.size + sb.size - intersection);
}

function dedupeKey(card) {
  return `${card.question}|${card.answer}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeCards(inputCards) {
  const kept = [];
  let duplicateCount = 0;
  const groups = [];

  for (const rawCard of inputCards) {
    const card = normalizeCard(rawCard, kept.length);
    if (!card) continue;
    const key = dedupeKey(card);
    let matchIndex = kept.findIndex((candidate) => dedupeKey(candidate) === key);
    if (matchIndex === -1) {
      matchIndex = kept.findIndex((candidate) => tokenJaccard(
        `${candidate.question} ${candidate.answer}`,
        `${card.question} ${card.answer}`
      ) >= 0.88);
    }
    if (matchIndex === -1) {
      kept.push(card);
      continue;
    }

    const target = kept[matchIndex];
    target.duplicates += 1 + card.duplicates;
    target.sourceLines = [...new Set([...target.sourceLines, ...card.sourceLines])].sort((a, b) => a - b);
    target.tags = [...new Set([...target.tags, ...card.tags])].slice(0, 5);
    duplicateCount += 1;
    groups.push({ keptId: target.id, duplicateId: card.id, question: card.question });
  }

  return {
    cards: kept.map((card, index) => ({ ...card, order: index })),
    duplicateCount,
    groups
  };
}

export function difficultyCounts(cards) {
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const card of cards) counts[card.difficulty] = (counts[card.difficulty] || 0) + 1;
  return counts;
}

export function buildDeckFromNotes(notes) {
  const atomic = splitNotesToCards(notes);
  const deduped = dedupeCards(atomic);
  return {
    cards: deduped.cards,
    stats: {
      inputStatements: atomic.length,
      cardCount: deduped.cards.length,
      duplicateCount: deduped.duplicateCount,
      difficulty: difficultyCounts(deduped.cards)
    },
    duplicateGroups: deduped.groups
  };
}

export function extractJsonPayload(text) {
  const cleaned = String(text ?? '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!cleaned) throw new Error('empty model response');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    throw new Error('model response did not contain JSON');
  }
}

export function cardsFromModelText(text, fallbackNotes = '') {
  try {
    const payload = extractJsonPayload(text);
    const list = Array.isArray(payload) ? payload : payload.cards;
    if (!Array.isArray(list)) throw new Error('JSON payload has no cards array');
    const normalized = list.slice(0, 40).map((item, index) => normalizeCard({
      question: item.question ?? item.q,
      answer: item.answer ?? item.a,
      difficulty: typeof item.difficulty === 'string' ? item.difficulty.toLowerCase() : undefined,
      tags: item.tags,
      origin: 'model',
      order: index
    }, index)).filter(Boolean);
    if (!normalized.length) throw new Error('JSON payload produced no usable cards');
    const deduped = dedupeCards(normalized);
    return {
      cards: deduped.cards,
      stats: {
        inputStatements: splitStatements(fallbackNotes).length,
        cardCount: deduped.cards.length,
        duplicateCount: deduped.duplicateCount,
        difficulty: difficultyCounts(deduped.cards)
      },
      duplicateGroups: deduped.groups,
      parser: 'model-json'
    };
  } catch {
    const fallback = buildDeckFromNotes(fallbackNotes);
    return { ...fallback, parser: 'heuristic-fallback' };
  }
}
