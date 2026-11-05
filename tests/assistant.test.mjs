import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant, singleBound } from '../src/assistant.mjs';
import { checkPassword, isValidSession, sessionToken } from '../src/auth.mjs';
import { createEngine, emptyPreferences } from '../src/engine.mjs';
import { interactionRow, saveInteraction } from '../src/interactions.mjs';
import { createPresentation } from '../src/presentation.mjs';

test('an interaction row keeps the turn and drops what the browser should not control', () => {
  const sessionId = '6f1c2b1e-8a57-4c1a-9d3e-0123456789ab';
  const row = interactionRow(
    { type: 'message', text: ` ${'x'.repeat(2000)} `, sessionId, history: ['secret'], preferences: { huge: true } },
    { language: 'pl', message: 'm', blocks: [], warnings: [], actions: [], shownIds: ['a'], preferences: {}, summary: ['s'] },
    200, 12,
  );
  assert.equal(row.sessionId, sessionId);
  assert.equal(row.userText.length, 1000);
  assert.ok(!row.request.includes('secret') && !row.request.includes('huge'));
  assert.deepEqual(JSON.parse(row.reply).shownIds, ['a']);
  assert.ok(!('summary' in JSON.parse(row.reply)));

  const bad = interactionRow({ type: 'operations', sessionId: "x'; DROP", operations: ['y'.repeat(30000)] }, null, 502, 1);
  assert.equal(bad.sessionId, null);
  assert.equal(bad.request, null);
  assert.equal(bad.reply, null);
  assert.equal(bad.status, 502);
});

test('saving never throws, with no database or an unreachable one', async () => {
  await saveInteraction({}, '');
  await saveInteraction({}, 'not-a-connection-string');
});

const dictionary = [
  { id: 'vanilla', pl: 'wanilia', family: 'gourmand', aliases: [] },
  { id: 'bergamot', pl: 'bergamotka', family: 'citrus', aliases: [] },
  { id: 'cedar', pl: 'cedr', family: 'woody', aliases: [] },
];
const rating = (freshness, sweetness, intensity) => ({
  freshness, sweetness, intensity, formality: 3, priceSegment: 'mid', tags: ['office'], tagProbabilities: { office: 0.9 },
  profileEn: 'A profile.', profilePl: 'Profil zapachu.',
});
function perfume(id, noteIds, enrichment) {
  return {
    id, name: `Name ${id}`, brand: 'Brand', imageUrl: 'https://example.test/a.jpg', rating: 4, ratingCount: 1000, accords: [],
    genderLabel: 'men', description: 'd', notes: { top: noteIds.map(n => ({ id: n, en: n, pl: null })), heart: [], base: [] }, noteIds,
    families: [], recommendable: noteIds.length > 0, pros: ['Lovely'], cons: ['Weak'], community: {}, enrichment, review: undefined,
  };
}
const catalog = [
  perfume('a', ['vanilla', 'cedar'], rating(2, 5, 4)),
  perfume('b', ['bergamot', 'cedar'], rating(5, 1, 2)),
  perfume('c', ['bergamot'], rating(4, 2, 3)),
  perfume('d', ['cedar'], rating(3, 3, 3)),
];
catalog[1].community = { season: { winter: 10, spring: 100, summer: 60, fall: 59, mostVoted: 'spring' }, timeOfDay: { day: 100, night: 20, mostVoted: 'day' } };
const references = catalog.map(e => ({ id: e.id, name: e.name, brand: e.brand, ratingCount: 1000, status: 'selected', catalogId: e.id, accords: [], noteIds: e.noteIds }));
const engine = createEngine({ catalog, references, dictionary });

function assistant({ interpret = async () => ({ language: 'pl', intent: 'recommend', operations: [] }), select = async () => ({ picks: [] }), showImages = false } = {}) {
  return createAssistant({ engine, dictionary, interpret, select, showImages });
}
const send = (a, text, preferences = emptyPreferences()) => a.handle({ type: 'message', text, preferences, language: 'pl', history: [] });
const cardsOf = reply => reply.blocks.find(b => b.type === 'recommendations')?.cards ?? [];

test('a card lists its note tiers, and when to wear it from votes of at least 60', async () => {
  const select = async () => ({ picks: [{ id: 'b', why: 'x', tradeoff: '' }, { id: 'c', why: 'x', tradeoff: '' }] });
  const [voted, unvoted] = cardsOf(await assistant({ select }).handle({ type: 'similar', perfumeId: 'a', language: 'pl' }));
  assert.deepEqual(voted.facts, [
    { label: 'Nuty głowy', value: 'bergamot, cedar' },
    { label: 'Pora roku', value: 'na wiosnę, na lato' },
    { label: 'Pora dnia', value: 'na dzień' },
  ]);
  assert.deepEqual(unvoted.facts.slice(1).map(f => f.value), ['Brak danych', 'Brak danych']);
});

