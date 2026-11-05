import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEngine } from './engine.mjs';

let store;

// ponytail: the catalog lives in memory for one process; add a database only with accounts.
export function getStore() {
  if (store) return store;
  const root = process.cwd();
  const read = path => JSON.parse(readFileSync(/* turbopackIgnore: true */ join(root, path), 'utf8'));
  const { id } = read('dane/snapshot.json');
  const dictionary = read('dane/nuty.json');
  const engine = createEngine({
    catalog: read(`wyniki/katalog/${id}/katalog-wzbogacony.json`),
    references: read(`wyniki/katalog/${id}/odniesienia.json`),
    dictionary,
  });
  store = { engine, dictionary };
  return store;
}
