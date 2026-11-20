import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VENUES,
  SEED_CONCERTS,
  SEED_TOUR_NEWS,
  MUSIC_FESTIVALS_DIRECTORY,
  FESTIVAL_ADVISOR_DATA,
  PRESET_SINGERS,
} from './seedCatalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const CACHE_DIR = path.join(__dirname, 'cache');
export const CACHE_FILE = path.join(CACHE_DIR, 'live-catalog.json');

function loadDotEnvIfPresent() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fsSync.existsSync(envPath)) return;
  try {
    const raw = fsSync.readFileSync(envPath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key] && val) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Fail safely without logging environment contents
  }
}

loadDotEnvIfPresent();

export function getApiConfig() {
  return {
    ticketmasterApiKey: process.env.TICKETMASTER_API_KEY || '',
    reminderWebhookUrl: process.env.REMINDER_WEBHOOK_URL || '',
    cacheTtlHours: Math.max(1, Number(process.env.CACHE_TTL_HOURS || 12)),
  };
}

function decodeXmlEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .trim();
}

async function fetchTicketmasterAuEvents(apiKey) {
  if (!apiKey) return [];
  const discovered = [];
  const melDefault = VENUES.find((v) => v.id === 'mel-rodlaver') || VENUES[0];
  const sydDefault = VENUES.find((v) => v.id === 'syd-qudos') || VENUES[0];
  const cities = [
    { cityParam: 'Melbourne', cityId: 'melbourne', defaultVenue: melDefault, tz: 'Australia/Melbourne' },
    { cityParam: 'Sydney', cityId: 'sydney', defaultVenue: sydDefault, tz: 'Australia/Sydney' },
  ];

  for (const target of cities) {
    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('countryCode', 'AU');
    url.searchParams.set('classificationName', 'music');
    url.searchParams.set('city', target.cityParam);
    url.searchParams.set('size', '25');
    url.searchParams.set('sort', 'date,asc');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const events = data?._embedded?.events || [];
      for (const ev of events) {
        const name = String(ev?.name || '').trim();
        const localDate = ev?.dates?.start?.localDate;
        if (!name || !localDate) continue;

        const rawVenueName = ev?._embedded?.venues?.[0]?.name || target.defaultVenue.name;
        const matchedVenue =
          VENUES.find(
            (v) =>
              v.city === target.cityId &&
              rawVenueName.toLowerCase().includes(v.name.toLowerCase().split(' ')[0]),
          ) || target.defaultVenue;

        const priceRange = ev?.priceRanges?.[0];
        const minAud = priceRange?.min ? Number(priceRange.min) : 99.9;
        const maxAud = priceRange?.max ? Number(priceRange.max) : minAud + 60;

        const ticketDrops = [];
        const presales = ev?.sales?.presales || [];
        for (const ps of presales.slice(0, 3)) {
          if (ps?.startDateTime) {
            const psName = String(ps.name || 'Pre-Sale');
            const kind = /telstra/i.test(psName)
              ? 'Telstra Plus'
              : /frontier/i.test(psName)
                ? 'Frontier Members'
                : /live\s*nation/i.test(psName)
                  ? 'Live Nation'
                  : /mastercard|amex/i.test(psName)
                    ? 'Mastercard / Amex'
                    : /spotify|artist/i.test(psName)
                      ? 'Artist / Spotify'
                      : 'Venue / Promoter';
            ticketDrops.push({
              id: `tm-ps-${ev.id}-${ticketDrops.length}`,
              kind,
              label: psName,
              opensAtIso: ps.startDateTime,
              closesAtIso: ps.endDateTime || undefined,
              bookingUrl: String(ev.url || 'https://www.ticketmaster.com.au/'),
            });
          }
        }
        if (ev?.sales?.public?.startDateTime) {
          ticketDrops.push({
            id: `tm-gp-${ev.id}`,
            kind: 'General On-Sale',
            label: 'General Public On-Sale',
            opensAtIso: ev.sales.public.startDateTime,
            bookingUrl: String(ev.url || 'https://www.ticketmaster.com.au/'),
          });
        }

        const genreName = ev?.classifications?.[0]?.genre?.name || 'Rock & Alternative';
        discovered.push({
          id: `tm-${ev.id}`,
          artist: name.split(/\s+[-–:|]\s+/)[0].slice(0, 80),
          supportActs: [],
          tourTitle: name,
          city: target.cityId,
          venueId: matchedVenue.id,
          venueName: String(rawVenueName).slice(0, 80),
          suburb: matchedVenue.suburb,
          venueTier: matchedVenue.tier,
          dateIso: localDate,
          doorsTimeLocal: (ev?.dates?.start?.localTime || '19:00:00').slice(0, 5),
          setTimeLocal: '20:30',
          timeZone: target.tz,
          genres: [genreName],
          promoter: ev?.promoter?.name || 'Ticketmaster AU Live',
          agency: 'Ticketmaster',
          status: ticketDrops.some((d) => new Date(d.opensAtIso).getTime() > Date.now())
            ? 'presale-soon'
            : 'on-sale',
          priceMinAud: minAud,
          priceMaxAud: maxAud,
          ticketUrl: String(ev.url || 'https://www.ticketmaster.com.au/'),
          ticketDrops,
          editorialNote: 'Synced live via Ticketmaster Australia Discovery feed.',
          sourceTag: 'Ticketmaster AU Live',
        });
      }
    } catch {
      // Network offline or rate-limited; proceed cleanly with seed + RSS
    } finally {
      clearTimeout(timer);
    }
  }
  return discovered;
}