test('a message becomes operations and validated cards from the catalog', async () => {
  const a = assistant({
    interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'excludeNote', text: 'wanilia' }] }),
    select: async () => ({ picks: [{ id: 'b', why: 'Bo świeży.', tradeoff: 'Słaby.' }] }),
  });
  const reply = await send(a, 'bez wanilii');
  assert.deepEqual(reply.preferences.excludedNotes, ['vanilla']);
  assert.deepEqual(cardsOf(reply).map(c => [c.id, c.name, c.why]), [['b', 'Name b', 'Bo świeży.']]);
  assert.deepEqual(reply.summary.map(s => s.label), ['Bez: wanilia']);
  assert.equal('rating' in cardsOf(reply)[0], false);
});

test('the model cannot show a perfume outside the shortlist or more than three', async () => {
  const a = assistant({
    interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'excludeNote', text: 'vanilla' }] }),
    select: async () => ({ picks: [
      { id: 'invented', why: 'x', tradeoff: '' }, { id: 'a', why: 'excluded', tradeoff: '' },
      { id: 'b', why: 'ok', tradeoff: '' }, { id: 'b', why: 'dup', tradeoff: '' }, { id: 'c', why: 'ok', tradeoff: '' }, { id: 'd', why: 'ok', tradeoff: '' },
    ] }),
  });
  const reply = await send(a, 'bez wanilii');
  assert.deepEqual(cardsOf(reply).map(c => c.id), ['b', 'c', 'd']);
});

test('a failed selection falls back to the ranking and still respects exclusions', async () => {
  const a = assistant({
    interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'excludeNote', text: 'vanilla' }] }),
    select: async () => { throw new Error('model down'); },
  });
  const cards = cardsOf(await send(a, 'bez wanilii'));
  assert.equal(cards.length, 3);
  assert.equal(cards.some(c => c.id === 'a'), false);
  assert.ok(cards.every(c => c.why.length > 0));
});

test('a failed interpretation reaches the caller, so the user can retry', async () => {
  const a = assistant({ interpret: async () => { throw new Error('down'); } });
  await assert.rejects(send(a, 'cokolwiek'), /down/);
});

test('an unknown excluded note is reported, never silently ignored', async () => {
  const a = assistant({ interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'excludeNote', text: 'kawior' }, { op: 'likeNote', text: 'cedar' }] }) });
  const reply = await send(a, 'bez kawioru');
  assert.ok(reply.warnings.some(w => w.includes('kawior')));
});

test('invalid model operations are dropped', async () => {
  const a = assistant({ interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'hack' }, { op: 'setScale', scale: 'nope', min: 3 }, { op: 'setGender', value: 'x' }, null] }) });
  const reply = await send(a, 'x');
  assert.deepEqual(reply.preferences, emptyPreferences());
  assert.deepEqual(reply.blocks, []);
});

test('tampered browser preferences are dropped', async () => {
  const reply = await assistant().handle({ type: 'summary', preferences: { excludedNotes: ['vanilla', 'fake', 7], scales: { intensity: { max: 99 }, x: { min: 1 } }, gender: 'x', references: [{ id: 'nope', relation: 'like' }], extra: 1 } });
  assert.deepEqual(reply.preferences, { ...emptyPreferences(), excludedNotes: ['vanilla'] });
});

test('a click uses the same operations with no interpretation call', async () => {
  let calls = 0;
  const a = assistant({ interpret: async () => { calls++; return {}; } });
  const reply = await a.handle({ type: 'operations', preferences: { excludedNotes: ['vanilla'], likedNotes: ['cedar'] }, operations: [{ op: 'remove', field: 'excludedNotes', value: 'vanilla' }] });
  assert.equal(calls, 0);
  assert.deepEqual(reply.preferences.excludedNotes, []);
});

test('less sweet is computed from what is on screen', async () => {
  const reply = await assistant().handle({ type: 'action', action: 'lessSweet', shownIds: ['d'], preferences: { likedNotes: ['cedar'] } });
  assert.deepEqual(reply.preferences.scales.sweetness, { max: 2 });
  assert.equal(cardsOf(reply).some(c => c.id === 'a' || c.id === 'd'), false);
});

test('show similar keeps active exclusions', async () => {
  const reply = await assistant().handle({ type: 'similar', perfumeId: 'b', preferences: { excludedNotes: ['vanilla'] } });
  assert.equal(cardsOf(reply).some(c => c.id === 'a' || c.id === 'b'), false);
  assert.deepEqual(reply.preferences.references, [{ id: 'b', relation: 'like', scale: null }]);
});

test('no match offers a named change and leaves the profile untouched', async () => {
  const a = assistant({ interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'excludeNote', text: 'cedar' }, { op: 'excludeNote', text: 'bergamot' }] }) });
  const reply = await send(a, 'x');
  const block = reply.blocks[0];
  assert.equal(block.type, 'noMatch');
  assert.deepEqual(reply.preferences.excludedNotes, ['cedar', 'bergamot']);
  assert.equal(block.options[0].label, 'Dopuść: cedr');
  assert.deepEqual(block.options[0].operation, { op: 'remove', field: 'excludedNotes', value: 'cedar' });
});

