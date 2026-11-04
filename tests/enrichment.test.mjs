import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInput, costUsd, parseDecision, pickSample, QUESTIONS, TAGS, validateProfile } from '../scripts/enrichment.mjs';

const answers = (overrides = {}) => ({
  freshness: { choice: 'level_4' }, sweetness: { choice: 'level_1' }, intensity: { choice: 'level_5' }, formality: { choice: 'level_3' },
  priceSegment: { choice: 'niche' },
  ...Object.fromEntries(TAGS.map(t => [`tag_${t.replaceAll('-', '_')}`, { probability: 0.1 }])),
  tag_white_floral: { probability: 0.9 },
  tag_clean: { probability: 0.5 },
  ...overrides,
});

test('every tag has its own question', () => {
  for (const tag of TAGS) assert.equal(QUESTIONS[`tag_${tag.replaceAll('-', '_')}`].type, 'boolean');
});

test('decision maps levels to integers and tags by probability threshold', () => {
  const parsed = parseDecision(answers());
  assert.equal(parsed.freshness, 4);
  assert.equal(parsed.intensity, 5);
  assert.equal(parsed.priceSegment, 'niche');
  assert.deepEqual(parsed.tags, ['clean', 'white-floral']);
  assert.equal(parsed.tagProbabilities.soapy, 0.1);
});

test('out-of-contract decisions are rejected', () => {
  for (const bad of [
    { freshness: { choice: 'level_6' } }, { sweetness: { choice: '3' } }, { priceSegment: { choice: '300 zl' } },
    { priceSegment: { choice: 'toString' } }, { tag_clean: { probability: 2 } }, { tag_clean: {} },
  ]) assert.throws(() => parseDecision(answers(bad)), undefined, JSON.stringify(bad));
});

test('profile accepts Polish and rejects mixed alphabets, long and empty text', () => {
  const ok = { profileEn: 'Clean, woody scent.', profilePl: 'Czysty, drzewny zapach; dobry na żółte dni.' };
  assert.deepEqual(validateProfile({ ...ok, profilePl: ` ${ok.profilePl} ` }), ok);
  for (const bad of [
    { profilePl: 'Początek Главный zapachu' }, { profilePl: 'P المقر zapach' }, { profileEn: 'x'.repeat(241) }, { profilePl: ' ' },
  ]) assert.throws(() => validateProfile({ ...ok, ...bad }), undefined, JSON.stringify(bad));
});

test('sample is deterministic, stratified and skips perfumes without notes', () => {
  const catalog = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, ratingCount: 1000 - i, recommendable: i !== 0 }));
  const sample = pickSample(catalog, 20);
  assert.deepEqual(sample.map(e => e.id), pickSample([...catalog].reverse(), 20).map(e => e.id));
  assert.equal(sample.length, 20);
  assert.equal(sample.some(e => e.id === 'p0'), false);
  assert.equal(sample.filter(e => e.ratingCount > 950).length, 10);
});

test('input limits reviews and adds Polish note names', () => {
  const entry = {
    name: 'A', brand: 'B', accords: [], notes: { top: [{ en: 'Rose', pl: 'róża' }], heart: [], base: [{ en: 'Soil', pl: null }] }, description: 'd',
    pros: [], cons: [], community: { longevity: null, sillage: null },
  };
  const input = buildInput(entry, { review: Array(30).fill('x'.repeat(1000)) });
  assert.equal(input.reviews.length, 12);
  assert.equal(input.reviews[0].length, 401);
  assert.deepEqual(input.notesPl, ['róża']);
});

test('cost uses token prices', () => {
  assert.equal(costUsd({ inputTokens: 10, outputTokens: 2 }, { input: 1, output: 5 }), 20);
});
