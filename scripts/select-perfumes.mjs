import { experimental_decide as decide } from 'ai';
import { readdir, readFile, mkdir, writeFile, appendFile, copyFile, rename } from 'node:fs/promises';
import { resolve, join, basename, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  MODEL, parseRecord, sortByPopularity, shortlist, buildRequest, routeDecision, requestKey,
} from './selection.mjs';

const DEFAULT_SOURCE = '/Users/pawelkomarnicki/pro/normalizacja/perfumy_json';
const DEFAULT_OUTPUT = new URL('../wyniki', import.meta.url).pathname;

export function options(args) {
  // Some package managers forward their own `--` separator to the script.
  // This CLI has no positional arguments, so separators can be safely omitted.
  const forwardedArgs = args.filter(arg => arg !== '--');
  const { values } = parseArgs({ args: forwardedArgs, options: {
    source: { type: 'string', default: DEFAULT_SOURCE },
    output: { type: 'string', default: DEFAULT_OUTPUT },
    'min-ratings': { type: 'string', default: '200' },
    limit: { type: 'string' },
    confidence: { type: 'string', default: '0.8' },
    availability: { type: 'string' },
    apply: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } });
  const minRatings = Number(values['min-ratings']);
  const limit = values.limit === undefined ? Infinity : Number(values.limit);
  const threshold = Number(values.confidence);
  if (!Number.isSafeInteger(minRatings) || minRatings < 0) throw new Error('--min-ratings musi byc liczba calkowita >= 0');
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('--limit musi byc liczba calkowita >= 1');
  if (!Number.isFinite(threshold) || threshold <= 0.5 || threshold > 1) throw new Error('--confidence musi byc > 0.5 i <= 1');
  const source = resolve(values.source), output = resolve(values.output);
  const rel = relative(source, output);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('Wyniki musza byc poza katalogiem zrodlowym');
  return { source, output, minRatings, limit, threshold, apply: values.apply, help: values.help, availability: values.availability };
}

