import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, cosine, createEngine, emptyPreferences } from '../src/engine.mjs';

const dictionary = [
  { id: 'vanilla', pl: 'wanilia', family: 'gourmand', aliases: ['vanille'] },
  { id: 'bergamot', pl: 'bergamotka', family: 'citrus', aliases: [] },
  { id: 'pepper', pl: 'pieprz', family: 'spicy', aliases: [] },
  { id: 'pink-pepper', pl: 'różowy pieprz', family: 'spicy', broader: 'pepper', aliases: ['pink pepper'] },
  { id: 'rose', pl: 'róża', family: 'floral', aliases: [] },
  { id: 'cedar', pl: 'cedr', family: 'woody', aliases: [] },
];
const familyOf = Object.fromEntries(dictionary.map(d => [d.id, d.family]));

function perfume(id, noteIds, enrichment, extra = {}) {
  return {
    id, name: extra.name ?? id, brand: extra.brand ?? `brand-${id}`, rating: extra.rating ?? 4, ratingCount: extra.ratingCount ?? 1000,
    accords: extra.accords ?? [], genderLabel: extra.genderLabel ?? 'women and men',
    notes: { top: noteIds.map(n => ({ id: n, en: n })), heart: [], base: [] }, noteIds,
    families: [...new Set(noteIds.map(n => familyOf[n]).filter(Boolean))],
    recommendable: noteIds.length > 0, enrichment,
    community: extra.community ?? {},
  };
}
const rating = (freshness, sweetness, intensity, formality = 3, priceSegment = 'mid', tags = []) => ({
  freshness, sweetness, intensity, formality, priceSegment, tags, tagProbabilities: Object.fromEntries(tags.map(t => [t, 0.9])),
});

const catalog = [
  perfume('sauvage', ['bergamot', 'pepper', 'cedar'], rating(4, 2, 5), { name: 'Sauvage', brand: 'Dior', ratingCount: 50000, accords: ['aromatic'] }),
  perfume('fresh-quiet', ['bergamot', 'cedar'], rating(5, 1, 2, 4, 'mid', ['office', 'clean']), { accords: ['aromatic'] }),
  perfume('fresh-loud', ['bergamot', 'pepper', 'pink-pepper'], rating(5, 2, 5), { accords: ['citrus'] }),
  perfume('sweet', ['vanilla', 'rose'], rating(1, 5, 4), { community: { longevity: { mostVoted: 'weak' }, season: { winter: 100, summer: 10 } } }),
  perfume('floral', ['rose', 'cedar'], rating(3, 3, 3, 3, 'budget'), { rating: 4.5 }),
  perfume('no-notes', [], undefined),
];
const references = [
  ...catalog.map(e => ({ id: e.id, name: e.name, brand: e.brand, ratingCount: e.ratingCount, status: 'selected', catalogId: e.id, accords: e.accords, noteIds: e.noteIds })),
  { id: 'sauvage-elixir', name: 'Sauvage Elixir', brand: 'Dior', ratingCount: 16000, status: 'variant', catalogId: 'sauvage', accords: ['aromatic'], noteIds: ['pepper', 'vanilla'] },
  { id: 'empty-ref', name: 'Mystery', brand: 'X', ratingCount: 300, status: 'review', catalogId: null, accords: [], noteIds: [] },
];
const engine = createEngine({ catalog, references, dictionary });
const run = (...operations) => operations.reduce((p, o) => engine.apply(p, o), emptyPreferences());
const ids = result => result.candidates.map(c => c.id);

test('exclusions are absolute, including broader notes and perfumes without notes', () => {
  const result = engine.recommend(run({ op: 'add', field: 'excludedNotes', value: 'pepper' }));
  assert.deepEqual(new Set(ids(result)), new Set(['fresh-quiet', 'sweet', 'floral']));
});

test('excluding vanilla never returns a vanilla perfume, whatever else is liked', () => {
  const result = engine.recommend(run({ op: 'add', field: 'likedNotes', value: 'rose' }, { op: 'add', field: 'excludedNotes', value: 'vanilla' }));
  assert.equal(ids(result).includes('sweet'), false);
});

test('liking and excluding the same note keeps the latest decision', () => {
  const p = run({ op: 'add', field: 'excludedNotes', value: 'rose' }, { op: 'add', field: 'likedNotes', value: 'rose' });
  assert.deepEqual([p.excludedNotes, p.likedNotes], [[], ['rose']]);
});

