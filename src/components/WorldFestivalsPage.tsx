import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellPlus,
  Calendar,
  Check,
  Clock,
  Compass,
  ExternalLink,
  Globe,
  Headphones,
  ListMusic,
  Loader2,
  MapPin,
  Plane,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  Wallet,
} from 'lucide-react';
import type {
  ApacTourStop,
  CityId,
  MonitoredSinger,
  ReminderRule,
  WorldFestivalItem,
  WorldFestivalRegion,
  WorldFestivalVibe,
} from '../types/gig';
import {
  CORE_WORLD_FESTIVALS,
  DISCOVERABLE_WORLD_FESTIVALS,
} from '../data/worldFestivals';
import type { WatchlistSingerEntry } from '../data/userSingerList';
import {
  buildGoogleCalendarWorldFestivalUrl,
  computeCountdown,
  downloadIcsEvents,
  formatAuTimestamp,
  sanitizeExternalHttpsUrl,
} from '../utils/formatters';
import { ArtistAvatar } from './ArtistAvatar';
import { ApacRadarSection } from './ApacRadarSection';
import { buildArtistPreviewLinks } from '../utils/musicPreviewLinks';
import { IS_STATIC_MODE } from '../config/runtimeMode';
import { useLocale } from '../i18n/LocaleContext';

function resolveTripPlanner(fest: WorldFestivalItem): {
  allInBudgetAud: string;
  budgetBreakdown: string;
  visaAndCampingTip: string;
} {
  if (fest.allInBudgetAud && fest.budgetBreakdown && fest.visaAndCampingTip) {
    return {
      allInBudgetAud: fest.allInBudgetAud,
      budgetBreakdown: fest.budgetBreakdown,
      visaAndCampingTip: fest.visaAndCampingTip,
    };
  }
  if (fest.region === 'Asia') {
    return {
      allInBudgetAud: '~A$1,950–$2,950 all-in',
      budgetBreakdown: `${fest.passPriceApprox} + Return nonstop/1-stop MEL/SYD flight ~A$850–$1,150 + Hotel/Transfers ~A$650`,
      visaAndCampingTip:
        'AU Passports: Visa-free / visa-exempt across major Asian music hubs (check local digital arrival card 72h prior).',
    };
  }
  if (fest.region === 'North America') {
    return {
      allInBudgetAud: '~A$3,400–$4,800 all-in',
      budgetBreakdown: `${fest.passPriceApprox} + Return MEL/SYD trans-Pacific flight ~A$1,550–$1,850 + Camping/Hotel & Shuttle ~A$1,150`,
      visaAndCampingTip:
        'AU Passports: Apply for US ESTA (or Canadian eTA) at least 72h prior; lock free-cancellation lodging near official shuttle lines.',
    };
  }
  if (fest.region === 'Europe') {
    return {
      allInBudgetAud: '~A$3,100–$4,450 all-in',
      budgetBreakdown: `${fest.passPriceApprox} + Return 1-stop MEL/SYD→EU flight ~A$1,950–$2,250 + Camping/City Stay & Rail ~A$650`,
      visaAndCampingTip:
        'AU Passports: 90-day visa-free Schengen/UK entry (check EU ETIAS / UK ETA requirements before departure).',
    };
  }
  return {
    allInBudgetAud: '~A$2,800–$4,200 all-in',
    budgetBreakdown: `${fest.passPriceApprox} + Return international flights from MEL/SYD + Accommodation & ground transfers`,
    visaAndCampingTip:
      'Check AU Smartraveller entry rules & official festival shuttle/camping allocations early.',
  };
}

interface WorldFestivalsPageProps {
  savedExtraFestivals: WorldFestivalItem[];
  onAddFestival: (festival: WorldFestivalItem) => void;
  onRemoveExtraFestival: (festivalId: string) => void;
  onResetExtraFestivals: () => void;
  monitoredSingers: MonitoredSinger[];
  watchlistSingers: WatchlistSingerEntry[];
  onToggleMonitorArtist: (artistName: string) => void;
  reminders: ReminderRule[];
  onToggleFestivalReminder: (festival: WorldFestivalItem) => void;
  onToggleApacReminder: (stop: ApacTourStop) => void;
  onBulkArmFestivalReminders: (newRules: ReminderRule[]) => void;
  onOpenReminderDrawer: () => void;
  cityFilter: 'all' | CityId;
  onChangeCityFilter: (city: 'all' | CityId) => void;
  nowMs: number;
  onBackToMainGuide: () => void;
  onShowToast: (msg: string) => void;
}

const REGION_FILTERS: Array<'All Regions' | WorldFestivalRegion> = [
  'All Regions',
  'North America',
  'Europe',
  'Asia',
  'Latin America',
  'Middle East & Africa',
  'Oceania',
];

const VIBE_FILTERS: Array<'All Vibes' | WorldFestivalVibe> = [
  'All Vibes',
  'Transformational & Art',
  'Electronic & Underground',
  'Indie, Rock & Nature',
  'Multi-Genre Iconic',
];

const QUICK_SEARCH_SUGGESTIONS = [
  'Ozora',
  'Glastonbury',
  'Primavera Sound',
  'Waking Life',
  'Dekmantel',
  'Time Warp',
  'Envision Festival',
  'Summer Sonic',
];

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.’'`]/g, '')
    .replace(/[^a-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ')
    .trim();
}

function getFallbackGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const palettes = [
    'linear-gradient(135deg, #422015 0%, #8c3b1f 52%, #1d1714 100%)',
    'linear-gradient(135deg, #1b2c3b 0%, #2d5c68 50%, #14191e 100%)',
    'linear-gradient(135deg, #332245 0%, #6c3b7a 52%, #191520 100%)',
    'linear-gradient(135deg, #243829 0%, #4b7043 52%, #141b16 100%)',
    'linear-gradient(135deg, #492c14 0%, #a36624 52%, #1c1612 100%)',
  ];
  return palettes[Math.abs(hash) % palettes.length];
}

