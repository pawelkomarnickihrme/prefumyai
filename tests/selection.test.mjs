import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRecord, sortByPopularity, shortlist, buildRequest, routeDecision, requestKey } from '../scripts/selection.mjs';
import { options, run } from '../scripts/select-perfumes.mjs';
import { experimental_decide as decide } from 'ai';
import { Experimental_DecisionMockModelV4 } from 'ai/test';

const record = (id, name, ratingCount, brand = 'Dior') => parseRecord({ perfumeName: name, brand, ratingCount }, id);
const yes = (choice = 'distinct', probability = 0.98) => ({
  recommendable: { type: 'boolean', probability },
  family: { type: 'choice', choice, probabilities: { [choice]: 0.99 } },
});

test('ratingCount, not rating, controls popularity; null counts mean zero', () => {
  const a = record('a.json', 'A', 10), b = record('b.json', 'B', 100);
  assert.deepEqual(sortByPopularity([a, b]).map(r => r.id), ['b.json', 'a.json']);
  assert.equal(record('c.json', 'C', null).ratingCount, 0);
  assert.throws(() => record('d.json', 'D', '1,000'));
  assert.throws(() => record('d.json', 'D', -1));
});

test('shortlist compares same-brand names but leaves family decision to model', () => {
  const base = record('base.json', 'Sauvage Dior', 1000);
  const unrelated = record('other.json', 'Homme Dior', 2000);
  const otherBrand = record('brand.json', 'Sauvage', 2000, 'Other');
  assert.deepEqual(shortlist(record('edp.json', 'Sauvage Eau de Parfum Dior', 500), [base, unrelated, otherBrand]), [base]);
  assert.deepEqual(shortlist(record('eau.json', 'Eau Sauvage Dior', 500), [base]), [base]);
});

test('AI chooses selected / duplicate / excluded / review with validated probabilities', () => {
  const base = record('base.json', 'Sauvage', 1000);
  assert.equal(routeDecision(yes(), []).status, 'selected');
  assert.deepEqual(routeDecision(yes('family_0'), [base]), {
    status: 'excluded', reason: 'less_popular_variant', representativeId: 'base.json',
  });
  assert.equal(routeDecision(yes('distinct', 0.05), []).status, 'excluded');
  assert.equal(routeDecision(yes('distinct', 0.5), []).status, 'review');
  assert.equal(routeDecision({ ...yes(), family: { type: 'choice', choice: 'distinct' } }, []).status, 'review');
  assert.throws(() => routeDecision(yes('family_99'), [base]));
  assert.throws(() => routeDecision(yes('distinct', NaN), []));
});

test('cache keys include policy inputs, availability and confidence threshold', () => {
  const a = record('a.json', 'Sauvage', 1000);
  const request = buildRequest(a, [], { status: 'unknown' });
  assert.equal(requestKey(request, 0.8), requestKey(request, 0.8));
  assert.notEqual(requestKey(request, 0.8), requestKey(request, 0.9));
  assert.notEqual(requestKey(request, 0.8), requestKey(buildRequest(a, [], { status: 'unavailable' }), 0.8));
});

test('request runs through real experimental_decide using SDK mock model', async () => {
  const candidate = record('sdk.json', 'Sauvage', 1000);
  const request = buildRequest(candidate, [], { status: 'unknown' });
  let called = false;
  const model = new Experimental_DecisionMockModelV4({
    doDecide: async () => {
      called = true;
      return {
        answers: {
          family: { type: 'choice', choice: 'distinct', probabilities: { distinct: 1 } },
          recommendable: { type: 'boolean', probability: 0.99 },
        },
        warnings: [], usage: { inputTokens: 1, outputTokens: 0 },
      };
    },
  });
  const result = await decide({ ...request, model });
  assert.equal(called, true);
  assert.equal(routeDecision(result.answers, []).status, 'selected');
});

test('CLI accepts npm and pnpm argument separators without losing limit or apply', () => {
  const direct = options(['--apply', '--limit', '20']);
  const forwarded = options(['--apply', '--', '--limit', '20']);
  const leading = options(['--', '--apply', '--limit', '20']);
  assert.equal(forwarded.limit, 20);
  assert.equal(forwarded.apply, true);
  assert.deepEqual(forwarded, direct);
  assert.deepEqual(leading, direct);
  assert.throws(() => options(['--apply', '--', '--unknown']));
  assert.throws(() => options(['--apply', '--', 'unexpected']));
});

