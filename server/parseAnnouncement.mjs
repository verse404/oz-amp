import { VENUES } from './seedCatalog.mjs';

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const VENUE_ALIASES = [
  { venueId: 'syd-accor', patterns: [/accor\s+stadium/i, /stadium\s+australia/i] },
  { venueId: 'syd-qudos', patterns: [/qudos\s+bank/i, /afterpay\s+arena/i, /sydney\s+superdome/i] },
  { venueId: 'syd-soh-forecourt', patterns: [/on\s+the\s+steps/i, /forecourt/i] },
  { venueId: 'syd-soh-hall', patterns: [/opera\s+house\s+concert\s+hall/i, /opera\s+house/i, /bennelong/i] },
  { venueId: 'syd-domain', patterns: [/\bthe\s+domain\b/i] },
  { venueId: 'syd-carriageworks', patterns: [/carriageworks/i] },
  { venueId: 'syd-hordern', patterns: [/hordern\s+pavilion/i, /\bhordern\b/i] },
  { venueId: 'syd-icc', patterns: [/icc\s+sydney/i, /aware\s+super\s+theatre/i] },
  { venueId: 'syd-enmore', patterns: [/enmore\s+theatre/i, /\benmore\b/i] },
  { venueId: 'syd-metro', patterns: [/metro\s+theatre/i] },
  { venueId: 'syd-centennial', patterns: [/centennial\s+park/i] },
  { venueId: 'syd-showground', patterns: [/sydney\s+showground/i, /engie\s+stadium/i] },
  { venueId: 'syd-tumbalong-park', patterns: [/tumbalong\s+park/i, /darling\s+harbour/i] },
  { venueId: 'mel-marvel', patterns: [/marvel\s+stadium/i, /docklands\s+stadium/i] },
  { venueId: 'mel-rodlaver', patterns: [/rod\s+laver/i] },
  { venueId: 'mel-johncain', patterns: [/john\s+cain\s+arena/i, /melbourne\s+arena/i] },
  { venueId: 'mel-mca', patterns: [/margaret\s+court/i] },
  { venueId: 'mel-festhall', patterns: [/festival\s+hall/i] },
  { venueId: 'mel-foreshore', patterns: [/palace\s+foreshore/i, /st\s+kilda\s+triangle/i] },
  { venueId: 'mel-bowl', patterns: [/sidney\s+myer/i, /music\s+bowl/i] },
  { venueId: 'mel-rbg', patterns: [/royal\s+botanic\s+gardens/i, /botanic\s+gardens\s+melbourne/i] },
  { venueId: 'mel-forum', patterns: [/forum\s+melbourne/i, /\bthe\s+forum\b/i] },
  { venueId: 'mel-palais', patterns: [/palais\s+theatre/i] },
  { venueId: 'mel-northcote', patterns: [/northcote\s+theatre/i, /northcote\s+social/i] },
  { venueId: 'mel-corner', patterns: [/corner\s+hotel/i, /170\s+russell/i] },
  { venueId: 'mel-flemington', patterns: [/flemington/i] },
  { venueId: 'mel-meredith', patterns: [/meredith/i, /golden\s+plains/i] },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Australian Eastern Daylight Time (+11:00 Oct–Mar) vs Standard Time (+10:00 Apr–Sep)
function auOffsetForMonth(month) {
  return month >= 4 && month <= 9 ? '+10:00' : '+11:00';
}

function parseAuDateFromLine(line, fallbackYear = 2027) {
  // ISO YYYY-MM-DD
  const isoMatch = line.match(/\b(202[6-9])-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD Month YYYY or Month DD, YYYY (e.g., "14 March 2027", "Thu 19 Nov 2026", "March 14, 2027")
  const dmyMatch = line.match(
    /\b([0-3]?\d)(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s*,?\s*(202[6-9]))?\b/i,
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = MONTHS[dmyMatch[2].toLowerCase().slice(0, 3)];
    const year = dmyMatch[3] ? Number(dmyMatch[3]) : month >= 11 ? 2026 : fallbackYear;
    if (day >= 1 && day <= 31 && month) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const mdyMatch = line.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-3]?\d)(?:st|nd|rd|th)?(?:\s*,?\s*(202[6-9]))?\b/i,
  );
  if (mdyMatch) {
    const month = MONTHS[mdyMatch[1].toLowerCase().slice(0, 3)];
    const day = Number(mdyMatch[2]);
    const year = mdyMatch[3] ? Number(mdyMatch[3]) : month >= 11 ? 2026 : fallbackYear;
    if (day >= 1 && day <= 31 && month) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // Australian DD/MM/YYYY
  const slashMatch = line.match(/\b([0-3]?\d)\/(0?[1-9]|1[0-2])\/(202[6-9])\b/);
  if (slashMatch) {
    return `${slashMatch[3]}-${pad2(Number(slashMatch[2]))}-${pad2(Number(slashMatch[1]))}`;
  }

  return null;
}

function parseTime24(line, defaultHour = 10) {
  const timeMatch = line.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return `${pad2(hour)}:${pad2(minute)}`;
  }
  const h24 = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) {
    return `${pad2(Number(h24[1]))}:${h24[2]}`;
  }
  return `${pad2(defaultHour)}:00`;
}

