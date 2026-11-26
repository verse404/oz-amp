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
import { UPLOADED_WATCHLIST_SINGERS } from '../data/userSingerList';
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

  // Build normalized lookup of user's 275 watchlist singers + monitored radar singers
  const watchedArtistSet = useMemo(() => {
    const set = new Set<string>();
    for (const entry of UPLOADED_WATCHLIST_SINGERS) {
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
  }, [monitoredSingers]);

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
      onShowToast('All tracked world festival registration & ticket sessions are already armed.');
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
    onShowToast(`Exported ${events.length} world festival sessions to .ics calendar.`);
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
    onShowToast(`Downloaded .ics calendar file for ${fest.name}.`);
  };

  const handleCustomFestivalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customName.trim();
    if (cleanName.length < 2) {
      onShowToast('Please enter a festival name.');
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
            <span>Back to Melbourne &amp; Sydney Gig Guide</span>
          </button>
          <span className="eyebrow-kicker">
            WORLD PILGRIMAGE EDITION · DEPARTING {departureCityLabel.toUpperCase()}
          </span>
        </div>

        <div className="watchlist-hero-grid">
          <div>
            <h1 id="world-fest-title" className="hero-headline watchlist-headline">
              Iconic Global Music &amp; Arts Festivals.
            </h1>
            <p className="hero-lede">
              Tracking your flagship global festival roster —{' '}
              <strong>Coachella</strong>, <strong>Tomorrowland</strong>,{' '}
              <strong>Burning Man</strong>, <strong>Fuji Rock</strong>,{' '}
              <strong>Wonderfruit</strong>, and <strong>Boom Festival</strong> — with registration
              countdowns in Australian time, watchlist singer crossovers, flight routing from{' '}
              <strong>{departureCityLabel}</strong>, and live discovery for potential new festivals
              worldwide.
            </p>

            <div className="watchlist-cta-row">
              <button
                type="button"
                id="arm-all-world-festivals-btn"
                className="btn-primary-sm"
                onClick={handleBulkArmAllSessions}
              >
                <BellPlus size={15} />
                <span>Arm All Registration Sessions</span>
              </button>

              <a href="#discover-world-festivals" className="btn-outline-sm">
                <Compass size={15} />
                <span>Search Potential New Festivals ↓</span>
              </a>

              <button
                type="button"
                className="btn-outline-sm"
                onClick={handleExportWorldFestivalsIcs}
              >
                <Calendar size={14} />
                <span>Export World Calendar (.ics)</span>
              </button>

              <button
                type="button"
                className="btn-outline-sm"
                onClick={onOpenReminderDrawer}
              >
                <Bell size={14} />
                <span>Armed Queue ({reminders.length})</span>
              </button>
            </div>
          </div>

          <div className="watchlist-stat-grid">
            <div className="watchlist-stat-tile is-accent">
              <span className="watchlist-stat-num">{myFestivals.length}</span>
              <span className="watchlist-stat-label">
                Tracked Festivals ({CORE_WORLD_FESTIVALS.length} Core
                {savedExtraFestivals.length > 0 ? ` + ${savedExtraFestivals.length} Added` : ''})
              </span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">
                {myFestivals.filter((f) => remindedFestivalIds.has(f.id)).length} /{' '}
                {myFestivals.length}
              </span>
              <span className="watchlist-stat-label">Registration Alarms Armed</span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{totalWatchlistCrossovers.length}</span>
              <span className="watchlist-stat-label">
                Your Singer Crossovers
                {totalWatchlistCrossovers.length > 0
                  ? ` (${totalWatchlistCrossovers.slice(0, 2).join(', ')})`
                  : ''}
              </span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{DISCOVERABLE_WORLD_FESTIVALS.length}+</span>
              <span className="watchlist-stat-label">Curated + Live Web Discovery</span>
            </div>
          </div>
        </div>

        {/* Departure Origin Switcher synced with Top Masthead Home Picker */}
        <div className="world-origin-bar">
          <span className="world-origin-label">
            <Plane size={14} />
            <span>Flight Routing Origin:</span>
          </span>
          <div className="city-tab-bar watchlist-city-tabs" role="tablist" aria-label="Flight routing origin">
            <button
              type="button"
              role="tab"
              aria-selected={cityFilter === 'melbourne'}
              className={`city-tab ${cityFilter === 'melbourne' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('melbourne')}
            >
              <span>Melbourne (MEL)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cityFilter === 'sydney'}
              className={`city-tab ${cityFilter === 'sydney' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('sydney')}
            >
              <span>Sydney (SYD)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cityFilter === 'all'}
              className={`city-tab ${cityFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('all')}
            >
              <span>Both Cities (MEL &amp; SYD)</span>
            </button>
          </div>
        </div>
      </section>

      {/* SECTION 01: YOUR TRACKED WORLD FESTIVALS (6 CORE + USER-ADDED) */}
      <section className="feature-section" aria-labelledby="tracked-world-heading">
        <div className="section-header-row">
          <div>
            <span className="eyebrow-kicker">
              01 · YOUR GLOBAL PILGRIMAGE ROSTER · REGISTRATION, BALLOTS &amp; LINEUPS
            </span>
            <h2 id="tracked-world-heading" className="section-heading">
              Your World Festivals ({filteredMyFestivals.length})
            </h2>
          </div>

          {savedExtraFestivals.length > 0 && (
            <button
              type="button"
              className="btn-subtle-sm"
              onClick={onResetExtraFestivals}
            >
              <RotateCcw size={13} />
              <span>Reset to Core 6</span>
            </button>
          )}
        </div>

        <div className="world-filter-toolbar">
          <div className="genre-scroll-row" role="group" aria-label="Filter tracked festivals by region">
            {REGION_FILTERS.map((reg) => (
              <button
                key={reg}
                type="button"
                className={`genre-pill ${trackedRegion === reg ? 'is-selected' : ''}`}
                onClick={() => setTrackedRegion(reg)}
              >
                {reg}
              </button>
            ))}
          </div>

          <div className="genre-scroll-row" role="group" aria-label="Filter tracked festivals by vibe">
            {VIBE_FILTERS.map((vibe) => (
              <button
                key={vibe}
                type="button"
                className={`genre-pill ${trackedVibe === vibe ? 'is-selected' : ''}`}
                onClick={() => setTrackedVibe(vibe)}
              >
                {vibe}
              </button>
            ))}
          </div>
        </div>

        {filteredMyFestivals.length === 0 ? (
          <div className="empty-state-box">
            <p>No tracked festivals match that region/vibe combination.</p>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => {
                setTrackedRegion('All Regions');
                setTrackedVibe('All Vibes');
              }}
            >
              Show All {myFestivals.length} Tracked Festivals
            </button>
          </div>
        ) : (
          <div className="world-festivals-grid">
            {filteredMyFestivals.map((fest) => {
              const isArmed = remindedFestivalIds.has(fest.id);
              const countdown = computeCountdown(fest.nextSessionIso, nowMs);
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
                        <span className="world-vibe-pill">{fest.vibe}</span>
                      </div>
                      <span className={`world-status-pill world-status-pill--${fest.status}`}>
                        {fest.statusLabel}
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
                                ? `Your Singer: ${crossoverActs[0]}`
                                : `${crossoverActs.length} Watchlist Singers`}
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
                          <span className="city-pill city-pill--melbourne">MEL ✈</span>
                          <span>{fest.melbourneFlightTip}</span>
                        </div>
                      )}
                      {(cityFilter === 'sydney' || cityFilter === 'all') && (
                        <div className="world-flight-line">
                          <span className="city-pill city-pill--sydney">SYD ✈</span>
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
                              <span>ESTIMATED ALL-IN TRIP BUDGET (AUD)</span>
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
                            ANNOUNCED LINEUP HIGHLIGHTS (CLICK TO TOGGLE RADAR)
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
                                      ? `${act} is in your active radar (click to toggle)`
                                      : `Add ${act} to your OZ Amp tour radar`
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
                                  <span>Headliner Spotify</span>
                                </a>
                                <a
                                  href={leadPreview.setlistFm}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="preview-chip preview-chip--setlist"
                                >
                                  <ListMusic size={12} />
                                  <span>Headliner Setlist.fm</span>
                                </a>
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}

                      {fest.stagesOrCamps.length > 0 && (
                        <div className="world-tier-block">
                          <span className="lineup-tier-label">
                            ICONIC STAGES, REALMS &amp; SOUND CAMPS
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
                          <span>NEXT KEY SESSION ({auDisplayCity === 'sydney' ? 'SYD' : 'MEL'} TIME)</span>
                        </span>
                        <strong className="world-session-title">{fest.nextSessionLabel}</strong>
                        <span className="world-session-timestamp">
                          {formatAuTimestamp(fest.nextSessionIso, auDisplayCity)}
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
                          <span>{isArmed ? 'Session Armed' : 'Remind Session'}</span>
                        </button>

                        <a
                          href={buildGoogleCalendarWorldFestivalUrl(fest, 'session')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-subtle-sm"
                          title="Add registration/ticket session to Google Calendar"
                        >
                          <Calendar size={13} />
                          <span>GCal</span>
                        </a>

                        <button
                          type="button"
                          className="btn-subtle-sm"
                          onClick={() => handleDownloadSingleFestivalIcs(fest)}
                          title="Download festival dates .ics file"
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
                            title={`Remove ${fest.name} from your tracked page`}
                          >
                            <Trash2 size={13} />
                            <span>Remove</span>
                          </button>
                        )}

                        <a
                          href={safeOfficialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline-sm"
                        >
                          <span>Official Site</span>
                          <ExternalLink size={13} />
                        </a>

                        <a
                          href={safeTicketsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary-sm"
                        >
                          <Ticket size={14} />
                          <span>Passes</span>
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
              03 · GLOBAL FESTIVAL RADAR · CURATED CATALOG + LIVE WORLDWIDE SEARCH
            </span>
            <h2 id="discover-world-heading" className="section-heading">
              Search &amp; Add Potential New Festivals
            </h2>
          </div>

          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => setShowCustomForm((open) => !open)}
          >
            <Plus size={14} />
            <span>{showCustomForm ? 'Close Custom Builder' : 'Add Custom Festival'}</span>
          </button>
        </div>

        <p className="section-subcopy">
          Explore transformational desert &amp; forest gatherings, European techno shrines, and
          short-flight Asian festivals — or search live across worldwide music festivals and pin any
          discovery straight onto your page above.
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
              placeholder="Search potential festivals by name, country, stage, or vibe (e.g. Ozora, Glastonbury, Primavera, Waking Life, Dekmantel)..."
              aria-label="Search potential new world music festivals"
            />
          </div>

          <button
            type="submit"
            id="world-festival-live-search-btn"
            className="btn-primary-sm"
            disabled={liveSearching}
          >
            {liveSearching ? <Loader2 size={15} className="spin-icon" /> : <Globe size={15} />}
            <span>{liveSearching ? 'Searching Worldwide...' : 'Search Worldwide Live'}</span>
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
              Clear
            </button>
          )}
        </form>

        {/* Quick Search Chips */}
        <div className="world-quick-chips">
          <span className="world-quick-label">
            <Sparkles size={13} />
            <span>Try searching:</span>
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
            <div className="stub-form-grid">
              <label className="form-field">
                <span>Festival Name *</span>
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder="e.g. Waking Life or Garbicz Festival"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>City / Grounds</span>
                <input
                  type="text"
                  maxLength={60}
                  placeholder="e.g. Crato, Alentejo"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Country</span>
                <input
                  type="text"
                  maxLength={48}
                  placeholder="e.g. Portugal"
                  value={customCountry}
                  onChange={(e) => setCustomCountry(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Region</span>
                <select
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value as WorldFestivalRegion)}
                >
                  {REGION_FILTERS.filter((r) => r !== 'All Regions').map((reg) => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Festival Vibe</span>
                <select
                  value={customVibe}
                  onChange={(e) => setCustomVibe(e.target.value as WorldFestivalVibe)}
                >
                  {VIBE_FILTERS.filter((v) => v !== 'All Vibes').map((vibe) => (
                    <option key={vibe} value={vibe}>
                      {vibe}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>2027 Dates / Window</span>
                <input
                  type="text"
                  maxLength={60}
                  placeholder="e.g. Jun 16–21, 2027"
                  value={customDates}
                  onChange={(e) => setCustomDates(e.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Official Website (HTTPS)</span>
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
                <span>Pin Custom Festival to My Page</span>
              </button>
            </div>
          </form>
        )}

        {/* Discovery Filter Pills */}
        <div className="world-filter-toolbar">
          <div className="genre-scroll-row" role="group" aria-label="Filter discovery by vibe">
            {VIBE_FILTERS.map((vibe) => (
              <button
                key={vibe}
                type="button"
                className={`genre-pill ${discoveryVibe === vibe ? 'is-selected' : ''}`}
                onClick={() => setDiscoveryVibe(vibe)}
              >
                {vibe}
              </button>
            ))}
          </div>

          <div className="genre-scroll-row" role="group" aria-label="Filter discovery by region">
            {REGION_FILTERS.map((reg) => (
              <button
                key={reg}
                type="button"
                className={`genre-pill ${discoveryRegion === reg ? 'is-selected' : ''}`}
                onClick={() => setDiscoveryRegion(reg)}
              >
                {reg}
              </button>
            ))}
          </div>
        </div>

        {/* Discovery Results Grid */}
        {combinedDiscoveryFestivals.length === 0 ? (
          <div className="empty-state-box">
            <p>
              No potential festivals matched that filter yet. Click{' '}
              <strong>Search Worldwide Live</strong> or <strong>Add Custom Festival</strong> to pin
              any boutique gathering.
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
                      <span className="world-vibe-pill">{item.vibe}</span>
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
                        <span>Official Site</span>
                        <ExternalLink size={13} />
                      </a>

                      <button
                        type="button"
                        disabled={alreadyAdded}
                        className={alreadyAdded ? 'btn-armed-sm' : 'btn-primary-sm'}
                        onClick={() => onAddFestival({ ...item, isCustomAdded: true })}
                      >
                        {alreadyAdded ? <Check size={14} /> : <Plus size={14} />}
                        <span>{alreadyAdded ? 'On Your Page' : 'Add to My Page'}</span>
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
