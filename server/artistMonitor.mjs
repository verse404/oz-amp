import { MUSIC_FESTIVALS_DIRECTORY, PRESET_SINGERS } from './seedCatalog.mjs';
import { resolveSingleArtistPortrait } from './artistPortraitsService.mjs';

// Bounded TTL cache for artist search (Apple Music AU + MusicBrainz)
const SEARCH_CACHE = new Map();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX = 128;

function getCachedSearch(key) {
  const entry = SEARCH_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedSearch(key, data) {
  if (SEARCH_CACHE.size >= SEARCH_CACHE_MAX) {
    const firstKey = SEARCH_CACHE.keys().next().value;
    if (firstKey) SEARCH_CACHE.delete(firstKey);
  }
  SEARCH_CACHE.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, data });
}

export function buildAuTicketingLinks(artistName, directShowUrl = '') {
  const clean = String(artistName || '').trim();
  const q = encodeURIComponent(clean);
  const verifiedPrimary =
    directShowUrl && directShowUrl.startsWith('https://')
      ? directShowUrl
      : `https://marketplace.ticketek.com.au/purchase/searchlist?keyword=${q}`;
  return {
    ticketek: verifiedPrimary,
    ticketmaster: `https://www.ticketmaster.com.au/search?q=${q}`,
    frontier: `https://www.livenation.com.au/search?keyword=${q}`,
    livenation: `https://www.livenation.com.au/search?keyword=${q}`,
    tixel: `https://tixel.com/au/discover/tickets?q=${q}`,
  };
}

async function queryAppleMusicAuArtists(cleanQuery) {
  const results = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    // Query iTunes AU for artists + top track artwork so singer cards have authentic portraits/covers
    const artistUrl = new URL('https://itunes.apple.com/search');
    artistUrl.searchParams.set('term', cleanQuery);
    artistUrl.searchParams.set('country', 'AU');
    artistUrl.searchParams.set('entity', 'musicArtist');
    artistUrl.searchParams.set('limit', '6');

    const songUrl = new URL('https://itunes.apple.com/search');
    songUrl.searchParams.set('term', cleanQuery);
    songUrl.searchParams.set('country', 'AU');
    songUrl.searchParams.set('entity', 'song');
    songUrl.searchParams.set('limit', '8');

    const [artistRes, songRes] = await Promise.all([
      fetch(artistUrl, { signal: controller.signal }),
      fetch(songUrl, { signal: controller.signal }),
    ]);

    const artworkByArtist = new Map();
    if (songRes.ok) {
      const songData = await songRes.json();
      for (const item of songData?.results || []) {
        const nameKey = String(item?.artistName || '').toLowerCase();
        const art = String(item?.artworkUrl100 || '').replace('100x100bb', '300x300bb');
        if (nameKey && art.startsWith('https://') && !artworkByArtist.has(nameKey)) {
          artworkByArtist.set(nameKey, art);
        }
      }
    }

    if (artistRes.ok) {
      const artistData = await artistRes.json();
      for (const item of artistData?.results || []) {
        const name = String(item?.artistName || '').trim();
        if (!name) continue;
        const lowerName = name.toLowerCase();
        let art = artworkByArtist.get(lowerName) || '';
        if (!art) {
          for (const [songArtist, artUrl] of artworkByArtist.entries()) {
            if (songArtist.includes(lowerName)) {
              art = artUrl;
              break;
            }
          }
        }
        results.push({
          name: name.slice(0, 80),
          genre: String(item?.primaryGenreName || 'Live Music').slice(0, 40),
          artworkUrl: art,
          appleMusicUrl: String(item?.artistLinkUrl || '').startsWith('https://')
            ? String(item.artistLinkUrl)
            : '',
        });
      }
    }
  } catch {
    // Graceful fallback if Apple Music API is unreachable
  } finally {
    clearTimeout(timer);
  }
  return results;
}

const CHINESE_ORIGIN_CODES = new Set(['CN', 'TW', 'HK', 'MO']);
const CHINESE_AREA_NAMES = new Set(['China', 'Taiwan', 'Hong Kong', 'Macao']);
const HAN_CHAR_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;