const FestivalPhotoBanner: React.FC<{
  festival: WorldFestivalItem;
  compact?: boolean;
  children?: React.ReactNode;
}> = ({ festival, compact = false, children }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasPhoto =
    Boolean(festival.imageUrl) &&
    festival.imageUrl.startsWith('https://') &&
    failedUrl !== festival.imageUrl;

  return (
    <div
      className={`world-fest-banner ${compact ? 'world-fest-banner--compact' : ''}`}
      style={!hasPhoto ? { background: getFallbackGradient(festival.name) } : undefined}
    >
      {hasPhoto ? (
        <img
          src={festival.imageUrl}
          alt={`${festival.name} stage atmosphere`}
          className="world-fest-banner-img"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(festival.imageUrl)}
        />
      ) : (
        <div className="world-fest-banner-fallback" aria-hidden="true">
          <Globe size={compact ? 26 : 34} />
          <span>{festival.countryCode}</span>
        </div>
      )}
      <div className="world-fest-banner-scrim" aria-hidden="true" />
      {children}
    </div>
  );
};

export const WorldFestivalsPage: React.FC<WorldFestivalsPageProps> = ({
  savedExtraFestivals,
  onAddFestival,
  onRemoveExtraFestival,
  onResetExtraFestivals,
  monitoredSingers,
  watchlistSingers,
  onToggleMonitorArtist,
  reminders,
  onToggleFestivalReminder,
  onToggleApacReminder,
  onBulkArmFestivalReminders,
  onOpenReminderDrawer,
  cityFilter,
  onChangeCityFilter,
  nowMs,
  onBackToMainGuide,
  onShowToast,
}) => {
  const { locale, isZh, tr, cityLabel, genreLabel } = useLocale();
  const [trackedRegion, setTrackedRegion] = useState<'All Regions' | WorldFestivalRegion>(
    'All Regions',
  );
  const [trackedVibe, setTrackedVibe] = useState<'All Vibes' | WorldFestivalVibe>('All Vibes');

  // Discovery & Live Global Search state
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discoveryVibe, setDiscoveryVibe] = useState<'All Vibes' | WorldFestivalVibe>('All Vibes');
  const [discoveryRegion, setDiscoveryRegion] = useState<'All Regions' | WorldFestivalRegion>(
    'All Regions',
  );
  const [liveResults, setLiveResults] = useState<WorldFestivalItem[]>([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const [liveSearchNote, setLiveSearchNote] = useState<string | null>(null);
  const searchSeqRef = useRef<number>(0);

  // Custom Festival Builder state
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [customCountry, setCustomCountry] = useState('');
  const [customRegion, setCustomRegion] = useState<WorldFestivalRegion>('Europe');
  const [customVibe, setCustomVibe] = useState<WorldFestivalVibe>('Transformational & Art');
  const [customDates, setCustomDates] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const myFestivals = useMemo(() => {
    const coreIds = new Set(CORE_WORLD_FESTIVALS.map((f) => f.id));
    const dedupedExtras = savedExtraFestivals.filter((f) => !coreIds.has(f.id));
    return [...CORE_WORLD_FESTIVALS, ...dedupedExtras];
  }, [savedExtraFestivals]);

  const myFestivalNameKeys = useMemo(() => {
    const set = new Set<string>();
    for (const f of myFestivals) {
      set.add(f.id);
      set.add(normalizeToken(f.name));
    }
    return set;
  }, [myFestivals]);

  // Build normalized lookup of user's live My Singers roster + monitored radar singers
  const watchedArtistSet = useMemo(() => {
    const set = new Set<string>();
    for (const entry of watchlistSingers) {
      const main = normalizeToken(entry.displayName);
      if (main) set.add(main);
      for (const term of entry.matchTerms) {
        const clean = normalizeToken(term);
        if (clean.length >= 2) set.add(clean);
      }
    }
    for (const s of monitoredSingers) {
      const main = normalizeToken(s.name);
      if (main) set.add(main);
      for (const al of s.aliases) {
        const clean = normalizeToken(al);
        if (clean.length >= 2) set.add(clean);
      }
    }
    return set;
  }, [monitoredSingers, watchlistSingers]);

  const monitoredNameSet = useMemo(
    () => new Set(monitoredSingers.map((s) => normalizeToken(s.name))),
    [monitoredSingers],
  );

  const remindedFestivalIds = useMemo(
    () => new Set(reminders.map((r) => r.concertId)),
    [reminders],
  );

  const filteredMyFestivals = useMemo(
    () =>
      myFestivals.filter((fest) => {
        if (trackedRegion !== 'All Regions' && fest.region !== trackedRegion) return false;
        if (trackedVibe !== 'All Vibes' && fest.vibe !== trackedVibe) return false;
        return true;
      }),
    [myFestivals, trackedRegion, trackedVibe],
  );

  const totalWatchlistCrossovers = useMemo(() => {
    const matched = new Set<string>();
    for (const fest of myFestivals) {
      for (const act of fest.lineupHighlights) {
        if (watchedArtistSet.has(normalizeToken(act))) {
          matched.add(act);
        }
      }
    }
    return Array.from(matched);
  }, [myFestivals, watchedArtistSet]);

  const executeLiveWorldwideSearch = async (rawQuery: string, explicitClick = false) => {
    const seq = ++searchSeqRef.current;
    const trimmed = rawQuery.trim();
    if (trimmed.length < 2) {
      setLiveResults([]);
      setLiveSearchNote(null);
      return;
    }
    if (IS_STATIC_MODE) {
      setLiveResults([]);
      if (explicitClick) {
        setLiveSearchNote(
          `Filtered curated worldwide festival catalog for "${trimmed}" — or add any festival via + Custom Festival below.`,
        );
      }
      return;
    }
    setLiveSearching(true);
    try {
      const res = await fetch(
        `/api/world-festivals/search?q=${encodeURIComponent(trimmed)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (seq !== searchSeqRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as {
          festivals?: WorldFestivalItem[];
          results?: WorldFestivalItem[];
        };
        if (seq !== searchSeqRef.current) return;
        const rawList = data.festivals || data.results;
        const items = Array.isArray(rawList) ? rawList : [];
        setLiveResults(items);
        if (explicitClick) {
          setLiveSearchNote(
            items.length > 0
              ? `Found ${items.length} live worldwide festival match${items.length === 1 ? '' : 'es'} for "${trimmed}".`
              : `No additional external festivals matched "${trimmed}" — you can add it via + Custom Festival below.`,
          );
        }
      }
    } catch {
      if (seq === searchSeqRef.current && explicitClick) {
        setLiveSearchNote('Showing curated offline global festival catalog.');
      }
    } finally {
      if (seq === searchSeqRef.current) {
        setLiveSearching(false);
      }
    }
  };

  // Debounced live worldwide discovery search when typing 3+ chars
  useEffect(() => {
    const trimmed = discoveryQuery.trim();
    if (trimmed.length < 3) {
      setLiveResults([]);
      setLiveSearchNote(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void executeLiveWorldwideSearch(trimmed, false);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [discoveryQuery]);

  const combinedDiscoveryFestivals = useMemo(() => {
    const q = discoveryQuery.trim().toLowerCase();
    const seenNames = new Set<string>();
    const results: WorldFestivalItem[] = [];

    const matchesFilters = (fest: WorldFestivalItem): boolean => {
      if (discoveryRegion !== 'All Regions' && fest.region !== discoveryRegion) return false;
      if (discoveryVibe !== 'All Vibes' && fest.vibe !== discoveryVibe) return false;
      if (!q) return true;
      const hay = [
        fest.name,
        fest.city,
        fest.country,
        fest.region,
        fest.vibe,
        fest.venueName,
        fest.description,
        ...fest.lineupHighlights,
        ...fest.stagesOrCamps,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    };

    for (const item of DISCOVERABLE_WORLD_FESTIVALS) {
      if (!matchesFilters(item)) continue;
      const key = normalizeToken(item.name);
      seenNames.add(key);
      results.push(item);
    }

    for (const liveItem of liveResults) {
      const key = normalizeToken(liveItem.name);
      if (seenNames.has(key)) continue;
      if (discoveryRegion !== 'All Regions' && liveItem.region !== discoveryRegion) continue;
      if (discoveryVibe !== 'All Vibes' && liveItem.vibe !== discoveryVibe) continue;
      seenNames.add(key);
      results.push(liveItem);
    }

    return results;
  }, [discoveryQuery, discoveryRegion, discoveryVibe, liveResults]);

  const handleBulkArmAllSessions = () => {
    const rulesToAdd: ReminderRule[] = [];
    const targetCity: CityId = cityFilter === 'sydney' ? 'sydney' : 'melbourne';

    for (const fest of myFestivals) {
      const ruleId = `${fest.id}::world-session::60`;
      if (reminders.some((r) => r.id === ruleId || r.concertId === fest.id)) continue;
      rulesToAdd.push({
        id: ruleId,
        concertId: fest.id,
        artist: fest.name,
        venueName: `${fest.venueName}, ${fest.city}`,
        city: targetCity,
        regionBadge: fest.countryCode,
        targetType: 'presale',
        targetLabel: fest.nextSessionLabel,
        targetIso: fest.nextSessionIso,
        leadMinutes: 60,
        ticketUrl: sanitizeExternalHttpsUrl(fest.ticketsUrl || fest.officialUrl, fest.name),
        firedOffsets: [],
        createdAtIso: new Date().toISOString(),
      });
    }

    if (rulesToAdd.length === 0) {
      onShowToast(
        tr(
          'All tracked world festival registration & ticket sessions already have alerts saved.',
          '已追踪的全部全球音乐节注册与开票场次均已保存提醒。',
        ),
      );
      return;
    }
    onBulkArmFestivalReminders(rulesToAdd);
  };

  const handleExportWorldFestivalsIcs = () => {
    const events = myFestivals.map((fest) => {
      const start = new Date(fest.nextSessionIso);
      const safeStart = Number.isNaN(start.getTime())
        ? new Date(`${fest.startDateIso}T10:00:00Z`)
        : start;
      const end = new Date(safeStart.getTime() + 90 * 60 * 1000);
      return {
        uid: `${fest.id}-session`,
        summary: `[World Festival] ${fest.name} — ${fest.nextSessionLabel}`,
        location: `${fest.venueName}, ${fest.city}, ${fest.country}`,
        description: [
          `Dates: ${fest.datesLabel}`,
          `Pass Guide: ${fest.passPriceApprox}`,
          `MEL Flight: ${fest.melbourneFlightTip}`,
          `SYD Flight: ${fest.sydneyFlightTip}`,
          `Official URL: ${sanitizeExternalHttpsUrl(fest.ticketsUrl || fest.officialUrl, fest.name)}`,
        ].join(' | '),
        startDate: safeStart,
        endDate: end,
        alarmMinutes: 60,
      };
    });
    downloadIcsEvents('oz-amp-world-festivals.ics', events);
    onShowToast(
      tr(
        `Exported ${events.length} world festival sessions to .ics calendar.`,
        `已导出 ${events.length} 场全球音乐节提醒至 .ics 日历文件。`,
      ),
    );
  };

  const handleDownloadSingleFestivalIcs = (fest: WorldFestivalItem) => {
    const start = new Date(`${fest.startDateIso}T12:00:00Z`);
    const endRaw = fest.endDateIso || fest.startDateIso;
    const end = new Date(`${endRaw}T22:00:00Z`);
    downloadIcsEvents(`${fest.id}.ics`, [
      {
        uid: fest.id,
        summary: `${fest.name} (${fest.country})`,
        location: `${fest.venueName}, ${fest.city}, ${fest.country}`,
        description: `${fest.datesLabel} | ${fest.passPriceApprox} | Official: ${sanitizeExternalHttpsUrl(fest.officialUrl, fest.name)}`,
        startDate: start,
        endDate: end,
        alarmMinutes: 1440,
      },
    ]);
    onShowToast(
      tr(
        `Downloaded .ics calendar file for ${fest.name}.`,
        `已下载 ${fest.name} 的 .ics 日历文件。`,
      ),
    );
  };

  const handleCustomFestivalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customName.trim();
    if (cleanName.length < 2) {
      onShowToast(tr('Please enter a festival name.', '请输入音乐节名称。'));
      return;
    }
    const cleanCountry = customCountry.trim() || 'International';
    const cleanCity = customCity.trim() || cleanCountry;
    let verifiedHttps = 'https://en.wikipedia.org/wiki/Music_festival';
    if (customUrl.trim()) {
      try {
        const parsed = new URL(
          customUrl.trim().startsWith('http') ? customUrl.trim() : `https://${customUrl.trim()}`,
        );
        if (parsed.protocol === 'https:') {
          verifiedHttps = parsed.toString();
        }
      } catch {
        // Keep safe HTTPS default
      }
    }

    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const nowDate = new Date();
    const targetSeasonYear = nowDate.getMonth() >= 9 ? nowDate.getFullYear() + 1 : nowDate.getFullYear();

    const created: WorldFestivalItem = {
      id: `wf-custom-${slug}-${Date.now().toString(36)}`,
      name: cleanName,
      city: cleanCity,
      country: cleanCountry,
      countryCode: cleanCountry.slice(0, 10).toUpperCase(),
      region: customRegion,
      vibe: customVibe,
      datesLabel: customDates.trim() || `${targetSeasonYear} Edition · Dates TBA`,
      startDateIso: `${targetSeasonYear}-07-01`,
      venueName: `${cleanCity} Festival Grounds`,
      themeOrEdition: 'Custom Tracked Pilgrimage',
      status: 'registration-soon',
      statusLabel: 'Custom Tracked · Watchlist',
      passPriceApprox: 'Check Official Portal',
      melbourneFlightTip: `MEL international routing to ${cleanCity}`,
      sydneyFlightTip: `SYD international routing to ${cleanCity}`,
      imageUrl: '',
      officialUrl: verifiedHttps,
      ticketsUrl: verifiedHttps,
      lineupAnnounced: false,
      lineupHighlights: [],
      stagesOrCamps: ['Main Festival Stage'],
      nextSessionLabel: 'Official Lineup & Ticket Release Check',
      nextSessionIso: `${targetSeasonYear}-02-01T10:00:00+11:00`,
      description: `Custom world festival added to your OZ Amp global pilgrimage tracker in ${cleanCity}, ${cleanCountry}.`,
      isCustomAdded: true,
    };

    onAddFestival(created);
    setCustomName('');
    setCustomCity('');
    setCustomCountry('');
    setCustomDates('');
    setCustomUrl('');
    setShowCustomForm(false);
  };

  const departureCityLabel =
    cityFilter === 'melbourne'
      ? 'Melbourne (MEL)'
      : cityFilter === 'sydney'
        ? 'Sydney (SYD)'
        : 'Melbourne (MEL) & Sydney (SYD)';

  return (
    <div className="world-festivals-page">
      {/* Top Editorial Hero Card */}
      <section className="watchlist-hero-card world-hero-card" aria-labelledby="world-fest-title">
        <div className="watchlist-hero-top">
          <button
            type="button"
            className="btn-outline-sm"
            onClick={onBackToMainGuide}
          >
            <ArrowLeft size={14} />
            <span>{tr('Back to Melbourne & Sydney Gig Guide', '返回墨尔本与悉尼全部演出')}</span>
          </button>
          <span className="eyebrow-kicker">
            {tr(
              `WORLD PILGRIMAGE EDITION · DEPARTING ${departureCityLabel.toUpperCase()}`,
              `全球音乐节朝圣指南 · 从 ${cityLabel(cityFilter)} 出发`,
            )}
          </span>
        </div>

        <div className="watchlist-hero-grid">
          <div>
            <h1 id="world-fest-title" className="hero-headline watchlist-headline">
              {tr('Iconic Global Music & Arts Festivals.', '全球标志性音乐与艺术节')}
            </h1>
            <p className="hero-lede">
              {isZh ? (
                <>
                  追踪全球殿堂级音乐节 — <strong>Coachella</strong>、<strong>Tomorrowland</strong>、
                  <strong>Burning Man</strong>、<strong>Fuji Rock</strong>、<strong>Wonderfruit</strong> 与{' '}
                  <strong>Boom Festival</strong> — 提供澳东时间开票倒计时、我的歌手阵容匹配、从{' '}
                  <strong>{cityLabel(cityFilter)}</strong> 出发的航班与预算建议，以及全球新音乐节实时搜索。
                </>
              ) : (
                <>
                  Tracking your flagship global festival roster —{' '}
                  <strong>Coachella</strong>, <strong>Tomorrowland</strong>,{' '}
                  <strong>Burning Man</strong>, <strong>Fuji Rock</strong>,{' '}
                  <strong>Wonderfruit</strong>, and <strong>Boom Festival</strong> — with
                  registration countdowns in Australian time, watchlist singer crossovers, flight
                  routing from <strong>{departureCityLabel}</strong>, and live discovery for
                  potential new festivals worldwide.
                </>
              )}
            </p>

            <div className="watchlist-cta-row">
              <button
                type="button"
                id="arm-all-world-festivals-btn"
                className="btn-primary-sm"
                onClick={handleBulkArmAllSessions}
              >
                <BellPlus size={15} />
                <span>
                  {tr('Notify All Registration Sessions', '一键开启全部抽签 / 开票提醒')}
                </span>
              </button>

              <a href="#discover-world-festivals" className="btn-outline-sm">
                <Compass size={15} />
                <span>{tr('Search Potential New Festivals ↓', '探索更多全球音乐节 ↓')}</span>
              </a>

              <button
                type="button"
                className="btn-outline-sm"
                onClick={handleExportWorldFestivalsIcs}
              >
                <Calendar size={14} />
                <span>{tr('Export World Calendar (.ics)', '导出音乐节日历 (.ics)')}</span>
              </button>

              <button
                type="button"
                className="btn-outline-sm"
                onClick={onOpenReminderDrawer}
              >
                <Bell size={14} />
                <span>{tr(`Saved Alerts (${reminders.length})`, `已存提醒 (${reminders.length})`)}</span>
              </button>
            </div>
          </div>

          <div className="watchlist-stat-grid">
            <div className="watchlist-stat-tile is-accent">
              <span className="watchlist-stat-num">{myFestivals.length}</span>
              <span className="watchlist-stat-label">
                {tr(
                  `Tracked Festivals (${CORE_WORLD_FESTIVALS.length} Core${savedExtraFestivals.length > 0 ? ` + ${savedExtraFestivals.length} Added` : ''})`,
                  `已追踪音乐节（${CORE_WORLD_FESTIVALS.length} 核心${savedExtraFestivals.length > 0 ? ` + ${savedExtraFestivals.length} 自选` : ''}）`,
                )}
              </span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">
                {myFestivals.filter((f) => remindedFestivalIds.has(f.id)).length} /{' '}
                {myFestivals.length}
              </span>
              <span className="watchlist-stat-label">
                {tr('Registration Alerts On', '已开启开票提醒')}
              </span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{totalWatchlistCrossovers.length}</span>
              <span className="watchlist-stat-label">
                {tr('Your Singer Crossovers', '命中您的关注歌手')}
                {totalWatchlistCrossovers.length > 0
                  ? ` (${totalWatchlistCrossovers.slice(0, 2).join(', ')})`
                  : ''}
              </span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{DISCOVERABLE_WORLD_FESTIVALS.length}+</span>
              <span className="watchlist-stat-label">
                {tr('Curated + Live Web Discovery', '精选库 + 全网实时探索')}
              </span>
            </div>
          </div>
        </div>

        {/* Departure Origin Switcher synced with Top Masthead Home Picker */}
        <div className="world-origin-bar">
          <span className="world-origin-label">
            <Plane size={14} />
            <span>{tr('Flight Routing Origin:', '出发城市 (航班建议):')}</span>
          </span>
          <div className="city-tab-bar watchlist-city-tabs" role="tablist" aria-label={tr('Flight routing origin', '出发城市')}>
            <button
              type="button"
              role="tab"
              aria-selected={cityFilter === 'melbourne'}
              className={`city-tab ${cityFilter === 'melbourne' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('melbourne')}
            >
              <span>{tr('Melbourne (MEL)', '墨尔本 (MEL)')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cityFilter === 'sydney'}
              className={`city-tab ${cityFilter === 'sydney' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('sydney')}
            >
              <span>{tr('Sydney (SYD)', '悉尼 (SYD)')}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cityFilter === 'all'}
              className={`city-tab ${cityFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('all')}
            >
              <span>{tr('Both Cities (MEL & SYD)', '墨尔本 & 悉尼')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 01: YOUR TRACKED WORLD FESTIVALS (6 CORE + USER-ADDED) */}
      <section className="feature-section" aria-labelledby="tracked-world-heading">
        <div className="section-header-row">
          <div>
            <span className="eyebrow-kicker">
              {tr(
                '01 · YOUR GLOBAL PILGRIMAGE ROSTER · REGISTRATION, BALLOTS & LINEUPS',
                '01 · 您的全球音乐节清单 · 抽签、开票倒计时与阵容',
              )}
            </span>
            <h2 id="tracked-world-heading" className="section-heading">
              {tr(
                `Your World Festivals (${filteredMyFestivals.length})`,
                `已追踪全球音乐节 (${filteredMyFestivals.length})`,
              )}
            </h2>
          </div>

          {savedExtraFestivals.length > 0 && (
            <button
              type="button"
              className="btn-subtle-sm"
              onClick={onResetExtraFestivals}
            >
              <RotateCcw size={13} />
              <span>{tr('Reset to Core 6', '重置为核心 6 大音乐节')}</span>
            </button>
          )}
        </div>

        <div className="world-filter-toolbar">
          <div className="genre-scroll-row" role="group" aria-label={tr('Filter tracked festivals by region', '按地区筛选音乐节')}>
            {REGION_FILTERS.map((reg) => (
              <button
                key={reg}
                type="button"
                className={`genre-pill ${trackedRegion === reg ? 'is-selected' : ''}`}
                onClick={() => setTrackedRegion(reg)}
              >
                {genreLabel(reg)}
              </button>
            ))}
          </div>

          <div className="genre-scroll-row" role="group" aria-label={tr('Filter tracked festivals by vibe', '按风格筛选音乐节')}>
            {VIBE_FILTERS.map((vibe) => (
              <button
                key={vibe}
                type="button"
                className={`genre-pill ${trackedVibe === vibe ? 'is-selected' : ''}`}
                onClick={() => setTrackedVibe(vibe)}
              >
                {genreLabel(vibe)}
              </button>
            ))}
          </div>
        </div>

        {filteredMyFestivals.length === 0 ? (
          <div className="empty-state-box">
            <p>
              {tr(
                'No tracked festivals match that region/vibe combination.',
                '当前地区与风格筛选下暂无匹配音乐节。',
              )}
            </p>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => {
                setTrackedRegion('All Regions');
                setTrackedVibe('All Vibes');
              }}
            >
              {tr(
                `Show All ${myFestivals.length} Tracked Festivals`,
                `显示全部 ${myFestivals.length} 个已追踪音乐节`,
              )}
            </button>
          </div>
        ) : (
          <div className="world-festivals-grid">
            {filteredMyFestivals.map((fest) => {
              const isArmed = remindedFestivalIds.has(fest.id);
              const countdown = computeCountdown(fest.nextSessionIso, nowMs, locale);
              const crossoverActs = fest.lineupHighlights.filter((act) =>
                watchedArtistSet.has(normalizeToken(act)),
              );
              const safeOfficialUrl = sanitizeExternalHttpsUrl(fest.officialUrl, fest.name);
              const safeTicketsUrl = sanitizeExternalHttpsUrl(
                fest.ticketsUrl || fest.officialUrl,
                fest.name,
              );
              const auDisplayCity: CityId = cityFilter === 'sydney' ? 'sydney' : 'melbourne';

              return (
                <article
                  key={fest.id}
                  className={`world-fest-card ${isArmed ? 'is-armed' : ''}`}
                >
                  <FestivalPhotoBanner festival={fest}>
                    <div className="world-banner-top-badges">
                      <div className="world-banner-left-pills">
                        <span className="world-country-pill">{fest.countryCode}</span>
                        <span className="world-vibe-pill">{genreLabel(fest.vibe)}</span>
                      </div>
                      <span className={`world-status-pill world-status-pill--${fest.status}`}>
                        {fest.status === 'lineup-live'
                          ? tr(fest.statusLabel, '阵容已公布')
                          : fest.status === 'registration-soon'
                            ? tr(fest.statusLabel, '即将开启预注册')
                            : fest.status === 'ballot-upcoming'
                              ? tr(fest.statusLabel, '即将抽签售票')
                              : tr(fest.statusLabel, '售罄 / 官方转售')}
                      </span>
                    </div>

                    <div className="world-banner-bottom-caption">
                      {fest.themeOrEdition && (
                        <span className="world-edition-kicker">{fest.themeOrEdition}</span>
                      )}
                      <span className="world-dates-chip">
                        <Calendar size={13} />
                        <span>{fest.datesLabel}</span>
                      </span>
                    </div>
                  </FestivalPhotoBanner>

                  <div className="world-fest-body">
                    <div className="world-fest-title-block">
                      <div className="world-fest-title-row">
                        <h3 className="world-fest-title">{fest.name}</h3>
                        {crossoverActs.length > 0 && (
                          <span className="watched-match-pill">
                            <Star size={12} />
                            <span>
                              {crossoverActs.length === 1
                                ? tr(`Your Singer: ${crossoverActs[0]}`, `您关注的歌手: ${crossoverActs[0]}`)
                                : tr(
                                    `${crossoverActs.length} Watchlist Singers`,
                                    `命中 ${crossoverActs.length} 位关注歌手`,
                                  )}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="world-fest-loc-row">
                        <span className="world-loc-item">
                          <MapPin size={13} />
                          <span>
                            {fest.venueName} · {fest.city}, {fest.country}
                          </span>
                        </span>
                        <span className="world-price-tag">
                          <Ticket size={13} />
                          <span>{fest.passPriceApprox}</span>
                        </span>
                      </div>
                    </div>

                    <p className="world-fest-desc">{fest.description}</p>

                    {/* Flight Routing Strip aligned with Melbourne / Sydney / Both Cities dropdown */}
                    <div className="world-flight-box">
                      {(cityFilter === 'melbourne' || cityFilter === 'all') && (
                        <div className="world-flight-line">
                          <span className="city-pill city-pill--melbourne">
                            {cityLabel('melbourne', 'short')} ✈
                          </span>
                          <span>{fest.melbourneFlightTip}</span>
                        </div>
                      )}
                      {(cityFilter === 'sydney' || cityFilter === 'all') && (
                        <div className="world-flight-line">
                          <span className="city-pill city-pill--sydney">
                            {cityLabel('sydney', 'short')} ✈
                          </span>
                          <span>{fest.sydneyFlightTip}</span>
                        </div>
                      )}
                    </div>

                    {/* All-In AUD Trip Budget & Visa / Camping Logistics Planner */}
                    {(() => {
                      const planner = resolveTripPlanner(fest);
                      return (
                        <div className="world-budget-box">
                          <div className="world-budget-top">
                            <span className="world-budget-kicker">
                              <Wallet size={13} />
                              <span>
                                {tr(
                                  'ESTIMATED ALL-IN TRIP BUDGET (AUD)',
                                  '预估总出行预算（含机票/住宿/门票 · 澳元）',
                                )}
                              </span>
                            </span>
                            <strong className="world-budget-total">{planner.allInBudgetAud}</strong>
                          </div>
                          <p className="world-budget-sub">{planner.budgetBreakdown}</p>
                          <div className="world-visa-line">
                            <ShieldCheck size={13} className="resale-icon" />
                            <span>{planner.visaAndCampingTip}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Lineup Highlights & Iconic Stages */}
                    <div className="world-lineup-stage-box">
                      {fest.lineupAnnounced && fest.lineupHighlights.length > 0 ? (
                        <div className="world-tier-block">
                          <span className="lineup-tier-label">
                            {tr(
                              'ANNOUNCED LINEUP HIGHLIGHTS (CLICK TO TOGGLE RADAR)',
                              '已官宣重点阵容（点击加入 / 取消巡演雷达）',
                            )}
                          </span>
                          <div className="world-artist-chips">
                            {fest.lineupHighlights.map((act) => {
                              const isWatched = watchedArtistSet.has(normalizeToken(act));
                              const isMonitored = monitoredNameSet.has(normalizeToken(act));
                              return (
                                <button
                                  key={act}
                                  type="button"
                                  className={`world-artist-chip ${isWatched ? 'is-watched' : ''}`}
                                  onClick={() => onToggleMonitorArtist(act)}
                                  title={
                                    isMonitored
                                      ? tr(
                                          `${act} is in your active radar (click to toggle)`,
                                          `${act} 已在巡演雷达中（点击切换）`,
                                        )
                                      : tr(
                                          `Add ${act} to your OZ Amp tour radar`,
                                          `将 ${act} 加入巡演雷达`,
                                        )
                                  }
                                >
                                  <ArtistAvatar name={act} size="xs" />
                                  <span>{act}</span>
                                  {isWatched && <Star size={11} className="world-star-icon" />}
                                </button>
                              );
                            })}
                          </div>
                          {(() => {
                            const leadPreview = buildArtistPreviewLinks(fest.lineupHighlights[0]);
                            return (
                              <div className="music-preview-strip">
                                <a
                                  href={leadPreview.spotify}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="preview-chip"
                                >
                                  <Headphones size={12} />
                                  <span>{tr('Headliner Spotify', '压轴歌手 Spotify')}</span>
                                </a>
                                <a
                                  href={leadPreview.setlistFm}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="preview-chip preview-chip--setlist"
                                >
                                  <ListMusic size={12} />
                                  <span>{tr('Headliner Setlist.fm', '压轴歌手歌单')}</span>
                                </a>
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}

                      {fest.stagesOrCamps.length > 0 && (
                        <div className="world-tier-block">
                          <span className="lineup-tier-label">
                            {tr('ICONIC STAGES, REALMS & SOUND CAMPS', '标志性舞台与主题营地')}
                          </span>
                          <div className="world-stage-chips">
                            {fest.stagesOrCamps.map((stage) => (
                              <span key={stage} className="world-stage-chip">
                                {stage}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Next Registration / Resale / Gate Session Countdown */}
                    <div className="world-session-box">
                      <div className="world-session-meta">
                        <span className="world-session-kicker">
                          <Clock size={12} />
                          <span>
                            {tr(
                              `NEXT KEY SESSION (${auDisplayCity === 'sydney' ? 'SYD' : 'MEL'} TIME)`,
                              `下一关键节点（${cityLabel(auDisplayCity)}时间）`,
                            )}
                          </span>
                        </span>
                        <strong className="world-session-title">{fest.nextSessionLabel}</strong>
                        <span className="world-session-timestamp">
                          {formatAuTimestamp(fest.nextSessionIso, auDisplayCity, locale)}
                        </span>
                      </div>
                      <span
                        className={`countdown-chip ${countdown.isImminent ? 'is-imminent' : ''}`}
                      >
                        {countdown.compact}
                      </span>
                    </div>

                    {/* Uniform Symmetrical Card Footer */}
                    <div className="world-fest-footer">
                      <div className="world-footer-left">
                        <button
                          type="button"
                          className={isArmed ? 'btn-armed-sm' : 'btn-outline-sm'}
                          onClick={() => onToggleFestivalReminder(fest)}
                        >
                          {isArmed ? <Check size={14} /> : <BellPlus size={14} />}
                          <span>{isArmed ? tr('Alert On', '已设提醒') : tr('Notify Me', '设置提醒')}</span>
                        </button>

                        <a
                          href={buildGoogleCalendarWorldFestivalUrl(fest, 'session')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-subtle-sm"
                          title={tr('Add registration/ticket session to Google Calendar', '添加到 Google 日历')}
                        >
                          <Calendar size={13} />
                          <span>{tr('GCal', '日历')}</span>
                        </a>

                        <button
                          type="button"
                          className="btn-subtle-sm"
                          onClick={() => handleDownloadSingleFestivalIcs(fest)}
                          title={tr('Download festival dates .ics file', '下载 .ics 日历文件')}
                        >
                          <span>.ics</span>
                        </button>
                      </div>

                      <div className="world-footer-right">
                        {!fest.isCore && (
                          <button
                            type="button"
                            className="btn-subtle-sm world-remove-btn"
                            onClick={() => onRemoveExtraFestival(fest.id)}
                            title={tr(`Remove ${fest.name} from your tracked page`, `移除 ${fest.name}`)}
                          >
                            <Trash2 size={13} />
                            <span>{tr('Remove', '移除')}</span>
                          </button>
                        )}

                        <a
                          href={safeOfficialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline-sm"
                        >
                          <span>{tr('Official Site', '官网')}</span>
                          <ExternalLink size={13} />
                        </a>

                        <a
                          href={safeTicketsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary-sm"
                        >
                          <Ticket size={14} />
                          <span>{tr('Passes', '购票')}</span>
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* SHORT-FLIGHT ASIA-PACIFIC TOUR STOP RADAR */}
      <ApacRadarSection
        cityFilter={cityFilter}
        reminders={reminders}
        onToggleApacReminder={onToggleApacReminder}
      />

      {/* SECTION 03: SEARCH & DISCOVER POTENTIAL NEW WORLD FESTIVALS */}
      <section
        id="discover-world-festivals"
        className="feature-section world-discovery-section"
        aria-labelledby="discover-world-heading"
      >
        <div className="section-header-row">
          <div>
            <span className="eyebrow-kicker">
              {tr(
                '03 · GLOBAL FESTIVAL RADAR · CURATED CATALOG + LIVE WORLDWIDE SEARCH',
                '03 · 全球音乐节雷达 · 精选目录 + 全网实时搜索',
              )}
            </span>
            <h2 id="discover-world-heading" className="section-heading">
              {tr('Search & Add Potential New Festivals', '搜索并添加新的全球音乐节')}
            </h2>
          </div>

          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => setShowCustomForm((open) => !open)}
          >
            <Plus size={14} />
            <span>
              {showCustomForm
                ? tr('Close Custom Builder', '收起自定义表单')
                : tr('Add Custom Festival', '手动添加音乐节')}
            </span>
          </button>
        </div>

        <p className="section-subcopy">
          {tr(
            'Explore transformational desert & forest gatherings, European techno shrines, and short-flight Asian festivals — or search live across worldwide music festivals and pin any discovery straight onto your page above.',
            '探索沙漠与森林艺术节、欧洲电音圣地与亚洲短途音乐节 — 或全网实时搜索任意全球音乐节，一键固定到您的专属列表。',
          )}
        </p>

        {/* Search Input + Live Worldwide Lookup */}
        <form
          className="world-search-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void executeLiveWorldwideSearch(discoveryQuery, true);
          }}
        >
          <div className="world-search-input-wrap">
            <Search size={16} className="world-search-icon" />
            <input
              id="world-festival-search-input"
              type="search"
              value={discoveryQuery}
              onChange={(e) => setDiscoveryQuery(e.target.value)}
              placeholder={tr(
                'Search potential festivals by name, country, stage, or vibe (e.g. Ozora, Glastonbury, Primavera, Waking Life, Dekmantel)...',
                '按名称、国家、舞台或风格搜索全球音乐节（如：Ozora、Glastonbury、Primavera、Clockenflap）…',
              )}
              aria-label={tr('Search potential new world music festivals', '搜索全球音乐节')}
            />
          </div>

          <button
            type="submit"
            id="world-festival-live-search-btn"
            className="btn-primary-sm"
            disabled={liveSearching}
          >
            {liveSearching ? <Loader2 size={15} className="spin-icon" /> : <Globe size={15} />}
            <span>
              {liveSearching
                ? tr('Searching Worldwide...', '全网搜索中…')
                : tr('Search Worldwide Live', '全网实时搜索')}
            </span>
          </button>

          {discoveryQuery && (
            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => {
                setDiscoveryQuery('');
                setLiveResults([]);
                setLiveSearchNote(null);
              }}
            >
              {tr('Clear', '清除')}
            </button>
          )}
        </form>

        {/* Quick Search Chips */}
        <div className="world-quick-chips">
          <span className="world-quick-label">
            <Sparkles size={13} />
            <span>{tr('Try searching:', '热门搜索:')}</span>
          </span>
          {QUICK_SEARCH_SUGGESTIONS.map((term) => (
            <button
              key={term}
              type="button"
              className="world-suggestion-chip"
              onClick={() => {
                setDiscoveryQuery(term);
                void executeLiveWorldwideSearch(term, true);
              }}
            >
              {term}
            </button>
          ))}
        </div>

        {liveSearchNote && (
          <p className="world-live-note" role="status">
            {liveSearchNote}
          </p>
        )}

        {/* Custom Festival Builder Form */}
        {showCustomForm && (
          <form className="world-custom-form" onSubmit={handleCustomFestivalSubmit}>
            <div className="world-fest-form-grid">
              <label className="form-field">
                <span>{tr('Festival Name *', '音乐节名称 *')}</span>
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder={tr('e.g. Waking Life or Garbicz Festival', '例如：Clockenflap 或 Glastonbury')}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>{tr('City / Grounds', '城市 / 场地')}</span>
                <input
                  type="text"
                  maxLength={60}
                  placeholder={tr('e.g. Crato, Alentejo', '例如：香港中环海滨')}
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>{tr('Country', '国家 / 地区')}</span>
                <input
                  type="text"
                  maxLength={48}
                  placeholder={tr('e.g. Portugal', '例如：葡萄牙 / 日本')}
                  value={customCountry}
                  onChange={(e) => setCustomCountry(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>{tr('Region', '大洲 / 区域')}</span>
                <select
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value as WorldFestivalRegion)}
                >
                  {REGION_FILTERS.filter((r) => r !== 'All Regions').map((reg) => (
                    <option key={reg} value={reg}>
                      {genreLabel(reg)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>{tr('Festival Vibe', '音乐节风格')}</span>
                <select
                  value={customVibe}
                  onChange={(e) => setCustomVibe(e.target.value as WorldFestivalVibe)}
                >
                  {VIBE_FILTERS.filter((v) => v !== 'All Vibes').map((vibe) => (
                    <option key={vibe} value={vibe}>
                      {genreLabel(vibe)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>{tr('2027 Dates / Window', '举办日期 / 档期')}</span>
                <input
                  type="text"
                  maxLength={60}
                  placeholder={tr('e.g. Jun 16–21, 2027', '例如：2027年6月16–21日')}
                  value={customDates}
                  onChange={(e) => setCustomDates(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>{tr('Official Website (HTTPS)', '官方网站 (HTTPS)')}</span>
                <input
                  type="url"
                  maxLength={180}
                  placeholder="https://wakinglife.pt/"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                />
              </label>
            </div>

            <div className="world-custom-actions">
              <button type="submit" className="btn-primary-sm">
                <Plus size={14} />
                <span>{tr('Pin Custom Festival to My Page', '添加到我的全球音乐节')}</span>
              </button>
            </div>
          </form>
        )}

        {/* Discovery Filter Pills */}
        <div className="world-filter-toolbar">
          <div className="genre-scroll-row" role="group" aria-label={tr('Filter discovery by vibe', '按风格筛选探索')}>
            {VIBE_FILTERS.map((vibe) => (
              <button
                key={vibe}
                type="button"
                className={`genre-pill ${discoveryVibe === vibe ? 'is-selected' : ''}`}
                onClick={() => setDiscoveryVibe(vibe)}
              >
                {genreLabel(vibe)}
              </button>
            ))}
          </div>

          <div className="genre-scroll-row" role="group" aria-label={tr('Filter discovery by region', '按地区筛选探索')}>
            {REGION_FILTERS.map((reg) => (
              <button
                key={reg}
                type="button"
                className={`genre-pill ${discoveryRegion === reg ? 'is-selected' : ''}`}
                onClick={() => setDiscoveryRegion(reg)}
              >
                {genreLabel(reg)}
              </button>
            ))}
          </div>
        </div>

        {/* Discovery Results Grid */}
        {combinedDiscoveryFestivals.length === 0 ? (
          <div className="empty-state-box">
            <p>
              {isZh ? (
                <>
                  当前筛选下暂无音乐节。点击<strong>全网实时搜索</strong>或<strong>手动添加音乐节</strong>即可收藏任意全球音乐节。
                </>
              ) : (
                <>
                  No potential festivals matched that filter yet. Click{' '}
                  <strong>Search Worldwide Live</strong> or <strong>Add Custom Festival</strong> to
                  pin any boutique gathering.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="world-discovery-grid">
            {combinedDiscoveryFestivals.map((item) => {
              const alreadyAdded =
                myFestivalNameKeys.has(item.id) ||
                myFestivalNameKeys.has(normalizeToken(item.name));
              const safeUrl = sanitizeExternalHttpsUrl(item.officialUrl, item.name);

              return (
                <article
                  key={item.id}
                  className={`world-discovery-card ${alreadyAdded ? 'is-added' : ''}`}
                >
                  <FestivalPhotoBanner festival={item} compact>
                    <div className="world-banner-top-badges">
                      <span className="world-country-pill">{item.countryCode}</span>
                      <span className="world-vibe-pill">{genreLabel(item.vibe)}</span>
                    </div>
                    <div className="world-banner-bottom-caption">
                      <span className="world-dates-chip">
                        <Calendar size={12} />
                        <span>{item.datesLabel}</span>
                      </span>
                    </div>
                  </FestivalPhotoBanner>

                  <div className="world-discovery-body">
                    <div className="world-discovery-header">
                      <h3 className="world-discovery-title">{item.name}</h3>
                      <span className="world-discovery-loc">
                        <MapPin size={12} />
                        <span>
                          {item.city}, {item.country} · {item.passPriceApprox}
                        </span>
                      </span>
                    </div>

                    <p className="world-discovery-desc">{item.description}</p>

                    {item.stagesOrCamps.length > 0 && (
                      <div className="world-stage-chips">
                        {item.stagesOrCamps.slice(0, 4).map((st) => (
                          <span key={st} className="world-stage-chip">
                            {st}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="world-discovery-footer">
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline-sm"
                      >
                        <span>{tr('Official Site', '官网')}</span>
                        <ExternalLink size={13} />
                      </a>

                      <button
                        type="button"
                        disabled={alreadyAdded}
                        className={alreadyAdded ? 'btn-armed-sm' : 'btn-primary-sm'}
                        onClick={() => onAddFestival({ ...item, isCustomAdded: true })}
                      >
                        {alreadyAdded ? <Check size={14} /> : <Plus size={14} />}
                        <span>
                          {alreadyAdded
                            ? tr('On Your Page', '已在列表中')
                            : tr('Add to My Page', '加入我的列表')}
                        </span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
