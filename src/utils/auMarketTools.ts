import type {
  CityId,
  ConcertEvent,
  FestivalAdvisorItem,
  VenueInfo,
} from '../types/gig';
import { formatAudPrice } from './formatters';
import { getActiveLocale } from '../i18n/LocaleContext';

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

  const isZh = getActiveLocale() === 'zh';
  return {
    statutoryLawLabel:
      concert.city === 'sydney'
        ? isZh
          ? '新州法定转售 +10% 上限'
          : 'NSW +10% Legal Resale Cap'
        : isZh
          ? '维州法定转售 +10% 上限'
          : 'VIC +10% Legal Resale Cap',
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
  const isZh = getActiveLocale() === 'zh';
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
          summary: isZh
            ? `时间冲突（重叠 ${overlap} 分钟）：${s1.artist}（${s1.stage} ${s1.start}–${s1.end}）与 ${s2.artist}（${s2.stage} ${s2.start}–${s2.end}）`
            : `Clash (${overlap}m overlap): ${s1.artist} (${s1.stage} ${s1.start}–${s1.end}) vs. ${s2.artist} (${s2.stage} ${s2.start}–${s2.end})`,
        });
      } else if (overlap >= -10 && s1.stage !== s2.stage) {
        clashes.push({
          type: 'tight-walk',
          summary: isZh
            ? `赶场紧凑（间隔仅 ${Math.abs(overlap)} 分钟）：${s1.artist}（${s1.stage}）→ ${s2.artist}（${s2.stage}）`
            : `Tight Stage Sprint (${Math.abs(overlap)}m gap): ${s1.artist} (${s1.stage}) → ${s2.artist} (${s2.stage})`,
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

  let verdictBadge = isZh ? '请在上方勾选想看的艺人进行对比' : 'Select bands above to compare';
  let verdictExplanation = isZh
    ? '勾选阵容中您想在墨尔本或悉尼观看的艺人，立即计算性价比与舞台时间冲突。'
    : 'Toggle the artists on this bill that you want to see in Sydney or Melbourne.';

  if (selectedArtists.length > 0) {
    const cityZh = targetCity === 'sydney' ? '悉尼' : '墨尔本';
    if (festivalOnlyActs.length > 0) {
      verdictBadge = isZh ? `推荐购买 ${festival.name} 通票` : `Buy ${festival.name} Pass`;
      verdictExplanation = isZh
        ? `${festivalOnlyActs.join('、')} 为${cityZh}音乐节限定演出（无单独剧场专场）。`
        : `${festivalOnlyActs.join(' & ')} ${festivalOnlyActs.length === 1 ? 'is a' : 'are'} festival exclusive${festivalOnlyActs.length === 1 ? '' : 's'} in ${targetCity === 'sydney' ? 'Sydney' : 'Melbourne'} (no standalone sideshow).`;
    } else if (savingsWithFestivalAud >= 15) {
      verdictBadge = isZh
        ? `音乐节通票更划算（省 ${formatAudPrice(savingsWithFestivalAud)}）`
        : `Festival Pass Wins (Saves ${formatAudPrice(savingsWithFestivalAud)})`;
      verdictExplanation = isZh
        ? `单独购买 ${selectedArtists.length} 场专场共需 ${formatAudPrice(sideshowTotalAud)}，而音乐节通票仅需 ${formatAudPrice(festival.festivalPassAud)}。`
        : `Buying ${selectedArtists.length} separate sideshows costs ${formatAudPrice(sideshowTotalAud)} vs. ${formatAudPrice(festival.festivalPassAud)} for the full festival.`;
    } else {
      const saveSideshow = Math.max(0, Math.round((festival.festivalPassAud - sideshowTotalAud) * 100) / 100);
      verdictBadge = isZh
        ? `推荐单买剧场专场（省 ${formatAudPrice(saveSideshow)}）`
        : `Buy Headline Sideshow${selectedArtists.length > 1 ? 's' : ''} (Saves ${formatAudPrice(saveSideshow)})`;
      verdictExplanation = isZh
        ? `单买专场共 ${formatAudPrice(sideshowTotalAud)}，可享受完整 90 分钟室内剧场演出（而非 45 分钟户外音乐节短场）。`
        : `You get full 90-minute indoor theatre sets (${formatAudPrice(sideshowTotalAud)} total) instead of 45-minute outdoor festival slots.`;
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

  const isZh = getActiveLocale() === 'zh';
  const routeLabel =
    homeCity === 'sydney'
      ? isZh
        ? '悉尼 ✈ 墨尔本（约 1 小时 25 分）'
        : 'SYD ✈ MEL (1h 25m)'
      : isZh
        ? '墨尔本 ✈ 悉尼（约 1 小时 25 分）'
        : 'MEL ✈ SYD (1h 25m)';

  const isDaytimeFestival = Number(concert.doorsTimeLocal.slice(0, 2)) < 14;
  const flightTimingTip = isDaytimeFestival
    ? isZh
      ? '下午 2 点前入场 — 建议前一晚抵达并预订 2 晚酒店。'
      : 'Doors open before 2 PM — fly in the evening before & book 2 nights.'
    : isZh
      ? '晚场演出 — 可当天上午乘 Qantas/Virgin/Jetstar 航班前往，次日早晨返程。'
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
      (concert.city === 'sydney'
        ? isZh
          ? '悉尼市中心 / 奥林匹克公园'
          : 'Sydney CBD / Olympic Park'
        : isZh
          ? '墨尔本市中心 / Southbank'
          : 'Melbourne CBD / Southbank'),
    hotelLockDeadlineIso,
  };
}
