import { t } from './i18n.mjs';

const pick = (language, pl, en) => (language === 'en' ? en : pl);

const SCALE_WORDS = {
  freshness: { name: ['Świeżość', 'Freshness'], high: ['Świeże', 'Fresh'], low: ['Ciepłe i cięższe', 'Warm and heavier'] },
  sweetness: { name: ['Słodycz', 'Sweetness'], high: ['Słodkie', 'Sweet'], low: ['Mało słodkie', 'Not very sweet'] },
  intensity: { name: ['Intensywność', 'Intensity'], high: ['Wyraziste', 'Bold'], low: ['Dyskretne', 'Discreet'] },
  formality: { name: ['Formalność', 'Formality'], high: ['Eleganckie', 'Formal'], low: ['Swobodne', 'Casual'] },
};
const COMPARATIVE = {
  freshness: { lessThan: ['mniej świeże niż', 'less fresh than'], moreThan: ['świeższe niż', 'fresher than'] },
  sweetness: { lessThan: ['mniej słodkie niż', 'less sweet than'], moreThan: ['słodsze niż', 'sweeter than'] },
  intensity: { lessThan: ['mniej intensywne niż', 'less intense than'], moreThan: ['bardziej intensywne niż', 'more intense than'] },
  formality: { lessThan: ['swobodniejsze niż', 'more casual than'], moreThan: ['bardziej eleganckie niż', 'more formal than'] },
};
const FAMILIES = {
  citrus: ['cytrusowe', 'citrus'], floral: ['kwiatowe', 'floral'], fruity: ['owocowe', 'fruity'], green: ['zielone', 'green'],
  aromatic: ['aromatyczne', 'aromatic'], spicy: ['przyprawowe', 'spicy'], woody: ['drzewne', 'woody'], amber: ['ambrowe', 'amber'],
  gourmand: ['deserowe', 'gourmand'], aquatic: ['morskie', 'aquatic'], musky: ['piżmowe', 'musky'], leather: ['skórzane', 'leather'], animalic: ['zwierzęce', 'animalic'],
};
const TAG_WORDS = {
  clean: ['Czyste', 'Clean'], soapy: ['Mydlane', 'Soapy'], laundry: ['Jak świeże pranie', 'Fresh laundry'], powdery: ['Pudrowe', 'Powdery'],
  'skin-like': ['Bliskie skórze', 'Skin-like'], aquatic: ['Morskie', 'Aquatic'], citrusy: ['Cytrusowe', 'Citrusy'], green: ['Zielone', 'Green'],
  herbal: ['Ziołowe', 'Herbal'], minty: ['Miętowe', 'Minty'], spicy: ['Przyprawowe', 'Spicy'], smoky: ['Dymne', 'Smoky'], leathery: ['Skórzane', 'Leathery'],
  woody: ['Drzewne', 'Woody'], earthy: ['Ziemiste', 'Earthy'], ambery: ['Ambrowe', 'Ambery'], resinous: ['Żywiczne', 'Resinous'], incense: ['Kadzidlane', 'Incense'],
  oud: ['Oud', 'Oud'], animalic: ['Zwierzęce', 'Animalic'], boozy: ['Alkoholowe', 'Boozy'], tobacco: ['Tytoniowe', 'Tobacco'], fruity: ['Owocowe', 'Fruity'],
  tropical: ['Tropikalne', 'Tropical'], floral: ['Kwiatowe', 'Floral'], 'white-floral': ['Białe kwiaty', 'White floral'], rosy: ['Różane', 'Rosy'],
  gourmand: ['Deserowe', 'Gourmand'], vanillic: ['Waniliowe', 'Vanillic'], creamy: ['Kremowe', 'Creamy'], honeyed: ['Miodowe', 'Honeyed'], coffee: ['Kawowe', 'Coffee'],
  chocolate: ['Czekoladowe', 'Chocolate'], nutty: ['Orzechowe', 'Nutty'], metallic: ['Metaliczne', 'Metallic'], barbershop: ['Barberskie', 'Barbershop'], retro: ['Retro', 'Retro'],
  'daily-wear': ['Na co dzień', 'Daily wear'], office: ['Do biura', 'For the office'], evening: ['Na wieczór', 'For the evening'],
  'date-night': ['Na randkę', 'For a date'], summer: ['Na lato', 'For summer'], winter: ['Na zimę', 'For winter'],
};
const SEGMENTS = { budget: ['Budżetowe', 'Budget'], mid: ['Średnia półka', 'Mid-range'], premium: ['Premium', 'Premium'], niche: ['Nisza', 'Niche'] };
const CHOICE_WORDS = {
  gender: { men: ['Męskie', 'For men'], women: ['Damskie', 'For women'] },
  season: { winter: ['Na zimę', 'For winter'], spring: ['Na wiosnę', 'For spring'], summer: ['Na lato', 'For summer'], fall: ['Na jesień', 'For autumn'] },
  timeOfDay: { day: ['Na dzień', 'For daytime'], night: ['Na wieczór', 'For the evening'] },
};
// Votes are scaled so the top choice is 100; the engine treats 60 as a real fit too.
const WEAR_SHARE = 60;
const COMMUNITY_WORDS = {
  veryWeak: ['bardzo słaba', 'very weak'], weak: ['słaba', 'weak'], moderate: ['umiarkowana', 'moderate'], longLasting: ['wysoka', 'long-lasting'], eternal: ['bardzo wysoka', 'very long-lasting'],
  intimate: ['blisko skóry', 'intimate'], strong: ['silna', 'strong'], enormous: ['bardzo silna', 'very strong'],
};
const word = (language, pair) => (pair ? pick(language, pair[0], pair[1]) : '');

