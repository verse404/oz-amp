// Live Worldwide Music Festival Discovery Engine (Wikimedia + MediaWiki API)

const SEARCH_CACHE = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;

const BLOCKED_EXTERNAL_DOMAINS = [
  'wikipedia.org',
  'wikimedia.org',
  'wikidata.org',
  'archive.org',
  'web.archive.org',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'tiktok.com',
  'google.com',
  'books.google',
  'nytimes.com',
  'theguardian.com',
  'bbc.co.uk',
  'bbc.com',
  'rollingstone.com',
  'pitchfork.com',
  'billboard.com',
  'nme.com',
  'residentadvisor.net',
  'ra.co',
];

function inferRegionFromText(text) {
  const low = text.toLowerCase();
  if (
    /\b(japan|tokyo|niigata|thailand|pattaya|china|hong kong|korea|seoul|indonesia|bali|taiwan|vietnam|india|singapore|philippines)\b/.test(
      low,
    )
  ) {
    return { region: 'Asia', code: 'ASIA' };
  }
  if (
    /\b(united states|california|nevada|michigan|tennessee|texas|florida|illinois|new york|canada|british columbia|montreal|detroit|miami|chicago)\b/.test(
      low,
    )
  ) {
    return { region: 'North America', code: 'NA' };
  }
  if (
    /\b(mexico|brazil|argentina|chile|colombia|costa rica|peru|buenos aires|são paulo|bogotá)\b/.test(
      low,
    )
  ) {
    return { region: 'Latin America', code: 'LATAM' };
  }
  if (/\b(australia|melbourne|sydney|victoria|new zealand|auckland)\b/.test(low)) {
    return { region: 'Oceania', code: 'OCEANIA' };
  }
  if (/\b(morocco|south africa|egypt|kenya|dubai|uae)\b/.test(low)) {
    return { region: 'Middle East & Africa', code: 'MEA' };
  }
  return { region: 'Europe', code: 'EUROPE' };
}

function inferVibeFromText(text) {
  const low = text.toLowerCase();
  if (
    /\b(transformational|psytrance|psychedelic|art car|burn|sustainability|spiritual|boom|ozora|burning|wonderfruit|envision|waking life)\b/.test(
      low,
    )
  ) {
    return 'Transformational & Art';
  }
  if (
    /\b(electronic|techno|house|edm|dance music|rave|trance|drum and bass|club|dj)\b/.test(
      low,
    )
  ) {
    return 'Electronic & Underground';
  }
  if (/\b(indie|rock|folk|jazz|mountain|forest|camping)\b/.test(low)) {
    return 'Indie, Rock & Nature';
  }
  return 'Multi-Genre Iconic';
}

function extractLocationFromSummary(summary) {
  const locMatch = summary.match(
    /\bheld (?:annually |biennially )?(?:at |in )([^.,;()]{3,48})(?:,\s*([^.,;()]{2,32}))?/i,
  );
  if (locMatch) {
    const city = locMatch[1].replace(/^(?:the\s+)/i, '').trim();
    const country = (locMatch[2] || '').trim();
    return { city: city.slice(0, 40), country: country.slice(0, 32) || 'Global' };
  }
  return { city: 'International Grounds', country: 'Global' };
}

