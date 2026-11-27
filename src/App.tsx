import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Award,
  Bell,
  BellPlus,
  Calendar,
  CalendarDays,
  Check,
  Clock,
  ExternalLink,
  Eye,
  FilePlus2,
  Headphones,
  Hotel,
  LayoutGrid,
  ListMusic,
  MapPin,
  Moon,
  Plane,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Ticket,
  Train,
  WifiOff,
} from 'lucide-react';
import type {
  ApacTourStop,
  CatalogPayload,
  CityId,
  ConcertEvent,
  LeadMinutes,
  MonitoredSinger,
  MusicFestivalDirectoryItem,
  ReminderRule,
  SingerMonitorCheckResult,
  TicketDropWindow,
  TicketStubRecord,
  WorldFestivalItem,
} from './types/gig';
import { FALLBACK_CATALOG } from './data/fallbackCatalog';
import {
  buildConcertDoorsIso,
  buildGoogleCalendarDropUrl,
  buildGoogleCalendarShowUrl,
  computeCountdown,
  describeTicketingPortal,
  downloadIcsEvents,
  formatAudRange,
  formatAuTime24To12,
  formatAuTimestamp,
  formatConcertDate,
  playReminderChime,
  sanitizeExternalHttpsUrl,
} from './utils/formatters';
import {
  computeInterstateTripPlan,
  computeResaleGuard,
} from './utils/auMarketTools';
import { SingerMonitorSection } from './components/SingerMonitorSection';
import { MusicFestivalsSection } from './components/MusicFestivalsSection';
import { StubArchiveSection } from './components/StubArchiveSection';
import { ArtistAvatar, ConcertMediaBanner } from './components/ArtistAvatar';
import { PriceRangeSlider } from './components/PriceRangeSlider';
import { UPLOADED_WATCHLIST_SINGERS } from './data/userSingerList';
import { CORE_WORLD_FESTIVALS } from './data/worldFestivals';
import { VENUE_INSIDER_TIPS } from './data/venueInsiderTips';
import { buildArtistPreviewLinks } from './utils/musicPreviewLinks';
import { IS_STATIC_MODE } from './config/runtimeMode';

const ConcertCalendarView = lazy(() =>
  import('./components/ConcertCalendarView').then((m) => ({ default: m.ConcertCalendarView })),
);

const ReminderDrawer = lazy(() =>
  import('./components/ReminderDrawer').then((m) => ({ default: m.ReminderDrawer })),
);
const SmartImportModal = lazy(() =>
  import('./components/SmartImportModal').then((m) => ({ default: m.SmartImportModal })),
);
const BackupSyncModal = lazy(() =>
  import('./components/BackupSyncModal').then((m) => ({ default: m.BackupSyncModal })),
);
const DedicatedWatchlistPage = lazy(() =>
  import('./components/DedicatedWatchlistPage').then((m) => ({
    default: m.DedicatedWatchlistPage,
  })),
);
const WorldFestivalsPage = lazy(() =>
  import('./components/WorldFestivalsPage').then((m) => ({ default: m.WorldFestivalsPage })),
);
const TrendingMusicPage = lazy(() =>
  import('./components/TrendingMusicPage').then((m) => ({ default: m.TrendingMusicPage })),
);

type SortMode = 'date' | 'price-asc' | 'drops-first' | 'artist-az';

type CityFilter = 'all' | CityId;
type StatusFilter =
  | 'all'
  | 'drops'
  | 'selling-fast'
  | 'on-sale'
  | 'waitlist'
  | 'watched'
  | 'reminded'
  | 'interstate-excl';

const GENRE_FILTERS = [
  'All Genres',
  'Pop',
  'Rock & Alternative',
  'Indie',
  'Hip-Hop & R&B',
  'Electronic',
  'K-Pop & J-Pop',
  'Metal & Punk',
  'Festival',
  'Folk & Soul',
];

const STORAGE_KEYS = {
  theme: 'southern_amp_theme_v1',
  homeCity: 'southern_amp_home_city_mel_v2',
  monitoredSingers: 'southern_amp_monitored_singers_v2',
  userPinnedBatchVersion: 'southern_amp_user_batch_v1',
  reminders: 'southern_amp_reminders_v1',
  customConcerts: 'southern_amp_custom_gigs_v1',
  stubs: 'southern_amp_stubs_v1',
  worldFestivalsExtra: 'oz_amp_world_festivals_saved_v1',
};

const USER_REQUESTED_SINGERS: MonitoredSinger[] = [
  {
    name: 'Fred again..',
    aliases: ['Fred again', 'Fred Gibson'],
    genre: 'Electronic',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/b0/9c/b7/b09cb72c-cca9-5d66-bc9d-a9b5e5f86b22/5054197236389.jpg/300x300bb.jpg',
    radarNote:
      'Touring Asia/India in Dec 2026 with no 2027 AU dates announced yet — famous for 24–48hr surprise Sydney Harbour / Qudos & Rod Laver pop-up drops!',
    notifyOnAnnounce: true,
    addedAtIso: '2026-11-18T05:12:30Z',
    knownConcertIds: [],
  },
  {
    name: 'Daniel Caesar',
    aliases: ['Ashton Simmonds'],
    genre: 'R&B / Soul',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/b6/cd/1a/b6cd1a5b-83af-a1e2-0ad7-ea530fcf2522/859722261219.jpg/300x300bb.jpg',
    radarNote:
      'Nov 5–9, 2026 Sydney (Qudos/Afterpay Arena) & Melbourne (Rod Laver Arena) shows were cancelled last-minute due to health — high-priority watch for 2027 rescheduled makeup dates.',
    notifyOnAnnounce: true,
    addedAtIso: '2026-11-18T05:12:30Z',
    knownConcertIds: [],
  },
  {
    name: 'The Weeknd',
    aliases: ['The Weekend', 'Abel Tesfaye'],
    genre: 'R&B / Pop',
    artworkUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/30/05/1e/30051e57-a63a-3acc-4b30-42568293f5f7/15UMGIM36514.rgb.jpg/300x300bb.jpg',
    radarNote:
      'Wrapped his After Hours Til Dawn global run in Nov 2026 (played Marvel & Accor in late 2024); watching Live Nation AU & Ticketek for his next stadium era.',
    notifyOnAnnounce: true,
    addedAtIso: '2026-11-18T05:12:30Z',
    knownConcertIds: [],
  },
  {
    name: 'Dua Lipa',
    aliases: [],
    genre: 'Dance-Pop',
    artworkUrl:
      'https://cdn-images.dzcdn.net/images/artist/877872aaf75694f11d53c318700ab2b5/500x500-000000-80-0-0.jpg',
    radarNote:
      'Headlined sold-out Melbourne (Rod Laver Arena) & Sydney (Qudos Bank Arena) arena runs — watching Live Nation AU & Ticketek for her next Australian tour dates.',
    notifyOnAnnounce: true,
    addedAtIso: '2026-11-27T02:35:00Z',
    knownConcertIds: [],
  },
];

const REMOVED_LEGACY_DEFAULT_SINGERS = new Set(['radiohead', 'yoasobi', 'spacey jane']);

const DEFAULT_MONITORED_SINGERS: MonitoredSinger[] = [...USER_REQUESTED_SINGERS];

const DEFAULT_STUBS: TicketStubRecord[] = [
  {
    id: 'stub-seed-1',
    concertId: 'spacey-jane-syd-2026',
    artist: 'Spacey Jane',
    tourTitle: 'On the Steps Summer Series',
    city: 'sydney',
    venueName: 'Sydney Opera House Forecourt',
    dateIso: '2026-12-10',
    paidAud: 114.9,
    sectionNote: 'Harbour GA Steps — arrive before 6:30 PM for sunset sightline under the sails.',
    venueRating: 5,
    status: 'secured',
    createdAtIso: '2026-11-18T03:30:00Z',
  },
];

