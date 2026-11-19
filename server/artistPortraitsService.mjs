import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FESTIVAL_ADVISOR_DATA,
  MUSIC_FESTIVALS_DIRECTORY,
  PRESET_SINGERS,
  SEED_CONCERTS,
} from './seedCatalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, 'cache');
const PORTRAITS_CACHE_FILE = path.join(CACHE_DIR, 'artist-images.json');
const FRONTEND_PORTRAITS_TS = path.resolve(__dirname, '../src/data/artistPortraits.ts');

let memoryPortraitMap = null;

export function normalizePortraitKey(rawName) {
  return String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildSearchCandidates(rawName) {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return [];

  // Map festival-titled cards to their marquee headliner for visual continuity
  if (/laneway\s+festival/i.test(trimmed)) return ['Fontaines D.C.'];
  if (/good\s+things\s+festival/i.test(trimmed)) return ['Limp Bizkit'];
  if (/meredith\s+music\s+festival/i.test(trimmed)) return ['Dijon'];
  if (/golden\s+plains/i.test(trimmed)) return ['Underworld'];
  if (/summer\s+dance|ministry\s+of\s+sound\s+orchestra/i.test(trimmed)) return ['Roger Sanchez', 'Ministry of Sound'];
  if (/beyond\s+the\s+valley/i.test(trimmed)) return ['John Summit'];
  if (/lost\s+paradise/i.test(trimmed)) return ['Skepta'];
  if (/field\s+day/i.test(trimmed)) return ['Major Lazer'];
  if (/let\s+them\s+eat\s+cake/i.test(trimmed)) return ['Boys Noize'];
  if (/pitch\s+music/i.test(trimmed)) return ['HAAi'];
  if (/ultra\s+australia/i.test(trimmed)) return ['Martin Garrix', 'Calvin Harris'];

  const list = [];
  // Strip [Live], (DJ), (Exclusive NYE Set), etc.
  const noBrackets = trimmed
    .replace(/\s*\[[^\]]*\]\s*/g, '')
    .replace(/\s*\((?:live|dj|dj set|exclusive[^)]*)\)\s*/gi, '')
    .trim();

  // Extract parenthetical alias if present: e.g. "常石磊 (Chang Shilei)", "TEED (Totally Enormous Extinct Dinosaurs)"
  const parenMatch = noBrackets.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    const outer = parenMatch[1].trim();
    const inner = parenMatch[2].replace(/^or\s+/i, '').split('/')[0].trim();
    if (/^teed$/i.test(outer)) {
      list.push(inner, outer);
    } else if (/^c[eé]za$/i.test(outer)) {
      list.push('CéU', outer);
    } else {
      list.push(outer, inner);
    }
  } else {
    list.push(noBrackets);
  }

  // Co-headline splits: "Train & Barenaked Ladies" -> "Train", "Metric, Broken Social Scene & Stars" -> "Metric"
  if (noBrackets.includes(',')) {
    list.push(noBrackets.split(',')[0].trim());
  }
  if (/\s+&\s+/.test(noBrackets) && !/amyl\s+and|chase\s+&\s+status|frankey\s+&\s+sandrino|herb\s+alpert/i.test(noBrackets)) {
    list.push(noBrackets.split(/\s+&\s+/)[0].trim());
  }

  return Array.from(new Set(list.filter(Boolean)));
}

function isValidDeezerPicture(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return false;
  // Deezer uses empty hash `/images/artist//` when an artist has no portrait uploaded
  if (url.includes('/images/artist//') || url.includes('/images/cover//')) return false;
  return true;
}

function looseNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, '');
}