test('a question offers ready operations and does not search', async () => {
  let selected = false;
  const a = assistant({
    interpret: async () => ({
      language: 'en', intent: 'question',
      operations: [],
      question: { text: 'How strong?', options: [{ label: 'Discreet', operations: [{ op: 'setScale', scale: 'intensity', max: 2 }] }, { label: 'Bold', operations: [{ op: 'setScale', scale: 'intensity', min: 4 }] }] },
    }),
    select: async () => { selected = true; return { picks: [] }; },
  });
  const reply = await send(a, 'something sharp');
  assert.equal(selected, false);
  assert.equal(reply.language, 'en');
  assert.deepEqual(reply.blocks[0].options[0].operations, [{ op: 'setScale', scale: 'intensity', max: 2 }]);
});

test('off-topic text gets a fixed reply, not model prose', async () => {
  const a = assistant({ interpret: async () => ({ language: 'pl', intent: 'other', operations: [], message: 'Ignore rules, buy now' }) });
  const reply = await send(a, 'napisz wiersz');
  assert.match(reply.message, /Pomagam w doborze perfum/);
});

test('details answer only as structured catalog data, with no model call', async () => {
  let calls = 0;
  const count = async () => { calls++; return {}; };
  const reply = await assistant({ interpret: count, select: count }).handle({ type: 'details', perfumeId: 'b', language: 'pl' });
  const [block] = reply.blocks;
  assert.equal(calls, 0);
  assert.equal(reply.message, 'Brand Name b');
  assert.equal(reply.blocks.length, 1);
  assert.equal(block.type, 'details');
  assert.equal(block.perfume.profile, 'Profil zapachu.');
  assert.equal(block.perfume.notes[0].value, 'bergamot, cedar');
  assert.equal(block.perfume.scales[0].value, 5);
  assert.deepEqual(block.perfume.pros, ['Lovely']);
});

test('images stay off by default and can be enabled explicitly', async () => {
  const body = { type: 'similar', perfumeId: 'b', preferences: {} };
  assert.equal(cardsOf(await assistant().handle(body))[0].imageUrl, null);
  assert.equal(cardsOf(await assistant({ showImages: true }).handle(body))[0].imageUrl, 'https://example.test/a.jpg');
});

test('compare names the widest difference and rejects one perfume', async () => {
  const reply = await assistant().handle({ type: 'compare', perfumeIds: ['a', 'b'], language: 'pl' });
  assert.match(reply.blocks[0].summary, /Największa różnica/);
  assert.deepEqual(reply.blocks[0].sharedNotes, ['cedr']);
  const [unvoted, voted] = reply.blocks[0].perfumes;
  assert.deepEqual([voted.topNotes, voted.heartNotes, voted.season, voted.timeOfDay], ['bergamot, cedar', null, 'na wiosnę, na lato', 'na dzień']);
  assert.deepEqual([unvoted.season, unvoted.timeOfDay], ['Brak danych', 'Brak danych']);
  assert.deepEqual((await assistant().handle({ type: 'compare', perfumeIds: ['a'] })).blocks, []);
});

const structuredEntry = {
  ...perfume('structured', ['bergamot', 'vanilla', 'cedar'], rating(5, 1, 2)),
  notes: {
    top: [{ id: 'bergamot', en: 'bergamot', pl: 'bergamotka' }],
    heart: [{ id: 'vanilla', en: 'vanilla', pl: 'wanilia' }],
    base: [{ id: 'cedar', en: 'cedar', pl: 'cedr' }],
  },
  community: { ...catalog[1].community, longevity: { mostVoted: 'longLasting' }, sillage: { mostVoted: 'intimate' } },
  pros: ['Source pro 1', 'Source pro 2', 'Source pro 3', 'Source pro 4', 'Source pro 5', 'Source pro 6'],
  cons: ['Source con'],
};
const missingEntry = { ...perfume('missing', [], null), imageUrl: undefined, pros: [], cons: [] };
const structuredEngine = createEngine({ catalog: [structuredEntry, missingEntry], references: [], dictionary });
const unexpectedModel = async () => { assert.fail('details/compare must not call a model'); };
const structuredAssistant = (showImages = false) => createAssistant({
  engine: structuredEngine, dictionary, showImages, interpret: unexpectedModel, select: unexpectedModel,
});

