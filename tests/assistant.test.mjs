import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant, singleBound } from '../src/assistant.mjs';
import { checkPassword, isValidSession, sessionToken } from '../src/auth.mjs';
import { createEngine, emptyPreferences } from '../src/engine.mjs';
import { interactionRow, saveInteraction } from '../src/interactions.mjs';

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

test('details answer as a chat comment built from the catalog, with no model call', async () => {
  let calls = 0;
  const count = async () => { calls++; return {}; };
  const reply = await assistant({ interpret: count, select: count }).handle({ type: 'details', perfumeId: 'b', language: 'pl' });
  const [block] = reply.blocks;
  assert.equal(calls, 0);
  assert.equal(reply.message, 'Brand Name b');
  assert.equal(block.type, 'comment');
  for (const part of ['Profil zapachu.', 'Nuty głowy: bergamot, cedar', 'Nuty serca: Brak danych', 'Świeżość 5 z 5', 'Trwałość'.toLowerCase(), 'Zalety (tekst źródłowy po angielsku):\n• Lovely']) {
    assert.ok(block.text.includes(part), part);
  }
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