function concertMatchesArtistTerm(concert: ConcertEvent, rawTerm: string): boolean {
  const clean = rawTerm.trim().toLowerCase();
  if (clean.length < 2) return false;
  const acts = [concert.artist, ...concert.supportActs];
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(clean)) {
    return acts.some((a) => a.toLowerCase().includes(clean));
  }
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
  return acts.some((a) => rx.test(a));
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    safeReadJson<'dark' | 'light'>(STORAGE_KEYS.theme, 'dark'),
  );
  const [cityFilter, setCityFilter] = useState<CityFilter>(() => {
    const saved = safeReadJson<string>(STORAGE_KEYS.homeCity, 'melbourne');
    return saved === 'sydney' || saved === 'all' ? saved : 'melbourne';
  });
  const homeCity: CityId = cityFilter === 'sydney' ? 'sydney' : 'melbourne';
  const [catalog, setCatalog] = useState<CatalogPayload>(FALLBACK_CATALOG);
  const [customConcerts, setCustomConcerts] = useState<ConcertEvent[]>(() =>
    safeReadJson<ConcertEvent[]>(STORAGE_KEYS.customConcerts, []),
  );
  const [monitoredSingers, setMonitoredSingers] = useState<MonitoredSinger[]>(() => {
    const chinesePresets = new Set(
      FALLBACK_CATALOG.presetSingers
        .filter((p) => p.category === 'Mandopop & Cantopop' || p.origin === 'JP')
        .map((p) => p.name.toLowerCase()),
    );
    const stripForeignChineseAlias = (list: MonitoredSinger[]) =>
      list.map((s) => {
        const isAllowedHan =
          chinesePresets.has(s.name.toLowerCase()) ||
          /[\u4e00-\u9fff]/.test(s.name);
        return {
          ...s,
          aliases: isAllowedHan
            ? s.aliases
            : s.aliases.filter((al) => !/[\u3400-\u4dbf\u4e00-\u9fff]/.test(al)),
        };
      });

    const existing = stripForeignChineseAlias(
      safeReadJson<MonitoredSinger[]>(
        STORAGE_KEYS.monitoredSingers,
        DEFAULT_MONITORED_SINGERS,
      ),
    );
    const appliedBatch = safeReadJson<string>(STORAGE_KEYS.userPinnedBatchVersion, '');
    if (appliedBatch === 'batch-fred-daniel-weeknd-dualipa-v3') {
      return existing;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.userPinnedBatchVersion,
        JSON.stringify('batch-fred-daniel-weeknd-dualipa-v3'),
      );
    } catch {
      // Ignore storage quota issues
    }
    const requestedNames = new Set(USER_REQUESTED_SINGERS.map((u) => u.name.toLowerCase()));
    const filteredExisting = existing.filter((s) => {
      const low = s.name.toLowerCase();
      return !requestedNames.has(low) && !REMOVED_LEGACY_DEFAULT_SINGERS.has(low);
    });
    return [...USER_REQUESTED_SINGERS, ...filteredExisting];
  });
  const [reminders, setReminders] = useState<ReminderRule[]>(() =>
    safeReadJson<ReminderRule[]>(STORAGE_KEYS.reminders, []),
  );
  const [stubs, setStubs] = useState<TicketStubRecord[]>(() =>
    safeReadJson<TicketStubRecord[]>(STORAGE_KEYS.stubs, DEFAULT_STUBS),
  );
  const [savedWorldFestivals, setSavedWorldFestivals] = useState<WorldFestivalItem[]>(() =>
    safeReadJson<WorldFestivalItem[]>(STORAGE_KEYS.worldFestivalsExtra, []),
  );

  // Live Singer Monitor Check State
  const [monitorResults, setMonitorResults] = useState<Record<string, SingerMonitorCheckResult>>({});
  const [lastMonitorCheckIso, setLastMonitorCheckIso] = useState<string | null>(null);
  const [checkingRadar, setCheckingRadar] = useState(false);

  // Session & CSRF state (kept strictly in memory; never persisted in localStorage)
  const [csrfToken, setCsrfToken] = useState('');
  const [readonlyMode, setReadonlyMode] = useState(IS_STATIC_MODE);
  const [defaultWebhookMasked, setDefaultWebhookMasked] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Filters
  const [venueFilter, setVenueFilter] = useState<string>('all');
  const [genreFilter, setGenreFilter] = useState<string>('All Genres');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortMode>('date');
  const [weekendOnly, setWeekendOnly] = useState<boolean>(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [gigViewMode, setGigViewMode] = useState<'grid' | 'calendar'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );

  // Drawers, Modals & Standalone Page Route
  const [activePage, setActivePage] = useState<
    'guide' | 'watchlist' | 'world-festivals' | 'trending'
  >(() => {
    if (window.location.hash === '#/my-sessions') return 'watchlist';
    if (window.location.hash === '#/world-festivals') return 'world-festivals';
    if (window.location.hash === '#/trending') return 'trending';
    return 'guide';
  });
  const [isReminderDrawerOpen, setIsReminderDrawerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [showVenueTips, setShowVenueTips] = useState(true);
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const [showAllDrops, setShowAllDrops] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const switchPage = useCallback(
    (nextPage: 'guide' | 'watchlist' | 'world-festivals' | 'trending') => {
      setActivePage(nextPage);
      try {
        const nextHash =
          nextPage === 'watchlist'
            ? '#/my-sessions'
            : nextPage === 'world-festivals'
              ? '#/world-festivals'
              : nextPage === 'trending'
                ? '#/trending'
                : '';
        window.history.replaceState(
          null,
          '',
          nextHash || window.location.pathname + window.location.search,
        );
      } catch {
        // Ignore history API restrictions
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [],
  );

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#/my-sessions') {
        setActivePage('watchlist');
      } else if (window.location.hash === '#/world-festivals') {
        setActivePage('world-festivals');
      } else if (window.location.hash === '#/trending') {
        setActivePage('trending');
      } else if (window.location.hash === '#/guide' || window.location.hash === '') {
        setActivePage('guide');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Keep browser tab title synced with the active standalone view
  useEffect(() => {
    const titles: Record<typeof activePage, string> = {
      guide: 'OZ Amp — Melbourne & Sydney Live Concert & Ticket-Drop Guide',
      watchlist: 'OZ Amp — My 275 Singer Sessions & Tour Alerts',
      'world-festivals': 'OZ Amp — Iconic World Music Festivals & Trip Budgets',
      trending: 'OZ Amp — Trending Popular Music & Live Tour Radar',
    };
    document.title = titles[activePage];
  }, [activePage]);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // Minute-granular clock prevents 1-second memo thrashing across 145+ concert cards
  const clockMinute = Math.floor(nowMs / 60_000);

  // Global Escape key dismissal for modals, drawers, and card popovers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsReminderDrawerOpen(false);
        setIsImportModalOpen(false);
        setIsSyncModalOpen(false);
        setActivePopoverId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Dismiss open card "Remind" popover on outside click
  useEffect(() => {
    if (!activePopoverId) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement) || !e.target.closest('.popover-anchor')) {
        setActivePopoverId(null);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [activePopoverId]);

  // Show subtle Back-to-Top floating button once scrolled down
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 520);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Track offline/online transitions for Service Worker offline banner
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => ('Notification' in window ? window.Notification.permission : 'unsupported'));

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 4800);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme));
    } catch {
      // Ignore quota errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.homeCity, JSON.stringify(cityFilter));
    } catch {
      // Ignore
    }
  }, [cityFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.monitoredSingers,
        JSON.stringify(monitoredSingers),
      );
    } catch {
      // Ignore
    }
  }, [monitoredSingers]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(reminders));
    } catch {
      // Ignore
    }
  }, [reminders]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.customConcerts, JSON.stringify(customConcerts));
    } catch {
      // Ignore
    }
  }, [customConcerts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.stubs, JSON.stringify(stubs));
    } catch {
      // Ignore
    }
  }, [stubs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.worldFestivalsExtra,
        JSON.stringify(savedWorldFestivals),
      );
    } catch {
      // Ignore
    }
  }, [savedWorldFestivals]);

  const allConcerts = useMemo(() => {
    const refMs = clockMinute * 60_000;
    const todayAu = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne',
    }).format(new Date(refMs));

    const combined = [...customConcerts, ...catalog.concerts]
      .filter((c) => {
        const allDates = [c.dateIso, ...(c.additionalDates || [])].sort();
        return allDates[allDates.length - 1] >= todayAu;
      })
      .map((c) => {
        if (c.status === 'presale-soon' || c.status === 'presale-live') {
          const hasFutureDrop = c.ticketDrops.some(
            (d) => new Date(d.opensAtIso).getTime() > refMs,
          );
          if (!hasFutureDrop) {
            return { ...c, status: 'on-sale' as const };
          }
        }
        return c;
      });

    combined.sort((a, b) => {
      const dateCmp = a.dateIso.localeCompare(b.dateIso);
      if (dateCmp !== 0) return dateCmp;
      if (a.city === b.city) return 0;
      return a.city === 'melbourne' ? -1 : 1;
    });
    return combined;
  }, [customConcerts, catalog.concerts, clockMinute]);

  // Evaluate monitored singers locally + via BFF `/api/artists/monitor-check` and trigger announcement alerts!
  const evaluateSingerAnnouncements = useCallback(
    (
      singersList: MonitoredSinger[],
      currentConcerts: ConcertEvent[],
      triggerAlertsForNew: boolean,
    ) => {
      const nextMap: Record<string, SingerMonitorCheckResult> = {};
      const newlyAnnouncedArtists: string[] = [];
      let shouldUpdateKnownIds = false;

      const updatedSingers = singersList.map((singer) => {
        const terms = [
          singer.name.toLowerCase(),
          ...singer.aliases.map((a) => a.toLowerCase()),
        ].filter((t) => t.length >= 2);

        const matched = currentConcerts.filter((c) =>
          terms.some((t) => concertMatchesArtistTerm(c, t)),
        );

        const matchedIds = matched.map((c) => c.id);
        const qEnc = encodeURIComponent(singer.name);
        const primaryShowUrl =
          matched[0]?.ticketUrl ||
          `https://marketplace.ticketek.com.au/purchase/searchlist?keyword=${qEnc}`;

        nextMap[singer.name.toLowerCase()] = {
          name: singer.name,
          aliases: singer.aliases,
          status: matched.length > 0 ? 'announced' : 'monitoring',
          matchedConcertIds: matchedIds,
          matchedConcertsSummary: matched.map((m) => ({
            id: m.id,
            city: m.city,
            venueName: m.venueName,
            dateIso: m.dateIso,
            status: m.status,
          })),
          breakingHeadlines: [],
          auLinks: {
            ticketek: primaryShowUrl,
            ticketmaster: `https://www.ticketmaster.com.au/search?q=${qEnc}`,
            frontier: `https://www.livenation.com.au/search?keyword=${qEnc}`,
            livenation: `https://www.livenation.com.au/search?keyword=${qEnc}`,
            tixel: `https://tixel.com/au/discover/tickets?q=${qEnc}`,
          },
        };

        const brandNewIds = matchedIds.filter((id) => !singer.knownConcertIds.includes(id));
        if (brandNewIds.length > 0) {
          shouldUpdateKnownIds = true;
          if (triggerAlertsForNew && singer.notifyOnAnnounce) {
            newlyAnnouncedArtists.push(singer.name);
          }
          return {
            ...singer,
            knownConcertIds: Array.from(new Set([...singer.knownConcertIds, ...brandNewIds])),
          };
        }
        return singer;
      });

      setMonitorResults((prev) => {
        const merged = { ...prev };
        for (const [k, val] of Object.entries(nextMap)) {
          const old = prev[k];
          merged[k] = {
            ...val,
            radarNote: old?.radarNote || val.radarNote,
            breakingHeadlines:
              old?.breakingHeadlines && old.breakingHeadlines.length > 0
                ? old.breakingHeadlines
                : val.breakingHeadlines,
          };
        }
        return merged;
      });
      setLastMonitorCheckIso(new Date().toISOString());

      if (shouldUpdateKnownIds) {
        setMonitoredSingers(updatedSingers);
      }

      if (newlyAnnouncedArtists.length > 0) {
        playReminderChime();
        const msg = `CONCERT ANNOUNCED: ${newlyAnnouncedArtists.join(', ')} now confirmed in Sydney/Melbourne!`;
        if ('Notification' in window && window.Notification.permission === 'granted') {
          new window.Notification('OZ Amp — Singer Tour Announced!', { body: msg });
        }
        showToast(msg);
      }
    },
    [showToast],
  );

  // Run server-backed monitor scan (or instant local catalog scan in static mode)
  const runServerMonitorScan = useCallback(
    async (refreshFeed = false, explicitToken?: string) => {
      const tokenToUse = explicitToken ?? csrfToken;
      setCheckingRadar(true);
      try {
        if (!IS_STATIC_MODE && tokenToUse) {
          const res = await fetch('/api/artists/monitor-check', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': tokenToUse,
            },
            body: JSON.stringify({
              singers: monitoredSingers.map((s) => ({ name: s.name, aliases: s.aliases })),
              refreshFeed,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const mapUpdate: Record<string, SingerMonitorCheckResult> = {};
            for (const item of (data.results || []) as SingerMonitorCheckResult[]) {
              mapUpdate[item.name.toLowerCase()] = item;
            }
            setMonitorResults((prev) => ({ ...prev, ...mapUpdate }));
            setLastMonitorCheckIso(data.checkedAtIso || new Date().toISOString());
            if (refreshFeed) {
              showToast(`Scanned AU radar for ${monitoredSingers.length} favourite singers.`);
            }
          }
        } else if (IS_STATIC_MODE && refreshFeed) {
          showToast(`Scanned OZ Amp catalog for ${monitoredSingers.length} favourite singers.`);
        }
        evaluateSingerAnnouncements(monitoredSingers, allConcerts, true);
      } catch {
        evaluateSingerAnnouncements(monitoredSingers, allConcerts, false);
      } finally {
        setCheckingRadar(false);
      }
    },
    [csrfToken, monitoredSingers, allConcerts, evaluateSingerAnnouncements, showToast],
  );

  // Bootstrap session + catalog on load
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        if (IS_STATIC_MODE) {
          setReadonlyMode(true);
          const catalogRes = await fetch('./data/catalog.json');
          if (!cancelled && catalogRes.ok) {
            const cData = (await catalogRes.json()) as CatalogPayload;
            if (Array.isArray(cData.concerts) && cData.concerts.length > 0) {
              setCatalog(cData);
            }
          }
          return;
        }
        const [sessionRes, catalogRes] = await Promise.all([
          fetch('/api/session'),
          fetch('/api/catalog'),
        ]);
        let tok = '';
        if (!cancelled && sessionRes.ok) {
          const sData = await sessionRes.json();
          tok = String(sData.csrfToken || '');
          setCsrfToken(tok);
          setReadonlyMode(Boolean(sData.readonlyMode));
          setDefaultWebhookMasked(sData.defaultWebhookMasked || null);
        }
        if (!cancelled && catalogRes.ok) {
          const cData = (await catalogRes.json()) as CatalogPayload;
          if (Array.isArray(cData.concerts) && cData.concerts.length > 0) {
            setCatalog(cData);
          }
        }
      } catch {
        // Fallback catalog remains active
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-evaluate singer matches whenever concerts or monitored singers change
  useEffect(() => {
    evaluateSingerAnnouncements(monitoredSingers, allConcerts, true);
  }, [allConcerts.length, monitoredSingers.length]);

  // Automatically reconcile any previously armed reminders in localStorage with verified drop/concert URLs
  useEffect(() => {
    if (reminders.length === 0 || allConcerts.length === 0) return;
    const concertsById = new Map(allConcerts.map((c) => [c.id, c]));
    const festivalsById = new Map(
      (catalog.musicFestivals || FALLBACK_CATALOG.musicFestivals).map((f) => [f.id, f]),
    );
    let changed = false;
    const healed = reminders.map((rule) => {
      const matchedConcert = concertsById.get(rule.concertId);
      if (matchedConcert) {
        const matchedDrop = rule.dropId
          ? matchedConcert.ticketDrops.find((d) => d.id === rule.dropId)
          : undefined;
        const authoritativeUrl = sanitizeExternalHttpsUrl(
          matchedDrop ? matchedDrop.bookingUrl : matchedConcert.ticketUrl,
          matchedConcert.artist,
        );
        const authoritativeLabel = matchedDrop ? matchedDrop.label : rule.targetLabel;
        if (
          rule.ticketUrl !== authoritativeUrl ||
          rule.artist !== matchedConcert.artist ||
          rule.targetLabel !== authoritativeLabel
        ) {
          changed = true;
          return {
            ...rule,
            artist: matchedConcert.artist,
            venueName: matchedConcert.venueName,
            targetLabel: authoritativeLabel,
            ticketUrl: authoritativeUrl,
          };
        }
        return rule;
      }

      const matchedFestival = festivalsById.get(rule.concertId);
      if (matchedFestival) {
        const festUrl = sanitizeExternalHttpsUrl(
          matchedFestival.ticketUrl || matchedFestival.lineupUrl,
          matchedFestival.name,
        );
        if (rule.ticketUrl !== festUrl) {
          changed = true;
          return { ...rule, ticketUrl: festUrl };
        }
        return rule;
      }

      const sanitized = sanitizeExternalHttpsUrl(rule.ticketUrl, rule.artist);
      if (sanitized !== rule.ticketUrl) {
        changed = true;
        return { ...rule, ticketUrl: sanitized };
      }
      return rule;
    });
    if (changed) {
      setReminders(healed);
    }
  }, [allConcerts, catalog.musicFestivals, reminders]);

  // 1-second live countdown clock
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Evaluate armed lead-time reminders
  useEffect(() => {
    if (reminders.length === 0) return;
    let updated = false;
    const nextReminders = reminders.map((rule) => {
      const targetTime = new Date(rule.targetIso).getTime();
      const alertTime = targetTime - rule.leadMinutes * 60 * 1000;
      const diffSinceAlert = nowMs - alertTime;
      if (
        diffSinceAlert >= 0 &&
        diffSinceAlert <= 10 * 60 * 1000 &&
        !rule.firedOffsets.includes(rule.leadMinutes)
      ) {
        updated = true;
        playReminderChime();
        const alertTitle = `${rule.artist} — ${rule.targetLabel}`;
        const alertLoc = rule.regionBadge || rule.city.toUpperCase();
        const alertBody = `Starting in ~${rule.leadMinutes === 1440 ? '24 hours' : `${rule.leadMinutes} mins`} at ${rule.venueName} (${alertLoc}).`;
        if ('Notification' in window && window.Notification.permission === 'granted') {
          new window.Notification(alertTitle, { body: alertBody });
        }
        showToast(`QUEUE ALERT: ${alertTitle}`);
        return {
          ...rule,
          firedOffsets: [...rule.firedOffsets, rule.leadMinutes],
        };
      }
      return rule;
    });
    if (updated) setReminders(nextReminders);
  }, [nowMs, reminders, showToast]);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    const perm = await window.Notification.requestPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      playReminderChime();
      showToast('Browser concert & pre-sale notifications enabled.');
    }
  };

  const handleManualSync = async () => {
    if (readonlyMode || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (res.ok) {
        const refreshed = (await res.json()) as CatalogPayload;
        setCatalog(refreshed);
        showToast(`Synced ${refreshed.concerts.length} Sydney & Melbourne gigs.`);
      } else {
        showToast('Sync skipped or rate-limited.');
      }
    } catch {
      showToast('Unable to reach sync server.');
    } finally {
      setSyncing(false);
    }
  };

  const isArtistFollowed = useCallback(
    (concert: ConcertEvent) => {
      return monitoredSingers.some((watched) => {
        const terms = [watched.name, ...watched.aliases];
        return terms.some((needle) => concertMatchesArtistTerm(concert, needle));
      });
    },
    [monitoredSingers],
  );

  const handleAddOrToggleSinger = (input: {
    name: string;
    aliases?: string[];
    genre?: string;
    artworkUrl?: string;
  }) => {
    const cleanName = input.name.trim();
    if (!cleanName) return;

    const preset = catalog.presetSingers.find(
      (p) =>
        p.name.toLowerCase() === cleanName.toLowerCase() ||
        p.aliases.some((a) => a.toLowerCase() === cleanName.toLowerCase()),
    );
    const canonicalName = preset ? preset.name : cleanName;
    const mergedAliases = Array.from(
      new Set([
        ...(input.aliases || []),
        ...(preset?.aliases || []),
        ...(canonicalName !== cleanName ? [cleanName] : []),
      ]),
    );

    setMonitoredSingers((prev) => {
      const exists = prev.some((s) => s.name.toLowerCase() === canonicalName.toLowerCase());
      if (exists) {
        showToast(`Stopped monitoring ${canonicalName}.`);
        return prev.filter((s) => s.name.toLowerCase() !== canonicalName.toLowerCase());
      }
      // Pre-record currently known concert IDs if already announced, and alert user immediately if already touring!
      const terms = [canonicalName, ...mergedAliases];
      const existingMatches = allConcerts
        .filter((c) => terms.some((t) => concertMatchesArtistTerm(c, t)))
        .map((c) => c.id);

      playReminderChime();
      if (existingMatches.length > 0) {
        showToast(
          `Monitoring ${canonicalName} — ${existingMatches.length} Sydney/Melbourne show(s) already on radar!`,
        );
      } else {
        showToast(
          `Monitoring ${canonicalName} — we will alert you as soon as an AU tour is announced.`,
        );
      }

      return [
        {
          name: canonicalName,
          aliases: mergedAliases,
          genre: input.genre || preset?.genre,
          artworkUrl: input.artworkUrl,
          notifyOnAnnounce: true,
          addedAtIso: new Date().toISOString(),
          knownConcertIds: existingMatches,
        },
        ...prev,
      ];
    });
  };

  const handleBulkAddSingers = (rawText: string) => {
    const tokens = rawText
      .split(/[,，;；/\r\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 60);
    if (tokens.length === 0) return;

    let addedCount = 0;
    setMonitoredSingers((prev) => {
      const next = [...prev];
      for (const tok of tokens) {
        const preset = catalog.presetSingers.find(
          (p) =>
            p.name.toLowerCase() === tok.toLowerCase() ||
            p.aliases.some((a) => a.toLowerCase() === tok.toLowerCase()) ||
            tok.toLowerCase().includes(p.name.toLowerCase()),
        );
        const canonical = preset ? preset.name : tok;
        if (next.some((s) => s.name.toLowerCase() === canonical.toLowerCase())) continue;

        const aliases = Array.from(
          new Set([...(preset?.aliases || []), ...(canonical !== tok ? [tok] : [])]),
        );
        const terms = [canonical, ...aliases];
        const existingMatches = allConcerts
          .filter((c) => terms.some((t) => concertMatchesArtistTerm(c, t)))
          .map((c) => c.id);

        next.unshift({
          name: canonical,
          aliases,
          genre: preset?.genre || 'Monitored Artist',
          notifyOnAnnounce: true,
          addedAtIso: new Date().toISOString(),
          knownConcertIds: existingMatches,
        });
        addedCount += 1;
      }
      return next;
    });

    playReminderChime();
    showToast(
      addedCount > 0
        ? `Added ${addedCount} singer${addedCount === 1 ? '' : 's'} to automatic AU announcement radar.`
        : 'All listed singers are already in your monitored radar.',
    );
  };

  const addOrToggleReminder = (
    concert: ConcertEvent,
    leadMinutes: LeadMinutes,
    drop?: TicketDropWindow,
    customOverride?: {
      ruleSuffix: string;
      targetType: ReminderRule['targetType'];
      targetLabel: string;
      targetIso: string;
      ticketUrl?: string;
    },
  ) => {
    const targetIso = customOverride
      ? customOverride.targetIso
      : drop
        ? drop.opensAtIso
        : buildConcertDoorsIso(concert);
    const targetLabel = customOverride
      ? customOverride.targetLabel
      : drop
        ? drop.label
        : `Show Night Doors (${concert.doorsTimeLocal})`;
    const ruleId = customOverride
      ? `${concert.id}::${customOverride.ruleSuffix}::${leadMinutes}`
      : `${concert.id}::${drop ? drop.id : 'doors'}::${leadMinutes}`;

    setReminders((prev) => {
      const exists = prev.some((r) => r.id === ruleId);
      if (exists) {
        showToast(`Removed reminder for ${concert.artist}.`);
        return prev.filter((r) => r.id !== ruleId);
      }
      playReminderChime();
      showToast(`Armed reminder: ${concert.artist} — ${targetLabel}.`);
      const nextRule: ReminderRule = {
        id: ruleId,
        concertId: concert.id,
        dropId: drop?.id,
        artist: concert.artist,
        venueName: concert.venueName,
        city: concert.city,
        targetType: customOverride
          ? customOverride.targetType
          : drop
            ? drop.kind === 'General On-Sale'
              ? 'onsale'
              : 'presale'
            : 'show-day',
        targetLabel,
        targetIso,
        leadMinutes,
        ticketUrl: customOverride?.ticketUrl || (drop ? drop.bookingUrl : concert.ticketUrl),
        firedOffsets: [],
        createdAtIso: new Date().toISOString(),
      };
      return [...prev, nextRule];
    });
    setActivePopoverId(null);
  };

  const handleImportConcerts = (imported: ConcertEvent[], autoRemind: boolean) => {
    setCustomConcerts((prev) => [...imported, ...prev]);
    if (autoRemind) {
      const newRules: ReminderRule[] = [];
      for (const c of imported) {
        if (c.ticketDrops.length > 0) {
          for (const d of c.ticketDrops) {
            newRules.push({
              id: `${c.id}::${d.id}::15`,
              concertId: c.id,
              dropId: d.id,
              artist: c.artist,
              venueName: c.venueName,
              city: c.city,
              targetType: d.kind === 'General On-Sale' ? 'onsale' : 'presale',
              targetLabel: d.label,
              targetIso: d.opensAtIso,
              leadMinutes: 15,
              ticketUrl: d.bookingUrl,
              firedOffsets: [],
              createdAtIso: new Date().toISOString(),
            });
          }
        } else {
          newRules.push({
            id: `${c.id}::doors::60`,
            concertId: c.id,
            artist: c.artist,
            venueName: c.venueName,
            city: c.city,
            targetType: 'show-day',
            targetLabel: `Show Night Doors (${c.doorsTimeLocal})`,
            targetIso: buildConcertDoorsIso(c),
            leadMinutes: 60,
            ticketUrl: c.ticketUrl,
            firedOffsets: [],
            createdAtIso: new Date().toISOString(),
          });
        }
      }
      setReminders((prev) => [...newRules, ...prev]);
    }
    showToast(
      `Imported ${imported.length} Sydney/Melbourne show${imported.length === 1 ? '' : 's'}${autoRemind ? ' & armed queue alerts' : ''}.`,
    );
  };

  const handleQuickStampStub = (concert: ConcertEvent) => {
    const exists = stubs.some((s) => s.concertId === concert.id);
    if (exists) {
      showToast(`${concert.artist} is already on your Stub Wall.`);
      document.getElementById('stub-wall')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const newStub: TicketStubRecord = {
      id: `stub-${Date.now().toString(36)}`,
      concertId: concert.id,
      artist: concert.artist,
      tourTitle: concert.tourTitle,
      city: concert.city,
      venueName: concert.venueName,
      dateIso: concert.dateIso,
      paidAud: concert.priceMinAud,
      sectionNote: 'General Admission / Reserved Seating — stamped from gig card.',
      venueRating: 5,
      status: 'secured',
      createdAtIso: new Date().toISOString(),
    };
    setStubs((prev) => [newStub, ...prev]);
    playReminderChime();
    showToast(`Stamped ${concert.artist} onto your Ticket-Stub Wall!`);
  };

  const upcomingDrops = useMemo(() => {
    const refMs = clockMinute * 60_000;
    const list: Array<{ concert: ConcertEvent; drop: TicketDropWindow; opensMs: number }> = [];
    for (const c of allConcerts) {
      if (cityFilter !== 'all' && c.city !== cityFilter) continue;
      for (const d of c.ticketDrops) {
        const opensMs = new Date(d.opensAtIso).getTime();
        if (opensMs >= refMs - 12 * 3600 * 1000) {
          list.push({ concert: c, drop: d, opensMs });
        }
      }
    }
    list.sort((a, b) => {
      if (a.opensMs !== b.opensMs) return a.opensMs - b.opensMs;
      if (a.concert.city === b.concert.city) return 0;
      return a.concert.city === 'melbourne' ? -1 : 1;
    });
    return list;
  }, [allConcerts, cityFilter, clockMinute]);

  const availableVenues = useMemo(
    () =>
      [...catalog.venues]
        .filter((v) => cityFilter === 'all' || v.city === cityFilter)
        .sort((a, b) => {
          if (a.city === b.city) return 0;
          return a.city === 'melbourne' ? -1 : 1;
        }),
    [catalog.venues, cityFilter],
  );

  const cityScopedConcerts = useMemo(
    () =>
      cityFilter === 'all' ? allConcerts : allConcerts.filter((c) => c.city === cityFilter),
    [allConcerts, cityFilter],
  );

  const cityScopedTourNews = useMemo(
    () =>
      cityFilter === 'all'
        ? catalog.tourNews
        : catalog.tourNews.filter((item) => item.citiesMentioned.includes(cityFilter)),
    [catalog.tourNews, cityFilter],
  );

  const cityScopedFestivals = useMemo(() => {
    const todayAu = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne',
    }).format(new Date(clockMinute * 60_000));
    return (catalog.musicFestivals || FALLBACK_CATALOG.musicFestivals).filter((f) =>
      f.stops.some(
        (st) => st.dateIso >= todayAu && (cityFilter === 'all' || st.city === cityFilter),
      ),
    );
  }, [catalog.musicFestivals, cityFilter, clockMinute]);

  const jumpToConcertSearch = useCallback(
    (artistName: string) => {
      setSearchQuery(artistName);
      setStatusFilter('all');
      setVenueFilter('all');
      setGenreFilter('All Genres');
      setMonthFilter('all');
      setWeekendOnly(false);
      setPriceRange([0, 500]);
      setGigViewMode('grid');
      if (activePage !== 'guide') {
        switchPage('guide');
      }
      window.setTimeout(() => {
        document.getElementById('gigs')?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    },
    [activePage, switchPage],
  );

  const cityScopedStubs = useMemo(
    () => (cityFilter === 'all' ? stubs : stubs.filter((s) => s.city === cityFilter)),
    [stubs, cityFilter],
  );

  const cityScopedReminders = useMemo(
    () =>
      cityFilter === 'all'
        ? reminders
        : reminders.filter((r) => Boolean(r.regionBadge) || r.city === cityFilter),
    [reminders, cityFilter],
  );

  const availableMonths = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cityScopedConcerts) {
      const key = c.dateIso.slice(0, 7);
      if (!map.has(key)) {
        const d = new Date(`${c.dateIso}T02:00:00Z`);
        const label = new Intl.DateTimeFormat('en-AU', {
          month: 'short',
          year: 'numeric',
          timeZone: 'Australia/Sydney',
        }).format(d);
        map.set(key, label);
      }
    }
    return Array.from(map.entries());
  }, [cityScopedConcerts]);

  const remindedConcertIds = useMemo(
    () => new Set(reminders.map((r) => r.concertId)),
    [reminders],
  );

  const filteredConcerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const refMs = clockMinute * 60_000;
    const list = allConcerts.filter((c) => {
      if (cityFilter !== 'all' && c.city !== cityFilter) return false;
      if (venueFilter !== 'all' && c.venueId !== venueFilter) return false;
      if (genreFilter !== 'All Genres' && !c.genres.includes(genreFilter)) return false;
      if (monthFilter !== 'all' && !c.dateIso.startsWith(monthFilter)) return false;

      if (weekendOnly) {
        const datesToCheck = [c.dateIso, ...(c.additionalDates || [])];
        const hasWeekendNight = datesToCheck.some((iso) => {
          const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
          return day === 5 || day === 6 || day === 0;
        });
        if (!hasWeekendNight) return false;
      }

      if (priceRange[0] > 0 && c.priceMinAud < priceRange[0]) return false;
      if (priceRange[1] < 500 && c.priceMinAud > priceRange[1]) return false;

      if (
        statusFilter === 'drops' &&
        c.ticketDrops.length === 0 &&
        c.status !== 'presale-soon' &&
        c.status !== 'presale-live'
      ) {
        return false;
      }
      if (statusFilter === 'selling-fast' && c.status !== 'selling-fast') return false;
      if (statusFilter === 'on-sale' && c.status !== 'on-sale' && c.status !== 'selling-fast') {
        return false;
      }
      if (statusFilter === 'waitlist' && c.status !== 'waitlist-resale') return false;
      if (statusFilter === 'watched' && !isArtistFollowed(c)) return false;
      if (statusFilter === 'reminded' && !remindedConcertIds.has(c.id)) return false;
      if (statusFilter === 'interstate-excl') {
        const hasOtherCity = allConcerts.some(
          (other) =>
            other.city !== c.city &&
            other.artist.toLowerCase() === c.artist.toLowerCase(),
        );
        if (hasOtherCity) return false;
      }

      if (q) {
        const hay = [
          c.artist,
          c.tourTitle || '',
          c.venueName,
          c.suburb,
          c.promoter,
          c.agency,
          ...c.supportActs,
          ...c.genres,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'price-asc') {
      return [...list].sort((a, b) => a.priceMinAud - b.priceMinAud || a.dateIso.localeCompare(b.dateIso));
    }
    if (sortBy === 'artist-az') {
      return [...list].sort((a, b) => a.artist.localeCompare(b.artist) || a.dateIso.localeCompare(b.dateIso));
    }
    if (sortBy === 'drops-first') {
      const nextDropMs = (ev: ConcertEvent) => {
        const future = ev.ticketDrops
          .map((d) => new Date(d.opensAtIso).getTime())
          .filter((ms) => ms >= refMs - 12 * 3600 * 1000);
        return future.length > 0 ? Math.min(...future) : Number.MAX_SAFE_INTEGER;
      };
      return [...list].sort((a, b) => nextDropMs(a) - nextDropMs(b) || a.dateIso.localeCompare(b.dateIso));
    }
    return list;
  }, [
    allConcerts,
    cityFilter,
    venueFilter,
    genreFilter,
    monthFilter,
    statusFilter,
    sortBy,
    weekendOnly,
    priceRange,
    clockMinute,
    searchQuery,
    isArtistFollowed,
    remindedConcertIds,
  ]);

  const sydneyCount = useMemo(
    () => allConcerts.filter((c) => c.city === 'sydney').length,
    [allConcerts],
  );
  const melbourneCount = useMemo(
    () => allConcerts.filter((c) => c.city === 'melbourne').length,
    [allConcerts],
  );

  const handleToggleApacReminder = (stop: ApacTourStop) => {
    const ruleId = `${stop.id}::apac-trip::1440`;
    setReminders((prev) => {
      const exists = prev.some((r) => r.id === ruleId || r.concertId === stop.id);
      if (exists) {
        showToast(`Removed Asia-Pacific trip alert for ${stop.artist} (${stop.city}).`);
        return prev.filter((r) => r.id !== ruleId && r.concertId !== stop.id);
      }
      playReminderChime();
      showToast(`Armed short-flight gig alert: ${stop.artist} in ${stop.city} (${stop.dateLabel}).`);
      const nextRule: ReminderRule = {
        id: ruleId,
        concertId: stop.id,
        artist: `${stop.artist} (${stop.city})`,
        venueName: `${stop.venueName}, ${stop.city}`,
        city: homeCity,
        regionBadge: stop.countryCode,
        targetType: 'show-day',
        targetLabel: `${stop.tourTitle} (${stop.dateLabel})`,
        targetIso: `${stop.dateIso}T10:00:00+11:00`,
        leadMinutes: 1440,
        ticketUrl: sanitizeExternalHttpsUrl(stop.ticketUrl, stop.artist),
        firedOffsets: [],
        createdAtIso: new Date().toISOString(),
      };
      return [nextRule, ...prev];
    });
  };

  const downloadSingleShowIcs = (concert: ConcertEvent) => {
    const start = new Date(buildConcertDoorsIso(concert));
    const end = new Date(start.getTime() + 3.5 * 3600 * 1000);
    downloadIcsEvents(`${concert.artist}-${concert.city}-${concert.dateIso}.ics`, [
      {
        uid: concert.id,
        summary: `${concert.artist} Live — ${concert.venueName}`,
        location: `${concert.venueName}, ${concert.suburb}`,
        description: `${concert.tourTitle || 'Live in Australia'} | Tickets (${concert.agency}): ${sanitizeExternalHttpsUrl(concert.ticketUrl, concert.artist)}`,
        startDate: start,
        endDate: end,
        alarmMinutes: 60,
      },
    ]);
    showToast(`Downloaded .ics calendar entry for ${concert.artist}.`);
  };

  return (
    <div className="app-shell">
      <div className="paper-grain" aria-hidden="true" />

      {toastMessage && (
        <div className="toast-banner" role="status" aria-live="polite">
          <Bell size={15} />
          <span>{toastMessage}</span>
        </div>
      )}

      {isOffline && (
        <div className="offline-status-banner" role="status">
          <WifiOff size={14} />
          <span>
            Offline Mode — Viewing cached gigs, set times, venue sightlines &amp; your Ticket-Stub
            Wall.
          </span>
        </div>
      )}

      {/* Top Editorial Masthead */}
      <header className="masthead">
        <div className="container masthead-inner">
          <div className="brand-cluster">
            <span className="brand-edition">VIC &amp; NSW LIVE GIG RADAR · AEDT / AEST</span>
            <button
              type="button"
              className="brand-home-btn"
              onClick={() => switchPage('guide')}
            >
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-wordmark">OZ Amp</span>
            </button>
          </div>

          <nav className="section-jump-nav" aria-label="Primary pages">
            <div className="page-mode-switcher" role="tablist" aria-label="Switch page view">
              <button
                type="button"
                id="nav-page-guide-btn"
                role="tab"
                aria-selected={activePage === 'guide'}
                className={`page-mode-btn ${activePage === 'guide' ? 'is-active' : ''}`}
                onClick={() => switchPage('guide')}
              >
                All Gigs ({cityScopedConcerts.length})
              </button>
              <button
                type="button"
                id="nav-page-watchlist-btn"
                role="tab"
                aria-selected={activePage === 'watchlist'}
                className={`page-mode-btn ${activePage === 'watchlist' ? 'is-active' : ''}`}
                onClick={() => switchPage('watchlist')}
              >
                My Singers ({UPLOADED_WATCHLIST_SINGERS.length})
              </button>
              <button
                type="button"
                id="nav-page-world-festivals-btn"
                role="tab"
                aria-selected={activePage === 'world-festivals'}
                className={`page-mode-btn ${activePage === 'world-festivals' ? 'is-active' : ''}`}
                onClick={() => switchPage('world-festivals')}
              >
                World Festivals ({CORE_WORLD_FESTIVALS.length + savedWorldFestivals.length})
              </button>
              <button
                type="button"
                id="nav-page-trending-btn"
                role="tab"
                aria-selected={activePage === 'trending'}
                className={`page-mode-btn ${activePage === 'trending' ? 'is-active' : ''}`}
                onClick={() => switchPage('trending')}
              >
                Trending Music
              </button>
            </div>
          </nav>

          <div className="masthead-actions">
            <label className="home-base-picker" htmlFor="home-city-select">
              <Plane size={13} />
              <span>Home:</span>
              <select
                id="home-city-select"
                value={cityFilter}
                onChange={(e) => {
                  setCityFilter(e.target.value as CityFilter);
                  setVenueFilter('all');
                }}
              >
                <option value="melbourne">Melbourne (VIC)</option>
                <option value="sydney">Sydney (NSW)</option>
                <option value="all">Both Cities</option>
              </select>
            </label>

            <button
              type="button"
              id="open-smart-import-btn"
              className="btn-outline-sm"
              onClick={() => setIsImportModalOpen(true)}
            >
              <FilePlus2 size={15} />
              <span>Paste Tour</span>
            </button>

            <button
              type="button"
              id="open-sync-modal-btn"
              className="btn-outline-sm"
              onClick={() => setIsSyncModalOpen(true)}
              title="Sync profile across laptop & phone or set up background push alerts"
            >
              <Smartphone size={15} />
              <span>Sync / App</span>
            </button>

            <button
              type="button"
              id="open-reminders-btn"
              className="btn-primary-sm"
              onClick={() => setIsReminderDrawerOpen(true)}
            >
              <Bell size={15} />
              <span>Reminders ({cityScopedReminders.length})</span>
            </button>

            <button
              type="button"
              id="toggle-theme-btn"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={
                theme === 'dark' ? 'Switch to Broadsheet Day theme' : 'Switch to Stage Warm theme'
              }
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      {activePage === 'guide' && (
        <nav className="section-subnav-ribbon" aria-label="Jump to guide section">
          <div className="container subnav-inner">
            <a href="#drops" className="subnav-pill">
              Ticket Drops ({upcomingDrops.length})
            </a>
            <a href="#singers-monitor" className="subnav-pill">
              Singer Radar ({monitoredSingers.length})
            </a>
            <a href="#gigs" className="subnav-pill">
              Concerts ({filteredConcerts.length})
            </a>
            <a href="#stub-wall" className="subnav-pill">
              Ticket Stubs ({cityScopedStubs.length})
            </a>
            <a href="#venues-heading" className="subnav-pill">
              Venue Sightlines ({availableVenues.length})
            </a>
            <a href="#music-festivals" className="subnav-pill">
              AU Festivals ({cityScopedFestivals.length})
            </a>
          </div>
        </nav>
      )}

      <main className="container main-content">
        {activePage === 'trending' ? (
          <Suspense fallback={<div className="lazy-page-loader">Loading Trending Popular Music…</div>}>
            <TrendingMusicPage
              concerts={allConcerts}
              musicFestivals={cityScopedFestivals}
              worldFestivals={[...CORE_WORLD_FESTIVALS, ...savedWorldFestivals]}
              monitoredSingers={monitoredSingers}
              cityFilter={cityFilter}
              onToggleMonitorArtist={(artistName, artworkUrl, genre) =>
                handleAddOrToggleSinger({ name: artistName, artworkUrl, genre })
              }
              onJumpToAuConcert={jumpToConcertSearch}
              onJumpToAuFestival={() => {
                switchPage('guide');
                window.setTimeout(() => {
                  document.getElementById('music-festivals')?.scrollIntoView({ behavior: 'smooth' });
                }, 140);
              }}
              onJumpToWorldFestivals={() => switchPage('world-festivals')}
              onBackToMainGuide={() => switchPage('guide')}
              onShowToast={showToast}
            />
          </Suspense>
        ) : activePage === 'world-festivals' ? (
          <Suspense fallback={<div className="lazy-page-loader">Loading World Festivals…</div>}>
            <WorldFestivalsPage
            savedExtraFestivals={savedWorldFestivals}
            onAddFestival={(fest) => {
              setSavedWorldFestivals((prev) => {
                if (prev.some((f) => f.id === fest.id || f.name.toLowerCase() === fest.name.toLowerCase())) {
                  return prev;
                }
                return [...prev, fest];
              });
              playReminderChime();
              showToast(`Added ${fest.name} (${fest.country}) to your World Festivals page!`);
            }}
            onRemoveExtraFestival={(festId) => {
              const target = savedWorldFestivals.find((f) => f.id === festId);
              setSavedWorldFestivals((prev) => prev.filter((f) => f.id !== festId));
              if (target) {
                showToast(`Removed ${target.name} from your World Festivals page.`);
              }
            }}
            onResetExtraFestivals={() => {
              setSavedWorldFestivals([]);
              showToast('Reset World Festivals page to your 6 core festivals.');
            }}
            monitoredSingers={monitoredSingers}
            onToggleMonitorArtist={(artistName) => handleAddOrToggleSinger({ name: artistName })}
            reminders={cityScopedReminders}
            onToggleFestivalReminder={(fest) => {
              const ruleId = `${fest.id}::world-session::60`;
              setReminders((prev) => {
                const exists = prev.some((r) => r.id === ruleId || r.concertId === fest.id);
                if (exists) {
                  showToast(`Removed session reminder for ${fest.name}.`);
                  return prev.filter((r) => r.id !== ruleId && r.concertId !== fest.id);
                }
                playReminderChime();
                showToast(`Armed reminder: ${fest.name} — ${fest.nextSessionLabel}.`);
                const nextRule: ReminderRule = {
                  id: ruleId,
                  concertId: fest.id,
                  artist: fest.name,
                  venueName: `${fest.venueName}, ${fest.city}`,
                  city: homeCity,
                  regionBadge: fest.countryCode,
                  targetType: 'presale',
                  targetLabel: fest.nextSessionLabel,
                  targetIso: fest.nextSessionIso,
                  leadMinutes: 60,
                  ticketUrl: sanitizeExternalHttpsUrl(
                    fest.ticketsUrl || fest.officialUrl,
                    fest.name,
                  ),
                  firedOffsets: [],
                  createdAtIso: new Date().toISOString(),
                };
                return [nextRule, ...prev];
              });
            }}
            onBulkArmFestivalReminders={(newRules) => {
              setReminders((prev) => [...newRules, ...prev]);
              playReminderChime();
              showToast(
                `Armed ${newRules.length} world festival registration & ticket reminder${newRules.length === 1 ? '' : 's'}!`,
              );
            }}
            onToggleApacReminder={handleToggleApacReminder}
            onOpenReminderDrawer={() => setIsReminderDrawerOpen(true)}
            cityFilter={cityFilter}
            onChangeCityFilter={(next) => {
              setCityFilter(next);
              setVenueFilter('all');
            }}
            nowMs={nowMs}
            onBackToMainGuide={() => switchPage('guide')}
            onShowToast={showToast}
          />
          </Suspense>
        ) : activePage === 'watchlist' ? (
          <Suspense fallback={<div className="lazy-page-loader">Loading Your 275 Singer Sessions…</div>}>
            <DedicatedWatchlistPage
            concerts={allConcerts}
            festivals={cityScopedFestivals}
            reminders={cityScopedReminders}
            nowMs={nowMs}
            cityFilter={cityFilter}
            onChangeCityFilter={(next) => {
              setCityFilter(next);
              setVenueFilter('all');
            }}
            onAddOrToggleReminder={addOrToggleReminder}
            onBulkArmReminders={(newRules) => {
              setReminders((prev) => [...newRules, ...prev]);
              playReminderChime();
              showToast(
                `Armed ${newRules.length} session & concert reminder${newRules.length === 1 ? '' : 's'} for your uploaded singer list!`,
              );
            }}
            onToggleApacReminder={handleToggleApacReminder}
            onOpenReminderDrawer={() => setIsReminderDrawerOpen(true)}
            onBackToMainGuide={() => switchPage('guide')}
            onShowToast={showToast}
          />
          </Suspense>
        ) : (
          <>
        {/* Hero Editorial Section */}
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow-kicker">
              Ticketek · Ticketmaster · Frontier · Live Nation · Tixel +10% Legal Cap
            </p>
            <h1 className="hero-headline">
              Every band, singer &amp; ticket drop across Melbourne and Sydney.
            </h1>
            <p className="hero-lede">
              Monitor favourite singers for instant tour-announcement alerts, catch Telstra Plus
              &amp; Frontier pre-sales, compare festival passes against theatre sideshows, and plan
              interstate MEL ↔ SYD gig trips before dynamic hotel prices surge.
            </p>

            <div className="city-tab-bar" role="tablist" aria-label="Filter by Australian city">
              <button
                type="button"
                id="city-tab-all"
                role="tab"
                aria-selected={cityFilter === 'all'}
                className={`city-tab ${cityFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => {
                  setCityFilter('all');
                  setVenueFilter('all');
                }}
              >
                <span>Both Cities</span>
                <span className="tab-count">{allConcerts.length}</span>
              </button>
              <button
                type="button"
                id="city-tab-melbourne"
                role="tab"
                aria-selected={cityFilter === 'melbourne'}
                className={`city-tab ${cityFilter === 'melbourne' ? 'is-active' : ''}`}
                onClick={() => {
                  setCityFilter('melbourne');
                  setVenueFilter('all');
                }}
              >
                <span>Melbourne · VIC</span>
                <span className="tab-count">{melbourneCount}</span>
              </button>
              <button
                type="button"
                id="city-tab-sydney"
                role="tab"
                aria-selected={cityFilter === 'sydney'}
                className={`city-tab ${cityFilter === 'sydney' ? 'is-active' : ''}`}
                onClick={() => {
                  setCityFilter('sydney');
                  setVenueFilter('all');
                }}
              >
                <span>Sydney · NSW</span>
                <span className="tab-count">{sydneyCount}</span>
              </button>
            </div>
          </div>

          <div className="hero-plates">
            <button
              type="button"
              id="hero-plate-melbourne"
              className={`stage-plate ${cityFilter === 'melbourne' ? 'is-selected' : ''}`}
              onClick={() => {
                setCityFilter((prev) => (prev === 'melbourne' ? 'all' : 'melbourne'));
                setVenueFilter('all');
              }}
            >
              <img
                src="./images/melbourne-stage.jpg"
                alt="Live concert beneath the starlit ceiling and arches of Forum Melbourne"
                className="stage-plate-img"
              />
              <div className="stage-plate-caption">
                <span className="plate-tag">MELBOURNE · NAARM</span>
                <strong>Forum, Rod Laver, Marvel, Music Bowl, Corner &amp; Northcote</strong>
              </div>
            </button>

            <button
              type="button"
              id="hero-plate-sydney"
              className={`stage-plate ${cityFilter === 'sydney' ? 'is-selected' : ''}`}
              onClick={() => {
                setCityFilter((prev) => (prev === 'sydney' ? 'all' : 'sydney'));
                setVenueFilter('all');
              }}
            >
              <img
                src="./images/sydney-stage.jpg"
                alt="Live outdoor twilight concert on the Sydney Opera House Forecourt beside Sydney Harbour"
                className="stage-plate-img"
              />
              <div className="stage-plate-caption">
                <span className="plate-tag">SYDNEY · EORA</span>
                <strong>Opera House Forecourt, Accor, Qudos, Hordern &amp; Enmore</strong>
              </div>
            </button>
          </div>
        </section>

        {/* Dedicated Uploaded Singer Sessions & Concert Reminder Page Callout */}
        <section className="dedicated-sessions-banner" aria-label="Dedicated singer sessions hub">
          <div>
            <span className="eyebrow-kicker">
              Personal Roster · {UPLOADED_WATCHLIST_SINGERS.length} Uploaded Singers (A–Z &amp; Chinese Artists)
            </span>
            <h2 className="dedicated-banner-title">
              Dedicated Ticket Sessions &amp; Upcoming Concert Reminders
            </h2>
            <p className="dedicated-banner-desc">
              Open your standalone reminder page for Gracie Abrams, J. Cole, Swae Lee, FKJ, Jordan
              Rakei, Jungle, Anderson .Paak, Major Lazer, Flight Facilities, Roger Sanchez,
              Elderbrook, and all {UPLOADED_WATCHLIST_SINGERS.length} uploaded singers.
            </p>
          </div>
          <button
            type="button"
            id="open-dedicated-sessions-banner-btn"
            className="btn-primary-sm"
            onClick={() => switchPage('watchlist')}
          >
            <BellPlus size={15} />
            <span>Open Dedicated Sessions Page →</span>
          </button>
        </section>

        {/* Live Pre-Sale & General On-Sale Countdown Radar */}
        {upcomingDrops.length > 0 && (
          <section id="drops" className="drop-radar-section" aria-labelledby="drop-radar-heading">
            <div className="section-header-row">
              <div>
                <span className="eyebrow-kicker">Queue Watch · Live Countdown</span>
                <h2 id="drop-radar-heading" className="section-heading">
                  Upcoming Pre-Sales &amp; Ticket Drops ({upcomingDrops.length})
                </h2>
              </div>
              <div className="header-cta-group">
                <span className="sync-caption">
                  Queue tip: Ticketek &amp; Ticketmaster waiting lounges open 15 minutes before the
                  hour.
                </span>
                {upcomingDrops.length > 12 && (
                  <button
                    type="button"
                    id="toggle-all-drops-btn"
                    className="btn-outline-sm"
                    onClick={() => setShowAllDrops((v) => !v)}
                  >
                    <span>
                      {showAllDrops
                        ? 'Show Next 12 Drops'
                        : `Show All ${upcomingDrops.length} Drops`}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="drop-strip">
              {(showAllDrops ? upcomingDrops : upcomingDrops.slice(0, 12)).map(({ concert, drop }) => {
                const cd = computeCountdown(drop.opensAtIso, nowMs);
                const ruleId15 = `${concert.id}::${drop.id}::15`;
                const isArmed = reminders.some((r) => r.id === ruleId15);
                const resolvedDropUrl = sanitizeExternalHttpsUrl(drop.bookingUrl, concert.artist);
                const portalLabel = describeTicketingPortal(resolvedDropUrl);

                return (
                  <article key={`${concert.id}-${drop.id}`} className="drop-card">
                    <div className="drop-card-top">
                      <div className="drop-card-badges">
                        <span className={`city-pill city-pill--${concert.city}`}>
                          {concert.city === 'sydney' ? 'SYD' : 'MEL'}
                        </span>
                        <span className="presale-kind-badge">{drop.kind}</span>
                      </div>
                      <span className={`mono-countdown ${cd.isImminent ? 'is-urgent' : ''}`}>
                        {cd.compact}
                      </span>
                    </div>

                    <div className="drop-artist-row">
                      <ArtistAvatar name={concert.artist} size="md" shape="rounded" />
                      <div className="drop-artist-meta">
                        <h3 className="drop-artist" title={concert.artist}>
                          {concert.artist}
                        </h3>
                        <p className="drop-artist-sub" title={`${concert.venueName} · ${concert.suburb}`}>
                          {concert.venueName} · {concert.suburb}
                        </p>
                      </div>
                    </div>

                    <div className="drop-session-body">
                      <p className="drop-label">{drop.label}</p>
                      <p className="drop-venue">
                        Opens {formatAuTimestamp(drop.opensAtIso, concert.city)}
                      </p>
                      {drop.codeHint && <p className="drop-hint">{drop.codeHint}</p>}
                    </div>

                    <div className="drop-card-actions drop-card-actions--trio">
                      <button
                        type="button"
                        className={`btn-remind-chip ${isArmed ? 'is-armed' : ''}`}
                        onClick={() => addOrToggleReminder(concert, 15, drop)}
                      >
                        {isArmed ? <Check size={13} /> : <BellPlus size={13} />}
                        <span>{isArmed ? 'Armed' : 'T-15m Alert'}</span>
                      </button>

                      <a
                        href={buildGoogleCalendarDropUrl(concert, drop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost-xs"
                        title="Add pre-sale queue block to Google Calendar"
                      >
                        <Calendar size={12} />
                        <span>GCal</span>
                      </a>

                      <a
                        href={resolvedDropUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost-xs"
                        title={`Open ${concert.artist} on ${portalLabel}`}
                      >
                        <span>{portalLabel}</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* DEDICATED FAVOURITE SINGERS MONITOR & GLOBAL SEARCH SECTION */}
        <SingerMonitorSection
          monitoredSingers={monitoredSingers}
          presetSingers={catalog.presetSingers || FALLBACK_CATALOG.presetSingers}
          concerts={cityScopedConcerts}
          cityFilter={cityFilter}
          monitorResults={monitorResults}
          lastCheckedIso={lastMonitorCheckIso}
          checkingRadar={checkingRadar}
          onRunMonitorScan={(refresh) => void runServerMonitorScan(refresh)}
          onAddOrToggleSinger={handleAddOrToggleSinger}
          onBulkAddSingers={handleBulkAddSingers}
          onToggleNotifySinger={(name) =>
            setMonitoredSingers((prev) =>
              prev.map((s) =>
                s.name.toLowerCase() === name.toLowerCase()
                  ? { ...s, notifyOnAnnounce: !s.notifyOnAnnounce }
                  : s,
              ),
            )
          }
          onRemoveSinger={(name) =>
            setMonitoredSingers((prev) =>
              prev.filter((s) => s.name.toLowerCase() !== name.toLowerCase()),
            )
          }
          onJumpToArtistConcerts={jumpToConcertSearch}
        />

        {/* Tour News Wire */}
        {cityScopedTourNews.length > 0 && (
          <section className="news-ticker-bar" aria-label="Australian tour dispatches">
            <span className="ticker-badge">
              <Radio size={13} />
              <span>AU TOUR WIRE</span>
            </span>
            <div className="ticker-items">
              {cityScopedTourNews.slice(0, 4).map((item) => (
                <a
                  key={item.id}
                  href={sanitizeExternalHttpsUrl(item.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ticker-link"
                >
                  <span className="ticker-source">{item.source}:</span> {item.headline}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Filter & Search Controls */}
        <section id="gigs" className="filter-panel" aria-label="Search and filter concerts">
          <div className="filter-top-row">
            <div className="search-field-wrap">
              <Search size={16} className="search-icon" />
              <input
                type="search"
                id="concert-search-input"
                className="search-input"
                placeholder="Search band, singer, support act, festival, suburb, or venue…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              id="venue-filter-select"
              className="filter-select"
              aria-label="Filter by venue"
              value={venueFilter}
              onChange={(e) => setVenueFilter(e.target.value)}
            >
              <option value="all">All Venues ({availableVenues.length})</option>
              {availableVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.city === 'sydney' ? '[SYD] ' : '[MEL] '}
                  {v.name} ({v.suburb})
                </option>
              ))}
            </select>

            <select
              id="month-filter-select"
              className="filter-select"
              aria-label="Filter by month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            >
              <option value="all">All Upcoming Months</option>
              {availableMonths.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <select
              id="status-filter-select"
              className="filter-select"
              aria-label="Filter by ticket status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All Ticket Statuses</option>
              <option value="watched">My Monitored Singers ({monitoredSingers.length})</option>
              <option value="drops">Has Pre-Sale / Upcoming Drop</option>
              <option value="selling-fast">Selling Fast</option>
              <option value="on-sale">On Sale Now</option>
              <option value="waitlist">Waitlist / Resale Only</option>
              <option value="interstate-excl">
                {cityFilter === 'melbourne'
                  ? 'Melbourne Exclusives (No Sydney Show)'
                  : cityFilter === 'sydney'
                    ? 'Sydney Exclusives (No Melbourne Show)'
                    : 'Single-City Exclusives (MEL or SYD Only)'}
              </option>
              <option value="reminded">
                My Armed Reminders ({cityScopedReminders.length})
              </option>
            </select>

            <select
              id="sort-order-select"
              className="filter-select"
              aria-label="Sort concerts"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
            >
              <option value="date">Sort: Soonest Date</option>
              <option value="drops-first">Sort: Next Ticket Drop</option>
              <option value="price-asc">Sort: Lowest Price (AUD)</option>
              <option value="artist-az">Sort: Artist A–Z</option>
            </select>
          </div>

          {/* Draggable Price Range Bar & Weekend Quick Filter */}
          <div className="filter-quick-bar">
            <PriceRangeSlider
              minBound={0}
              maxBound={500}
              step={10}
              value={priceRange}
              onChange={setPriceRange}
            />

            <div className="quick-toggle-cluster">
              <button
                type="button"
                id="weekend-only-filter-btn"
                aria-pressed={weekendOnly}
                className={`weekend-toggle-pill ${weekendOnly ? 'is-active' : ''}`}
                onClick={() => setWeekendOnly((v) => !v)}
              >
                <Calendar size={14} />
                <span>{weekendOnly ? '✓ Fri–Sun Only' : 'Fri–Sun Only'}</span>
              </button>

              {(weekendOnly ||
                priceRange[0] > 0 ||
                priceRange[1] < 500 ||
                venueFilter !== 'all' ||
                genreFilter !== 'All Genres' ||
                statusFilter !== 'all' ||
                monthFilter !== 'all' ||
                searchQuery.trim() !== '') && (
                <button
                  type="button"
                  className="btn-subtle-sm"
                  onClick={() => {
                    setVenueFilter('all');
                    setGenreFilter('All Genres');
                    setStatusFilter('all');
                    setMonthFilter('all');
                    setWeekendOnly(false);
                    setPriceRange([0, 500]);
                    setSearchQuery('');
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="genre-pill-row" role="group" aria-label="Filter by music genre">
            {GENRE_FILTERS.map((g) => (
              <button
                key={g}
                type="button"
                className={`genre-pill ${genreFilter === g ? 'is-active' : ''}`}
                onClick={() => setGenreFilter(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </section>

        {/* Results Meta Bar + Cards / Monthly Calendar View Switcher */}
        <div className="results-meta-bar">
          <p className="results-summary">
            Showing <strong>{filteredConcerts.length}</strong> live concert
            {filteredConcerts.length === 1 ? '' : 's'}
            {cityFilter !== 'all'
              ? ` in ${cityFilter === 'melbourne' ? 'Melbourne (VIC)' : 'Sydney (NSW)'}`
              : ' across Melbourne & Sydney'}
            {weekendOnly ? ' · Fri–Sun' : ''}
            {priceRange[0] > 0 || priceRange[1] < 500
              ? ` · A$${priceRange[0]}–${priceRange[1] >= 500 ? 'A$500+' : `A$${priceRange[1]}`}`
              : ''}
          </p>

          <div className="sync-status-cluster">
            <div className="page-mode-switcher view-mode-switch" role="tablist" aria-label="Concert view layout">
              <button
                type="button"
                id="view-mode-grid-btn"
                role="tab"
                aria-selected={gigViewMode === 'grid'}
                className={`page-mode-btn ${gigViewMode === 'grid' ? 'is-active' : ''}`}
                onClick={() => setGigViewMode('grid')}
              >
                <LayoutGrid size={13} />
                <span>Cards Grid</span>
              </button>
              <button
                type="button"
                id="view-mode-calendar-btn"
                role="tab"
                aria-selected={gigViewMode === 'calendar'}
                className={`page-mode-btn ${gigViewMode === 'calendar' ? 'is-active' : ''}`}
                onClick={() => setGigViewMode('calendar')}
              >
                <CalendarDays size={13} />
                <span>Monthly Calendar</span>
              </button>
            </div>

            <span className="sync-source-label">{catalog.liveSyncSource}</span>
            {!readonlyMode && (
              <button
                type="button"
                id="refresh-catalog-btn"
                className="btn-ghost-xs"
                onClick={() => void handleManualSync()}
                disabled={syncing}
              >
                <RefreshCw size={13} className={syncing ? 'spin-icon' : ''} />
                <span>{syncing ? 'Syncing…' : 'Sync Feed'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Concert Broadsheet Grid OR Interactive Monthly Calendar */}
        {gigViewMode === 'calendar' ? (
          <Suspense fallback={<div className="lazy-page-loader">Loading Monthly Calendar…</div>}>
            <ConcertCalendarView
              concerts={filteredConcerts}
              upcomingDrops={upcomingDrops}
              worldFestivals={[...CORE_WORLD_FESTIVALS, ...savedWorldFestivals]}
              reminders={cityScopedReminders}
              onAddOrToggleReminder={addOrToggleReminder}
              onOpenWorldFestivalsPage={() => switchPage('world-festivals')}
            />
          </Suspense>
        ) : filteredConcerts.length === 0 ? (
          <section className="empty-results-panel">
            <Sparkles size={26} />
            <h2>No matching gigs under current filters</h2>
            <p>
              Try widening your price slider, clearing Fri–Sun Only, switching cities, or adding
              the singer to <strong>Favourite Singers Radar</strong> above so we alert you as soon
              as dates drop.
            </p>
            <button
              type="button"
              id="reset-all-filters-btn"
              className="btn-primary-sm"
              onClick={() => {
                setCityFilter('all');
                setVenueFilter('all');
                setGenreFilter('All Genres');
                setStatusFilter('all');
                setMonthFilter('all');
                setWeekendOnly(false);
                setPriceRange([0, 500]);
                setSearchQuery('');
              }}
            >
              Reset All Filters
            </button>
          </section>
        ) : (
          <section className="gig-grid" aria-label="Upcoming concerts">
            {filteredConcerts.map((concert) => {
              const dateParts = formatConcertDate(concert.dateIso, concert.timeZone);
              const venueMeta = catalog.venues.find((v) => v.id === concert.venueId);
              const watched = isArtistFollowed(concert);
              const hasReminder = remindedConcertIds.has(concert.id);
              const isPopoverOpen = activePopoverId === concert.id;

              const resaleGuard = computeResaleGuard(concert, nowMs);
              const tripPlan = computeInterstateTripPlan(
                homeCity,
                concert,
                allConcerts,
                venueMeta,
              );

              const statusLabel =
                concert.status === 'presale-live'
                  ? 'Pre-Sale Live'
                  : concert.status === 'presale-soon'
                    ? 'Pre-Sale Upcoming'
                    : concert.status === 'selling-fast'
                      ? 'Selling Fast'
                      : concert.status === 'waitlist-resale'
                        ? 'Waitlist · Resale'
                        : 'On Sale';

              return (
                <article
                  key={concert.id}
                  className={`gig-card ${watched ? 'gig-card--watched' : ''}`}
                >
                  <div className="gig-card-header">
                    <div className="gig-badge-group">
                      <span className={`city-pill city-pill--${concert.city}`}>
                        {concert.city === 'sydney' ? 'SYDNEY · NSW' : 'MELBOURNE · VIC'}
                      </span>
                      <span className={`status-pill status-pill--${concert.status}`}>
                        {statusLabel}
                      </span>
                      {tripPlan?.isExclusiveToOtherCity && (
                        <span className="interstate-excl-pill">
                          {concert.city === 'sydney' ? 'SYD Exclusive' : 'MEL/VIC Exclusive'}
                        </span>
                      )}
                      {concert.isCustom && <span className="custom-pill">Imported</span>}
                    </div>

                    <div className="card-corner-tools">
                      <button
                        type="button"
                        className="star-btn"
                        onClick={() => handleQuickStampStub(concert)}
                        title="Stamp ticket onto my Stub Wall"
                        aria-label={`Stamp ${concert.artist} onto Ticket-Stub Wall`}
                      >
                        <Award size={15} />
                      </button>

                      <button
                        type="button"
                        className={`star-btn ${watched ? 'is-starred' : ''}`}
                        onClick={() => handleAddOrToggleSinger({ name: concert.artist })}
                        aria-label={
                          watched
                            ? `Stop monitoring ${concert.artist}`
                            : `Monitor ${concert.artist}`
                        }
                        title={watched ? 'Monitoring singer' : 'Monitor singer for alerts'}
                      >
                        <Star size={16} fill={watched ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>

                  {/* Visual Artist Portrait Banner, Tour & Support Acts */}
                  <ConcertMediaBanner
                    artist={concert.artist}
                    tourTitle={concert.tourTitle}
                    supportActs={concert.supportActs}
                  />

                  {/* Date, Venue, Curfew & Last-Train Details */}
                  <div className="gig-logistics">
                    <div className="logistics-row">
                      <Calendar size={15} className="logistics-icon" />
                      <div>
                        <strong className="logistics-primary">{dateParts.fullLabel}</strong>
                        {concert.additionalDates && concert.additionalDates.length > 0 && (
                          <span className="multi-night-badge">
                            +{concert.additionalDates.length} more night
                            {concert.additionalDates.length === 1 ? '' : 's'}
                          </span>
                        )}
                        <div className="logistics-sub">
                          <Clock size={12} /> Doors{' '}
                          {formatAuTime24To12(
                            concert.doorsTimeLocal,
                            concert.dateIso,
                            concert.timeZone,
                          )}{' '}
                          · Set {concert.setTimeLocal}
                          {venueMeta?.curfewLocal ? ` · Curfew ${venueMeta.curfewLocal}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="logistics-row">
                      <MapPin size={15} className="logistics-icon" />
                      <div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueMeta?.mapsQuery || `${concert.venueName} ${concert.suburb}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="venue-map-link"
                        >
                          <strong>{concert.venueName}</strong> · {concert.suburb}
                        </a>
                        <div className="logistics-sub">
                          <Train size={12} /> {venueMeta?.lastTransitTip || venueMeta?.transitHint}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AU Upgrade #1: Statutory +10% Resale Guard Strip */}
                  <div className="resale-guard-strip">
                    <div className="resale-guard-text">
                      <ShieldCheck size={14} className="resale-icon" />
                      <span>
                        <strong>{resaleGuard.statutoryLawLabel}:</strong> Max fair resale{' '}
                        <code>{resaleGuard.maxLegalMaxAud}</code>
                      </span>
                    </div>
                    <a
                      href={sanitizeExternalHttpsUrl(resaleGuard.tixelUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Tixel Auto-Buy <ExternalLink size={10} />
                    </a>
                  </div>

                  {/* AU Upgrade #3: Interstate Gig-Trip & Hotel-Lock Helper (when outside Home City) */}
                  {tripPlan && tripPlan.isExclusiveToOtherCity && (
                    <div className="interstate-trip-box">
                      <div className="interstate-head">
                        <span>
                          <Plane size={12} /> <strong>{tripPlan.routeLabel}</strong> ·{' '}
                          {tripPlan.flightTimingTip}
                        </span>
                      </div>
                      <div className="interstate-hotel-row">
                        <span>
                          <Hotel size={12} /> Stay: {tripPlan.hotelAreaTip}
                        </span>
                        <button
                          type="button"
                          className="mini-arm-btn"
                          onClick={() =>
                            addOrToggleReminder(concert, 60, undefined, {
                              ruleSuffix: 'hotel-lock',
                              targetType: 'hotel-lock',
                              targetLabel: `Book Free-Cancel Hotel (${concert.city.toUpperCase()})`,
                              targetIso: tripPlan.hotelLockDeadlineIso,
                            })
                          }
                        >
                          +Hotel Reminder
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="gig-editorial-note">{concert.editorialNote}</p>

                  {/* 1-Click Spotify / Apple Music / Setlist.fm Preview Strip */}
                  {(() => {
                    const preview = buildArtistPreviewLinks(concert.artist);
                    return (
                      <div className="music-preview-strip">
                        <a
                          href={preview.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="preview-chip"
                        >
                          <Headphones size={12} />
                          <span>Spotify</span>
                        </a>
                        <a
                          href={preview.appleMusic}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="preview-chip"
                        >
                          <Headphones size={12} />
                          <span>Apple Music</span>
                        </a>
                        <a
                          href={preview.setlistFm}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="preview-chip preview-chip--setlist"
                        >
                          <ListMusic size={12} />
                          <span>Setlist.fm</span>
                        </a>
                      </div>
                    );
                  })()}

                  {/* Inline Pre-Sale Schedule */}
                  {concert.ticketDrops.length > 0 && (
                    <div className="card-drops-box">
                      <span className="card-drops-heading">Pre-Sale &amp; On-Sale Schedule</span>
                      <ul className="card-drops-list">
                        {concert.ticketDrops.map((drop) => {
                          const cd = computeCountdown(drop.opensAtIso, nowMs);
                          const isDropArmed = reminders.some(
                            (r) => r.id === `${concert.id}::${drop.id}::15`,
                          );
                          return (
                            <li key={drop.id} className="card-drop-row">
                              <div>
                                <strong>{drop.kind}:</strong>{' '}
                                {formatAuTimestamp(drop.opensAtIso, concert.city)}{' '}
                                <span className="inline-cd">({cd.compact})</span>
                              </div>
                              <button
                                type="button"
                                className={`mini-arm-btn ${isDropArmed ? 'is-armed' : ''}`}
                                onClick={() => addOrToggleReminder(concert, 15, drop)}
                              >
                                {isDropArmed ? 'Armed' : '+15m Alert'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="gig-card-footer">
                    <div className="price-block">
                      <span className="price-aud">
                        {formatAudRange(concert.priceMinAud, concert.priceMaxAud)}
                      </span>
                      <span className="agency-caption">via {concert.agency}</span>
                    </div>

                    <div className="card-cta-cluster">
                      <div className="popover-anchor">
                        <button
                          type="button"
                          className={`btn-outline-sm ${hasReminder ? 'is-armed-btn' : ''}`}
                          onClick={() =>
                            setActivePopoverId((cur) => (cur === concert.id ? null : concert.id))
                          }
                        >
                          <BellPlus size={14} />
                          <span>{hasReminder ? 'Armed' : 'Remind'}</span>
                        </button>

                        {isPopoverOpen && (
                          <div className="remind-popover" role="menu">
                            <span className="popover-title">Queue &amp; Sniper Alerts</span>
                            {concert.ticketDrops[0] && (
                              <button
                                type="button"
                                className="popover-option"
                                onClick={() =>
                                  addOrToggleReminder(concert, 15, concert.ticketDrops[0])
                                }
                              >
                                T-15m Next Drop ({concert.ticketDrops[0].kind})
                              </button>
                            )}
                            {resaleGuard.productionHoldFuture && (
                              <button
                                type="button"
                                className="popover-option"
                                onClick={() =>
                                  addOrToggleReminder(concert, 15, undefined, {
                                    ruleSuffix: 'prod-hold-48h',
                                    targetType: 'production-hold',
                                    targetLabel: 'T-48h Stage Production-Hold Sniper',
                                    targetIso: resaleGuard.productionHoldIso,
                                  })
                                }
                              >
                                T-48h Production-Hold Sniper (10am)
                              </button>
                            )}
                            <button
                              type="button"
                              className="popover-option"
                              onClick={() => addOrToggleReminder(concert, 60)}
                            >
                              1 hour before Show Doors
                            </button>
                            <button
                              type="button"
                              className="popover-option"
                              onClick={() => addOrToggleReminder(concert, 1440)}
                            >
                              24 hours before Show Day
                            </button>
                            <hr className="popover-divider" />
                            <a
                              href={buildGoogleCalendarShowUrl(concert)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="popover-option"
                              onClick={() => setActivePopoverId(null)}
                            >
                              Add Show to Google Calendar ↗
                            </a>
                            <button
                              type="button"
                              className="popover-option"
                              onClick={() => {
                                downloadSingleShowIcs(concert);
                                setActivePopoverId(null);
                              }}
                            >
                              Download Show .ics File
                            </button>
                          </div>
                        )}
                      </div>

                      {concert.resaleUrl && concert.status === 'waitlist-resale' ? (
                        <a
                          href={sanitizeExternalHttpsUrl(concert.resaleUrl, concert.artist)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary-sm"
                        >
                          <Ticket size={14} />
                          <span>Official Resale</span>
                        </a>
                      ) : (
                        <a
                          href={sanitizeExternalHttpsUrl(concert.ticketUrl, concert.artist)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary-sm"
                        >
                          <Ticket size={14} />
                          <span>{concert.agency}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {/* AU UPGRADE #3: VINTAGE AUSTRALIAN TICKET-STUB ARCHIVE WALL & SIGHTLINE NOTES */}
        <StubArchiveSection
          stubs={stubs}
          concerts={cityScopedConcerts}
          cityFilter={cityFilter}
          onAddStub={(newStub) => {
            setStubs((prev) => [
              {
                ...newStub,
                id: `stub-${Date.now().toString(36)}`,
                createdAtIso: new Date().toISOString(),
              },
              ...prev,
            ]);
            playReminderChime();
            showToast(`Stamped ${newStub.artist} onto your Ticket-Stub Wall.`);
          }}
          onToggleStubStatus={(id) => {
            setStubs((prev) =>
              prev.map((s) =>
                s.id === id
                  ? { ...s, status: s.status === 'attended' ? 'secured' : 'attended' }
                  : s,
              ),
            );
          }}
          onRemoveStub={(id) => setStubs((prev) => prev.filter((s) => s.id !== id))}
        />

        {/* Sydney & Melbourne Venue Directory + Sightline, Restricted-View & Bag/Merch Insider Guide */}
        <section className="venues-directory" aria-labelledby="venues-heading">
          <div className="section-header-row">
            <div>
              <span className="eyebrow-kicker">
                03 · {availableVenues.length} Tracked Stages · Sightlines, Curfews &amp; Bag Rules
              </span>
              <h2 id="venues-heading" className="section-heading">
                {cityFilter === 'melbourne'
                  ? 'Melbourne Venue & Sightline Guide'
                  : cityFilter === 'sydney'
                    ? 'Sydney Venue & Sightline Guide'
                    : 'Melbourne & Sydney Venue & Sightline Guide'}
              </h2>
            </div>

            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => setShowVenueTips((cur) => !cur)}
            >
              <Eye size={14} />
              <span>{showVenueTips ? 'Compact Venue Grid' : 'Show Sightline & Bag Tips'}</span>
            </button>
          </div>
          <div className={`venue-directory-grid ${showVenueTips ? 'is-expanded-guide' : ''}`}>
            {availableVenues.map((v) => {
              const count = allConcerts.filter((c) => c.venueId === v.id).length;
              const isSelected = venueFilter === v.id;
              const insider = VENUE_INSIDER_TIPS[v.id];
              return (
                <article
                  key={v.id}
                  className={`venue-tile venue-guide-card ${isSelected ? 'is-selected' : ''}`}
                >
                  <div className="venue-tile-top">
                    <span className={`city-pill city-pill--${v.city}`}>{v.state}</span>
                    <span className="venue-cap">
                      Cap. {new Intl.NumberFormat('en-AU').format(v.capacity)} · Curfew{' '}
                      {v.curfewLocal || '23:00'}
                    </span>
                  </div>

                  <div className="venue-guide-head">
                    <strong className="venue-tile-name">{v.name}</strong>
                    <span className="venue-tile-suburb">
                      {v.suburb} · {v.transitHint}
                    </span>
                  </div>

                  {showVenueTips && insider && (
                    <div className="venue-insider-list">
                      <div className="venue-insider-row">
                        <Eye size={13} className="insider-icon insider-icon--best" />
                        <span>
                          <strong>Best Sightline:</strong> {insider.bestSectionTip}
                        </span>
                      </div>
                      <div className="venue-insider-row">
                        <AlertTriangle size={13} className="insider-icon insider-icon--warn" />
                        <span>
                          <strong>Watch Out:</strong> {insider.restrictedViewWarning}
                        </span>
                      </div>
                      <div className="venue-insider-row">
                        <ShoppingBag size={13} className="insider-icon insider-icon--merch" />
                        <span>
                          <strong>Bags &amp; Merch:</strong> {insider.cloakAndMerchTip}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="venue-guide-footer">
                    <button
                      type="button"
                      className={isSelected ? 'btn-armed-sm' : 'btn-subtle-sm'}
                      onClick={() => {
                        setVenueFilter((cur) => (cur === v.id ? 'all' : v.id));
                        document.getElementById('gigs')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <span>
                        {isSelected
                          ? `✓ Filtering ${count} Show${count === 1 ? '' : 's'}`
                          : `Filter ${count} Show${count === 1 ? '' : 's'} Here`}
                      </span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* DEDICATED MUSIC FESTIVALS DIRECTORY & FULL LINEUP HUB (BOTTOM SECTION) */}
        <MusicFestivalsSection
          festivals={catalog.musicFestivals || FALLBACK_CATALOG.musicFestivals}
          advisorFestivals={catalog.festivals || FALLBACK_CATALOG.festivals}
          monitoredSingers={monitoredSingers}
          homeCity={homeCity}
          cityFilter={cityFilter}
          onChangeCityFilter={(next) => {
            setCityFilter(next);
            setVenueFilter('all');
          }}
          armedFestivalIds={remindedConcertIds}
          onArmFestivalReminder={(fest: MusicFestivalDirectoryItem) => {
            const matchingStop =
              (cityFilter !== 'all' ? fest.stops.find((st) => st.city === cityFilter) : undefined) ||
              fest.stops[0];
            if (!matchingStop) return;
            const ruleId = `${fest.id}::fest-doors::1440`;
            setReminders((prev) => {
              if (prev.some((r) => r.id === ruleId)) {
                showToast(`Removed festival reminder for ${fest.name}.`);
                return prev.filter((r) => r.id !== ruleId);
              }
              playReminderChime();
              showToast(`Armed festival reminder for ${fest.name} (${matchingStop.dateLabel}).`);
              return [
                {
                  id: ruleId,
                  concertId: fest.id,
                  artist: fest.name,
                  venueName: matchingStop.venueName,
                  city: matchingStop.city,
                  targetType: 'show-day',
                  targetLabel: `Festival Gates & Lineup Alert (${matchingStop.dateLabel})`,
                  targetIso: `${matchingStop.dateIso}T10:00:00+11:00`,
                  leadMinutes: 1440,
                  ticketUrl: fest.lineupUrl,
                  firedOffsets: [],
                  createdAtIso: new Date().toISOString(),
                },
                ...prev,
              ];
            });
          }}
          onToggleMonitorArtist={(artistName) => handleAddOrToggleSinger({ name: artistName })}
        />
          </>
        )}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p>
            <strong>OZ Amp</strong> — Melbourne (Naarm) &amp; Sydney (Eora) Live Music &amp;
            Pre-Sale Reminder Guide. Protected by VIC Major Events Act &amp; NSW Fair Trading{' '}
            <strong>+10% statutory resale caps</strong> via <strong>Ticketek Marketplace</strong>{' '}
            &amp; <strong>Tixel</strong>.
          </p>
        </div>
      </footer>

      {showBackToTop && (
        <button
          type="button"
          className="back-to-top-fab"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll back to top"
        >
          <ArrowUp size={15} />
          <span>Top</span>
        </button>
      )}

      {isReminderDrawerOpen && (
        <Suspense fallback={null}>
          <ReminderDrawer
            isOpen={isReminderDrawerOpen}
            onClose={() => setIsReminderDrawerOpen(false)}
            reminders={cityScopedReminders}
            onRemoveReminder={(id) => setReminders((prev) => prev.filter((r) => r.id !== id))}
            onClearPastReminders={() => {
              setReminders((prev) =>
                prev.filter((r) => new Date(r.targetIso).getTime() > Date.now()),
              );
              showToast('Cleared elapsed ticket drops.');
            }}
            nowMs={nowMs}
            notificationPermission={notificationPermission}
            onRequestNotificationPermission={() => void requestNotificationPermission()}
            onShowToast={showToast}
            csrfToken={csrfToken}
            readonlyMode={readonlyMode}
            defaultWebhookMasked={defaultWebhookMasked}
          />
        </Suspense>
      )}

      {isImportModalOpen && (
        <Suspense fallback={null}>
          <SmartImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            csrfToken={csrfToken}
            onImportConcerts={handleImportConcerts}
          />
        </Suspense>
      )}

      {isSyncModalOpen && (
        <Suspense fallback={null}>
          <BackupSyncModal
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            theme={theme}
            cityFilter={cityFilter}
            reminders={reminders}
            stubs={stubs}
            monitoredSingers={monitoredSingers}
            savedWorldFestivals={savedWorldFestivals}
            customConcerts={customConcerts}
            onRestoreBackup={(backup) => {
              setTheme(backup.theme);
              setCityFilter(backup.cityFilter);
              setReminders(backup.reminders);
              setStubs(backup.stubs);
              if (backup.monitoredSingers.length > 0) {
                setMonitoredSingers(backup.monitoredSingers);
              }
              setSavedWorldFestivals(backup.savedWorldFestivals);
              setCustomConcerts(backup.customConcerts);
              playReminderChime();
              showToast(
                `Restored OZ Amp profile (${backup.reminders.length} reminders, ${backup.stubs.length} stubs)!`,
              );
            }}
            onShowToast={showToast}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
