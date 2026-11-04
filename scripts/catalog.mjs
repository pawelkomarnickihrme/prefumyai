import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalize, parseRecord } from './selection.mjs';

const NOTE_LEVELS = { top: 'topNotes', heart: 'heartNotes', base: 'baseNotes' };
const COMMUNITY_FIELDS = ['longevity', 'sillage', 'season', 'timeOfDay', 'gender', 'valueForMoney'];
const ACCORD_SENTENCE = /\bis an? ((?:[A-Z][\w-]*\s+)+)fragrance for (women and men|women|men)\b/;

export function loadDictionary(entries) {
  const byAlias = new Map();
  const ids = new Set(entries.map(e => e.id));
  for (const entry of entries) {
    if (entry.broader && !ids.has(entry.broader)) throw new Error(`Nieznana nuta nadrzedna: ${entry.broader}`);
    for (const alias of new Set([entry.id, ...entry.aliases].map(normalize))) {
      if (byAlias.has(alias)) throw new Error(`Alias "${alias}" nalezy do ${byAlias.get(alias).id} i ${entry.id}`);
      byAlias.set(alias, entry);
    }
  }
  return byAlias;
}

// Unknown notes keep their own id and no Polish label: never guess a mapping.
export function mapNote(raw, dictionary) {
  const key = normalize(raw);
  const entry = dictionary.get(key);
  if (!entry) return { id: key.replaceAll(' ', '-'), en: raw, pl: null, family: null, mapped: false };
  return { id: entry.id, en: raw, pl: entry.pl, family: entry.family, broader: entry.broader, mapped: true };
}

export function parseDescription(description) {
  const match = ACCORD_SENTENCE.exec(description ?? '');
  if (!match) return { accords: [], genderLabel: null };
  return { accords: match[1].trim().toLowerCase().split(/\s+/), genderLabel: match[2] };
}

function mapNotes(raw, dictionary) {
  return Object.fromEntries(Object.entries(NOTE_LEVELS).map(([level, field]) => {
    const values = Array.isArray(raw.notes?.[field]) ? raw.notes[field] : [];
    return [level, values.filter(n => typeof n === 'string' && n.trim()).map(n => mapNote(n.trim(), dictionary))];
  }));
}

function matchableNoteIds(notes) {
  const all = Object.values(notes).flat();
  return [...new Set(all.flatMap(n => (n.broader ? [n.id, n.broader] : [n.id])))].sort();
}

function stripBrand(name, brand) {
  return name.endsWith(brand) && name.length > brand.length ? name.slice(0, -brand.length).trim() : name;
}

const present = value => value != null && value !== '' &&
  (typeof value !== 'object' || Object.keys(value).length > 0);
const textList = value => (Array.isArray(value) ? value.filter(t => typeof t === 'string' && t.trim()) : []);
const stripId = filename => filename.replace(/\.json$/, '');