test('operations do not mutate and clicks can remove a criterion', () => {
  const before = emptyPreferences();
  const after = applyOperation(before, { op: 'add', field: 'likedTags', value: 'office' });
  assert.deepEqual(before.likedTags, []);
  assert.deepEqual(applyOperation(after, { op: 'remove', field: 'likedTags', value: 'office' }).likedTags, []);
});

test('invalid operations fail loudly', () => {
  const p = emptyPreferences();
  assert.throws(() => engine.apply(p, { op: 'add', field: 'excludedNotes', value: 'vanila-typo' }), /Nieznana nuta/);
  assert.throws(() => engine.apply(p, { op: 'addReference', id: 'nope', relation: 'like' }), /Nieznany zapach/);
  assert.throws(() => applyOperation(p, { op: 'add', field: 'hack', value: 1 }), /Nieznane pole/);
  assert.throws(() => applyOperation(p, { op: 'setScale', scale: 'intensity', max: 9 }), /Niepoprawne/);
  assert.throws(() => applyOperation(p, { op: 'set', field: 'gender', value: 'x' }), /Niepoprawna/);
  assert.throws(() => applyOperation(p, { op: 'addReference', id: 'a', relation: 'lessThan' }), /skali/);
  assert.throws(() => applyOperation(p, { op: 'drop' }), /Nieznana operacja/);
});

test('notes resolve from English, Polish and aliases', () => {
  for (const text of ['Vanilla', 'wanilia', 'Vanille']) assert.equal(engine.resolveNote(text), 'vanilla');
  assert.equal(engine.resolveNote('kawior z marsa'), null);
});

test('"not as strong as Sauvage" lowers intensity and removes the line', () => {
  const result = engine.recommend(run({ op: 'addReference', id: 'sauvage', relation: 'lessThan', scale: 'intensity' }));
  const set = new Set(ids(result));
  assert.equal(set.has('sauvage'), false);
  assert.equal(set.has('fresh-loud'), false);
  assert.equal(set.has('fresh-quiet'), true);
});

test('variant reference uses its representative and says so', () => {
  const result = engine.recommend(run({ op: 'addReference', id: 'sauvage-elixir', relation: 'lessThan', scale: 'intensity' }));
  assert.equal(ids(result).includes('sauvage'), false);
  assert.deepEqual(result.warnings, [{ type: 'referenceVersionUsed', id: 'sauvage-elixir', usedId: 'sauvage' }]);
});

test('"like X" ranks by notes, not by title, and skips X', () => {
  const result = engine.recommend(run({ op: 'addReference', id: 'sauvage', relation: 'like' }));
  assert.equal(ids(result).includes('sauvage'), false);
  assert.equal(ids(result)[0], 'fresh-quiet');
  assert.deepEqual(result.candidates[0].reasons[0], { type: 'similarTo', id: 'sauvage', sharedNotes: ['bergamot', 'cedar'] });
});

test('reference without notes produces a warning instead of a guess', () => {
  const result = engine.recommend(run({ op: 'addReference', id: 'empty-ref', relation: 'like' }));
  assert.deepEqual(result.warnings, [{ type: 'referenceWithoutNotes', id: 'empty-ref' }]);
  assert.deepEqual(engine.similar('empty-ref'), { status: 'noNotes', candidates: [] });
});

test('reference search prefers an exact name over partial ones', () => {
  assert.equal(engine.resolveReference('sauvage')[0].id, 'sauvage');
  assert.equal(engine.resolveReference('Dior Sauvage')[0].id, 'sauvage');
  assert.equal(engine.resolveReference('sauvage elixir')[0].id, 'sauvage-elixir');
  assert.deepEqual(engine.resolveReference('nieistniejacy'), []);
});

test('no match names the condition worth relaxing', () => {
  const result = engine.recommend(run(
    { op: 'add', field: 'excludedNotes', value: 'bergamot' },
    { op: 'add', field: 'excludedNotes', value: 'rose' },
  ));
  assert.equal(result.status, 'noMatch');
  assert.deepEqual(result.relaxations.map(r => r.condition), ['excludedNote:bergamot', 'excludedNote:rose']);
});

test('contradictory scale bounds end in no match, not a crash', () => {
  const result = engine.recommend(run({ op: 'setScale', scale: 'freshness', min: 5, max: 1 }));
  assert.equal(result.status, 'noMatch');
});