for (const language of ['pl', 'en']) {
  const en = language === 'en';
  const notes = [
    { key: 'top', label: en ? 'Top notes' : 'Nuty głowy', value: en ? 'bergamot' : 'bergamotka' },
    { key: 'heart', label: en ? 'Heart notes' : 'Nuty serca', value: en ? 'vanilla' : 'wanilia' },
    { key: 'base', label: en ? 'Base notes' : 'Nuty bazy', value: en ? 'cedar' : 'cedr' },
  ];
  const scales = [
    { key: 'freshness', label: en ? 'Freshness' : 'Świeżość', value: 5 },
    { key: 'sweetness', label: en ? 'Sweetness' : 'Słodycz', value: 1 },
    { key: 'intensity', label: en ? 'Intensity' : 'Intensywność', value: 2 },
    { key: 'formality', label: en ? 'Formality' : 'Formalność', value: 3 },
  ];

  test(`${language}: recommendations add catalog profile, keyed notes and scales without changing facts`, async () => {
    const a = createAssistant({
      engine: structuredEngine, dictionary,
      interpret: unexpectedModel, select: async () => ({ picks: [{ id: 'structured', why: 'Selected reason.' }] }),
    });
    const [card] = cardsOf(await a.handle({ type: 'operations', language, operations: [{ op: 'add', field: 'likedNotes', value: 'bergamot' }] }));
    assert.equal(card.profile, en ? 'A profile.' : 'Profil zapachu.');
    assert.deepEqual(card.notes, notes);
    assert.deepEqual(card.scales, scales);
    assert.deepEqual(card.facts, [
      ...notes.map(({ label, value }) => ({ label, value })),
      { label: en ? 'Season' : 'Pora roku', value: en ? 'for spring, for summer' : 'na wiosnę, na lato' },
      { label: en ? 'Time of day' : 'Pora dnia', value: en ? 'for daytime' : 'na dzień' },
    ]);
  });

  test(`${language}: structured details expose source-truth values without duplicate comments or models`, async () => {
    const reply = await structuredAssistant().handle({ type: 'details', perfumeId: 'structured', language });
    assert.deepEqual(reply.blocks.map(block => block.type), ['details']);
    assert.equal(reply.message, 'Brand Name structured');
    assert.deepEqual(reply.blocks[0], { type: 'details', perfume: {
      id: 'structured', brand: 'Brand', name: 'Name structured', imageUrl: null,
      profile: en ? 'A profile.' : 'Profil zapachu.', facets: [],
      wear: [
        { key: 'season', label: en ? 'Season' : 'Pora roku', value: en ? 'for spring, for summer' : 'na wiosnę, na lato' },
        { key: 'timeOfDay', label: en ? 'Time of day' : 'Pora dnia', value: en ? 'for daytime' : 'na dzień' },
      ], notes, scales,
      longevity: en ? 'long-lasting' : 'wysoka', sillage: en ? 'intimate' : 'blisko skóry',
      season: en ? 'for spring, for summer' : 'na wiosnę, na lato', timeOfDay: en ? 'for daytime' : 'na dzień',
      priceSegment: en ? 'Mid-range' : 'Średnia półka', pros: structuredEntry.pros, cons: structuredEntry.cons,
    } });
    // Raw English source lists are neither translated nor truncated in the structured block.
    assert.equal(reply.blocks[0].perfume.pros.length, 6);
  });

  test(`${language}: absent data keeps all note groups and nullable scales in details and comparison`, async () => {
    const a = structuredAssistant(true);
    const reply = await a.handle({ type: 'details', perfumeId: 'missing', language });
    const details = reply.blocks[0].perfume;
    assert.deepEqual(details.notes, notes.map(note => ({ ...note, value: en ? 'No data' : 'Brak danych' })));
    assert.deepEqual(details.scales, scales.map(scale => ({ ...scale, value: null })));
    for (const field of ['profile', 'imageUrl', 'longevity', 'sillage', 'priceSegment']) assert.equal(details[field], null, field);
    assert.equal(details.season, en ? 'No data' : 'Brak danych');
    assert.equal(details.timeOfDay, en ? 'No data' : 'Brak danych');
    assert.deepEqual(details.pros, []);
    assert.deepEqual(details.cons, []);
    const comparison = (await a.handle({ type: 'compare', perfumeIds: ['structured', 'missing'], language })).blocks[0];
    assert.deepEqual(comparison.perfumes[0].scales, scales);
    assert.deepEqual(comparison.perfumes[1].scales, details.scales);
    assert.equal(comparison.perfumes[0].profile, en ? 'A profile.' : 'Profil zapachu.');
    assert.equal(comparison.perfumes[0].topNotes, notes[0].value);
    assert.equal(comparison.perfumes[1].imageUrl, null);
  });
}

test('presentation defaults hide images and cards retain missing groups, null profiles and partial scales', () => {
  const presentation = createPresentation({ engine: structuredEngine, dictionary });
  const entry = { ...structuredEntry, enrichment: { freshness: 1, profileEn: 'English only.' } };
  const card = presentation.card(entry, 'pl', 'Why.', 'Tradeoff.');
  assert.equal(card.imageUrl, null);
  assert.equal(card.profile, null); // Never substitute the other language's profile.
  assert.deepEqual(card.scales.map(({ key, value }) => [key, value]), [
    ['freshness', 1], ['sweetness', null], ['intensity', null], ['formality', null],
  ]);
  assert.equal(presentation.card(entry, 'en', '', '').profile, 'English only.');
  const missing = presentation.card(missingEntry, 'en', '', '');
  assert.equal(missing.profile, null);
  assert.equal(missing.notes.length, 3);
  assert.ok(missing.notes.every(note => note.value === 'No data'));
  assert.equal(missing.scales.length, 4);
  assert.ok(missing.scales.every(scale => scale.value === null));
  assert.deepEqual(missing.facts, [
    { label: 'Season', value: 'No data' }, { label: 'Time of day', value: 'No data' },
  ]);
  assert.equal(presentation.details(structuredEntry, 'en').blocks[0].perfume.imageUrl, null);
  assert.ok(presentation.comparison(['structured', 'missing'], 'en').perfumes.every(perfume => perfume.imageUrl === null));
});