async function loadAvailability(path) {
  if (!path) return {};
  const data = JSON.parse(await readFile(path, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dostepnosc musi byc mapa nazw plikow');
  for (const [id, value] of Object.entries(data)) {
    if (basename(id) !== id || !value || !['available', 'unavailable', 'unknown'].includes(value.status)) {
      throw new Error(`Niepoprawny wpis dostepnosci: ${id}`);
    }
    if (value.status !== 'unknown' && (typeof value.source !== 'string' || !value.source.trim() ||
        typeof value.checkedAt !== 'string' || !Number.isFinite(Date.parse(value.checkedAt)))) {
      throw new Error(`Dostepnosc ${id} wymaga source oraz checkedAt (data ISO)`);
    }
  }
  return data;
}

// The SDK's maxRetries cannot recover from a timeout: its signal is shared by all
// attempts and stays aborted. Each attempt here gets a fresh signal instead.
async function askWithTimeoutRetry(ask, request, timeoutMs) {
  for (let attempt = 1; ; attempt++) {
    const abortSignal = AbortSignal.timeout(timeoutMs);
    try {
      return await ask({ ...request, maxRetries: 2, abortSignal });
    } catch (error) {
      if (!abortSignal.aborted || attempt === 3) throw error;
    }
  }
}

export async function run(config, dependencies = {}) {
  const ask = dependencies.decide ?? decide;
  const log = dependencies.log ?? console.log;
  const availability = await loadAvailability(config.availability);
  // Intentionally non-recursive: source has subdirectories containing duplicate exports.
  const files = (await readdir(config.source, { withFileTypes: true }))
    .filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name).sort();
  const records = [], early = [];
  for (const filename of files) {
    try {
      const raw = JSON.parse(await readFile(join(config.source, filename), 'utf8'));
      const record = parseRecord(raw, filename);
      if (record.ratingCount < config.minRatings) {
        early.push({ id: filename, name: record.name, ratingCount: record.ratingCount, status: 'excluded', reason: 'below_min_ratings' });
      } else if (availability[filename]?.status === 'unavailable') {
        early.push({ id: filename, name: record.name, ratingCount: record.ratingCount, status: 'excluded', reason: 'confirmed_unavailable', availability: availability[filename] });
      } else records.push(record);
    } catch (error) {
      early.push({ id: filename, status: 'invalid', reason: error.message });
    }
  }
  const sorted = sortByPopularity(records);
  const candidates = sorted.slice(0, config.limit);
  const plan = {
    source: config.source, output: config.output, model: MODEL,
    sourceFiles: files.length, invalid: early.filter(r => r.status === 'invalid').length,
    filtered: early.filter(r => r.status === 'excluded').length,
    eligible: sorted.length, toProcess: candidates.length,
    pending: sorted.length - candidates.length,
    maxModelCalls: candidates.length, minRatings: config.minRatings,
    confidenceThreshold: config.threshold, mode: config.apply ? 'apply' : 'plan',
  };
  log(JSON.stringify(plan, null, 2));
  if (!config.apply) {
    log('Plan: bez wywolan AI i bez zapisu. Dodaj --apply, aby uruchomic platna selekcje.');
    return { plan };
  }
  if (candidates.length && !dependencies.decide && !process.env.AI_GATEWAY_API_KEY) {
    throw new Error('Brak AI_GATEWAY_API_KEY. Ustaw klucz w .env lub zmiennej srodowiskowej. Nie wykonano wywolan AI.');
  }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const runDir = join(config.output, runId);
  const selectedDir = join(runDir, 'wybrane');
  const reviewDir = join(runDir, 'do-weryfikacji');
  const reportsDir = join(runDir, 'raporty');
  const cacheDir = join(config.output, 'cache');
  for (const path of [selectedDir, reviewDir, reportsDir, cacheDir]) await mkdir(path, { recursive: true });
  await writeFile(join(reportsDir, 'plan.json'), JSON.stringify(plan, null, 2));
  const reportPath = join(reportsDir, 'decyzje.jsonl');
  await writeFile(reportPath, early.map(r => JSON.stringify(r)).join('\n') + (early.length ? '\n' : ''));
  const representativesByBrand = new Map();
  const counts = { selected: 0, excluded: early.filter(r => r.status === 'excluded').length, review: 0, invalid: plan.invalid, pending: plan.pending, modelCalls: 0, cacheHits: 0 };
  const catalogPath = join(reportsDir, 'wybrane.jsonl');
  await writeFile(catalogPath, '');
  for (const record of candidates) {
    const representatives = representativesByBrand.get(record.brandKey) ?? [];
    const matches = shortlist(record, representatives);
    const evidence = availability[record.id] ?? { status: 'unknown' };
    const request = buildRequest(record, matches, evidence);
    const key = requestKey(request, config.threshold);
    const cacheFile = join(cacheDir, `${key}.json`);
    let answers;
    try {
      try {
        answers = JSON.parse(await readFile(cacheFile, 'utf8'));
        counts.cacheHits++;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        counts.modelCalls++;
        const result = await askWithTimeoutRetry(ask, request, dependencies.timeoutMs ?? 60_000);
        answers = result.answers;
        // Validate before caching; interrupted writes are never treated as complete entries.
        routeDecision(answers, matches, config.threshold);
        const temporary = `${cacheFile}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(answers));
        await rename(temporary, cacheFile);
      }
      const decision = routeDecision(answers, matches, config.threshold);
      const entry = {
        id: record.id, name: record.name, brand: record.brand, ratingCount: record.ratingCount,
        ...decision, availability: evidence, answers, cacheKey: key,
      };
      if (decision.status === 'selected' || decision.status === 'review') {
        const destination = decision.status === 'selected' ? selectedDir : reviewDir;
        await copyFile(join(config.source, record.id), join(destination, record.id));
      }
      if (decision.status === 'selected') {
        representatives.push(record);
        representativesByBrand.set(record.brandKey, representatives);
        await appendFile(catalogPath, JSON.stringify(entry) + '\n');
        log(`WYBRANE | ${record.ratingCount} ocen | ${record.brand} | ${record.name}`);
      }
      counts[decision.status]++;
      await appendFile(reportPath, JSON.stringify(entry) + '\n');
    } catch (error) {
      await appendFile(reportPath, JSON.stringify({ id: record.id, status: 'error', reason: error.message }) + '\n');
      await writeFile(join(reportsDir, 'blad.json'), JSON.stringify({ id: record.id, message: error.message, counts }, null, 2));
      throw new Error(`Przerwano na ${record.id}: ${error.message}. Czesciowe wyniki: ${runDir}. Uruchom ponownie z tymi samymi opcjami, aby uzyc cache.`, { cause: error });
    }
  }
  // Explicitly mark unprocessed records: a limited run must never look like a complete catalog.
  for (const record of sorted.slice(candidates.length)) {
    await appendFile(reportPath, JSON.stringify({ id: record.id, status: 'pending', reason: 'run_limit' }) + '\n');
  }
  const summary = { ...counts, complete: counts.pending === 0, runDir };
  await writeFile(join(reportsDir, 'podsumowanie.json'), JSON.stringify(summary, null, 2));
  log(JSON.stringify(summary, null, 2));
  return { plan, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = options(process.argv.slice(2));
    if (config.help) {
      console.log('pnpm run plan [--source KATALOG] [--output KATALOG] [--min-ratings 200] [--limit 20] [--confidence 0.8] [--availability PLIK]\npnpm run select [te same opcje]  # platne wywolania AI, kopie JSON i raporty');
    } else await run(config);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