test('rating only breaks ties', () => {
  const tied = engine.recommend(emptyPreferences());
  assert.equal(tied.candidates[0].id, 'floral');
  const liked = engine.recommend(run({ op: 'add', field: 'likedNotes', value: 'vanilla' }));
  assert.equal(liked.candidates[0].id, 'sweet');
});

test('budget and gender stay soft and budget reason is marked as an estimate', () => {
  const result = engine.recommend(run({ op: 'add', field: 'priceSegments', value: 'budget' }, { op: 'set', field: 'gender', value: 'men' }));
  assert.equal(result.candidates[0].id, 'floral');
  assert.deepEqual(result.candidates[0].reasons, [{ type: 'priceSegment', value: 'budget', estimated: true }]);
  assert.equal(result.candidates.length, 4 + 1);
});

test('missing season data does not exclude a perfume', () => {
  const result = engine.recommend(run({ op: 'set', field: 'season', value: 'summer' }));
  assert.equal(result.candidates.length, 5);
});

test('unknown scale cannot pass a hard bound', () => {
  const partial = createEngine({ catalog: [perfume('rated', ['rose'], rating(3, 3, 2)), perfume('unrated', ['rose'], undefined)], references: [], dictionary });
  const result = partial.recommend(partial.apply(emptyPreferences(), { op: 'setScale', scale: 'intensity', max: 3 }));
  assert.deepEqual(result.candidates.map(c => c.id), ['rated']);
});

test('near-duplicates and one brand give way to variety, but results are not dropped', () => {
  const twins = createEngine({
    catalog: [
      perfume('a', ['rose', 'cedar'], rating(3, 3, 3), { rating: 5 }),
      perfume('a-twin', ['rose', 'cedar'], rating(3, 3, 3), { rating: 4.9 }),
      perfume('b', ['vanilla'], rating(3, 3, 3), { rating: 4 }),
    ], references: [], dictionary,
  });
  assert.deepEqual(twins.recommend(emptyPreferences()).candidates.map(c => c.id), ['a', 'b', 'a-twin']);
  assert.deepEqual(twins.recommend(emptyPreferences(), { limit: 2 }).candidates.map(c => c.id), ['a', 'b']);
});

test('tradeoffs come from community data', () => {
  const result = engine.recommend(run({ op: 'add', field: 'likedNotes', value: 'vanilla' }));
  assert.deepEqual(result.candidates[0].tradeoffs, [{ type: 'weakLongevity', value: 'weak' }]);
});

test('similar works from a perfume outside the catalog and reports shared and different notes', () => {
  const result = engine.similar('sauvage-elixir');
  assert.equal(ids(result).includes('sauvage'), false);
  assert.equal(ids(result)[0], 'sweet');
  assert.deepEqual(result.candidates[0].sharedNotes, ['vanilla']);
  assert.deepEqual(result.candidates[0].differentNotes, ['rose']);
});

test('compare lists shared and unique notes with the same criteria', () => {
  const result = engine.compare(['sauvage', 'fresh-quiet']);
  assert.deepEqual(result.sharedNotes, ['bergamot', 'cedar']);
  assert.deepEqual(result.perfumes[0].uniqueNotes, ['pepper']);
  assert.equal(result.perfumes[1].scales.intensity, 2);
  assert.throws(() => engine.compare(['sauvage']), /2-3/);
  assert.throws(() => engine.compare(['sauvage', 'nope']), /Nieznany/);
});

test('buttons become ordinary operations relative to what is shown', () => {
  assert.deepEqual(engine.actionToOperation('lessSweet', ['sweet', 'floral']), { op: 'setScale', scale: 'sweetness', max: 2 });
  assert.deepEqual(engine.actionToOperation('moreDiscreet', ['fresh-quiet']), { op: 'setScale', scale: 'intensity', max: 1 });
  assert.deepEqual(engine.actionToOperation('known', [], 'sweet'), { op: 'add', field: 'excludedPerfumes', value: 'sweet' });
  assert.throws(() => engine.actionToOperation('lessSweet', []), /Brak danych/);
});

test('cosine is symmetric whatever the vector sizes', () => {
  const a = new Map([['x', 1]]), b = new Map([['x', 0.5], ['y', 0.5]]);
  assert.equal(cosine(a, b), 0.5);
  assert.equal(cosine(b, a), 0.5);
});

test('recommendation is deterministic', () => {
  const p = run({ op: 'add', field: 'likedNotes', value: 'cedar' });
  assert.deepEqual(engine.recommend(p), engine.recommend(p));
});