export function buildEntry(raw, filename, dictionary, variants = []) {
  const record = parseRecord(raw, filename);
  if (typeof raw.mainImageUrl !== 'string' || !raw.mainImageUrl.startsWith('https://')) throw new Error('Brak poprawnego zdjecia');
  if (typeof raw.rating !== 'number' || raw.rating < 0 || raw.rating > 5) throw new Error('Niepoprawna ocena');
  const notes = mapNotes(raw, dictionary);
  const noteIds = matchableNoteIds(notes);
  return {
    id: stripId(filename),
    name: stripBrand(record.name, record.brand),
    brand: record.brand,
    imageUrl: raw.mainImageUrl,
    rating: raw.rating,
    ratingCount: record.ratingCount,
    ...parseDescription(raw.description),
    description: typeof raw.description === 'string' ? raw.description : '',
    notes,
    noteIds,
    families: [...new Set(Object.values(notes).flat().map(n => n.family).filter(Boolean))].sort(),
    recommendable: noteIds.length > 0, // Without notes "bez wanilii" cannot be verified.
    pros: textList(raw.pros),
    cons: textList(raw.cons),
    community: Object.fromEntries(COMMUNITY_FIELDS.map(f => [f, present(raw[f]) ? raw[f] : null])),
    variantIds: variants,
  };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

async function readJsonDir(dir) {
  const names = (await readdir(dir)).filter(n => n.endsWith('.json')).sort();
  const rows = [];
  for (const name of names) rows.push([name, await readFile(join(dir, name), 'utf8')]);
  return rows;
}

function readDecisions(text) {
  const rows = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const status = new Map(), variants = new Map(), representative = new Map();
  for (const row of rows) {
    if (row.reason === 'below_min_ratings') continue;
    status.set(row.id, row.reason === 'less_popular_variant' ? 'variant' : row.status);
    if (row.reason === 'less_popular_variant' && row.representativeId) {
      representative.set(row.id, row.representativeId);
      if (!variants.has(row.representativeId)) variants.set(row.representativeId, []);
      variants.get(row.representativeId).push(stripId(row.id));
    }
  }
  return { status, variants, representative };
}

function buildReport({ catalog, invalid, references, referenceInvalid, plan, status, noteCounts }) {
  const occurrences = [...noteCounts.values()].reduce((sum, n) => sum + n.count, 0);
  const mapped = [...noteCounts.values()].filter(n => n.mapped);
  const mappedOccurrences = mapped.reduce((sum, n) => sum + n.count, 0);
  const coverage = field => catalog.filter(e => present(e.community[field])).length;
  const referenceStatus = {};
  for (const r of references) referenceStatus[r.status] = (referenceStatus[r.status] ?? 0) + 1;
  return {
    catalog: {
      total: catalog.length,
      recommendable: catalog.filter(e => e.recommendable).length,
      withoutNotes: catalog.filter(e => !e.recommendable).map(e => e.id),
      withoutAccords: catalog.filter(e => e.accords.length === 0).length,
      withoutProsCons: catalog.filter(e => !e.pros.length && !e.cons.length).length,
      communityFilled: Object.fromEntries(COMMUNITY_FIELDS.map(f => [f, coverage(f)])),
      invalid,
    },
    notes: {
      distinctRaw: noteCounts.size,
      occurrences,
      mappedOccurrenceShare: occurrences ? Number((mappedOccurrences / occurrences).toFixed(4)) : 0,
      unmapped: [...noteCounts.entries()].filter(([, n]) => !n.mapped)
        .sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))
        .map(([note, n]) => ({ note, count: n.count })),
    },
    ambiguous: {
      needsReview: [...status.entries()].filter(([, s]) => s === 'review').map(([id]) => stripId(id)).sort(),
    },
    references: {
      total: references.length,
      expectedEligible: plan.eligible,
      byStatus: referenceStatus,
      invalid: referenceInvalid,
    },
  };
}

export async function buildCatalog({ snapshotDir, sourceDir, expectedHash, dictionaryEntries }) {
  const sums = await readFile(join(snapshotDir, 'SHA256SUMS'));
  const hash = createHash('sha256').update(sums).digest('hex');
  if (hash !== expectedHash) throw new Error(`Kopia nie zgadza sie z manifestem: ${hash}`);

  const dictionary = loadDictionary(dictionaryEntries);
  const plan = JSON.parse(await readFile(join(snapshotDir, 'raporty', 'plan.json'), 'utf8'));
  const { status, variants, representative } = readDecisions(await readFile(join(snapshotDir, 'raporty', 'decyzje.jsonl'), 'utf8'));

  const catalog = [], invalid = [], noteCounts = new Map();
  for (const [name, text] of await readJsonDir(join(snapshotDir, 'wybrane'))) {
    try {
      const entry = buildEntry(JSON.parse(text), name, dictionary, (variants.get(name) ?? []).sort());
      for (const note of Object.values(entry.notes).flat()) {
        const key = normalize(note.en);
        const current = noteCounts.get(key) ?? { count: 0, mapped: note.mapped };
        current.count += 1;
        noteCounts.set(key, current);
      }
      catalog.push(entry);
    } catch (error) {
      invalid.push({ id: name, error: error.message });
    }
  }
  const catalogIds = new Set(catalog.map(e => e.id));

  // A reference is understood but never recommended unless it maps to a catalog entry.
  const references = [], referenceInvalid = [];
  for (const name of (await readdir(sourceDir)).filter(n => n.endsWith('.json')).sort()) {
    let raw;
    try {
      raw = JSON.parse(await readFile(join(sourceDir, name), 'utf8'));
      if (parseRecord(raw, name).ratingCount < plan.minRatings) continue;
    } catch (error) {
      referenceInvalid.push({ id: name, error: error.message });
      continue;
    }
    const id = stripId(name);
    const notes = mapNotes(raw, dictionary);
    const rep = representative.has(name) ? stripId(representative.get(name)) : null;
    references.push({
      id,
      name: stripBrand(raw.perfumeName.trim(), raw.brand.trim()),
      brand: raw.brand.trim(),
      ratingCount: raw.ratingCount,
      status: status.get(name) ?? 'unprocessed',
      catalogId: catalogIds.has(id) ? id : rep && catalogIds.has(rep) ? rep : null,
      accords: parseDescription(raw.description).accords,
      noteIds: matchableNoteIds(notes),
    });
  }

  catalog.sort(byId);
  references.sort(byId);
  const report = buildReport({ catalog, invalid, references, referenceInvalid, plan, status, noteCounts });
  return { catalog, references, report };
}