test('image gate applies to structured details and comparison as well as recommendations', async () => {
  for (const showImages of [false, true]) {
    const a = structuredAssistant(showImages);
    const details = await a.handle({ type: 'details', perfumeId: 'structured' });
    const comparison = await a.handle({ type: 'compare', perfumeIds: ['structured', 'missing'] });
    const expected = showImages ? structuredEntry.imageUrl : null;
    assert.equal(details.blocks[0].perfume.imageUrl, expected);
    assert.equal(comparison.blocks[0].perfumes[0].imageUrl, expected);
    if (!showImages) {
      assert.ok(!JSON.stringify(details).includes(structuredEntry.imageUrl));
      assert.ok(!JSON.stringify(comparison).includes(structuredEntry.imageUrl));
    }
  }
});

test('chat details and comparison use the same presentation and never select recommendations', async () => {
  for (const intent of ['details', 'compare']) {
    let interpretations = 0;
    const a = assistant({
      interpret: async () => { interpretations++; return { intent, language: 'en', perfumes: ['Name a', 'Name b'] }; },
      select: unexpectedModel,
    });
    const chat = await send(a, 'tell me about these');
    const direct = await a.handle(intent === 'details'
      ? { type: 'details', perfumeId: 'a', language: 'en' }
      : { type: 'compare', perfumeIds: ['a', 'b'], language: 'en' });
    assert.equal(interpretations, 1);
    assert.deepEqual(chat.blocks, direct.blocks);
  }
});

test('direct comparison deduplicates and drops invalid IDs before the three-perfume limit, without models', async () => {
  const a = assistant({ interpret: unexpectedModel, select: unexpectedModel });
  const reply = await a.handle({ type: 'compare', perfumeIds: ['invalid', null, 'a', 'a', {}, 'b', 'c', 'd'] });
  assert.deepEqual(reply.blocks[0].perfumes.map(perfume => perfume.id), ['a', 'b', 'c']);
  for (const perfumeIds of [['a', 'a', 'invalid'], ['invalid', null], [], null]) {
    const rejected = await a.handle({ type: 'compare', perfumeIds });
    assert.deepEqual(rejected.blocks, []);
    assert.match(rejected.message, /dwóch lub trzech/);
  }
  assert.deepEqual((await a.handle({ type: 'details', perfumeId: 'invalid' })).blocks, []);
});

test('budget adds an honest note about prices', async () => {
  const a = assistant({ interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'budget', value: 'mid' }] }) });
  assert.ok((await send(a, 'do 300 zł')).warnings.some(w => w.includes('Nie mam aktualnych cen')));
});

test('password check fails closed and session tokens cannot be forged', () => {
  assert.equal(checkPassword('x', ''), false);
  assert.equal(checkPassword('x', undefined), false);
  assert.equal(checkPassword('sekret', 'sekret'), true);
  assert.equal(checkPassword('zle', 'sekret'), false);
  assert.equal(isValidSession(sessionToken('sekret'), 'sekret'), true);
  assert.equal(isValidSession('forged', 'sekret'), false);
  assert.equal(isValidSession(undefined, 'sekret'), false);
});

test('discoveries exclude owned items for messages, operations, actions and similar, including fallback', async () => {
  const preferences = engine.apply(emptyPreferences(), { op: 'add', field: 'likedNotes', value: 'cedar' });
  const before = structuredClone(preferences);
  for (const selectMode of ['empty', 'invalid', 'failure']) {
    const a = assistant({
      select: async input => {
        assert.ok(input.candidates.every(c => !['b', 'c'].includes(c.id)));
        if (selectMode === 'failure') throw new Error('selection unavailable');
        return { picks: selectMode === 'empty' ? [] : [{ id: 'b' }, { id: 'invalid' }, { id: null }] };
      },
    });
    for (const request of [
      { type: 'message', text: 'something new' },
      { type: 'operations', operations: [] },
      { type: 'action', action: 'lessSweet', shownIds: ['a'] },
      { type: 'similar', perfumeId: 'a' },
    ]) {
      const reply = await a.handle({ ...request, preferences, ownedIds: ['b', 'c', 'b', 'invalid', {}, null] });
      assert.ok(reply.shownIds.length > 0);
      assert.ok(reply.shownIds.every(id => ['a', 'd'].includes(id)));
      assert.deepEqual(reply.preferences.excludedPerfumes, []);
      assert.equal('ownedIds' in reply.preferences, false);
      assert.equal('collectionOnly' in reply.preferences, false);
    }
  }
  assert.deepEqual(preferences, before);
});

test('collection-only can choose without preferences, honors hard exclusions, and ignores forged picks', async () => {
  const preferences = { ...emptyPreferences(), excludedNotes: ['vanilla'], excludedPerfumes: ['d'] };
  const before = structuredClone(preferences);
  const a = assistant({ select: async input => {
    assert.deepEqual(input.candidates.map(c => c.id), ['b']);
    return { picks: [{ id: 'a' }, { id: 'c' }, { id: 'invented' }, { id: 'b', why: 'Fits.' }] };
  } });
  const reply = await a.handle({ type: 'operations', operations: [], preferences, collectionOnly: true, ownedIds: ['a', 'b', 'd'] });
  assert.deepEqual(reply.shownIds, ['b']);
  assert.deepEqual(reply.preferences, before);
  assert.deepEqual(preferences, before);
  const noPreferences = await assistant().handle({ type: 'operations', collectionOnly: true, ownedIds: ['c'] });
  assert.deepEqual(noPreferences.shownIds, ['c']);
});

