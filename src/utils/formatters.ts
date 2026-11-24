import type {
  CityId,
  ConcertEvent,
  TicketDropWindow,
  ReminderRule,
  WorldFestivalItem,
} from '../types/gig';

const audFormatterWhole = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const audFormatterCents = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAudPrice(amount: number): string {
  return Number.isInteger(amount)
    ? audFormatterWhole.format(amount)
    : audFormatterCents.format(amount);
}

export function formatAudRange(minAud: number, maxAud: number): string {
  if (!maxAud || Math.abs(maxAud - minAud) < 1) {
    return formatAudPrice(minAud);
  }
  return `${ audFormatterWhole.format(Math.round(minAud)) } – ${ audFormatterWhole.format(Math.round(maxAud)) }`;
}

export function formatConcertDate(
  dateIso: string,
  timeZone: 'Australia/Sydney' | 'Australia/Melbourne' = 'Australia/Sydney',
): { weekday: string; dayMonth: string; fullLabel: string; monthKey: string } {
  // Parse YYYY-MM-DD at noon UTC so date never shifts across Australian +10/+11 offsets
  const safeDate = new Date(`${dateIso}T02:00:00Z`);
  const weekday = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    timeZone,
  }).format(safeDate);
  const dayMonth = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(safeDate);
  const fullLabel = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(safeDate);

  return {
    weekday,
    dayMonth,
    fullLabel,
    monthKey: dateIso.slice(0, 7),
  };
}

export function formatAuTimestamp(
  isoString: string,
  city: CityId = 'sydney',
): string {
  const timeZone = city === 'melbourne' ? 'Australia/Melbourne' : 'Australia/Sydney';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(date);
}

export function formatAuTime24To12(
  time24: string,
  dateIso: string,
  timeZone: 'Australia/Sydney' | 'Australia/Melbourne',
): string {
  const [hStr, mStr] = time24.split(':');
  const hour = Number(hStr || 19);
  const minute = Number(mStr || 0);
  const month = Number(dateIso.slice(5, 7));
  const offset = month >= 4 && month <= 9 ? '+10:00' : '+11:00';
  const iso = `${dateIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return time24;
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(d);
}

export function buildConcertDoorsIso(concert: ConcertEvent): string {
  const month = Number(concert.dateIso.slice(5, 7));
  const offset = month >= 4 && month <= 9 ? '+10:00' : '+11:00';
  const doors = /^\d{2}:\d{2}$/.test(concert.doorsTimeLocal)
    ? concert.doorsTimeLocal
    : '19:00';
  return `${concert.dateIso}T${doors}:00${offset}`;
}

export interface CountdownParts {
  isPast: boolean;
  isImminent: boolean;
  totalMs: number;
  compact: string;
}

export function computeCountdown(targetIso: string, nowMs: number): CountdownParts {
  const targetMs = new Date(targetIso).getTime();
  const diff = targetMs - nowMs;
  if (Number.isNaN(targetMs) || diff <= 0) {
    return {
      isPast: true,
      isImminent: false,
      totalMs: 0,
      compact: 'Live now',
    };
  }
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const compact =
    days > 0
      ? `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`
      : `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;

  return {
    isPast: false,
    isImminent: diff <= 48 * 3600 * 1000,
    totalMs: diff,
    compact,
  };
}

const GENERIC_TICKETING_HOSTS = new Set([
  'premier.ticketek.com.au',
  'www.ticketek.com.au',
  'marketplace.ticketek.com.au',
  'www.ticketmaster.com.au',
  'ticketmaster.com.au',
  'www.moshtix.com.au',
  'moshtix.com.au',
  'www.oztix.com.au',
  'oztix.com.au',
  'www.livenation.com.au',
  'livenation.com.au',
  'www.frontiertouring.com',
  'frontiertouring.com',
  'www.sydneyoperahouse.com',
  'forummelbourne.com.au',
  'www.enmoretheatre.com.au',
  'www.metrotheatre.com.au',
  'cornerhotel.com',
  'tixel.com',
  'plus.telstra.com.au',
  'www.telstra.com.au',
  'www.radiohead.com',
]);

const STALE_BROKEN_PATTERNS = [
  /\/search\/SearchResults\.aspx/i,
  /frontiertouring\.com\/search/i,
  /frontiertouring\.com\/babykeem/i,
  /harry-styles-tickets-1232869/i,
  /bruno-mars-tickets-41006/i,
  /tixel\.com\/au\/music-tickets/i,
];