function detectPresaleKind(line) {
  if (/telstra/i.test(line)) return 'Telstra Plus';
  if (/frontier/i.test(line)) return 'Frontier Members';
  if (/live\s*nation/i.test(line)) return 'Live Nation';
  if (/mastercard|amex|american\s+express|westpac/i.test(line)) return 'Mastercard / Amex';
  if (/spotify|artist\s+pre|fan\s+club|waste/i.test(line)) return 'Artist / Spotify';
  if (/general\s+(?:public\s+)?on[- ]?sale|\bgp\s+on[- ]?sale\b|\bon\s+sale\b/i.test(line) && !/pre[- ]?sale/i.test(line)) {
    return 'General On-Sale';
  }
  if (/pre[- ]?sale/i.test(line)) return 'Venue / Promoter';
  return null;
}

function detectAgency(text, fallbackAgency) {
  if (/ticketmaster/i.test(text)) return 'Ticketmaster';
  if (/moshtix/i.test(text)) return 'Moshtix';
  if (/oztix/i.test(text)) return 'Oztix';
  if (/ticketek/i.test(text)) return 'Ticketek';
  return fallbackAgency || 'Ticketek';
}

function buildAgencyArtistUrl(agency, artist, promoter = '') {
  const q = encodeURIComponent(String(artist || '').trim());
  if (agency === 'Ticketmaster') return `https://www.ticketmaster.com.au/search?q=${q}`;
  if (agency === 'Moshtix') return `https://www.moshtix.com.au/v2/search?query=${q}`;
  if (agency === 'Oztix') return `https://www.oztix.com.au/search?q=${q}`;
  if (/live\s+nation/i.test(promoter)) {
    return `https://www.livenation.com.au/search?keyword=${q}`;
  }
  return `https://www.ticketmaster.com.au/search?q=${q}`;
}

function detectPromoter(text) {
  if (/frontier\s+touring/i.test(text)) return 'Frontier Touring';
  if (/live\s+nation/i.test(text)) return 'Live Nation AU';
  if (/handsome\s+tours/i.test(text)) return 'Handsome Tours';
  if (/secret\s+sounds/i.test(text)) return 'Secret Sounds';
  if (/destroy\s+all\s+lines/i.test(text)) return 'Destroy All Lines';
  if (/untitled\s+group/i.test(text)) return 'Untitled Group';
  if (/chugg/i.test(text)) return 'Chugg Entertainment';
  return 'Australian Tour Radar';
}