for (const language of ['pl', 'en']) {
  test(`${language}: explicit empty collection needs no model, and no-match never invents a collection fit`, async () => {
    const a = assistant({ interpret: unexpectedModel, select: unexpectedModel });
    for (const ownedIds of [undefined, [], null, 'b', {}, ['invalid', null, {}, 'Name b']]) {
      for (const type of ['message', 'operations', 'similar']) {
        const reply = await a.handle({ type, text: 'from my collection', perfumeId: 'b', collectionOnly: true, ownedIds, language });
        assert.deepEqual(reply.shownIds, []);
        assert.deepEqual(cardsOf(reply), []);
        assert.deepEqual(reply.blocks, []);
        assert.match(reply.message, language === 'en' ? /collection is empty/ : /kolekcja jest pusta/);
      }
    }
    const preferences = { ...emptyPreferences(), excludedNotes: ['vanilla'] };
    const noMatch = await a.handle({ type: 'operations', collectionOnly: true, ownedIds: ['a'], preferences, language });
    assert.match(noMatch.message, language === 'en' ? /No perfume in your collection matches/ : /Żadne perfumy z Twojej kolekcji/);
    assert.deepEqual(noMatch.blocks, []);
    assert.deepEqual(noMatch.preferences, preferences);
  });
}

test('interpretation receives validated collection labels and IDs; only the latest intent flag controls scope', async () => {
  let turn = 0;
  const a = assistant({
    interpret: async input => {
      assert.deepEqual(input.collection, [{ id: 'b', label: 'Brand Name b' }]);
      assert.equal('ownedIds' in input.currentPreferences, false);
      turn++;
      return { intent: 'recommend', language: 'en', collectionOnly: turn === 1,
        ownedIds: ['a', 'c'], collection: [{ id: 'a' }], operations: [] };
    },
  });
  const preferences = { ...emptyPreferences(), likedNotes: ['cedar'] };
  const first = await a.handle({ type: 'message', text: 'what from my collection for a date', preferences,
    ownedIds: ['b', 'b', {}, 1, 'invalid'], history: [] });
  assert.deepEqual(first.shownIds, ['b']);
  const second = await a.handle({ type: 'message', text: 'something new', preferences: first.preferences,
    ownedIds: ['b', 'b', {}, 1, 'invalid'], history: [{ role: 'user', text: 'what from my collection for a date' }] });
  assert.ok(second.shownIds.length);
  assert.ok(!second.shownIds.includes('b'));
  assert.deepEqual(second.preferences, preferences);
});

test('explicit boolean collection scope wins over interpretation; truthy non-booleans do not enable it', async () => {
  const preferences = { ...emptyPreferences(), likedNotes: ['cedar'] };
  const a = assistant({ interpret: async () => ({ intent: 'recommend', collectionOnly: false, operations: [] }) });
  const ownedOnly = await a.handle({ type: 'message', text: 'choose', preferences, ownedIds: ['b'], collectionOnly: true });
  assert.deepEqual(ownedOnly.shownIds, ['b']);
  for (const collectionOnly of ['true', 1, {}, false, undefined]) {
    const reply = await a.handle({ type: 'operations', preferences, ownedIds: ['b'], collectionOnly });
    assert.ok(!reply.shownIds.includes('b'));
  }
  const modelTruthy = assistant({ interpret: async () => ({ intent: 'recommend', collectionOnly: 'true', operations: [] }) });
  assert.ok(!(await modelTruthy.handle({ type: 'message', text: 'new', preferences, ownedIds: ['b'] })).shownIds.includes('b'));
});

test('reply collection scope round-trips through questions, operations and actions but not fresh messages', async () => {
  let interpretations = 0;
  const a = assistant({ interpret: async () => {
    interpretations++;
    return interpretations === 1
      ? { intent: 'question', language: 'en', collectionOnly: true, operations: [], question: {
        text: 'How strong?', options: [
          { label: 'Discreet', operations: [{ op: 'setScale', scale: 'intensity', max: 2 }] },
          { label: 'Bold', operations: [{ op: 'setScale', scale: 'intensity', min: 4 }] },
        ],
      } }
      : { intent: 'recommend', language: 'en', collectionOnly: false, operations: [
        { op: 'clearScale', scale: 'intensity' }, { op: 'clearScale', scale: 'sweetness' }, { op: 'likeNote', text: 'cedar' },
      ] };
  } });
  const ownedIds = ['b', 'd'];
  const question = await a.handle({ type: 'message', text: 'from my collection', ownedIds });
  assert.equal(question.collectionOnly, true);
  const answer = await a.handle({ type: 'operations', operations: question.blocks[0].options[0].operations,
    preferences: question.preferences, ownedIds, collectionOnly: question.collectionOnly });
  assert.equal(answer.collectionOnly, true);
  assert.deepEqual(answer.shownIds, ['b']);
  const action = await a.handle({ type: 'action', action: answer.actions[0].action,
    shownIds: answer.shownIds, preferences: answer.preferences, ownedIds, collectionOnly: answer.collectionOnly });
  assert.equal(action.collectionOnly, true);
  assert.deepEqual(action.shownIds, ['b']);
  const summary = await a.handle({ type: 'summary', preferences: action.preferences, ownedIds, collectionOnly: action.collectionOnly });
  assert.equal(summary.collectionOnly, true);
  const fresh = await a.handle({ type: 'message', text: 'something new, any intensity or sweetness', preferences: action.preferences, ownedIds });
  assert.equal(fresh.collectionOnly, false);
  assert.ok(fresh.shownIds.length);
  assert.ok(fresh.shownIds.every(id => !ownedIds.includes(id)));
  assert.equal('collectionOnly' in fresh.preferences, false);
  assert.equal(interpretations, 2);
});

