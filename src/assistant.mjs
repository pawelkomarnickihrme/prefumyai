import { softenClaims } from '../scripts/enrichment.mjs';
import { t } from './i18n.mjs';
import { createPresentation } from './presentation.mjs';

const MAX_PICKS = 3;
const MAX_TEXT = 1000;
const HISTORY = 6;
const clipText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const languageOf = value => (value === 'en' ? 'en' : 'pl');
const NO_FLAWS = /(nie wykazano|brak (wyra\u017anych |znanych )?wad|bez (\u017cadnych |znanych )?wad|brak danych|no (known |clear )?(flaws|drawbacks|downsides)|no data)/i;

// A compromise must come from the data: with nothing on record, or filler text, show none.
function usableTradeoff(text, entry, candidate) {
  const hasSource = entry.cons.length > 0 || candidate.tradeoffs.some(item => item.type !== 'noCommunityData');
  return hasSource && text && !NO_FLAWS.test(text) ? softenClaims(text) : '';
}

// Models tend to send min, max and target at once; the widest ends of the scale say nothing.
export function singleBound({ min, max, target }) {
  const bounds = {};
  if (min != null && min > 1) bounds.min = min;
  if (max != null && max < 5) bounds.max = max;
  if (!Object.keys(bounds).length && target != null) bounds.target = target;
  return bounds;
}