async function fetchAustralianTourRssNews() {
  const feeds = [
    { source: 'Music Feeds AU', url: 'https://musicfeeds.com.au/feed/' },
    { source: 'Tone Deaf AU', url: 'https://tonedeaf.thebrag.com/feed/' },
  ];
  const items = [];

  for (const feed of feeds) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'OZAmp-GigRadar/1.0 (+https://localhost)' },
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 180_000);
      const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
      for (const block of itemBlocks.slice(0, 12)) {
        const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
        const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        if (!titleMatch || !linkMatch) continue;
        const headline = decodeXmlEntities(titleMatch[1]).replace(/<[^>]+>/g, '');
        if (!/tour|sydney|melbourne|australia|announc|sideshow|laneway|festival|arena|ticket/i.test(headline)) {
          continue;
        }
        const linkUrl = decodeXmlEntities(linkMatch[1]);
        if (!linkUrl.startsWith('https://')) continue;
        const cities = [];
        if (/sydney|nsw|enmore|hordern|opera house|qudos|accor/i.test(headline)) cities.push('sydney');
        if (/melbourne|vic|forum|rod laver|marvel|meredith|bowl/i.test(headline)) cities.push('melbourne');
        if (cities.length === 0) cities.push('sydney', 'melbourne');

        items.push({
          id: `rss-${Buffer.from(linkUrl).toString('base64url').slice(0, 16)}`,
          headline: headline.slice(0, 160),
          source: feed.source,
          publishedAtIso: dateMatch ? new Date(decodeXmlEntities(dateMatch[1])).toISOString() : new Date().toISOString(),
          url: linkUrl,
          citiesMentioned: cities,
        });
      }
    } catch {
      // Ignore unreachable external RSS feed cleanly
    } finally {
      clearTimeout(timer);
    }
  }
  return items;
}

export async function syncLiveCatalog() {
  const cfg = getApiConfig();
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const [tmConcerts, rssNews] = await Promise.all([
    fetchTicketmasterAuEvents(cfg.ticketmasterApiKey),
    fetchAustralianTourRssNews(),
  ]);

  const seenKeys = new Set(
    SEED_CONCERTS.map((c) => `${c.artist.toLowerCase()}|${c.city}|${c.dateIso}`),
  );
  const mergedConcerts = [...SEED_CONCERTS];
  for (const ev of tmConcerts) {
    const key = `${ev.artist.toLowerCase()}|${ev.city}|${ev.dateIso}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      mergedConcerts.push(ev);
    }
  }

  mergedConcerts.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  // Automatically filter out concerts whose final AU date has elapsed and promote elapsed presales to 'on-sale'
  const todayAu = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
  }).format(new Date());
  const nowMs = Date.now();
  const activeConcerts = mergedConcerts
    .filter((c) => {
      const allDates = [c.dateIso, ...(c.additionalDates || [])].sort();
      return allDates[allDates.length - 1] >= todayAu;
    })
    .map((c) => {
      if (c.status === 'presale-soon' || c.status === 'presale-live') {
        const futureDrops = (c.ticketDrops || []).filter(
          (d) => new Date(d.opensAtIso).getTime() > nowMs,
        );
        if (futureDrops.length === 0) {
          return { ...c, status: 'on-sale' };
        }
      }
      return c;
    });

  const payload = {
    syncedAtIso: new Date().toISOString(),
    liveSyncSource:
      tmConcerts.length > 0
        ? `Curated AU Slate + Ticketmaster Discovery (${tmConcerts.length} live) + AU Music Press`
        : rssNews.length > 0
          ? `Verified Sydney & Melbourne Slate + Live AU Tour Press (${rssNews.length} dispatches)`
          : 'Verified Sydney & Melbourne 2026–2027 Concert Slate',
    ticketmasterConfigured: Boolean(cfg.ticketmasterApiKey),
    venues: VENUES,
    concerts: activeConcerts,
    tourNews: rssNews.length > 0 ? [...rssNews.slice(0, 6), ...SEED_TOUR_NEWS].slice(0, 8) : SEED_TOUR_NEWS,
    musicFestivals: MUSIC_FESTIVALS_DIRECTORY,
    festivals: FESTIVAL_ADVISOR_DATA,
    presetSingers: PRESET_SINGERS,
  };

  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

export async function loadOrSyncCatalog() {
  const cfg = getApiConfig();
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const ageHours = (Date.now() - new Date(parsed.syncedAtIso).getTime()) / 3_600_000;
    if (
      ageHours < cfg.cacheTtlHours &&
      Array.isArray(parsed.concerts) &&
      parsed.concerts.length > 0 &&
      Array.isArray(parsed.festivals) &&
      Array.isArray(parsed.musicFestivals) &&
      Array.isArray(parsed.presetSingers)
    ) {
      return parsed;
    }
  } catch {
    // Cache absent, stale, or pre-upgrade schema; run fresh sync
  }
  return syncLiveCatalog();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncLiveCatalog()
    .then((res) => {
      process.stdout.write(
        `Synced ${res.concerts.length} Sydney & Melbourne concerts (${res.liveSyncSource}) at ${res.syncedAtIso}\n`,
      );
    })
    .catch((err) => {
      process.stderr.write(`Catalog sync failed: ${err?.message || 'unknown error'}\n`);
      process.exitCode = 1;
    });
}
