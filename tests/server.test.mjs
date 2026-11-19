import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTourAnnouncement } from '../server/parseAnnouncement.mjs';
import { checkMonitoredSingersAnnouncements } from '../server/artistMonitor.mjs';
import {
  MUSIC_FESTIVALS_DIRECTORY,
  SEED_CONCERTS,
  SEED_TOUR_NEWS,
  VENUES,
} from '../server/seedCatalog.mjs';
import { createAppServer } from '../server/index.mjs';

test('SEED_CONCERTS and all ticketDrops never link to generic homepages or defunct search URLs', () => {
  const genericHomes = new Set([
    'https://premier.ticketek.com.au/',
    'https://www.ticketmaster.com.au/',
    'https://www.moshtix.com.au/',
    'https://www.oztix.com.au/',
    'https://www.livenation.com.au/',
    'https://www.frontiertouring.com/',
    'https://www.sydneyoperahouse.com/',
    'https://forummelbourne.com.au/',
    'https://www.enmoretheatre.com.au/',
    'https://www.metrotheatre.com.au/',
    'https://cornerhotel.com/',
    'https://marketplace.ticketek.com.au/',
    'https://tixel.com/au/music-tickets',
    'https://plus.telstra.com.au/tickets',
    'https://www.telstra.com.au/plus/tickets',
    'https://www.radiohead.com/',
    'https://www.lanewayfestival.com/',
  ]);

  const brokenPatterns = [
    /\/search\/SearchResults\.aspx/i,
    /frontiertouring\.com\/search/i,
    /frontiertouring\.com\/babykeem/i,
    /harry-styles-tickets-1232869/i,
    /bruno-mars-tickets-41006/i,
    /tixel\.com\/au\/music-tickets/i,
    /plus\.telstra\.com\.au\/tickets$/i,
    /ticketmaster\.com\.au\/search\?q=/i,
    /livenation\.com\.au\/search\?keyword=/i,
    /sydneyoperahouse\.com\/search\?query=/i,
    /oztix\.com\.au\/search\?q=/i,
    /enmoretheatre\.com\.au\/\?s=/i,
    /metrotheatre\.com\.au\/\?s=/i,
  ];

  const venueIds = new Set(VENUES.map((v) => v.id));

  for (const c of SEED_CONCERTS) {
    assert.ok(venueIds.has(c.venueId), `Unknown venueId ${c.venueId} on ${c.id} (${c.artist})`);
    assert.ok(c.ticketUrl.startsWith('https://'), `Non-HTTPS ticketUrl on ${c.artist}`);
    assert.ok(!genericHomes.has(c.ticketUrl), `Generic ticketUrl on ${c.artist}: ${c.ticketUrl}`);
    assert.ok(
      !brokenPatterns.some((rx) => rx.test(c.ticketUrl)),
      `Defunct/broken ticketUrl on ${c.artist}: ${c.ticketUrl}`,
    );
    if (c.resaleUrl) {
      assert.ok(!genericHomes.has(c.resaleUrl), `Generic resaleUrl on ${c.artist}: ${c.resaleUrl}`);
      assert.ok(
        !brokenPatterns.some((rx) => rx.test(c.resaleUrl)),
        `Defunct/broken resaleUrl on ${c.artist}: ${c.resaleUrl}`,
      );
    }
    for (const d of c.ticketDrops || []) {
      assert.ok(d.bookingUrl.startsWith('https://'), `Non-HTTPS bookingUrl on ${c.artist}`);
      assert.ok(
        !genericHomes.has(d.bookingUrl),
        `Generic bookingUrl on ${c.artist} (${d.id}): ${d.bookingUrl}`,
      );
      assert.ok(
        !brokenPatterns.some((rx) => rx.test(d.bookingUrl)),
        `Defunct/broken bookingUrl on ${c.artist} (${d.id}): ${d.bookingUrl}`,
      );
    }
  }
});

test('MUSIC_FESTIVALS_DIRECTORY includes full lineup arrays and HTTPS official lineup URLs for every festival', () => {
  assert.ok(MUSIC_FESTIVALS_DIRECTORY.length >= 10);
  for (const fest of MUSIC_FESTIVALS_DIRECTORY) {
    assert.ok(fest.lineupUrl.startsWith('https://'), `Missing HTTPS lineupUrl on ${fest.name}`);
    assert.ok(Array.isArray(fest.fullLineup), `Missing fullLineup array on ${fest.name}`);
    if (fest.lineupAnnounced !== false) {
      assert.ok(fest.fullLineup.length >= 3, `Expected announced lineup on ${fest.name}`);
    }
  }
});

