import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const corpusDir = new URL('../private/ocr-real-samples/', import.meta.url);
const manifestPath = new URL('../private/ocr-real-samples-manifest.json', import.meta.url);
const supported = new Set(['.jpg', '.jpeg', '.png', '.pdf']);

await mkdir(corpusDir, { recursive: true });
const names = (await readdir(corpusDir)).filter((name) => supported.has(extname(name).toLowerCase())).sort();
const samples = [];

for (const name of names) {
  const path = join(corpusDir.pathname, name);
  const [buffer, info] = await Promise.all([readFile(path), stat(path)]);
  samples.push({
    file: name,
    bytes: info.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    expected: null,
    reviewedAt: null,
  });
}

await writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), samples }, null, 2)}\n`);
console.log(`OCR corpus manifest: ${samples.length} private sample(s) -> ${manifestPath.pathname}`);
