import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildCatalog } from './catalog.mjs';

const root = new URL('..', import.meta.url).pathname;
const { values } = parseArgs({
  options: {
    manifest: { type: 'string', default: join(root, 'dane/snapshot.json') },
    source: { type: 'string', default: '/Users/pawelkomarnicki/pro/normalizacja/perfumy_json' },
  },
  allowPositionals: true,
});

const manifest = JSON.parse(await readFile(resolve(values.manifest), 'utf8'));
const dictionaryEntries = JSON.parse(await readFile(join(root, 'dane/nuty.json'), 'utf8'));
const { catalog, references, report } = await buildCatalog({
  snapshotDir: join(root, manifest.path),
  sourceDir: resolve(values.source),
  expectedHash: manifest.sha256sumsHash,
  dictionaryEntries,
});

const output = join(root, 'wyniki/katalog', manifest.id);
await mkdir(output, { recursive: true });
await writeFile(join(output, 'katalog.json'), JSON.stringify(catalog));
await writeFile(join(output, 'odniesienia.json'), JSON.stringify(references));
await writeFile(join(output, 'raport.json'), JSON.stringify(report, null, 2));

console.log(`Katalog: ${report.catalog.total}, do polecania: ${report.catalog.recommendable}, bledne: ${report.catalog.invalid.length}`);
console.log(`Nuty w slowniku: ${(report.notes.mappedOccurrenceShare * 100).toFixed(1)}% wystapien, poza slownikiem: ${report.notes.unmapped.length} nazw`);
console.log(`Odniesienia: ${report.references.total} z ${report.references.expectedEligible}`);
console.log(`Wynik: ${output}`);
