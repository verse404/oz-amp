// Morning Background Digest & Mobile Push Notifier (GitHub Actions / CLI)
// Scans your 275 watchlist singers + 6 flagship World Festivals against live-catalog.json
// and pushes alerts to Bark (iOS), Telegram, Discord, or Slack when configured.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LIVE_CATALOG_PATH = path.join(__dirname, 'cache', 'live-catalog.json');
const PREV_CATALOG_PATH = process.env.PREV_CATALOG_FILE || '';

const ALLOWED_WEBHOOK_HOSTS = new Set([
  'api.day.app',
  'api.telegram.org',
  'discord.com',
  'hooks.slack.com',
]);

function extractWatchlistNames() {
  const userListPath = path.join(PROJECT_ROOT, 'src', 'data', 'userSingerList.ts');
  if (!fsSync.existsSync(userListPath)) return [];
  const raw = fsSync.readFileSync(userListPath, 'utf-8');
  const slice = raw.includes('const RAW_UPLOADED_GROUPS')
    ? raw.split('const RAW_UPLOADED_GROUPS')[1].split('const SPECIAL_CONTEXT_NOTES')[0]
    : '';
  return [...slice.matchAll(/^\s{4}(?:'([^']+)'|"([^"]+)"),?\s*$/gm)]
    .map((m) => (m[1] || m[2] || '').trim())
    .filter(Boolean);
}

function extractCoreWorldFestivals() {
  const wfPath = path.join(PROJECT_ROOT, 'src', 'data', 'worldFestivals.ts');
  if (!fsSync.existsSync(wfPath)) return [];
  const raw = fsSync.readFileSync(wfPath, 'utf-8');
  const coreSlice = raw.split('export const DISCOVERABLE_WORLD_FESTIVALS')[0] || '';
  const blocks = coreSlice.split(/\{\s*id:\s*'wf-/).slice(1);
  const items = [];
  for (const blk of blocks) {
    const nameMatch = blk.match(/name:\s*'([^']+)'/);
    const labelMatch = blk.match(/nextSessionLabel:\s*'([^']+)'/);
    const isoMatch = blk.match(/nextSessionIso:\s*'([^']+)'/);
    const urlMatch = blk.match(/ticketsUrl:\s*'([^']+)'/);
    if (nameMatch && labelMatch && isoMatch) {
      items.push({
        name: nameMatch[1],
        nextSessionLabel: labelMatch[1],
        nextSessionIso: isoMatch[1],
        ticketsUrl: urlMatch ? urlMatch[1] : '',
      });
    }
  }
  return items;
}

function matchesPerformer(concert, rawSinger) {
  const clean = rawSinger.replace(/\([^)]*\)/g, ' ').trim().toLowerCase();
  if (clean.length < 2) return false;
  const acts = [concert.artist, ...(concert.supportActs || [])];
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(clean)) {
    return acts.some((a) => String(a).toLowerCase().includes(clean));
  }
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
  return acts.some((a) => rx.test(String(a)));
}

function validateSafeWebhookUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== 'https:') return null;
    if (!ALLOWED_WEBHOOK_HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function runDailyDigest() {
  if (!fsSync.existsSync(LIVE_CATALOG_PATH)) {
    process.stdout.write('No live-catalog.json found yet; run syncCatalog.mjs first.\n');
    return { sent: false, highlightsCount: 0 };
  }

  const catalog = JSON.parse(await fs.readFile(LIVE_CATALOG_PATH, 'utf-8'));
  const concerts = Array.isArray(catalog.concerts) ? catalog.concerts : [];

  let prevIds = new Set();
  if (PREV_CATALOG_PATH && fsSync.existsSync(PREV_CATALOG_PATH)) {
    try {
      const prev = JSON.parse(await fs.readFile(PREV_CATALOG_PATH, 'utf-8'));
      prevIds = new Set((prev.concerts || []).map((c) => c.id));
    } catch {
      prevIds = new Set();
    }
  }

  const watchlist = extractWatchlistNames();
  const worldFests = extractCoreWorldFestivals();
  const nowMs = Date.now();

  // 1. Newly added shows since yesterday's snapshot
  const newlyAdded = prevIds.size > 0 ? concerts.filter((c) => !prevIds.has(c.id)) : [];
  const newlyAddedWatchlist = newlyAdded.filter((c) =>
    watchlist.some((singer) => matchesPerformer(c, singer)),
  );

  // 2. Watchlist singer pre-sales / on-sales opening in the next 36 hours
  const imminentDrops = [];
  for (const c of concerts) {
    const matchedSinger = watchlist.find((singer) => matchesPerformer(c, singer));
    if (!matchedSinger) continue;
    for (const d of c.ticketDrops || []) {
      const diffHours = (new Date(d.opensAtIso).getTime() - nowMs) / 3_600_000;
      if (diffHours >= -1 && diffHours <= 36) {
        imminentDrops.push({
          singer: matchedSinger,
          city: c.city === 'sydney' ? 'SYD' : 'MEL',
          venue: c.venueName,
          label: d.label,
          opensAtIso: d.opensAtIso,
          url: d.bookingUrl || c.ticketUrl,
        });
      }
    }
  }

  // 3. World Festival registration / resale windows opening in the next 72 hours
  const imminentWorldFests = worldFests.filter((wf) => {
    const diffHours = (new Date(wf.nextSessionIso).getTime() - nowMs) / 3_600_000;
    return diffHours >= -2 && diffHours <= 72;
  });

  const lines = [];
  if (newlyAddedWatchlist.length > 0) {
    lines.push(
      `NEW AU TOUR ANNOUNCED (${newlyAddedWatchlist.length}):`,
      ...newlyAddedWatchlist
        .slice(0, 5)
        .map((c) => `• ${c.artist} — ${c.venueName} (${c.city.toUpperCase()}, ${c.dateIso})`),
    );
  } else if (newlyAdded.length > 0) {
    lines.push(`+${newlyAdded.length} new Melbourne/Sydney gig(s) added to OZ Amp today.`);
  }

  if (imminentDrops.length > 0) {
    lines.push(
      `WATCHLIST TICKET DROPS (<36h):`,
      ...imminentDrops
        .slice(0, 5)
        .map((d) => `• ${d.singer} [${d.city}] — ${d.label} (${d.venue})`),
    );
  }

  if (imminentWorldFests.length > 0) {
    lines.push(
      `WORLD FESTIVAL SESSIONS (<72h):`,
      ...imminentWorldFests.map((wf) => `• ${wf.name} — ${wf.nextSessionLabel}`),
    );
  }

  const highlightsCount =
    newlyAddedWatchlist.length + imminentDrops.length + imminentWorldFests.length;

  if (lines.length === 0) {
    process.stdout.write(
      `OZ Amp Daily Digest: ${concerts.length} AU concerts scanned; 0 urgent <36h drops today.\n`,
    );
    return { sent: false, highlightsCount: 0 };
  }

  const digestText = `OZ Amp Morning Radar\n${lines.join('\n')}`.slice(0, 950);
  process.stdout.write(`${digestText}\n`);

  const safeWebhook = validateSafeWebhookUrl(process.env.REMINDER_WEBHOOK_URL || '');
  if (!safeWebhook) {
    process.stdout.write(
      'REMINDER_WEBHOOK_URL not set (or host not in Bark/Telegram/Discord/Slack allow-list); skipping push.\n',
    );
    return { sent: false, highlightsCount };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(safeWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'OZ Amp — Singer & Festival Alert',
        body: digestText,
        content: digestText,
        text: digestText,
      }),
      signal: controller.signal,
    });
    process.stdout.write(`Mobile webhook push status: ${res.status}\n`);
    return { sent: res.ok, highlightsCount };
  } catch {
    process.stderr.write('Mobile webhook push timed out or failed.\n');
    return { sent: false, highlightsCount };
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDailyDigest().catch(() => {
    process.exitCode = 1;
  });
}
