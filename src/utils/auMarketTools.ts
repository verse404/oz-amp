import type {
  CityId,
  ConcertEvent,
  FestivalAdvisorItem,
  VenueInfo,
} from '../types/gig';
import { formatAudPrice } from './formatters';

// ── 1. RESALE GUARD (+10% NSW/VIC STATUTORY CAP) & PRODUCTION-HOLD SNIPER ──

export interface ResaleGuardInfo {
  statutoryLawLabel: string;
  maxLegalMinAud: string;
  maxLegalMaxAud: string;
  tixelUrl: string;
  marketplaceUrl: string;
  productionHoldIso: string;
  productionHoldFuture: boolean;
}

export function computeResaleGuard(concert: ConcertEvent, nowMs: number): ResaleGuardInfo {
  const capMin = Math.round(concert.priceMinAud * 1.1 * 100) / 100;
  const capMax = Math.round(concert.priceMaxAud * 1.1 * 100) / 100;

  const q = encodeURIComponent(concert.artist.trim());
  const tixelUrl = `https://tixel.com/au/discover/tickets?q=${q}`;

  const marketplaceUrl =
    concert.agency === 'Ticketmaster'
      ? `https://www.ticketmaster.com.au/search?q=${q}`
      : `https://marketplace.ticketek.com.au/purchase/searchlist?keyword=${q}`;

  // Compute T-48h 10:00 AM local production/sightline hold drop
  const showNoonUtc = new Date(`${concert.dateIso}T02:00:00Z`);
  const minus2Days = new Date(showNoonUtc.getTime() - 2 * 86400 * 1000);
  const y = minus2Days.getUTCFullYear();
  const m = minus2Days.getUTCMonth() + 1;
  const d = minus2Days.getUTCDate();
  const offset = m >= 4 && m <= 9 ? '+10:00' : '+11:00';
  const productionHoldIso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T10:00:00${offset}`;

  return {
    statutoryLawLabel:
      concert.city === 'sydney' ? 'NSW +10% Legal Resale Cap' : 'VIC +10% Legal Resale Cap',
    maxLegalMinAud: formatAudPrice(capMin),
    maxLegalMaxAud: formatAudPrice(capMax),
    tixelUrl,
    marketplaceUrl,
    productionHoldIso,
    productionHoldFuture: new Date(productionHoldIso).getTime() > nowMs,
  };
}

// ── 2. FESTIVAL VS. SIDESHOW VALUE & SET-TIME CLASH CALCULATOR ──────────────

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface ClashAlert {
  type: 'overlap' | 'tight-walk';
  summary: string;
}

export interface FestivalDecisionAnalysis {
  selectedCount: number;
  clashes: ClashAlert[];
  festivalOnlyActs: string[];
  sideshowTotalAud: number;
  savingsWithFestivalAud: number;
  verdictBadge: string;
  verdictExplanation: string;
}

export function analyzeFestivalDecision(
  festival: FestivalAdvisorItem,
  selectedArtists: string[],
  targetCity: CityId,
): FestivalDecisionAnalysis {
  const selectedLower = new Set(selectedArtists.map((a) => a.toLowerCase()));
  const activeSlots = festival.slots.filter((s) => selectedLower.has(s.artist.toLowerCase()));

  // Detect set-time clashes and tight (<10 min) stage changeovers
  const clashes: ClashAlert[] = [];
  for (let i = 0; i < activeSlots.length; i += 1) {
    const s1 = activeSlots[i];
    const start1 = hhmmToMinutes(s1.start);
    let end1 = hhmmToMinutes(s1.end);
    if (end1 <= start1) end1 += 24 * 60;

    for (let j = i + 1; j < activeSlots.length; j += 1) {
      const s2 = activeSlots[j];
      const start2 = hhmmToMinutes(s2.start);
      let end2 = hhmmToMinutes(s2.end);
      if (end2 <= start2) end2 += 24 * 60;

      const overlap = Math.min(end1, end2) - Math.max(start1, start2);
      if (overlap > 0) {
        clashes.push({
          type: 'overlap',
          summary: `Clash (${overlap}m overlap): ${s1.artist} (${s1.stage} ${s1.start}–${s1.end}) vs. ${s2.artist} (${s2.stage} ${s2.start}–${s2.end})`,
        });
      } else if (overlap >= -10 && s1.stage !== s2.stage) {
        clashes.push({
          type: 'tight-walk',
          summary: `Tight Stage Sprint (${Math.abs(overlap)}m gap): ${s1.artist} (${s1.stage}) → ${s2.artist} (${s2.stage})`,
        });
      }
    }
  }

  // Compare Festival Pass price vs. individual Sydney/Melbourne headline sideshows
  const festivalOnlyActs: string[] = [];
  let sideshowTotalAud = 0;

  for (const act of selectedArtists) {
    const side = festival.sideshows.find((s) => s.artist.toLowerCase() === act.toLowerCase());
    if (!side) {
      // Lower-bill festival act without standalone sideshow listed; estimate A$75 club ticket
      sideshowTotalAud += 75;
      continue;
    }
    const isExclInTargetCity =
      Boolean(side.festivalOnly) ||
      (targetCity === 'melbourne' && Boolean(side.melbourneExclusiveFestival));
    if (isExclInTargetCity) {
      festivalOnlyActs.push(side.artist);
      sideshowTotalAud += festival.festivalPassAud;
    } else {
      sideshowTotalAud += side.priceAud;
    }
  }

  const savingsWithFestivalAud = Math.round((sideshowTotalAud - festival.festivalPassAud) * 100) / 100;

  let verdictBadge = 'Select bands above to compare';
  let verdictExplanation =
    'Toggle the artists on this bill that you want to see in Sydney or Melbourne.';

  if (selectedArtists.length > 0) {
    if (festivalOnlyActs.length > 0) {
      verdictBadge = `Buy ${festival.name} Pass`;
      verdictExplanation = `${festivalOnlyActs.join(' & ')} ${festivalOnlyActs.length === 1 ? 'is a' : 'are'} festival exclusive${festivalOnlyActs.length === 1 ? '' : 's'} in ${targetCity === 'sydney' ? 'Sydney' : 'Melbourne'} (no standalone sideshow).`;
    } else if (savingsWithFestivalAud >= 15) {
      verdictBadge = `Festival Pass Wins (Saves ${formatAudPrice(savingsWithFestivalAud)})`;
      verdictExplanation = `Buying ${selectedArtists.length} separate sideshows costs ${formatAudPrice(sideshowTotalAud)} vs. ${formatAudPrice(festival.festivalPassAud)} for the full festival.`;
    } else {
      const saveSideshow = Math.max(0, Math.round((festival.festivalPassAud - sideshowTotalAud) * 100) / 100);
      verdictBadge = `Buy Headline Sideshow${selectedArtists.length > 1 ? 's' : ''} (Saves ${formatAudPrice(saveSideshow)})`;
      verdictExplanation = `You get full 90-minute indoor theatre sets (${formatAudPrice(sideshowTotalAud)} total) instead of 45-minute outdoor festival slots.`;
    }
  }

  return {
    selectedCount: selectedArtists.length,
    clashes,
    festivalOnlyActs,
    sideshowTotalAud,
    savingsWithFestivalAud,
    verdictBadge,
    verdictExplanation,
  };
}

// ── 3. SYD ↔ MEL INTERSTATE TRIP, HOTEL-LOCK & CURFEW HELPER ────────────────

export interface InterstateTripPlan {
  isInterstate: boolean;
  isExclusiveToOtherCity: boolean;
  routeLabel: string;
  flightTimingTip: string;
  hotelAreaTip: string;
  hotelLockDeadlineIso: string;
}

export function computeInterstateTripPlan(
  homeCity: CityId,
  concert: ConcertEvent,
  allConcerts: ConcertEvent[],
  venue?: VenueInfo,
): InterstateTripPlan | null {
  if (concert.city === homeCity) return null;

  const hasLocalShow = allConcerts.some(
    (other) =>
      other.city === homeCity &&
      other.artist.toLowerCase() === concert.artist.toLowerCase(),
  );

  const routeLabel =
    homeCity === 'sydney' ? 'SYD ✈ MEL (1h 25m)' : 'MEL ✈ SYD (1h 25m)';

  const isDaytimeFestival = Number(concert.doorsTimeLocal.slice(0, 2)) < 14;
  const flightTimingTip = isDaytimeFestival
    ? 'Doors open before 2 PM — fly in the evening before & book 2 nights.'
    : 'Evening doors — morning Qantas/Virgin/Jetstar flight works; return next morning.';

  // Lock free-cancellation hotel 24h before earliest presale (or tomorrow 10am if already on sale)
  let hotelLockDeadlineIso: string;
  if (concert.ticketDrops.length > 0) {
    const earliestMs = Math.min(
      ...concert.ticketDrops.map((d) => new Date(d.opensAtIso).getTime()),
    );
    hotelLockDeadlineIso = new Date(earliestMs - 24 * 3600 * 1000).toISOString();
  } else {
    const showMs = new Date(`${concert.dateIso}T02:00:00Z`).getTime();
    hotelLockDeadlineIso = new Date(showMs - 21 * 86400 * 1000).toISOString();
  }

  return {
    isInterstate: true,
    isExclusiveToOtherCity: !hasLocalShow,
    routeLabel,
    flightTimingTip,
    hotelAreaTip:
      venue?.hotelAreaTip ||
      (concert.city === 'sydney' ? 'Sydney CBD / Olympic Park' : 'Melbourne CBD / Southbank'),
    hotelLockDeadlineIso,
  };
}