export function describeTicketingPortal(rawUrl?: string): string {
  if (!rawUrl) return 'Tickets';
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host.includes('marketplace.ticketek')) return 'Ticketek Resale';
    if (host.includes('ticketek')) return 'Ticketek';
    if (host.includes('ticketmaster')) return 'Ticketmaster';
    if (host.includes('livenation')) return 'Live Nation';
    if (host.includes('frontiertouring')) return 'Frontier';
    if (host.includes('laneway')) return 'Laneway';
    if (host.includes('moshtix')) return 'Moshtix';
    if (host.includes('oztix')) return 'Oztix';
    if (host.includes('sydneyoperahouse')) return 'Opera House';
    if (host.includes('margaretcourtarena')) return 'MCA Official';
    if (host.includes('enmoretheatre')) return 'Enmore';
    if (host.includes('metrotheatre')) return 'Metro';
    if (host.includes('tixel')) return 'Tixel';
    if (host.includes('goldenplains')) return 'Golden Plains';
    return 'Official Page';
  } catch {
    return 'Tickets';
  }
}

export function sanitizeExternalHttpsUrl(rawUrl?: string, artistContext?: string): string {
  const q = artistContext ? encodeURIComponent(artistContext.trim()) : '';
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:') {
        const host = parsed.hostname.toLowerCase();
        const fullStr = parsed.toString();
        const isGenericRoot =
          (parsed.pathname === '/' ||
            parsed.pathname === '/tickets' ||
            parsed.pathname === '/plus/tickets' ||
            parsed.pathname === '/au/music-tickets') &&
          !parsed.search &&
          GENERIC_TICKETING_HOSTS.has(host);
        const isStaleBroken = STALE_BROKEN_PATTERNS.some((rx) => rx.test(fullStr));

        if ((isGenericRoot || isStaleBroken) && q) {
          if (host.includes('moshtix')) return `https://www.moshtix.com.au/v2/search?query=${q}`;
          if (host.includes('oztix') || host.includes('cornerhotel')) {
            return `https://www.oztix.com.au/search?q=${q}`;
          }
          if (host.includes('livenation') || host.includes('frontiertouring')) {
            return `https://www.livenation.com.au/search?keyword=${q}`;
          }
          if (host.includes('sydneyoperahouse')) {
            return `https://www.sydneyoperahouse.com/search?query=${q}`;
          }
          if (host.includes('enmoretheatre')) return `https://www.enmoretheatre.com.au/?s=${q}`;
          if (host.includes('metrotheatre')) return `https://www.metrotheatre.com.au/?s=${q}`;
          if (host.includes('tixel')) return `https://tixel.com/au/discover/tickets?q=${q}`;
          if (host.includes('marketplace.ticketek')) {
            return `https://marketplace.ticketek.com.au/purchase/searchlist?keyword=${q}`;
          }
          return `https://www.ticketmaster.com.au/search?q=${q}`;
        }
        return fullStr;
      }
    } catch {
      // Fall through to artist-specific fallback
    }
  }
  return q
    ? `https://www.ticketmaster.com.au/search?q=${q}`
    : 'https://www.ticketmaster.com.au/';
}

function toUtcCalendarStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(val: string): string {
  return val
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildGoogleCalendarShowUrl(concert: ConcertEvent): string {
  const start = new Date(buildConcertDoorsIso(concert));
  const end = new Date(start.getTime() + 3.5 * 3600 * 1000);
  const title = `${concert.artist} Live — ${concert.venueName} (${concert.city === 'sydney' ? 'Sydney' : 'Melbourne'})`;
  const details = [
    concert.tourTitle ? `Tour: ${concert.tourTitle}` : '',
    concert.supportActs.length ? `Support: ${concert.supportActs.join(', ')}` : '',
    `Doors: ${concert.doorsTimeLocal} | Main Set: ${concert.setTimeLocal}`,
    `Tickets (${concert.agency}): ${sanitizeExternalHttpsUrl(concert.ticketUrl, concert.artist)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${toUtcCalendarStamp(start)}/${toUtcCalendarStamp(end)}`);
  url.searchParams.set('location', `${concert.venueName}, ${concert.suburb}`);
  url.searchParams.set('details', details);
  url.searchParams.set('ctz', concert.timeZone);
  return url.toString();
}

export function buildGoogleCalendarDropUrl(
  concert: ConcertEvent,
  drop: TicketDropWindow,
): string {
  const dropStart = new Date(drop.opensAtIso);
  // Block 15 mins early so user enters Ticketek/Ticketmaster waiting room in time!
  const queueOpen = new Date(dropStart.getTime() - 15 * 60 * 1000);
  const dropEnd = new Date(dropStart.getTime() + 45 * 60 * 1000);
  const title = `[TICKET DROP] ${concert.artist} — ${drop.label} (${concert.city === 'sydney' ? 'SYD' : 'MEL'})`;
  const resolvedDropUrl = sanitizeExternalHttpsUrl(drop.bookingUrl, concert.artist);
  const details = [
    `Queue opens 15 mins before ${formatAuTimestamp(drop.opensAtIso, concert.city)}`,
    drop.codeHint ? `Access tip: ${drop.codeHint}` : '',
    `Venue: ${concert.venueName} (${concert.dateIso})`,
    `Booking Link: ${resolvedDropUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${toUtcCalendarStamp(queueOpen)}/${toUtcCalendarStamp(dropEnd)}`);
  url.searchParams.set('location', resolvedDropUrl);
  url.searchParams.set('details', details);
  url.searchParams.set('ctz', concert.timeZone);
  return url.toString();
}

export function downloadIcsEvents(
  filename: string,
  events: Array<{
    uid: string;
    summary: string;
    description: string;
    location: string;
    startDate: Date;
    endDate: Date;
    alarmMinutes?: number;
  }>,
): void {
  const nowStamp = toUtcCalendarStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OZ Amp//Melbourne & Sydney Gig Guide//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(ev.uid)}@oz-amp.local`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${toUtcCalendarStamp(ev.startDate)}`);
    lines.push(`DTEND:${toUtcCalendarStamp(ev.endDate)}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    const alarmMin = ev.alarmMinutes ?? 15;
    lines.push('BEGIN:VALARM');
    lines.push(`TRIGGER:-PT${alarmMin}M`);
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeIcsText(ev.summary)}`);
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function buildGoogleCalendarWorldFestivalUrl(
  fest: WorldFestivalItem,
  mode: 'session' | 'festival',
): string {
  const safeOfficial = sanitizeExternalHttpsUrl(fest.ticketsUrl || fest.officialUrl, fest.name);
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');

  if (mode === 'session') {
    const start = new Date(fest.nextSessionIso);
    const queueOpen = new Date(start.getTime() - 15 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    url.searchParams.set(
      'text',
      `[WORLD FESTIVAL] ${fest.name} — ${fest.nextSessionLabel} (${fest.countryCode})`,
    );
    url.searchParams.set('dates', `${toUtcCalendarStamp(queueOpen)}/${toUtcCalendarStamp(end)}`);
    url.searchParams.set('location', safeOfficial);
    url.searchParams.set(
      'details',
      [
        `${fest.name} (${fest.datesLabel})`,
        `Venue: ${fest.venueName}, ${fest.city}, ${fest.country}`,
        `Session: ${fest.nextSessionLabel}`,
        `Official Link: ${safeOfficial}`,
      ].join('\n'),
    );
    return url.toString();
  }

  const startDay = fest.startDateIso.replace(/-/g, '');
  const endRaw = fest.endDateIso || fest.startDateIso;
  const endPlusOne = new Date(`${endRaw}T12:00:00Z`);
  endPlusOne.setUTCDate(endPlusOne.getUTCDate() + 1);
  const endDay = endPlusOne.toISOString().slice(0, 10).replace(/-/g, '');

  url.searchParams.set('text', `${fest.name} (${fest.country})`);
  url.searchParams.set('dates', `${startDay}/${endDay}`);
  url.searchParams.set('location', `${fest.venueName}, ${fest.city}, ${fest.country}`);
  url.searchParams.set(
    'details',
    [
      fest.themeOrEdition ? `Edition: ${fest.themeOrEdition}` : '',
      `Dates: ${fest.datesLabel}`,
      `Pass Guide: ${fest.passPriceApprox}`,
      `MEL Flight Tip: ${fest.melbourneFlightTip}`,
      `SYD Flight Tip: ${fest.sydneyFlightTip}`,
      `Official Site: ${safeOfficial}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return url.toString();
}

export function exportRemindersToIcs(reminders: ReminderRule[]): void {
  if (reminders.length === 0) return;
  const events = reminders.map((r) => {
    const start = new Date(r.targetIso);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const locBadge = r.regionBadge || (r.city === 'sydney' ? 'Sydney' : 'Melbourne');
    return {
      uid: r.id,
      summary: `[OZ Amp] ${r.artist} — ${r.targetLabel}`,
      location: `${r.venueName} (${locBadge})`,
      description: `Booking Link: ${sanitizeExternalHttpsUrl(r.ticketUrl, r.artist)}`,
      startDate: start,
      endDate: end,
      alarmMinutes: r.leadMinutes,
    };
  });
  downloadIcsEvents('oz-amp-reminders.ics', events);
}

let sharedAudioCtx: AudioContext | null = null;

// Plays a gentle two-note stage harmonic chime using a single reused Web AudioContext
export function playReminderChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const notes = [523.25, 659.25]; // C5 -> E5 warm interval
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.6);
    });
  } catch {
    // Ignore autoplay restriction if user has not interacted yet
  }
}
