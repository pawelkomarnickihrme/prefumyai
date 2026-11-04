import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCatalog, buildEntry, loadDictionary, mapNote, parseDescription } from '../scripts/catalog.mjs';

const entries = JSON.parse(await readFile(new URL('../dane/nuty.json', import.meta.url), 'utf8'));
const dictionary = loadDictionary(entries);
const raw = (overrides = {}) => ({
  perfumeName: 'Sauvage Dior', brand: 'Dior', rating: 4.3, ratingCount: 1000,
  mainImageUrl: 'https://example.test/a.jpg',
  description: 'Sauvage by Dior is a Aromatic Fougere fragrance for men. Launched in 2015.',
  notes: { topNotes: ['Madagascar Vanilla'], heartNotes: ['Pink Pepper'], baseNotes: ['Ambroxan'] },
  ...overrides,
});

test('every vanilla spelling maps to one id, so an exclusion cannot miss it', () => {
  for (const note of ['Vanilla', 'Vanille', 'vanila', 'Bourbon Vanilla', 'Ultravanil™', 'Black Vanilla Husk']) {
    assert.equal(mapNote(note, dictionary).id, 'vanilla', note);
  }
});

test('notes with similar words stay separate', () => {
  assert.equal(mapNote('Rosemary', dictionary).id, 'rosemary');
  assert.equal(mapNote('Brazilian Rosewood', dictionary).id, 'rosewood');
  assert.equal(mapNote('Rock Rose', dictionary).id, 'labdanum');
  assert.equal(mapNote('Orange Blossom', dictionary).id, 'orange-blossom');
  assert.equal(mapNote('Lime (Linden) Blossom', dictionary).mapped, false);
});

test('unknown note is reported as unmapped instead of guessed', () => {
  assert.deepEqual(mapNote('Soil Tincture', dictionary),
    { id: 'soil-tincture', en: 'Soil Tincture', pl: null, family: null, mapped: false });
});

test('duplicate alias and unknown broader note are rejected', () => {
  assert.throws(() => loadDictionary([{ id: 'a', aliases: ['x'] }, { id: 'b', aliases: ['x'] }]), /Alias/);
  assert.throws(() => loadDictionary([{ id: 'a', broader: 'z', aliases: [] }]), /nadrzedna/);
});

test('accords come only from the structured sentence', () => {
  assert.deepEqual(parseDescription('X by Y is a Floral Woody Musk fragrance for women and men.'),
    { accords: ['floral', 'woody', 'musk'], genderLabel: 'women and men' });
  assert.deepEqual(parseDescription('X is a fragrance for men. This scent is a Great fragrance indeed.'),
    { accords: [], genderLabel: null });
});

test('entry strips brand, expands broader notes and drops reviews', () => {
  const entry = buildEntry(raw({ review: ['secret'] }), 'dior_sauvage.json', dictionary, ['dior_elixir']);
  assert.equal(entry.id, 'dior_sauvage');
  assert.equal(entry.name, 'Sauvage');
  assert.deepEqual(entry.noteIds, ['ambroxan', 'pepper', 'pink-pepper', 'vanilla']);
  assert.deepEqual(entry.variantIds, ['dior_elixir']);
  assert.equal(entry.recommendable, true);
  assert.equal('review' in entry, false);
});

test('perfume without notes is kept but not recommendable; bad records throw', () => {
  const empty = { topNotes: [], heartNotes: [], baseNotes: [] };
  assert.equal(buildEntry(raw({ notes: empty }), 'a.json', dictionary).recommendable, false);
  assert.throws(() => buildEntry(raw({ rating: 7 }), 'a.json', dictionary), /ocena/);
  assert.throws(() => buildEntry(raw({ mainImageUrl: null }), 'a.json', dictionary), /zdjecia/);
});

test('build is deterministic, checks the manifest hash and links references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'katalog-'));
  try {
    const snapshotDir = join(dir, 'snap'), sourceDir = join(dir, 'src');
    await mkdir(join(snapshotDir, 'wybrane'), { recursive: true });
    await mkdir(join(snapshotDir, 'raporty'));
    await mkdir(sourceDir);
    const rep = raw(), variant = raw({ perfumeName: 'Sauvage Elixir Dior' }), low = raw({ perfumeName: 'Rare Dior', ratingCount: 3 });
    await writeFile(join(snapshotDir, 'wybrane', 'rep.json'), JSON.stringify(rep));
    await writeFile(join(snapshotDir, 'wybrane', 'bad.json'), JSON.stringify(raw({ rating: 9 })));
    await writeFile(join(sourceDir, 'rep.json'), JSON.stringify(rep));
    await writeFile(join(sourceDir, 'var.json'), JSON.stringify(variant));
    await writeFile(join(sourceDir, 'low.json'), JSON.stringify(low));
    await writeFile(join(snapshotDir, 'raporty', 'plan.json'), JSON.stringify({ minRatings: 200, eligible: 2 }));
    await writeFile(join(snapshotDir, 'raporty', 'decyzje.jsonl'), [
      { id: 'rep.json', status: 'selected' },
      { id: 'var.json', status: 'excluded', reason: 'less_popular_variant', representativeId: 'rep.json' },
      { id: 'low.json', status: 'excluded', reason: 'below_min_ratings' },
    ].map(r => JSON.stringify(r)).join('\n'));
    await writeFile(join(snapshotDir, 'SHA256SUMS'), 'x');
    const expectedHash = createHash('sha256').update('x').digest('hex');
    const config = { snapshotDir, sourceDir, expectedHash, dictionaryEntries: entries };

    const first = await buildCatalog(config);
    assert.deepEqual(first, await buildCatalog(config));
    assert.deepEqual(first.catalog.map(e => e.id), ['rep']);
    assert.deepEqual(first.catalog[0].variantIds, ['var']);
    assert.deepEqual(first.report.catalog.invalid.map(e => e.id), ['bad.json']);
    assert.deepEqual(first.references.map(r => [r.id, r.status, r.catalogId]),
      [['rep', 'selected', 'rep'], ['var', 'variant', 'rep']]);
    await assert.rejects(buildCatalog({ ...config, expectedHash: 'zly' }), /manifestem/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