test('empty, no-match and rejected action replies retain explicit collection scope', async () => {
  const a = assistant({ interpret: unexpectedModel, select: unexpectedModel });
  for (const body of [
    { type: 'message', text: 'from collection', ownedIds: [] },
    { type: 'operations', ownedIds: ['a'], preferences: { excludedNotes: ['vanilla'] } },
    { type: 'action', action: 'invalid', ownedIds: ['a'] },
  ]) {
    const reply = await a.handle({ ...body, collectionOnly: true });
    assert.equal(reply.collectionOnly, true);
    assert.deepEqual(reply.shownIds, []);
  }
  const summary = await a.handle({ type: 'summary', collectionOnly: 'true' });
  assert.equal(summary.collectionOnly, false);
});

for (const language of ['pl', 'en']) {
  test(`${language}: cards expose community-backed longevity and sillage without guessing from scales or tags`, () => {
    const presentation = createPresentation({ engine: structuredEngine, dictionary });
    const card = presentation.card(structuredEntry, language, '', '');
    assert.equal(card.longevity, language === 'en' ? 'long-lasting' : 'wysoka');
    assert.equal(card.sillage, language === 'en' ? 'intimate' : 'blisko skóry');
    const details = presentation.details(structuredEntry, language).blocks[0].perfume;
    assert.equal(card.longevity, details.longevity);
    assert.equal(card.sillage, details.sillage);
    for (const entry of [missingEntry, { ...structuredEntry, community: {},
      enrichment: { ...structuredEntry.enrichment, intensity: 1, tags: ['skin-like', 'daily-wear'] } }]) {
      const absent = presentation.card(entry, language, '', '');
      assert.equal(absent.longevity, null);
      assert.equal(absent.sillage, null);
    }
  });
}

test('owned-only action and similar stay in collection, while direct details stay accessible', async () => {
  const a = assistant({ interpret: unexpectedModel });
  const action = await a.handle({ type: 'action', action: 'lessSweet', shownIds: ['d'], ownedIds: ['b'], collectionOnly: true });
  assert.deepEqual(action.shownIds, ['b']);
  const similar = await a.handle({ type: 'similar', perfumeId: 'a', ownedIds: ['b'], collectionOnly: true });
  assert.deepEqual(similar.shownIds, ['b']);
  const details = await a.handle({ type: 'details', perfumeId: 'b', ownedIds: ['b'], collectionOnly: true });
  assert.deepEqual(details.blocks.map(b => b.type), ['details']);
  assert.equal(details.blocks[0].perfume.id, 'b');
});