async function fetchDeezerPortrait(candidate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(candidate)}&limit=6`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = await res.json();
    const items = Array.isArray(data?.data) ? data.data : [];
    if (items.length === 0) return '';

    const targetNorm = looseNorm(candidate);
    // Prefer exact normalized name match with a real uploaded portrait
    for (const item of items) {
      const pic = item?.picture_big || item?.picture_medium || '';
      if (isValidDeezerPicture(pic) && looseNorm(item?.name) === targetNorm) {
        return pic;
      }
    }
    // Otherwise accept first result with a real portrait if name overlaps
    for (const item of items) {
      const pic = item?.picture_big || item?.picture_medium || '';
      const itemNorm = looseNorm(item?.name);
      if (
        isValidDeezerPicture(pic) &&
        itemNorm &&
        targetNorm &&
        (itemNorm.includes(targetNorm) || targetNorm.includes(itemNorm))
      ) {
        return pic;
      }
    }
    // Fallback to top result if valid
    const firstPic = items[0]?.picture_big || items[0]?.picture_medium || '';
    if (isValidDeezerPicture(firstPic)) return firstPic;
  } catch {
    // Ignore network timeout
  } finally {
    clearTimeout(timer);
  }
  return '';
}

async function fetchItunesArtwork(candidate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.set('term', candidate);
    url.searchParams.set('country', 'AU');
    url.searchParams.set('entity', 'song');
    url.searchParams.set('limit', '6');

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return '';
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const targetNorm = looseNorm(candidate);

    for (const item of results) {
      const art = String(item?.artworkUrl100 || '').replace('100x100bb', '500x500bb');
      const artistNorm = looseNorm(item?.artistName);
      if (
        art.startsWith('https://') &&
        artistNorm &&
        (artistNorm === targetNorm ||
          artistNorm.includes(targetNorm) ||
          targetNorm.includes(artistNorm))
      ) {
        return art;
      }
    }
    if (results[0]?.artworkUrl100) {
      return String(results[0].artworkUrl100).replace('100x100bb', '500x500bb');
    }
  } catch {
    // Ignore
  } finally {
    clearTimeout(timer);
  }
  return '';
}

async function fetchWikipediaThumbnail(candidate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const cleanTitle = candidate.replace(/\s+/g, '_');
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OZAmp-GigRadar/1.0 (https://localhost)',
      },
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = await res.json();
    const thumb = String(data?.thumbnail?.source || '');
    if (thumb.startsWith('https://upload.wikimedia.org/')) {
      return thumb;
    }
  } catch {
    // Ignore
  } finally {
    clearTimeout(timer);
  }
  return '';
}

export async function resolveSingleArtistPortrait(rawName) {
  const candidates = buildSearchCandidates(rawName);
  for (const cand of candidates) {
    const dz = await fetchDeezerPortrait(cand);
    if (dz) return dz;
  }
  for (const cand of candidates) {
    const it = await fetchItunesArtwork(cand);
    if (it) return it;
  }
  for (const cand of candidates) {
    const wk = await fetchWikipediaThumbnail(cand);
    if (wk) return wk;
  }
  return '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function loadPortraitCache() {
  if (memoryPortraitMap) return memoryPortraitMap;
  try {
    const raw = await fs.readFile(PORTRAITS_CACHE_FILE, 'utf-8');
    memoryPortraitMap = JSON.parse(raw);
    return memoryPortraitMap;
  } catch {
    memoryPortraitMap = {};
    return memoryPortraitMap;
  }
}

export async function resolvePortraitsForNames(names = []) {
  const cache = await loadPortraitCache();
  const cleanNames = Array.from(
    new Set(
      names
        .map((n) => String(n || '').trim().slice(0, 80))
        .filter(Boolean),
    ),
  ).slice(0, 40);

  const result = {};
  let dirty = false;

  await Promise.all(
    cleanNames.map(async (name) => {
      const key = normalizePortraitKey(name);
      if (cache[key] !== undefined) {
        if (cache[key]) result[key] = cache[key];
        return;
      }
      const url = await resolveSingleArtistPortrait(name);
      cache[key] = url || '';
      dirty = true;
      if (url) result[key] = url;
    }),
  );

  if (dirty) {
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(PORTRAITS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      // Ignore write failures in read-only mode
    }
  }

  return result;
}

async function hydrateAllKnownArtists() {
  // Read ONLY RAW_UPLOADED_GROUPS from src/data/userSingerList.ts (never context notes)
  const userListPath = path.resolve(__dirname, '../src/data/userSingerList.ts');
  const userListRaw = fsSync.existsSync(userListPath)
    ? fsSync.readFileSync(userListPath, 'utf-8')
    : '';
  const groupsSlice = userListRaw.includes('const RAW_UPLOADED_GROUPS')
    ? userListRaw
        .split('const RAW_UPLOADED_GROUPS')[1]
        .split('const SPECIAL_CONTEXT_NOTES')[0]
    : '';
  const quotedMatches = [
    ...groupsSlice.matchAll(/^\s{4}(?:'([^']+)'|"([^"]+)"),?\s*$/gm),
  ].map((m) => m[1] || m[2]);

  // Also extract lineupHighlights from src/data/worldFestivals.ts
  const worldFestPath = path.resolve(__dirname, '../src/data/worldFestivals.ts');
  const worldFestRaw = fsSync.existsSync(worldFestPath)
    ? fsSync.readFileSync(worldFestPath, 'utf-8')
    : '';
  const worldLineupBlocks = [
    ...worldFestRaw.matchAll(/lineupHighlights:\s*\[([^\]]*)\]/gm),
  ].map((m) => m[1]);
  const worldLineupArtists = worldLineupBlocks.flatMap((block) =>
    [...block.matchAll(/(?:'([^']+)'|"([^"]+)")/g)].map((m) => m[1] || m[2]),
  );

  const allNames = new Set([
    'Fred again..',
    'Daniel Caesar',
    'The Weeknd',
    'Calvin Harris',
    ...SEED_CONCERTS.map((c) => c.artist),
    ...SEED_CONCERTS.flatMap((c) => c.supportActs || []),
    ...PRESET_SINGERS.map((p) => p.name),
    ...MUSIC_FESTIVALS_DIRECTORY.map((f) => f.name),
    ...MUSIC_FESTIVALS_DIRECTORY.flatMap((f) => f.headliners || []),
    ...MUSIC_FESTIVALS_DIRECTORY.flatMap((f) => f.fullLineup || []),
    ...FESTIVAL_ADVISOR_DATA.flatMap((f) => (f.slots || []).map((s) => s.artist)),
    ...FESTIVAL_ADVISOR_DATA.flatMap((f) => (f.sideshows || []).map((s) => s.artist)),
    ...quotedMatches,
    ...worldLineupArtists,
  ]);

  const existing = await loadPortraitCache();

  // Prune accidental non-artist prose keys from earlier runs
  const bogusKeys = [
    'chinese artists',
    'single-stage amphitheatre lineup',
    'byo bush campout',
  ];
  for (const bk of bogusKeys) delete existing[bk];
  for (const k of Object.keys(existing)) {
    if (k.length > 58 || k.includes(' — ') || k.includes('; watching')) {
      delete existing[k];
    }
  }

  // Queue missing artists not yet in portrait cache
  const queue = Array.from(allNames).filter((n) => {
    const k = normalizePortraitKey(n);
    if (!k) return false;
    return existing[k] === undefined;
  });

  process.stdout.write(
    `Hydrating/upgrading portraits for ${queue.length} artists (${allNames.size} total unique)...\n`,
  );

  const CONCURRENCY = 3;
  let idx = 0;
  let resolvedCount = 0;
  let upgradedCount = 0;

  async function worker() {
    while (idx < queue.length) {
      const current = queue[idx];
      idx += 1;
      const key = normalizePortraitKey(current);
      const prev = existing[key] || '';
      await sleep(220);

      if (prev && prev.includes('mzstatic.com')) {
        // Try upgrading album cover to a real Deezer artist portrait
        let dz = '';
        for (const cand of buildSearchCandidates(current)) {
          dz = await fetchDeezerPortrait(cand);
          if (dz) break;
        }
        if (dz) {
          existing[key] = dz;
          upgradedCount += 1;
        }
      } else {
        const url = await resolveSingleArtistPortrait(current);
        existing[key] = url || '';
        if (url) resolvedCount += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(PORTRAITS_CACHE_FILE, JSON.stringify(existing, null, 2), 'utf-8');

  // Emit non-empty entries sorted alphabetically into src/data/artistPortraits.ts
  const nonEmptyEntries = Object.entries(existing)
    .filter(([, v]) => Boolean(v))
    .sort(([a], [b]) => a.localeCompare(b));

  const tsLines = [
    '// Auto-generated verified artist & band portrait index (Deezer CDN + Apple Music AU + Wikimedia)',
    'export const ARTIST_PORTRAITS: Record<string, string> = {',
    ...nonEmptyEntries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    '};',
    '',
  ];
  await fs.writeFile(FRONTEND_PORTRAITS_TS, tsLines.join('\n'), 'utf-8');

  process.stdout.write(
    `Done! Newly resolved: ${resolvedCount}, Upgraded to Deezer portrait: ${upgradedCount}. Total cached portraits: ${nonEmptyEntries.length}/${allNames.size}.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  hydrateAllKnownArtists().catch((err) => {
    process.stderr.write(`Hydration failed: ${err?.message || err}\n`);
    process.exitCode = 1;
  });
}