export function createPresentation({ engine, dictionary, showImages = false }) {
  const noteById = new Map(dictionary.map(n => [n.id, n]));

  function noteName(id, language) {
    const note = noteById.get(id);
    if (note) return language === 'en' ? id.replaceAll('-', ' ') : note.pl;
    return id.replaceAll('-', ' ');
  }
  const perfumeLabel = id => {
    const known = engine.getPerfume(id) ?? engine.getReference(id);
    return known ? known.name : id;
  };
  const scaleName = (scale, language) => word(language, SCALE_WORDS[scale].name);

  function scaleLabel(scale, bounds, language) {
    const high = bounds.min >= 3 || bounds.target >= 4;
    const low = bounds.max <= 3 || bounds.target <= 2;
    if (high && !low) return word(language, SCALE_WORDS[scale].high);
    if (low && !high) return word(language, SCALE_WORDS[scale].low);
    return `${scaleName(scale, language)}: ${bounds.target ?? bounds.min ?? bounds.max} ${t(language, 'outOf')}`;
  }

  function summarize(preferences, language) {
    const without = pick(language, 'Bez', 'No');
    const items = [];
    const push = (key, label, operation) => items.push({ key, label, operation });
    for (const id of preferences.excludedNotes) push(`xn:${id}`, `${without}: ${noteName(id, language)}`, { op: 'remove', field: 'excludedNotes', value: id });
    for (const id of preferences.excludedFamilies) push(`xf:${id}`, `${without}: ${word(language, FAMILIES[id]) || id}`, { op: 'remove', field: 'excludedFamilies', value: id });
    for (const id of preferences.excludedPerfumes) push(`xp:${id}`, `${pick(language, 'Znam', 'Known')}: ${perfumeLabel(id)}`, { op: 'remove', field: 'excludedPerfumes', value: id });
    for (const id of preferences.likedTags) push(`lt:${id}`, word(language, TAG_WORDS[id]) || id, { op: 'remove', field: 'likedTags', value: id });
    for (const [scale, bounds] of Object.entries(preferences.scales)) push(`s:${scale}`, scaleLabel(scale, bounds, language), { op: 'clearScale', scale });
    for (const id of preferences.likedNotes) push(`ln:${id}`, `${pick(language, 'Nuta', 'Note')}: ${noteName(id, language)}`, { op: 'remove', field: 'likedNotes', value: id });
    for (const id of preferences.likedFamilies) push(`lf:${id}`, word(language, FAMILIES[id]) || id, { op: 'remove', field: 'likedFamilies', value: id });
    for (const id of preferences.priceSegments) push(`p:${id}`, `${word(language, SEGMENTS[id]) || id} (${pick(language, 'orientacyjnie', 'rough')})`, { op: 'remove', field: 'priceSegments', value: id });
    for (const field of Object.keys(CHOICE_WORDS)) {
      if (preferences[field]) push(`c:${field}`, word(language, CHOICE_WORDS[field][preferences[field]]), { op: 'set', field, value: null });
    }
    for (const { id, relation, scale } of preferences.references) {
      const name = perfumeLabel(id);
      const label = relation === 'like' ? `${pick(language, 'Jak', 'Like')} ${name}` : `${word(language, COMPARATIVE[scale][relation])} ${name}`;
      push(`r:${id}`, label[0].toUpperCase() + label.slice(1), { op: 'removeReference', id });
    }
    return items;
  }

  function fallbackWhy(candidate, language) {
    const parts = candidate.reasons.slice(0, 2).map(reason => {
      if (reason.type === 'note') return `${pick(language, 'zawiera nutę', 'has the note')}: ${noteName(reason.id, language)}`;
      if (reason.type === 'similarTo') return `${pick(language, 'wspólne nuty z', 'shared notes with')} ${perfumeLabel(reason.id)}: ${reason.sharedNotes.slice(0, 3).map(n => noteName(n, language)).join(', ')}`;
      if (reason.type === 'tag') return (word(language, TAG_WORDS[reason.id]) || reason.id).toLowerCase();
      if (reason.type === 'scale') return `${scaleName(reason.scale, language).toLowerCase()} ${reason.value} ${t(language, 'outOf')}`;
      if (reason.type === 'family') return word(language, FAMILIES[reason.id]) || reason.id;
      if (reason.type === 'priceSegment') return `${word(language, SEGMENTS[reason.value]).toLowerCase()} (${pick(language, 'szacunek', 'estimate')})`;
      if (reason.type === 'season') return word(language, CHOICE_WORDS.season[reason.value]).toLowerCase();
      return null;
    }).filter(Boolean);
    if (!parts.length) return pick(language, 'Pasuje do podanych preferencji.', 'It fits the preferences you gave.');
    const text = parts.join('; ');
    return `${text[0].toUpperCase()}${text.slice(1)}.`;
  }

  function fallbackTradeoff(candidate, language) {
    const first = candidate.tradeoffs.find(item => item.type !== 'noCommunityData');
    if (!first) return '';
    if (first.type === 'weakLongevity') return pick(language, 'Społeczność ocenia trwałość jako słabą.', 'The community rates its longevity as weak.');
    if (first.type === 'strongSillage') return pick(language, 'Społeczność ocenia projekcję jako bardzo silną.', 'The community rates its projection as very strong.');
    return pick(language, 'Część społeczności uważa, że jest za drogi.', 'Part of the community finds it overpriced.');
  }

  const noteList = (list, language) => list.map(n => (n.pl && language !== 'en' ? n.pl : n.en)).join(', ');

  const wear = (entry, field, language) => Object.keys(CHOICE_WORDS[field])
    .filter(option => entry.community?.[field]?.[option] >= WEAR_SHARE)
    .map(option => word(language, CHOICE_WORDS[field][option]).toLowerCase())
    .join(', ') || t(language, 'noData');

  const profileFor = (entry, language) => (language === 'en' ? entry.enrichment?.profileEn : entry.enrichment?.profilePl) ?? null;
  const imageFor = entry => showImages ? entry.imageUrl ?? null : null;
  const noteGroups = (entry, language) => ['top', 'heart', 'base'].map(key => ({
    key, label: t(language, `${key}Notes`), value: noteList(entry.notes[key], language) || t(language, 'noData'),
  }));
  const scaleGroups = (values, language) => Object.keys(SCALE_WORDS).map(key => ({
    key, label: scaleName(key, language), value: values?.[key] ?? null,
  }));

  // Occasion/style tags are not olfactory facets; unknown values never become labels.
  const nonOlfactoryTags = new Set(['daily-wear', 'office', 'evening', 'date-night', 'summer', 'winter', 'retro']);
  function facetsFor(entry, language) {
    const tags = [...new Set(Array.isArray(entry.enrichment?.tags) ? entry.enrichment.tags : [])]
      .filter(key => Object.hasOwn(TAG_WORDS, key) && !nonOlfactoryTags.has(key));
    const probability = key => {
      const value = entry.enrichment?.tagProbabilities?.[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    };
    // Stable sort keeps source order for ties; scores never introduce new tags.
    tags.sort((a, b) => probability(b) - probability(a));
    const keys = tags.length ? tags : [...new Set(entry.families ?? [])].filter(key => Object.hasOwn(FAMILIES, key));
    return keys.slice(0, 4).map(key => ({ key, label: word(language, (tags.length ? TAG_WORDS : FAMILIES)[key]) }));
  }

  function wearFor(entry, language) {
    return ['season', 'timeOfDay'].flatMap(key => {
      const options = Object.keys(CHOICE_WORDS[key]).filter(option => {
        const vote = entry.community?.[key]?.[option];
        return typeof vote === 'number' && Number.isFinite(vote) && vote >= WEAR_SHARE;
      });
      return options.length ? [{
        key, label: t(language, key === 'season' ? 'wearSeason' : 'wearTime'),
        value: options.map(option => word(language, CHOICE_WORDS[key][option]).toLowerCase()).join(', '),
      }] : [];
    });
  }

  function card(entry, language, why, tradeoff) {
    const notes = [['topNotes', entry.notes.top], ['heartNotes', entry.notes.heart], ['baseNotes', entry.notes.base]]
      .filter(([, list]) => list.length)
      .map(([label, list]) => ({ label: t(language, label), value: noteList(list, language) }));
    const facts = [...notes, { label: t(language, 'wearSeason'), value: wear(entry, 'season', language) }, { label: t(language, 'wearTime'), value: wear(entry, 'timeOfDay', language) }];
    return {
      id: entry.id, name: entry.name, brand: entry.brand,
      imageUrl: imageFor(entry),
      profile: profileFor(entry, language),
      facets: facetsFor(entry, language), wear: wearFor(entry, language),
      notes: noteGroups(entry, language),
      scales: scaleGroups(entry.enrichment, language),
      longevity: communityValue(entry.community?.longevity, language),
      sillage: communityValue(entry.community?.sillage, language),
      facts, why, tradeoff,
    };
  }

  function communityValue(field, language) {
    const voted = field?.mostVoted;
    return voted ? word(language, COMMUNITY_WORDS[voted]) || voted : null;
  }

  // Structured details built only from catalog data, with no duplicate prose block.
  function details(entry, language) {
    const profile = profileFor(entry, language);
    const segment = entry.enrichment ? word(language, SEGMENTS[entry.enrichment.priceSegment]) : '';
    const perfume = {
      id: entry.id, brand: entry.brand, name: entry.name, imageUrl: imageFor(entry), profile,
      facets: facetsFor(entry, language), wear: wearFor(entry, language),
      notes: noteGroups(entry, language),
      scales: scaleGroups(entry.enrichment, language),
      longevity: communityValue(entry.community?.longevity, language),
      sillage: communityValue(entry.community?.sillage, language),
      season: wear(entry, 'season', language),
      timeOfDay: wear(entry, 'timeOfDay', language),
      priceSegment: segment || null,
      pros: entry.pros, cons: entry.cons,
    };
    return { message: `${entry.brand} ${entry.name}`, blocks: [{ type: 'details', perfume }] };
  }

  function comparison(ids, language) {
    const result = engine.compare(ids);
    const perfumes = result.perfumes.map(item => {
      const entry = engine.getPerfume(item.id);
      return {
        id: item.id, name: entry.name, brand: entry.brand,
        imageUrl: imageFor(entry),
        profile: profileFor(entry, language),
        topNotes: noteList(entry.notes.top, language) || null,
        heartNotes: noteList(entry.notes.heart, language) || null,
        baseNotes: noteList(entry.notes.base, language) || null,
        uniqueNotes: item.uniqueNotes.map(n => noteName(n, language)),
        scales: scaleGroups(item.scales, language),
        longevity: communityValue(entry.community?.longevity, language),
        sillage: communityValue(entry.community?.sillage, language),
        season: wear(entry, 'season', language),
        timeOfDay: wear(entry, 'timeOfDay', language),
      };
    });
    let summary = t(language, 'noBigDifference');
    let widest = 1;
    for (const scale of Object.keys(SCALE_WORDS)) {
      const rated = result.perfumes.filter(p => p.scales[scale] !== null);
      if (rated.length < 2) continue;
      const values = rated.map(p => p.scales[scale]);
      const spread = Math.max(...values) - Math.min(...values);
      if (spread > widest) {
        widest = spread;
        const high = rated.find(p => p.scales[scale] === Math.max(...values)), low = rated.find(p => p.scales[scale] === Math.min(...values));
        summary = `${t(language, 'biggestDifference')}: ${scaleName(scale, language).toLowerCase()} (${perfumeLabel(high.id)} ${Math.max(...values)}, ${perfumeLabel(low.id)} ${Math.min(...values)}).`;
      }
    }
    return { type: 'comparison', summary, sharedNotes: result.sharedNotes.map(n => noteName(n, language)), perfumes };
  }

  // Each no-match button names the exact condition it changes.
  function relaxationOption(condition, preferences, language) {
    const [kind, value] = condition.split(':');
    const allow = pick(language, 'Dopuść', 'Allow');
    if (kind === 'excludedNote') return { label: `${allow}: ${noteName(value, language)}`, operation: { op: 'remove', field: 'excludedNotes', value } };
    if (kind === 'excludedFamily') return { label: `${allow}: ${word(language, FAMILIES[value]) || value}`, operation: { op: 'remove', field: 'excludedFamilies', value } };
    if (kind === 'min' || kind === 'max') {
      const drop = pick(language, 'Usuń warunek', 'Remove condition');
      if (preferences.scales[value]) return { label: `${drop}: ${scaleLabel(value, preferences.scales[value], language)}`, operation: { op: 'clearScale', scale: value } };
      const reference = preferences.references.find(r => r.scale === value);
      if (reference) return { label: `${drop}: ${word(language, COMPARATIVE[value][reference.relation])} ${perfumeLabel(reference.id)}`, operation: { op: 'removeReference', id: reference.id } };
    }
    return null;
  }

  function warningText(warning, language) {
    const name = warning.id ? perfumeLabel(warning.id) : warning.text;
    switch (warning.type) {
      case 'referenceVersionUsed': return pick(language, `Porównuję z wersją ${perfumeLabel(warning.usedId)}, bo w katalogu nie ma dokładnie zapachu ${name}. To nie jest ten sam zapach.`, `I am comparing with ${perfumeLabel(warning.usedId)}, because the catalog has no exact ${name}. It is not the same scent.`);
      case 'referenceWithoutNotes': return pick(language, `Znam ${name} za słabo, bo nie mam jego nut. Opisz, co Ci się w nim podoba.`, `I know too little about ${name}, because I have no notes for it. Describe what you like about it.`);
      case 'referenceScaleUnknown': return pick(language, `Nie mam ocen zapachu ${name}, więc nie porównuję z nim tej cechy.`, `I have no ratings for ${name}, so I am not comparing this trait with it.`);
      case 'unknownReference': return `„${name}”: ${t(language, 'notFound')}`;
      case 'unknownNote': return pick(language, `Nie rozpoznaję nuty „${warning.text}”, więc nie mogę jej uwzględnić.`, `I do not recognize the note "${warning.text}", so I cannot apply it.`);
      case 'budget': return pick(language, 'Nie mam aktualnych cen; segment jest orientacyjny.', 'I have no current prices; the segment is a rough estimate.');
      default: return null;
    }
  }

  return { summarize, fallbackWhy, fallbackTradeoff, card, details, comparison, relaxationOption, warningText };
}