function isAliasAllowedForOrigin(aliasName, aliasLocale, countryCode, areaName) {
  const loc = String(aliasLocale || '').toLowerCase();
  const isChineseArtist =
    CHINESE_ORIGIN_CODES.has(countryCode) || CHINESE_AREA_NAMES.has(areaName);
  const isJapaneseArtist = countryCode === 'JP' || areaName === 'Japan';
  const isKoreanArtist = countryCode === 'KR' || areaName === 'South Korea';

  // Never attach Chinese-locale translations to non-Chinese singers
  if (!isChineseArtist && loc.startsWith('zh')) {
    return false;
  }
  // Never attach Han/Chinese characters to non-Chinese & non-Japanese singers
  if (!isChineseArtist && !isJapaneseArtist && HAN_CHAR_RE.test(aliasName)) {
    return false;
  }
  // For Western/non-CJK artists, keep only Latin-script aliases (real legal/stage names, no translated scripts)
  if (
    !isChineseArtist &&
    !isJapaneseArtist &&
    !isKoreanArtist &&
    !/^[\u0020-\u024F\s.'’&-]+$/.test(aliasName)
  ) {
    return false;
  }
  return true;
}

async function queryMusicBrainzAliases(cleanQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const url = new URL('https://musicbrainz.org/ws/2/artist/');
    url.searchParams.set('query', cleanQuery);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('limit', '4');

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OZAmp-GigRadar/1.0 (https://localhost)',
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.artists || []).map((a) => {
      const countryCode = String(
        a?.country || a?.area?.['iso-3166-1-codes']?.[0] || '',
      ).toUpperCase();
      const areaName = String(a?.area?.name || '');
      const aliases = [];
      for (const al of (a?.aliases || []).slice(0, 12)) {
        const alName = String(al?.name || '').trim();
        if (
          alName &&
          alName.toLowerCase() !== String(a?.name || '').toLowerCase() &&
          !aliases.includes(alName) &&
          isAliasAllowedForOrigin(alName, al?.locale, countryCode, areaName)
        ) {
          aliases.push(alName);
        }
      }
      return {
        name: String(a?.name || '').trim().slice(0, 80),
        origin: String(countryCode || areaName || '').slice(0, 24),
        aliases: aliases.slice(0, 4),
        genre: (a?.tags || [])
          .slice(0, 2)
          .map((t) => String(t?.name || ''))
          .filter(Boolean)
          .join(' / ')
          .slice(0, 40),
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function searchArtistsLive(rawQuery, catalogConcerts = []) {
  const clean = String(rawQuery || '')
    .replace(/[\u0000-\u001F]/g, '')
    .trim()
    .slice(0, 60);
  if (clean.length < 1) {
    return [];
  }

  const cacheKey = clean.toLowerCase();
  const cached = getCachedSearch(cacheKey);
  if (cached) {
    return attachConcertCounts(cached, catalogConcerts);
  }

  // Match local presets first (instant bilingual Chinese/Japanese/Korean <-> English match)
  const localMatches = PRESET_SINGERS.filter(
    (p) =>
      p.name.toLowerCase().includes(cacheKey) ||
      p.aliases.some((al) => al.toLowerCase().includes(cacheKey)),
  ).map((p) => ({
    name: p.name,
    aliases: p.aliases,
    genre: p.genre,
    origin: p.origin,
    artworkUrl: '',
  }));

  const [amResults, mbResults] = await Promise.all([
    queryAppleMusicAuArtists(clean),
    queryMusicBrainzAliases(clean),
  ]);

  const mergedMap = new Map();
  for (const item of localMatches) {
    mergedMap.set(item.name.toLowerCase(), { ...item });
  }

  for (const am of amResults) {
    const key = am.name.toLowerCase();
    const existing = mergedMap.get(key);
    if (existing) {
      if (!existing.artworkUrl && am.artworkUrl) existing.artworkUrl = am.artworkUrl;
      if (!existing.genre && am.genre) existing.genre = am.genre;
    } else {
      mergedMap.set(key, {
        name: am.name,
        aliases: [],
        genre: am.genre || 'Live Music',
        origin: '',
        artworkUrl: am.artworkUrl || '',
      });
    }
  }

  for (const mb of mbResults) {
    if (!mb.name) continue;
    const key = mb.name.toLowerCase();
    const existing = mergedMap.get(key);
    if (existing) {
      const combinedAliases = new Set([...(existing.aliases || []), ...(mb.aliases || [])]);
      existing.aliases = Array.from(combinedAliases).slice(0, 5);
      if (!existing.origin && mb.origin) existing.origin = mb.origin;
      if ((!existing.genre || existing.genre === 'Live Music') && mb.genre) existing.genre = mb.genre;
    } else if (mergedMap.size < 8) {
      mergedMap.set(key, {
        name: mb.name,
        aliases: mb.aliases || [],
        genre: mb.genre || 'Live Music',
        origin: mb.origin || '',
        artworkUrl: '',
      });
    }
  }

  // Always offer the exact typed query if nothing external matched (e.g., brand-new indie band)
  if (mergedMap.size === 0) {
    mergedMap.set(cacheKey, {
      name: clean,
      aliases: [],
      genre: 'Custom Monitored Artist',
      origin: '',
      artworkUrl: '',
    });
  }

  const baseList = Array.from(mergedMap.values()).slice(0, 8);
  const profiles = await Promise.all(
    baseList.map(async (p) => {
      const portrait = p.artworkUrl || (await resolveSingleArtistPortrait(p.name));
      return {
        ...p,
        artworkUrl: portrait || '',
        auLinks: buildAuTicketingLinks(p.name),
      };
    }),
  );

  setCachedSearch(cacheKey, profiles);
  return attachConcertCounts(profiles, catalogConcerts);
}

function matchesActTerm(actsList, term) {
  const cleanTerm = String(term || '').trim().toLowerCase();
  if (cleanTerm.length < 2) return false;
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(cleanTerm)) {
    return actsList.some((a) => a.toLowerCase().includes(cleanTerm));
  }
  const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
  return actsList.some((a) => rx.test(a));
}

function attachConcertCounts(profiles, concerts) {
  return profiles.map((p) => {
    const terms = [p.name, ...(p.aliases || [])].filter(Boolean);
    const matchedShows = concerts.filter((c) => {
      const acts = [c.artist, ...(c.supportActs || [])];
      return terms.some((t) => matchesActTerm(acts, t));
    });
    return {
      ...p,
      upcomingAuCount: matchedShows.length,
      matchedCities: Array.from(new Set(matchedShows.map((s) => s.city))),
    };
  });
}

export function checkMonitoredSingersAnnouncements(monitoredList, catalog) {
  const concerts = catalog?.concerts || [];
  const tourNews = catalog?.tourNews || [];

  const results = [];
  for (const rawSinger of (monitoredList || []).slice(0, 80)) {
    const name = String(rawSinger?.name || '').trim().slice(0, 80);
    if (!name) continue;
    const preset = PRESET_SINGERS.find(
      (p) =>
        p.name.toLowerCase() === name.toLowerCase() ||
        p.aliases.some((a) => a.toLowerCase() === name.toLowerCase()),
    );
    const allowHan =
      preset?.category === 'Mandopop & Cantopop' ||
      preset?.origin === 'JP' ||
      HAN_CHAR_RE.test(name);
    const aliases = Array.from(
      new Set([
        ...(Array.isArray(rawSinger?.aliases) ? rawSinger.aliases : []),
        ...(preset?.aliases || []),
        ...(preset && preset.name !== name ? [preset.name] : []),
      ]),
    )
      .map((a) => String(a).trim().slice(0, 60))
      .filter((a) => Boolean(a) && (allowHan || !HAN_CHAR_RE.test(a)));

    const searchTerms = [name.toLowerCase(), ...aliases.map((a) => a.toLowerCase())].filter(
      (t) => t.length >= 2,
    );

    const matchedConcerts = concerts.filter((c) => {
      const acts = [c.artist, ...(c.supportActs || [])];
      return searchTerms.some((term) => matchesActTerm(acts, term));
    });

    const matchedNews = tourNews.filter((n) => {
      const h = String(n.headline || '').toLowerCase();
      return searchTerms.some((term) => term.length > 3 && matchesActTerm([h], term));
    });

    const matchedFestivals = (catalog?.musicFestivals || MUSIC_FESTIVALS_DIRECTORY || []).filter(
      (fest) => {
        const roster = fest.fullLineup || [];
        return searchTerms.some((term) => matchesActTerm(roster, term));
      },
    );

    const festivalSummaries = matchedFestivals.flatMap((f) =>
      (f.stops || []).map((st) => ({
        id: `${f.id}-${st.city}`,
        city: st.city,
        venueName: `${f.name} (${st.venueName})`,
        dateIso: st.dateIso,
        status: f.status,
      })),
    );

    const allMatchedSummaries = [
      ...matchedConcerts.map((c) => ({
        id: c.id,
        city: c.city,
        venueName: c.venueName,
        dateIso: c.dateIso,
        status: c.status,
      })),
      ...festivalSummaries,
    ];

    // Deduplicate by city + dateIso
    const dedupedSummaries = [];
    const seenSummaryKeys = new Set();
    for (const s of allMatchedSummaries) {
      const k = `${s.city}|${s.dateIso}`;
      if (!seenSummaryKeys.has(k)) {
        seenSummaryKeys.add(k);
        dedupedSummaries.push(s);
      }
    }

    results.push({
      name: preset ? preset.name : name,
      aliases,
      status:
        dedupedSummaries.length > 0
          ? 'announced'
          : matchedNews.length > 0
            ? 'rumour-or-news'
            : 'monitoring',
      matchedConcertIds: dedupedSummaries.map((s) => s.id),
      matchedConcertsSummary: dedupedSummaries,
      radarNote: preset?.radarNote || '',
      breakingHeadlines: matchedNews.slice(0, 2),
      auLinks: buildAuTicketingLinks(
        preset ? preset.name : name,
        matchedConcerts[0]?.ticketUrl || matchedFestivals[0]?.ticketUrl || '',
      ),
    });
  }

  return {
    checkedAtIso: new Date().toISOString(),
    results,
  };
}