async function fetchCommonsBitmapPhoto(festivalTitle) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3800);
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${festivalTitle} festival filetype:bitmap`,
      gsrlimit: '2',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '960',
    });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      headers: { 'User-Agent': 'OZAmp-GigRadar/1.0 (+https://localhost)' },
      signal: controller.signal,
    });
    if (!res.ok) return '';
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    for (const p of pages) {
      const thumb = String(p?.imageinfo?.[0]?.thumburl || '');
      if (thumb.startsWith('https://') && !thumb.toLowerCase().endsWith('.svg.png')) {
        return thumb;
      }
    }
  } catch {
    // Ignore timeout
  } finally {
    clearTimeout(timer);
  }
  return '';
}

export async function searchWorldFestivalsLive(rawQuery) {
  const clean = String(rawQuery || '')
    .replace(/[\u0000-\u001F]/g, '')
    .trim()
    .slice(0, 70);
  if (clean.length < 2) return [];

  const cacheKey = clean.toLowerCase();
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.items;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const discovered = [];

  try {
    const searchQuery = /festival|burn/i.test(clean) ? clean : `${clean} music festival`;
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: searchQuery,
      gsrlimit: '6',
      prop: 'pageimages|extracts|extlinks',
      piprop: 'thumbnail',
      pithumbsize: '960',
      exintro: '1',
      explaintext: '1',
      exsentences: '2',
      ellimit: '15',
    });

    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OZAmp-GigRadar/1.0 (+https://localhost)',
      },
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      const pages = Object.values(data?.query?.pages || {}).sort(
        (a, b) => (a.index || 99) - (b.index || 99),
      );

      for (const page of pages) {
        const title = String(page?.title || '').trim();
        const extract = String(page?.extract || '').trim();
        if (!title || !extract) continue;
        // Keep genuine music / arts / cultural festival entries
        if (!/festival|music|concert|gathering|burn|rave|carnival|open air/i.test(`${title} ${extract}`)) {
          continue;
        }
        if (/^list of /i.test(title) || /disambiguation/i.test(title)) {
          continue;
        }

        let imageUrl = String(page?.thumbnail?.source || '');
        if (!imageUrl || imageUrl.toLowerCase().includes('.svg')) {
          imageUrl = await fetchCommonsBitmapPhoto(title);
        }

        // Pick best official external HTTPS link if available on the article
        let officialUrl = '';
        for (const ext of page?.extlinks || []) {
          const rawHref = String(ext?.['*'] || ext?.url || '');
          if (!rawHref.startsWith('https://')) continue;
          try {
            const u = new URL(rawHref);
            const host = u.hostname.toLowerCase();
            if (!BLOCKED_EXTERNAL_DOMAINS.some((d) => host.includes(d))) {
              officialUrl = `${u.origin}${u.pathname === '/' ? '/' : u.pathname}`;
              break;
            }
          } catch {
            // Skip malformed link
          }
        }
        if (!officialUrl) {
          officialUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
        }

        const { region, code } = inferRegionFromText(`${title} ${extract}`);
        const vibe = inferVibeFromText(`${title} ${extract}`);
        const loc = extractLocationFromSummary(extract);
        const cleanDisplayTitle = title.replace(/\s*\([^)]*festival[^)]*\)\s*/i, '').trim();
        const slug = cleanDisplayTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        discovered.push({
          id: `wf-live-${slug}`,
          name: cleanDisplayTitle,
          city: loc.city,
          country: loc.country,
          countryCode: code,
          region,
          vibe,
          datesLabel: '2027 Season · Check Official Calendar',
          startDateIso: '2027-06-15',
          venueName: loc.city,
          status: 'registration-soon',
          statusLabel: 'Discovered · Watch 2027',
          passPriceApprox: 'See Official Site',
          melbourneFlightTip: 'MEL international connection via regional hub',
          sydneyFlightTip: 'SYD international connection via regional hub',
          imageUrl,
          officialUrl,
          ticketsUrl: officialUrl,
          lineupAnnounced: false,
          lineupHighlights: [],
          stagesOrCamps: ['Main Festival Grounds'],
          nextSessionLabel: '2027 Lineup & Pass Release Check',
          nextSessionIso: '2027-01-15T10:00:00+11:00',
          description: extract.slice(0, 260),
          isCustomAdded: true,
        });
      }
    }
  } catch {
    // Graceful fallback if Wikipedia is unreachable
  } finally {
    clearTimeout(timer);
  }

  if (SEARCH_CACHE.size >= CACHE_MAX) {
    const oldest = SEARCH_CACHE.keys().next().value;
    if (oldest) SEARCH_CACHE.delete(oldest);
  }
  SEARCH_CACHE.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, items: discovered });
  return discovered;
}
