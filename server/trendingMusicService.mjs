// Live Trending Popular Music Service (Apple Music / iTunes Public Top Songs RSS — $0, zero key)

const TRENDING_CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

export const ALLOWED_TRENDING_REGIONS = new Set(['au', 'us', 'gb', 'jp']);

const FALLBACK_TRENDING_BY_REGION = {
  au: [
    {
      id: 'fb-au-1',
      rank: 1,
      title: 'Flower In A Hurricane',
      artist: 'Justice, Tame Impala & SZA',
      album: 'Original Score Single',
      genre: 'Alternative',
      region: 'au',
      artworkUrl: '',
      previewUrl: '',
      appleMusicUrl: 'https://music.apple.com/au/browse',
      releaseDateLabel: '2026',
    },
    {
      id: 'fb-au-2',
      rank: 2,
      title: 'Espresso',
      artist: 'Sabrina Carpenter',
      album: "Short n' Sweet",
      genre: 'Pop',
      region: 'au',
      artworkUrl: '',
      previewUrl: '',
      appleMusicUrl: 'https://music.apple.com/au/browse',
      releaseDateLabel: '2025',
    },
    {
      id: 'fb-au-3',
      rank: 3,
      title: 'The Less I Know The Better',
      artist: 'Tame Impala',
      album: 'Currents',
      genre: 'Alternative',
      region: 'au',
      artworkUrl: '',
      previewUrl: '',
      appleMusicUrl: 'https://music.apple.com/au/browse',
      releaseDateLabel: '2025',
    },
  ],
};

function normalizeHttpsUrl(raw, expectedHostSuffix) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return '';
    if (expectedHostSuffix && !u.hostname.toLowerCase().endsWith(expectedHostSuffix)) {
      return '';
    }
    return u.toString();
  } catch {
    return '';
  }
}

export async function fetchTrendingMusic(rawRegion = 'au') {
  const region = String(rawRegion || 'au').trim().toLowerCase();
  if (!ALLOWED_TRENDING_REGIONS.has(region)) {
    throw new Error('Unsupported trending music region.');
  }

  const cached = TRENDING_CACHE.get(region);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.payload;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  const tracks = [];
  let source = `Apple Music ${region.toUpperCase()} Top 25 Live Charts`;

  try {
    const res = await fetch(
      `https://itunes.apple.com/${region}/rss/topsongs/limit=25/json`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OZAmp-GigRadar/1.0 (+https://localhost)',
        },
        signal: controller.signal,
      },
    );

    if (res.ok) {
      const data = await res.json();
      const entries = Array.isArray(data?.feed?.entry) ? data.feed.entry : [];

      entries.forEach((entry, index) => {
        const title = String(entry?.['im:name']?.label || '').trim();
        const artist = String(entry?.['im:artist']?.label || '').trim();
        if (!title || !artist) return;

        const album = String(entry?.['im:collection']?.['im:name']?.label || '').trim();
        const genre = String(entry?.category?.attributes?.label || 'Pop').trim();
        const releaseDateLabel = String(
          entry?.['im:releaseDate']?.attributes?.label || '',
        ).trim();

        const images = Array.isArray(entry?.['im:image']) ? entry['im:image'] : [];
        const rawArt = String(
          images[images.length - 1]?.label || images[0]?.label || '',
        ).replace('170x170bb.png', '400x400bb.jpg');
        const artworkUrl = normalizeHttpsUrl(rawArt, 'mzstatic.com');

        const links = Array.isArray(entry?.link) ? entry.link : [];
        const previewNode = links.find((l) =>
          String(l?.attributes?.type || '').includes('audio'),
        );
        const pageNode = links.find(
          (l) => l?.attributes?.rel === 'alternate' || String(l?.attributes?.type || '') === 'text/html',
        );

        const previewUrl = normalizeHttpsUrl(
          previewNode?.attributes?.href || '',
          'itunes.apple.com',
        );
        const appleMusicUrl =
          normalizeHttpsUrl(pageNode?.attributes?.href || '', 'apple.com') ||
          `https://music.apple.com/${region}/search?term=${encodeURIComponent(`${artist} ${title}`)}`;

        tracks.push({
          id: `tr-${region}-${index + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
          rank: index + 1,
          title: title.slice(0, 120),
          artist: artist.slice(0, 120),
          album: album.slice(0, 120),
          genre: genre.slice(0, 40),
          region,
          artworkUrl,
          previewUrl,
          appleMusicUrl,
          releaseDateLabel: releaseDateLabel.slice(0, 32),
        });
      });
    }
  } catch {
    // Graceful fallback if upstream RSS is momentarily unreachable
  } finally {
    clearTimeout(timer);
  }

  if (tracks.length === 0) {
    source = 'Offline Fallback Charts';
    tracks.push(...(FALLBACK_TRENDING_BY_REGION[region] || FALLBACK_TRENDING_BY_REGION.au));
  }

  const payload = {
    region,
    updatedAtIso: new Date().toISOString(),
    source,
    tracks,
  };

  TRENDING_CACHE.set(region, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  return payload;
}