export function parseTourAnnouncement(rawInput) {
  if (typeof rawInput !== 'string') {
    throw new Error('Announcement text must be a string.');
  }
  const cleaned = rawInput.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (cleaned.length < 10 || cleaned.length > 6000) {
    throw new Error('Announcement text must be between 10 and 6,000 characters.');
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Extract headline artist & tour name from the first non-date line
  let artist = 'Announced Artist';
  let tourTitle = 'Australia Live Tour';
  const headerLine = lines[0] || '';
  const dashParts = headerLine.split(/\s+[—–-]\s+|\s*\|\s*/);
  if (dashParts.length >= 2) {
    artist = dashParts[0].replace(/^(?:JUST\s+ANNOUNCED|TOUR\s+ALERT)[:\s!]*/i, '').trim().slice(0, 80);
    tourTitle = dashParts.slice(1).join(' — ').trim().slice(0, 100);
  } else {
    const announcesMatch = headerLine.match(/^(.+?)\s+(?:announces?|brings?|confirms?|returns?\s+to)\s+(.+)$/i);
    if (announcesMatch) {
      artist = announcesMatch[1].replace(/^(?:BREAKING|JUST\s+IN)[:\s!]*/i, '').trim().slice(0, 80);
      tourTitle = announcesMatch[2].trim().slice(0, 100);
    } else {
      artist = headerLine.slice(0, 72);
    }
  }

  // Extract AUD prices if mentioned
  const priceMatches = [...cleaned.matchAll(/(?:A\$|\$|AUD\s*)(\d{2,4}(?:\.\d{1,2})?)/gi)].map((m) =>
    Number(m[1]),
  );
  const validPrices = priceMatches.filter((n) => n >= 25 && n <= 1500);
  const priceMinAud = validPrices.length ? Math.min(...validPrices) : 109.9;
  const priceMaxAud = validPrices.length > 1 ? Math.max(...validPrices) : Math.round((priceMinAud + 60) * 10) / 10;

  const promoter = detectPromoter(cleaned);

  // Extract Ticket Drop windows (Presales & General On-Sale)
  const currentYear = new Date().getFullYear();
  const ticketDrops = [];
  for (const line of lines) {
    const kind = detectPresaleKind(line);
    if (!kind) continue;
    const dropDate = parseAuDateFromLine(line, currentYear);
    if (!dropDate) continue;
    const time24 = parseTime24(line, 10);
    const month = Number(dropDate.slice(5, 7));
    const offset = /\bAEST\b/i.test(line) ? '+10:00' : /\bAEDT\b/i.test(line) ? '+11:00' : auOffsetForMonth(month);
    const agency = detectAgency(cleaned, 'Ticketek');
    const bookingUrl = buildAgencyArtistUrl(agency, artist, promoter);

    ticketDrops.push({
      id: `drop-${ticketDrops.length + 1}-${Date.now().toString(36)}`,
      kind,
      label: line.slice(0, 90),
      opensAtIso: `${dropDate}T${time24}:00${offset}`,
      bookingUrl,
    });
  }

  // Match Sydney & Melbourne tour stops line-by-line
  const matchedStops = [];
  for (const line of lines) {
    if (detectPresaleKind(line)) continue;
    const dateIso = parseAuDateFromLine(line, 2027);

    let matchedVenue = null;
    for (const alias of VENUE_ALIASES) {
      if (alias.patterns.some((re) => re.test(line))) {
        matchedVenue = VENUES.find((v) => v.id === alias.venueId) || null;
        break;
      }
    }
    if (!matchedVenue && dateIso) {
      if (/\bsydney\b|\bnsw\b/i.test(line)) {
        matchedVenue = VENUES.find((v) => v.id === 'syd-qudos');
      } else if (/\bmelbourne\b|\bvic\b/i.test(line)) {
        matchedVenue = VENUES.find((v) => v.id === 'mel-rodlaver');
      }
    }

    if (matchedVenue && dateIso) {
      matchedStops.push({ venue: matchedVenue, dateIso });
    }
  }

  // Fallback if entire announcement had a venue + date across separate lines
  if (matchedStops.length === 0) {
    const anyDate = parseAuDateFromLine(cleaned, 2027) || '2027-03-20';
    const mentionsSyd = /\bsydney\b/i.test(cleaned);
    const mentionsMel = /\bmelbourne\b/i.test(cleaned);
    if (mentionsSyd || (!mentionsSyd && !mentionsMel)) {
      matchedStops.push({
        venue: VENUES.find((v) => v.id === 'syd-hordern'),
        dateIso: anyDate,
      });
    }
    if (mentionsMel) {
      matchedStops.push({
        venue: VENUES.find((v) => v.id === 'mel-forum'),
        dateIso: anyDate,
      });
    }
  }

  const concerts = matchedStops.map((stop, idx) => {
    const agency = detectAgency(cleaned, stop.venue.primaryAgency);
    const ticketUrl = buildAgencyArtistUrl(agency, artist, promoter);

    return {
      id: `custom-${Date.now().toString(36)}-${idx}`,
      artist,
      supportActs: [],
      tourTitle,
      city: stop.venue.city,
      venueId: stop.venue.id,
      venueName: stop.venue.name,
      suburb: stop.venue.suburb,
      venueTier: stop.venue.tier,
      dateIso: stop.dateIso,
      doorsTimeLocal: '19:00',
      setTimeLocal: '20:30',
      timeZone: stop.venue.city === 'sydney' ? 'Australia/Sydney' : 'Australia/Melbourne',
      genres: ['Rock & Alternative', 'Pop'],
      promoter,
      agency,
      status: ticketDrops.length > 0 ? 'presale-soon' : 'on-sale',
      priceMinAud,
      priceMaxAud,
      ticketUrl,
      ticketDrops: ticketDrops.map((d, dIdx) => ({
        ...d,
        id: `${d.id}-${idx}-${dIdx}`,
      })),
      editorialNote: 'Imported via Smart Tour Announcement Parser.',
      isCustom: true,
    };
  });

  return {
    artist,
    tourTitle,
    concerts,
    ticketDropsCount: ticketDrops.length,
  };
}