test('parseTourAnnouncement extracts Sydney & Melbourne stops, AUD prices, and Telstra/Frontier presales', () => {
  const sample = `Olivia Rodrigo — GUTS Enchores Australia 2027
Presented by Live Nation Australia
Tickets from A$149.90 - A$289.90 via Ticketek

Tuesday 18 May 2027 — Rod Laver Arena, Melbourne VIC
Saturday 22 May 2027 — Qudos Bank Arena, Sydney NSW

Telstra Plus Pre-Sale: Mon 23 Nov 2026 10:00am AEDT
Live Nation Pre-Sale: Wed 25 Nov 2026 11:00am AEDT
General Public On-Sale: Fri 27 Nov 2026 12:00pm AEDT`;

  const result = parseTourAnnouncement(sample);
  assert.equal(result.artist, 'Olivia Rodrigo');
  assert.equal(result.concerts.length, 2);
  assert.equal(result.concerts[0].city, 'melbourne');
  assert.equal(result.concerts[0].venueId, 'mel-rodlaver');
  assert.equal(result.concerts[0].dateIso, '2027-05-18');
  assert.equal(result.concerts[1].city, 'sydney');
  assert.equal(result.concerts[1].venueId, 'syd-qudos');
  assert.equal(result.concerts[1].dateIso, '2027-05-22');
  assert.equal(result.ticketDropsCount, 3);
  assert.equal(result.concerts[0].priceMinAud, 149.9);
  assert.equal(result.concerts[0].priceMaxAud, 289.9);
});

test('checkMonitoredSingersAnnouncements resolves bilingual aliases and detects announced vs monitoring singers', () => {
  const report = checkMonitoredSingersAnnouncements(
    [
      { name: 'ヨアソビ', aliases: [] },
      { name: '周杰伦', aliases: [] },
      { name: 'Radiohead', aliases: [] },
    ],
    { concerts: SEED_CONCERTS, tourNews: SEED_TOUR_NEWS },
  );

  assert.equal(report.results.length, 3);
  // ヨアソビ resolves to YOASOBI and matches Melbourne & Sydney arena shows
  assert.equal(report.results[0].name, 'YOASOBI');
  assert.equal(report.results[0].status, 'announced');
  assert.equal(report.results[0].matchedConcertIds.length, 2);

  // 周杰伦 resolves to Jay Chou and enters active monitoring status with AU ticketing links
  assert.equal(report.results[1].name, 'Jay Chou');
  assert.equal(report.results[1].status, 'monitoring');
  assert.ok(report.results[1].auLinks.ticketek.includes('Jay%20Chou'));

  // Radiohead matches Melbourne + Sydney 2027 arena shows and has zero Chinese translation aliases
  assert.equal(report.results[2].status, 'announced');
  assert.ok(report.results[2].aliases.every((al) => !/[\u4e00-\u9fff]/.test(al)));
});

test('BFF enforces security headers, HTTP method allow-list, CSRF, SSRF protection, and artist APIs', async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Healthz & security headers
    const healthRes = await fetch(`${baseUrl}/api/healthz`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');

    // 2. Method allow-list blocks DELETE
    const delRes = await fetch(`${baseUrl}/api/catalog`, { method: 'DELETE' });
    assert.equal(delRes.status, 405);

    // 3. Artist search endpoint works and validates query bounds
    const emptySearch = await fetch(`${baseUrl}/api/artists/search?q=`);
    assert.equal(emptySearch.status, 400);

    const validSearch = await fetch(`${baseUrl}/api/artists/search?q=${encodeURIComponent('陈奕迅')}`);
    assert.equal(validSearch.status, 200);
    const searchJson = await validSearch.json();
    assert.ok(Array.isArray(searchJson.profiles));
    assert.ok(searchJson.profiles.some((p) => p.name === 'Eason Chan'));

    // 3b. Artist portraits endpoint returns HTTPS portraits for singers/bands
    const portraitsRes = await fetch(
      `${baseUrl}/api/artists/portraits?names=${encodeURIComponent('Gracie Abrams|YOASOBI')}`,
    );
    assert.equal(portraitsRes.status, 200);
    const portraitsJson = await portraitsRes.json();
    assert.ok(portraitsJson.portraits['gracie abrams']?.startsWith('https://'));
    assert.ok(portraitsJson.portraits['yoasobi']?.startsWith('https://'));

    // 3c. World festivals live search endpoint validates query length and returns structured JSON
    const shortWorldRes = await fetch(`${baseUrl}/api/world-festivals/search?q=a`);
    assert.equal(shortWorldRes.status, 400);

    const validWorldRes = await fetch(
      `${baseUrl}/api/world-festivals/search?q=${encodeURIComponent('Glastonbury')}`,
    );
    assert.equal(validWorldRes.status, 200);
    const validWorldJson = await validWorldRes.json();
    assert.ok(Array.isArray(validWorldJson.results));

    // 4. POST without CSRF token fails with 403
    const noCsrfRes = await fetch(`${baseUrl}/api/artists/monitor-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ singers: [{ name: 'Radiohead' }] }),
    });
    assert.equal(noCsrfRes.status, 403);

    // 5. Obtain CSRF cookie + token from /api/session, then POST succeeds
    const sessionRes = await fetch(`${baseUrl}/api/session`);
    assert.equal(sessionRes.status, 200);
    const setCookie = sessionRes.headers.get('set-cookie') || '';
    const cookiePair = setCookie.split(';')[0];
    const { csrfToken } = await sessionRes.json();

    const monitorRes = await fetch(`${baseUrl}/api/artists/monitor-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ singers: [{ name: 'Radiohead' }, { name: 'Jay Chou' }] }),
    });
    assert.equal(monitorRes.status, 200);
    const monitorBody = await monitorRes.json();
    assert.equal(monitorBody.results.length, 2);

    // 6. SSRF protection blocks loopback/internal webhook URLs
    const ssrfRes = await fetch(`${baseUrl}/api/reminders/test-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ webhookUrl: 'http://127.0.0.1:9999/secret' }),
    });
    assert.equal(ssrfRes.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