test('CLI rejects invalid costs/options and output inside source', () => {
  for (const args of [['--limit', '0'], ['--min-ratings', '-1'], ['--confidence', '0.5'], ['--what']]) {
    assert.throws(() => options(args));
  }
  assert.throws(() => options(['--source', '/tmp/source', '--output', '/tmp/source/results']));
  assert.equal(options([]).apply, false);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'perfume-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), output = join(root, 'output');
  await mkdir(source);
  const put = (file, name, count) => writeFile(join(source, file), JSON.stringify({ perfumeName: name, brand: 'Dior', ratingCount: count }));
  await put('popular.json', 'Sauvage Dior', 3000);
  await put('variant.json', 'Sauvage Eau de Parfum Dior', 2000);
  await put('other.json', 'Homme Dior', 1000);
  await put('low.json', 'Rare', 5);
  await writeFile(join(source, 'broken.json'), '{');
  await mkdir(join(source, 'nested'));
  await writeFile(join(source, 'nested', 'duplicate.json'), '{}');
  return { root, source, output, config: { source, output, minRatings: 200, limit: Infinity, threshold: 0.8, apply: true } };
}

test('plan has no AI calls or output writes and ignores nested duplicate exports', async t => {
  const { config, output } = await fixture(t);
  const result = await run({ ...config, apply: false }, {
    decide: () => assert.fail('AI called during plan'), log: () => {},
  });
  assert.equal(result.plan.sourceFiles, 5);
  assert.equal(result.plan.invalid, 1);
  assert.equal(result.plan.toProcess, 3);
  await assert.rejects(readdir(output), { code: 'ENOENT' });
});

test('apply copies originals, picks popular family representative, caches decisions', async t => {
  const { config, source } = await fixture(t);
  const original = await readFile(join(source, 'popular.json'), 'utf8');
  let calls = 0;
  const fake = async request => {
    calls++;
    assert.equal(request.model, 'typesafe-ai/jev');
    return { answers: yes(request.state.candidate.id === 'variant.json' ? 'family_0' : 'distinct') };
  };
  const first = await run(config, { decide: fake, log: () => {} });
  assert.equal(first.summary.selected, 2);
  assert.equal(first.summary.excluded, 2);
  assert.equal(first.summary.invalid, 1);
  assert.equal(calls, 3);
  assert.deepEqual((await readdir(join(first.summary.runDir, 'wybrane'))).sort(), ['other.json', 'popular.json']);
  assert.equal(await readFile(join(first.summary.runDir, 'wybrane', 'popular.json'), 'utf8'), original);
  assert.equal(await readFile(join(source, 'popular.json'), 'utf8'), original);
  const second = await run(config, { decide: fake, log: () => {} });
  assert.equal(calls, 3);
  assert.equal(second.summary.cacheHits, 3);
});

test('availability evidence filters unavailable products, never guesses stock', async t => {
  const { config, root } = await fixture(t);
  const availability = join(root, 'availability.json');
  await writeFile(availability, JSON.stringify({
    'popular.json': { status: 'unavailable', source: 'manual check', checkedAt: '2026-11-04' },
  }));
  const result = await run({ ...config, availability }, { decide: async () => ({ answers: yes() }), log: () => {} });
  assert.equal(result.summary.selected, 2);
  const report = await readFile(join(result.summary.runDir, 'raporty', 'decyzje.jsonl'), 'utf8');
  assert.match(report, /confirmed_unavailable/);
  await writeFile(availability, JSON.stringify({ 'popular.json': { status: 'unavailable' } }));
  await assert.rejects(run({ ...config, availability }, { log: () => {} }), /source oraz checkedAt/);
});

test('limited run marks unprocessed entries as pending', async t => {
  const { config } = await fixture(t);
  const result = await run({ ...config, limit: 1 }, { decide: async () => ({ answers: yes() }), log: () => {} });
  assert.equal(result.summary.pending, 2);
  assert.equal(result.summary.complete, false);
  const report = await readFile(join(result.summary.runDir, 'raporty', 'decyzje.jsonl'), 'utf8');
  assert.equal(report.split('\n').filter(line => line.includes('run_limit')).length, 2);
});

const hang = ({ abortSignal }) => new Promise((_, reject) => {
  abortSignal.addEventListener('abort', () => reject(abortSignal.reason));
});

test('a timed out model call is retried with a fresh signal', async t => {
  const { config } = await fixture(t);
  const signals = [];
  const result = await run({ ...config, limit: 1 }, {
    timeoutMs: 5, log: () => {},
    decide: async request => {
      signals.push(request.abortSignal);
      return signals.length === 1 ? hang(request) : { answers: yes() };
    },
  });
  assert.equal(result.summary.selected, 1);
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
});

test('repeated timeouts stop the run after 3 attempts; other errors are not retried here', async t => {
  const { config } = await fixture(t);
  let calls = 0;
  await assert.rejects(run({ ...config, limit: 1 }, {
    timeoutMs: 5, log: () => {},
    decide: request => { calls++; return hang(request); },
  }), /Przerwano/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(run({ ...config, limit: 1 }, {
    timeoutMs: 1000, log: () => {},
    decide: async () => { calls++; throw new Error('provider offline'); },
  }), /provider offline/);
  assert.equal(calls, 1);
});

test('uncertain decisions go to review; AI failures stop instead of silently discarding', async t => {
  const { config } = await fixture(t);
  const review = await run({ ...config, limit: 1 }, { decide: async () => ({ answers: yes('distinct', 0.5) }), log: () => {} });
  assert.equal(review.summary.review, 1);
  assert.deepEqual(await readdir(join(review.summary.runDir, 'do-weryfikacji')), ['popular.json']);
  // Changed confidence invalidates cache for the failure check.
  await assert.rejects(run({ ...config, threshold: 0.9, limit: 1 }, {
    decide: async () => { throw new Error('provider offline'); }, log: () => {},
  }), /Przerwano.*provider offline/);
});
