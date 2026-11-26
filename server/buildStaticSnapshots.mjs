// Generates static JSON snapshots (`dist/data/catalog.json` & `dist/data/trending-*.json`)
// so OZ Amp runs with full live catalog & Top 25 chart data on any zero-backend static host.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncLiveCatalog } from './syncCatalog.mjs';
import { ALLOWED_TRENDING_REGIONS, fetchTrendingMusic } from './trendingMusicService.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_OUT_DIR = path.join(PROJECT_ROOT, 'dist', 'data');

async function main() {
  await fs.mkdir(DATA_OUT_DIR, { recursive: true });

  const catalog = await syncLiveCatalog();
  await fs.writeFile(
    path.join(DATA_OUT_DIR, 'catalog.json'),
    JSON.stringify(catalog),
    'utf-8',
  );

  const regions = Array.from(ALLOWED_TRENDING_REGIONS);
  const trendingResults = await Promise.all(
    regions.map(async (region) => {
      const payload = await fetchTrendingMusic(region);
      await fs.writeFile(
        path.join(DATA_OUT_DIR, `trending-${region}.json`),
        JSON.stringify(payload),
        'utf-8',
      );
      return `${region.toUpperCase()}:${payload.tracks.length}`;
    }),
  );

  process.stdout.write(
    `Built static snapshots in dist/data/ — catalog (${catalog.concerts.length} concerts, ${catalog.musicFestivals.length} AU fests), trending (${trendingResults.join(', ')})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`Static snapshot build failed: ${err?.message || 'unknown error'}\n`);
  process.exitCode = 1;
});
