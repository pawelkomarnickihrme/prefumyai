import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROMPT_VERSION } from './enrichment.mjs';

const root = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(await readFile(join(root, 'dane/snapshot.json'), 'utf8'));
const catalogDir = join(root, 'wyniki/katalog', manifest.id);
const enrichmentDir = join(root, 'wyniki/wzbogacanie', manifest.id, `v${PROMPT_VERSION}`, 'a');
const catalog = JSON.parse(await readFile(join(catalogDir, 'katalog.json'), 'utf8'));

const enrichment = new Map();
for (const name of await readdir(enrichmentDir)) {
  const row = JSON.parse(await readFile(join(enrichmentDir, name), 'utf8'));
  enrichment.set(row.id, row.enrichment);
}
const merged = catalog.map(entry => (enrichment.has(entry.id) ? { ...entry, enrichment: enrichment.get(entry.id) } : entry));
await writeFile(join(catalogDir, 'katalog-wzbogacony.json'), JSON.stringify(merged));

const missing = merged.filter(e => e.recommendable && !e.enrichment).length;
console.log(`Wzbogacone: ${merged.filter(e => e.enrichment).length}, do polecania bez wzbogacenia: ${missing}`);
