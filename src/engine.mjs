import { normalize } from '../scripts/selection.mjs';

export const SCALE_NAMES = ['freshness', 'sweetness', 'intensity', 'formality'];
const LIST_FIELDS = ['excludedNotes', 'excludedFamilies', 'excludedPerfumes', 'likedNotes', 'likedFamilies', 'likedTags', 'priceSegments'];
const OPPOSITE = { likedNotes: 'excludedNotes', excludedNotes: 'likedNotes', likedFamilies: 'excludedFamilies', excludedFamilies: 'likedFamilies' };
const CHOICES = { gender: ['men', 'women'], season: ['winter', 'spring', 'summer', 'fall'], timeOfDay: ['day', 'night'] };
const RELATIONS = ['like', 'lessThan', 'moreThan'];

const WEIGHTS = { note: 2, family: 1, tag: 1.5, scaleTarget: 1.5, similarity: 6, price: 1.5, gender: 1, season: 1, timeOfDay: 1 };
const SHORTLIST = 20;
const MAX_PER_BRAND = 3;
const NEAR_DUPLICATE = 0.85;

export const emptyPreferences = () => ({
  ...Object.fromEntries(LIST_FIELDS.map(f => [f, []])),
  scales: {}, gender: null, season: null, timeOfDay: null, references: [],
});

// The single way preferences change: model output and button clicks share it.
export function applyOperation(preferences, operation) {
  const next = structuredClone(preferences);
  const { op, field, value } = operation;
  if (op === 'add' || op === 'remove') {
    if (!LIST_FIELDS.includes(field)) throw new Error(`Nieznane pole: ${field}`);
    next[field] = next[field].filter(v => v !== value);
    if (op === 'add') {
      next[field].push(value);
      if (OPPOSITE[field]) next[OPPOSITE[field]] = next[OPPOSITE[field]].filter(v => v !== value);
    }
  } else if (op === 'set') {
    if (!CHOICES[field]) throw new Error(`Nieznane pole: ${field}`);
    if (value !== null && !CHOICES[field].includes(value)) throw new Error(`Niepoprawna wartosc ${field}: ${value}`);
    next[field] = value;
  } else if (op === 'setScale') {
    if (!SCALE_NAMES.includes(operation.scale)) throw new Error(`Nieznana skala: ${operation.scale}`);
    const bounds = {};
    for (const key of ['min', 'max', 'target']) {
      if (operation[key] === undefined) continue;
      if (!Number.isInteger(operation[key]) || operation[key] < 1 || operation[key] > 5) throw new Error(`Niepoprawne ${key}`);
      bounds[key] = operation[key];
    }
    next.scales[operation.scale] = bounds;
  } else if (op === 'clearScale') {
    delete next.scales[operation.scale];
  } else if (op === 'addReference') {
    if (!RELATIONS.includes(operation.relation)) throw new Error(`Nieznana relacja: ${operation.relation}`);
    if (operation.relation !== 'like' && !SCALE_NAMES.includes(operation.scale)) throw new Error('Porownanie wymaga skali');
    next.references = next.references.filter(r => r.id !== operation.id);
    next.references.push({ id: operation.id, relation: operation.relation, scale: operation.scale ?? null });
  } else if (op === 'removeReference') {
    next.references = next.references.filter(r => r.id !== operation.id);
  } else {
    throw new Error(`Nieznana operacja: ${op}`);
  }
  return next;
}

function tokensOf(item) {
  return [...new Set(item.noteIds ?? []), ...(item.accords ?? []).map(a => `accord:${a}`)];
}

export function cosine(a, b) {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let sum = 0;
  for (const [key, value] of small) sum += value * (large.get(key) ?? 0);
  return sum;
}

function genderFit(entry, wanted) {
  const voted = entry.community?.gender?.mostVoted;
  const groups = { men: ['male', 'moreMale'], women: ['female', 'moreFemale'] };
  if (voted) return groups[wanted].includes(voted) ? 1 : voted === 'unisex' ? 0.5 : 0;
  if (entry.genderLabel === wanted) return 1;
  return entry.genderLabel === 'women and men' ? 0.5 : 0;
}

const describe = condition => condition.key;