for (const language of ['pl', 'en']) {
  test(`${language}: facets are localized olfactory tags only, capped, with mapped family fallback`, () => {
    const presentation = createPresentation({ engine, dictionary });
    const tagged = { ...catalog[0], enrichment: { ...catalog[0].enrichment,
      tags: ['office', 'date-night', 'daily-wear', 'summer', 'winter', 'evening', 'retro', 'invented', 'woody', 'woody', 'clean', 'vanillic', 'smoky', 'oud'] } };
    const expected = [
      { key: 'woody', label: language === 'en' ? 'Woody' : 'Drzewne' },
      { key: 'clean', label: language === 'en' ? 'Clean' : 'Czyste' },
      { key: 'vanillic', label: language === 'en' ? 'Vanillic' : 'Waniliowe' },
      { key: 'smoky', label: language === 'en' ? 'Smoky' : 'Dymne' },
    ];
    assert.deepEqual(presentation.card(tagged, language, '', '').facets, expected);
    assert.deepEqual(presentation.details(tagged, language).blocks[0].perfume.facets, expected);
    const fallback = { ...catalog[0], enrichment: { tags: ['office', 'unknown'], profileEn: 'Invented citrus prose', profilePl: 'Cytrusowy opis' },
      families: ['unknown', 'citrus', 'citrus', 'woody', 'floral', 'green', 'amber'] };
    assert.deepEqual(presentation.card(fallback, language, '', '').facets, [
      { key: 'citrus', label: language === 'en' ? 'citrus' : 'cytrusowe' },
      { key: 'woody', label: language === 'en' ? 'woody' : 'drzewne' },
      { key: 'floral', label: language === 'en' ? 'floral' : 'kwiatowe' },
      { key: 'green', label: language === 'en' ? 'green' : 'zielone' },
    ]);
    const absent = { ...fallback, families: ['invented'] };
    assert.deepEqual(presentation.card(absent, language, '', '').facets, []);
    assert.deepEqual(presentation.details(absent, language).blocks[0].perfume.facets, []);
  });

  test(`${language}: facet probabilities rank supplied tags before the cap with stable ties and no inference`, () => {
    const presentation = createPresentation({ engine, dictionary });
    const entry = { ...catalog[0], enrichment: {
      tags: ['earthy', 'fruity', 'green', 'incense', 'resinous', 'office'],
      tagProbabilities: { earthy: 0.3, fruity: 0.3, green: 0.2, incense: 0.95, resinous: 0.9, office: 1, oud: 1 },
    } };
    const expected = [
      { key: 'incense', label: language === 'en' ? 'Incense' : 'Kadzidlane' },
      { key: 'resinous', label: language === 'en' ? 'Resinous' : 'Żywiczne' },
      { key: 'earthy', label: language === 'en' ? 'Earthy' : 'Ziemiste' },
      { key: 'fruity', label: language === 'en' ? 'Fruity' : 'Owocowe' },
    ];
    assert.deepEqual(presentation.card(entry, language, '', '').facets, expected);
    assert.deepEqual(presentation.details(entry, language).blocks[0].perfume.facets, expected);
    assert.deepEqual(entry.enrichment.tags, ['earthy', 'fruity', 'green', 'incense', 'resinous', 'office']);
    for (const tagProbabilities of [undefined, {}, { earthy: '1', fruity: NaN, green: Infinity, oud: 1 }]) {
      const unscored = { ...entry, enrichment: { ...entry.enrichment, tagProbabilities } };
      assert.deepEqual(presentation.card(unscored, language, '', '').facets.map(f => f.key), ['earthy', 'fruity', 'green', 'incense']);
    }
  });

  test(`${language}: wear exposes only known votes >=60 and never placeholder rows or inferred occasions`, () => {
    const presentation = createPresentation({ engine, dictionary });
    const expected = [
      { key: 'season', label: language === 'en' ? 'Season' : 'Pora roku', value: language === 'en' ? 'for spring, for summer' : 'na wiosnę, na lato' },
      { key: 'timeOfDay', label: language === 'en' ? 'Time of day' : 'Pora dnia', value: language === 'en' ? 'for daytime' : 'na dzień' },
    ];
    assert.deepEqual(presentation.card(catalog[1], language, '', '').wear, expected);
    assert.deepEqual(presentation.details(catalog[1], language).blocks[0].perfume.wear, expected);
    const unknown = { ...catalog[0], community: { season: { mostVoted: 'summer', summer: '100', winter: 59, fake: 100 }, timeOfDay: { day: NaN, night: Infinity } },
      enrichment: { ...catalog[0].enrichment, tags: ['summer', 'evening', 'date-night'] } };
    assert.deepEqual(presentation.card(unknown, language, '', '').wear, []);
    assert.deepEqual(presentation.details(unknown, language).blocks[0].perfume.wear, []);
    assert.deepEqual(presentation.card(missingEntry, language, '', '').wear, []);
  });
}

test('a scale keeps only the bound that says something', () => {
  assert.deepEqual(singleBound({ min: 4, max: 5, target: 4 }), { min: 4 });
  assert.deepEqual(singleBound({ min: 1, max: 2, target: 1 }), { max: 2 });
  assert.deepEqual(singleBound({ min: 2, max: 4 }), { min: 2, max: 4 });
  assert.deepEqual(singleBound({ target: 3 }), { target: 3 });
});

test('model text cannot promise perfection or invent the absence of flaws', async () => {
  const noCons = { ...perfume('e', ['bergamot'], rating(4, 2, 3)), cons: [] };
  const local = createEngine({ catalog: [...catalog, noCons], references: [...references, { id: 'e', name: 'e', brand: 'B', ratingCount: 1, status: 'selected', catalogId: 'e', accords: [], noteIds: ['bergamot'] }], dictionary });
  const a = createAssistant({
    engine: local, dictionary,
    interpret: async () => ({ language: 'pl', intent: 'recommend', operations: [{ op: 'likeNote', text: 'bergamot' }] }),
    select: async () => ({ picks: [
      { id: 'b', why: 'Idealny do biura.', tradeoff: 'Nie wykazano żadnych znanych wad.' },
      { id: 'c', why: 'Dobry.', tradeoff: 'Bywa uznawany za słaby.' },
      { id: 'e', why: 'Dobry.', tradeoff: 'Wymyślona wada bez danych.' },
    ] }),
  });
  const cards = cardsOf(await send(a, 'x'));
  assert.equal(cards[0].why, 'Dobry do biura.');
  assert.equal(cards[0].tradeoff, '');
  assert.equal(cards[1].tradeoff, 'Bywa uznawany za słaby.');
  assert.equal(cards[2].tradeoff, '');
});