export function createAssistant({ engine, dictionary, interpret, select, showImages = false }) {
  const presentation = createPresentation({ engine, dictionary, showImages });

  // Model output is untrusted: only known operations survive, and an exclusion that
  // cannot be resolved becomes a visible warning instead of silently doing nothing.
  function toOperations(raw) {
    const operations = [], warnings = [];
    const note = (text, field) => {
      const id = typeof text === 'string' ? engine.resolveNote(text) : null;
      if (id) operations.push({ op: 'add', field, value: id });
      else warnings.push({ type: 'unknownNote', text: String(text) });
    };
    for (const item of Array.isArray(raw) ? raw : []) {
      switch (item?.op) {
        case 'excludeNote': note(item.text, 'excludedNotes'); break;
        case 'likeNote': note(item.text, 'likedNotes'); break;
        case 'removeNote': {
          const id = engine.resolveNote(String(item.text));
          if (id) operations.push({ op: 'remove', field: 'excludedNotes', value: id }, { op: 'remove', field: 'likedNotes', value: id });
          break;
        }
        case 'excludeFamily': operations.push({ op: 'add', field: 'excludedFamilies', value: item.value }); break;
        case 'likeFamily': operations.push({ op: 'add', field: 'likedFamilies', value: item.value }); break;
        case 'likeTag': operations.push({ op: 'add', field: 'likedTags', value: item.value }); break;
        case 'setScale': {
          const bounds = singleBound(item);
          operations.push({ op: 'setScale', scale: item.scale, ...bounds });
          break;
        }
        case 'clearScale': operations.push({ op: 'clearScale', scale: item.scale }); break;
        case 'setGender': operations.push({ op: 'set', field: 'gender', value: item.value }); break;
        case 'setSeason': operations.push({ op: 'set', field: 'season', value: item.value }); break;
        case 'setTimeOfDay': operations.push({ op: 'set', field: 'timeOfDay', value: item.value }); break;
        case 'budget': operations.push({ op: 'add', field: 'priceSegments', value: item.value }); break;
        case 'reference': {
          const match = engine.resolveReference(String(item.text))[0];
          if (match) operations.push({ op: 'addReference', id: match.id, relation: item.relation, scale: item.scale ?? undefined });
          else warnings.push({ type: 'unknownReference', text: String(item.text) });
          break;
        }
        case 'removeReference': {
          const match = engine.resolveReference(String(item.text))[0];
          if (match) operations.push({ op: 'removeReference', id: match.id });
          break;
        }
        default: break;
      }
    }
    return { operations, warnings };
  }

  function applyAll(preferences, operations) {
    let next = preferences;
    for (const operation of operations) {
      try { next = engine.apply(next, operation); } catch { /* A rejected operation leaves the profile unchanged. */ }
    }
    return next;
  }

  const FIELD_VALUES = { priceSegments: ['budget', 'mid', 'premium', 'niche'] };
  const isBudgetSet = preferences => preferences.priceSegments.some(v => FIELD_VALUES.priceSegments.includes(v));

  function envelope(preferences, language, extra = {}) {
    const warnings = (extra.warnings ?? []).map(w => presentation.warningText(w, language)).filter(Boolean);
    return {
      language, message: extra.message ?? '', blocks: extra.blocks ?? [], warnings,
      actions: extra.actions ?? [], shownIds: extra.shownIds ?? [],
      collectionOnly: extra.collectionOnly === true,
      preferences, summary: presentation.summarize(preferences, language),
    };
  }

  function candidateForModel(candidate) {
    const entry = engine.getPerfume(candidate.id);
    const { tags, tagProbabilities: _omit, profileEn, profilePl: _pl, ...ratings } = entry.enrichment ?? {};
    return {
      id: entry.id, name: entry.name, brand: entry.brand,
      notes: Object.values(entry.notes).flat().map(n => n.en), accords: entry.accords,
      ratings, tags, profile: profileEn, cons: entry.cons.slice(0, 4),
      matchedOn: candidate.reasons, knownTradeoffs: candidate.tradeoffs.filter(item => item.type !== 'noCommunityData'),
    };
  }

  function collectionMiss(preferences, language, empty, warnings = []) {
    const message = language === 'en'
      ? (empty ? 'Your collection is empty. Add perfumes to choose from your collection.' : 'No perfume in your collection matches these criteria. Your exclusions still apply.')
      : (empty ? 'Twoja kolekcja jest pusta. Dodaj perfumy, aby wybrać coś z kolekcji.' : 'Żadne perfumy z Twojej kolekcji nie spełniają tych kryteriów. Twoje wykluczenia nadal obowiązują.');
    return envelope(preferences, language, { collectionOnly: true, message, warnings });
  }

  async function recommend(preferences, language, { text = '', warnings = [], ...scope }, signal) {
    const result = engine.recommend(preferences, scope);
    const allWarnings = [...warnings, ...result.warnings];
    if (isBudgetSet(preferences)) allWarnings.push({ type: 'budget' });
    if (result.status === 'noMatch') {
      if (scope.collectionOnly) return collectionMiss(preferences, language, !scope.ownedIds.length, allWarnings);
      const options = result.relaxations.map(r => presentation.relaxationOption(r.condition, preferences, language)).filter(Boolean);
      return envelope(preferences, language, { warnings: allWarnings, blocks: [{ type: 'noMatch', options }] });
    }
    const allowed = new Map(result.candidates.map(c => [c.id, c]));
    let picks = [];
    try {
      const answer = await select({
        request: text, preferences: presentation.summarize(preferences, 'en').map(i => i.label),
        candidates: result.candidates.map(candidateForModel),
      }, language, signal);
      const seen = new Set();
      for (const pick of Array.isArray(answer?.picks) ? answer.picks : []) {
        if (!allowed.has(pick?.id) || seen.has(pick.id)) continue;
        seen.add(pick.id);
        picks.push({
          id: pick.id,
          why: softenClaims(clipText(pick.why, 320)),
          tradeoff: usableTradeoff(clipText(pick.tradeoff, 200), engine.getPerfume(pick.id), allowed.get(pick.id)),
        });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      console.error('Wybor modelu nie powiodl sie, uzywam rankingu:', error.message);
    }
    if (!picks.length) picks = result.candidates.slice(0, MAX_PICKS).map(c => ({ id: c.id }));
    const cards = picks.slice(0, MAX_PICKS).map(pick => {
      const candidate = allowed.get(pick.id);
      return presentation.card(engine.getPerfume(pick.id), language,
        pick.why || presentation.fallbackWhy(candidate, language),
        pick.tradeoff || presentation.fallbackTradeoff(candidate, language));
    });
    return envelope(preferences, language, {
      collectionOnly: scope.collectionOnly,
      message: t(language, 'results'), warnings: allWarnings,
      blocks: [{ type: 'recommendations', cards }],
      actions: ['lessSweet', 'moreDiscreet'].map(action => ({ action, label: t(language, action) })),
      shownIds: cards.map(c => c.id),
    });
  }

  function resolvePerfumes(names) {
    const ids = [];
    for (const name of Array.isArray(names) ? names : []) {
      const match = engine.resolveReference(String(name))[0];
      const id = match?.catalogId ?? null;
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  async function onMessage(body, preferences, language, scope, signal) {
    const text = clipText(body.text, MAX_TEXT);
    if (!text) return envelope(preferences, language, { collectionOnly: scope.collectionOnly, message: t(language, 'askMore') });
    const history = (Array.isArray(body.history) ? body.history : []).slice(-HISTORY)
      .map(m => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', text: clipText(m?.text, 400) }));
    const collection = scope.ownedIds.map(id => {
      const entry = engine.getPerfume(id);
      return { id, label: `${entry.brand} ${entry.name}` };
    });
    const answer = await interpret({ currentPreferences: preferences, history, latestMessage: text, collection }, signal);
    // Only the intent flag is accepted from the model; ownership comes from the browser.
    const requestScope = { ...scope, collectionOnly: scope.collectionOnly || answer?.collectionOnly === true };
    const replyLanguage = answer?.language === 'en' || answer?.language === 'pl' ? answer.language : language;
    const { operations, warnings } = toOperations(answer?.operations);
    const next = applyAll(preferences, operations);

    if (answer?.intent === 'question' && answer.question?.text) {
      const options = (Array.isArray(answer.question.options) ? answer.question.options : []).slice(0, 4)
        .map(option => ({ label: clipText(option?.label, 60), operations: toOperations(option?.operations).operations }))
        .filter(option => option.label);
      if (options.length >= 2) {
        return envelope(next, replyLanguage, { collectionOnly: requestScope.collectionOnly, warnings, blocks: [{ type: 'question', text: clipText(answer.question.text, 200), options }] });
      }
    }
    if (answer?.intent === 'compare') {
      const ids = resolvePerfumes(answer.perfumes).slice(0, 3);
      if (ids.length < 2) return envelope(next, replyLanguage, { collectionOnly: requestScope.collectionOnly, message: t(replyLanguage, 'compareNeedsTwo'), warnings });
      return envelope(next, replyLanguage, { collectionOnly: requestScope.collectionOnly, warnings, blocks: [presentation.comparison(ids, replyLanguage)] });
    }
    if (answer?.intent === 'details') {
      const [id] = resolvePerfumes(answer.perfumes);
      if (!id) return envelope(next, replyLanguage, { collectionOnly: requestScope.collectionOnly, message: t(replyLanguage, 'notFound'), warnings });
      return envelope(next, replyLanguage, { collectionOnly: requestScope.collectionOnly, warnings, ...presentation.details(engine.getPerfume(id), replyLanguage) });
    }
    if (answer?.intent === 'other' && !operations.length) {
      return envelope(next, replyLanguage, { collectionOnly: requestScope.collectionOnly, message: t(replyLanguage, 'offTopic'), warnings });
    }
    if (!requestScope.collectionOnly && !presentation.summarize(next, replyLanguage).length) {
      return envelope(next, replyLanguage, { collectionOnly: requestScope.collectionOnly, message: t(replyLanguage, 'askMore'), warnings });
    }
    return recommend(next, replyLanguage, { text, warnings, ...requestScope }, signal);
  }

  async function handle(body, signal) {
    const preferences = engine.rehydrate(body.preferences);
    const language = languageOf(body.language);
    const scope = {
      ownedIds: [...new Set((Array.isArray(body.ownedIds) ? body.ownedIds : [])
        .filter(id => typeof id === 'string' && engine.getPerfume(id)))],
      collectionOnly: body.collectionOnly === true,
    };
    switch (body.type) {
      case 'message':
        if (scope.collectionOnly && !scope.ownedIds.length) return collectionMiss(preferences, language, true);
        return onMessage(body, preferences, language, scope, signal);
      case 'operations': {
        const next = applyAll(preferences, Array.isArray(body.operations) ? body.operations : []);
        if (!scope.collectionOnly && !presentation.summarize(next, language).length) return envelope(next, language, { collectionOnly: scope.collectionOnly, message: t(language, 'askMore') });
        return recommend(next, language, scope, signal);
      }
      case 'action': {
        let operation;
        try {
          operation = engine.actionToOperation(body.action, Array.isArray(body.shownIds) ? body.shownIds : [], body.perfumeId);
        } catch {
          return envelope(preferences, language, { collectionOnly: scope.collectionOnly, message: t(language, 'askMore') });
        }
        return recommend(applyAll(preferences, [operation]), language, scope, signal);
      }
      case 'similar':
        return recommend(applyAll(preferences, [{ op: 'addReference', id: body.perfumeId, relation: 'like' }]), language, scope, signal);
      case 'details': {
        const entry = engine.getPerfume(body.perfumeId);
        if (!entry) return envelope(preferences, language, { collectionOnly: scope.collectionOnly, message: t(language, 'notFound') });
        return envelope(preferences, language, { collectionOnly: scope.collectionOnly, ...presentation.details(entry, language) });
      }
      case 'compare': {
        const ids = [...new Set(Array.isArray(body.perfumeIds) ? body.perfumeIds : [])]
          .filter(id => engine.getPerfume(id)).slice(0, MAX_PICKS);
        if (ids.length < 2) return envelope(preferences, language, { collectionOnly: scope.collectionOnly, message: t(language, 'compareNeedsTwo') });
        return envelope(preferences, language, { collectionOnly: scope.collectionOnly, blocks: [presentation.comparison(ids, language)] });
      }
      case 'summary':
        return envelope(preferences, language, { collectionOnly: scope.collectionOnly });
      default:
        return envelope(preferences, language, { collectionOnly: scope.collectionOnly, message: t(language, 'askMore') });
    }
  }

  return { handle };
}