export function createEngine({ catalog, references, dictionary }) {
  const byId = new Map(catalog.map(e => [e.id, e]));
  const referenceById = new Map(references.map(r => [r.id, r]));
  const recommendable = catalog.filter(e => e.recommendable);

  const documentFrequency = new Map();
  for (const entry of catalog) for (const t of new Set(tokensOf(entry))) documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);
  const vectorCache = new Map();
  function vectorOf(item) {
    if (vectorCache.has(item.id)) return vectorCache.get(item.id);
    const raw = new Map(tokensOf(item).map(t => [t, Math.log((catalog.length + 1) / ((documentFrequency.get(t) ?? 0) + 1)) + 1]));
    const norm = Math.sqrt([...raw.values()].reduce((s, v) => s + v * v, 0)) || 1;
    const vector = new Map([...raw].map(([k, v]) => [k, v / norm]));
    vectorCache.set(item.id, vector);
    return vector;
  }

  const noteLookup = new Map();
  for (const entry of dictionary) {
    for (const alias of [entry.id, entry.pl, ...entry.aliases]) if (alias) noteLookup.set(normalize(alias), entry.id);
  }
  for (const entry of catalog) {
    for (const note of Object.values(entry.notes).flat()) {
      if (!noteLookup.has(normalize(note.en))) noteLookup.set(normalize(note.en), note.id);
    }
  }
  const resolveNote = text => noteLookup.get(normalize(text)) ?? null;
  const knownNotes = new Set(noteLookup.values());

  // A misspelled exclusion must fail loudly: silently ignoring it would break "bez X".
  function apply(preferences, operation) {
    if (operation.op === 'add' && ['excludedNotes', 'likedNotes'].includes(operation.field) && !knownNotes.has(operation.value)) {
      throw new Error(`Nieznana nuta: ${operation.value}`);
    }
    if (operation.op === 'addReference' && !referenceById.has(operation.id)) throw new Error(`Nieznany zapach: ${operation.id}`);
    if (operation.op === 'add' && operation.field === 'excludedPerfumes' && !byId.has(operation.value)) throw new Error(`Nieznany zapach: ${operation.value}`);
    return applyOperation(preferences, operation);
  }

  // Titles only recognize a perfume the user named; they never affect ranking.
  function resolveReference(text) {
    const query = normalize(text);
    if (!query) return [];
    const words = query.split(' ');
    const score = r => {
      const name = normalize(r.name), brand = normalize(r.brand);
      if (name === query || `${name} ${brand}` === query || `${brand} ${name}` === query) return 2;
      const haystack = new Set(`${name} ${brand}`.split(' '));
      return words.every(w => haystack.has(w)) ? 1 : 0;
    };
    return references.map(r => [score(r), r]).filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0] || b[1].ratingCount - a[1].ratingCount || (a[1].id < b[1].id ? -1 : 1))
      .slice(0, 5).map(([, r]) => r);
  }

  function resolveConstraints(preferences) {
    const conditions = [{ key: 'recommendable', fixed: true, test: e => e.recommendable }];
    const warnings = [], likes = [];
    for (const note of preferences.excludedNotes) conditions.push({ key: `excludedNote:${note}`, test: e => !e.noteIds.includes(note) });
    for (const family of preferences.excludedFamilies) conditions.push({ key: `excludedFamily:${family}`, test: e => !e.families.includes(family) });
    const excluded = new Set(preferences.excludedPerfumes);
    if (excluded.size) conditions.push({ key: 'excludedPerfumes', fixed: true, test: e => !excluded.has(e.id) });

    const bounds = {};
    for (const [scale, b] of Object.entries(preferences.scales)) bounds[scale] = { ...b };

    for (const { id, relation, scale } of preferences.references) {
      const reference = referenceById.get(id);
      if (!reference) {
        warnings.push({ type: 'unknownReference', id });
        continue;
      }
      const representative = reference.catalogId ? byId.get(reference.catalogId) : null;
      conditions.push({ key: `reference:${id}`, fixed: true, test: e => e.id !== id });
      if (relation === 'like') {
        if (!reference.noteIds.length) warnings.push({ type: 'referenceWithoutNotes', id });
        else likes.push(reference);
        continue;
      }
      // "Not as X as Y" must not return Y or its own line.
      if (representative) conditions.push({ key: `referenceLine:${id}`, fixed: true, test: e => e.id !== representative.id });
      const value = representative?.enrichment?.[scale];
      if (value === undefined) {
        warnings.push({ type: 'referenceScaleUnknown', id, scale });
        continue;
      }
      if (representative.id !== id) warnings.push({ type: 'referenceVersionUsed', id, usedId: representative.id });
      const b = (bounds[scale] ??= {});
      if (relation === 'lessThan') b.max = Math.min(b.max ?? 5, value - 1);
      else b.min = Math.max(b.min ?? 1, value + 1);
    }

    for (const [scale, b] of Object.entries(bounds)) {
      // Unknown scale cannot confirm a hard bound, so the perfume does not pass it.
      if (b.min !== undefined) conditions.push({ key: `min:${scale}:${b.min}`, test: e => e.enrichment?.[scale] >= b.min });
      if (b.max !== undefined) conditions.push({ key: `max:${scale}:${b.max}`, test: e => e.enrichment?.[scale] <= b.max });
    }
    return { conditions, warnings, likes, bounds };
  }

  function scoreEntry(entry, preferences, { likes, bounds }) {
    let score = 0;
    const reasons = [];
    for (const note of preferences.likedNotes) {
      if (entry.noteIds.includes(note)) { score += WEIGHTS.note; reasons.push({ type: 'note', id: note }); }
    }
    for (const family of preferences.likedFamilies) {
      if (entry.families.includes(family)) { score += WEIGHTS.family; reasons.push({ type: 'family', id: family }); }
    }
    for (const tag of preferences.likedTags) {
      if (entry.enrichment?.tags?.includes(tag)) { score += WEIGHTS.tag * entry.enrichment.tagProbabilities[tag]; reasons.push({ type: 'tag', id: tag }); }
    }
    for (const [scale, b] of Object.entries(bounds)) {
      const value = entry.enrichment?.[scale];
      if (value === undefined) continue;
      if (b.target !== undefined) {
        score += WEIGHTS.scaleTarget * (1 - Math.abs(value - b.target) / 4);
        if (Math.abs(value - b.target) <= 1) reasons.push({ type: 'scale', scale, value });
      } else if (b.min !== undefined || b.max !== undefined) {
        reasons.push({ type: 'scale', scale, value });
      }
    }
    for (const reference of likes) {
      const similarity = cosine(vectorOf(entry), vectorOf(reference));
      score += WEIGHTS.similarity * similarity;
      const sharedNotes = entry.noteIds.filter(n => reference.noteIds.includes(n));
      if (sharedNotes.length) reasons.push({ type: 'similarTo', id: reference.id, sharedNotes });
    }
    if (preferences.priceSegments.includes(entry.enrichment?.priceSegment)) {
      score += WEIGHTS.price;
      reasons.push({ type: 'priceSegment', value: entry.enrichment.priceSegment, estimated: true });
    }
    if (preferences.gender) score += WEIGHTS.gender * genderFit(entry, preferences.gender);
    if (preferences.season) {
      const share = entry.community?.season?.[preferences.season];
      if (typeof share === 'number') {
        score += WEIGHTS.season * share / 100;
        if (share >= 60) reasons.push({ type: 'season', value: preferences.season, share });
      }
    }
    if (preferences.timeOfDay) {
      const share = entry.community?.timeOfDay?.[preferences.timeOfDay];
      if (typeof share === 'number') score += WEIGHTS.timeOfDay * share / 100;
    }
    return { score: Math.round(score * 1000) / 1000, reasons };
  }

  function tradeoffsOf(entry) {
    const tradeoffs = [];
    const longevity = entry.community?.longevity?.mostVoted;
    if (longevity === 'veryWeak' || longevity === 'weak') tradeoffs.push({ type: 'weakLongevity', value: longevity });
    const sillage = entry.community?.sillage?.mostVoted;
    if (sillage === 'enormous') tradeoffs.push({ type: 'strongSillage', value: sillage });
    const value = entry.community?.valueForMoney?.mostVoted;
    if (value === 'priceTooHigh' || value === 'overpriced') tradeoffs.push({ type: 'poorValue', value });
    if (!entry.community?.longevity) tradeoffs.push({ type: 'noCommunityData' });
    return tradeoffs;
  }

  // Keep the list varied, but never return fewer results just to stay varied.
  function diversify(ranked, limit) {
    const picked = [], skipped = [], perBrand = new Map();
    for (const item of ranked) {
      if (picked.length >= limit) break;
      const tooManyFromBrand = (perBrand.get(item.entry.brand) ?? 0) >= MAX_PER_BRAND;
      const nearDuplicate = picked.some(p => cosine(vectorOf(p.entry), vectorOf(item.entry)) >= NEAR_DUPLICATE);
      if (tooManyFromBrand || nearDuplicate) { skipped.push(item); continue; }
      picked.push(item);
      perBrand.set(item.entry.brand, (perBrand.get(item.entry.brand) ?? 0) + 1);
    }
    return [...picked, ...skipped.slice(0, Math.max(0, limit - picked.length))];
  }

  const byRank = (a, b) => b.score - a.score || b.entry.rating - a.entry.rating ||
    b.entry.ratingCount - a.entry.ratingCount || (a.entry.id < b.entry.id ? -1 : 1);

  function recommend(preferences, { limit = SHORTLIST } = {}) {
    const constraints = resolveConstraints(preferences);
    const { conditions, warnings } = constraints;
    const passing = catalog.filter(e => conditions.every(c => c.test(e)));
    if (!passing.length) {
      const relaxations = conditions.filter(c => !c.fixed).map(condition => ({
        condition: describe(condition),
        matches: catalog.filter(e => conditions.every(c => c === condition || c.test(e))).length,
      })).filter(r => r.matches > 0).sort((a, b) => b.matches - a.matches);
      return { status: 'noMatch', candidates: [], relaxations, warnings };
    }
    const ranked = passing.map(entry => ({ entry, ...scoreEntry(entry, preferences, constraints) })).sort(byRank);
    const candidates = diversify(ranked, limit).map(({ entry, score, reasons }) => ({ id: entry.id, score, reasons, tradeoffs: tradeoffsOf(entry) }));
    return { status: 'ok', total: passing.length, candidates, relaxations: [], warnings };
  }

  // Works for any reference, including perfumes that are not in the catalog.
  function similar(id, { limit = SHORTLIST } = {}) {
    const source = referenceById.get(id) ?? byId.get(id);
    if (!source) throw new Error(`Nieznany zapach: ${id}`);
    if (!tokensOf(source).length || !source.noteIds.length) return { status: 'noNotes', candidates: [] };
    const self = byId.get(source.catalogId ?? id);
    const ranked = recommendable.filter(e => e.id !== id && e.id !== self?.id).map(entry => ({
      entry, score: Math.round(cosine(vectorOf(source), vectorOf(entry)) * 1000) / 1000,
    })).filter(r => r.score > 0).sort(byRank);
    return {
      status: 'ok',
      candidates: diversify(ranked, limit).map(({ entry, score }) => ({
        id: entry.id, score,
        sharedNotes: entry.noteIds.filter(n => source.noteIds.includes(n)),
        differentNotes: entry.noteIds.filter(n => !source.noteIds.includes(n)),
      })),
    };
  }

  function compare(ids) {
    if (ids.length < 2 || ids.length > 3) throw new Error('Porownanie wymaga 2-3 zapachow');
    const entries = ids.map(id => {
      const entry = byId.get(id);
      if (!entry) throw new Error(`Nieznany zapach: ${id}`);
      return entry;
    });
    return {
      sharedNotes: entries[0].noteIds.filter(n => entries.every(e => e.noteIds.includes(n))),
      perfumes: entries.map(entry => ({
        id: entry.id,
        uniqueNotes: entry.noteIds.filter(n => !entries.some(o => o !== entry && o.noteIds.includes(n))),
        scales: Object.fromEntries(SCALE_NAMES.map(s => [s, entry.enrichment?.[s] ?? null])),
        priceSegment: entry.enrichment?.priceSegment ?? null,
        longevity: entry.community?.longevity?.mostVoted ?? null,
        sillage: entry.community?.sillage?.mostVoted ?? null,
      })),
    };
  }

  // Result buttons, turned into ordinary operations relative to what is on screen.
  function actionToOperation(action, shownIds = [], perfumeId) {
    if (action === 'known') return { op: 'add', field: 'excludedPerfumes', value: perfumeId };
    const nudges = { lessSweet: ['sweetness', -1], moreDiscreet: ['intensity', -1] };
    if (!nudges[action]) throw new Error(`Nieznana akcja: ${action}`);
    const [scale, direction] = nudges[action];
    const values = shownIds.map(id => byId.get(id)?.enrichment?.[scale]).filter(v => v !== undefined);
    if (!values.length) throw new Error('Brak danych o pokazanych zapachach');
    const lowest = Math.min(...values);
    return { op: 'setScale', scale, max: Math.max(1, lowest + direction) };
  }

  return { apply, resolveNote, resolveReference, recommend, similar, compare, actionToOperation };
}
