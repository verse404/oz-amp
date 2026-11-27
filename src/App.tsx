import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
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
  UserCheck,
  UserCircle,
  WifiOff,
} from 'lucide-react';
import type {
  ApacTourStop,
  AuthUser,
  CatalogPayload,
  CityId,
  ConcertEvent,
  FirebasePublicConfig,
  LeadMinutes,
  MonitoredSinger,
  MusicFestivalDirectoryItem,
  ReminderRule,
  SavedAccountProfile,
  SingerMonitorCheckResult,
  TicketDropWindow,
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
import { ArtistAvatar, ConcertMediaBanner } from './components/ArtistAvatar';
import { PriceRangeSlider } from './components/PriceRangeSlider';
import { UPLOADED_WATCHLIST_SINGERS, type WatchlistSingerEntry } from './data/userSingerList';
import { CORE_WORLD_FESTIVALS } from './data/worldFestivals';
import { VENUE_INSIDER_TIPS } from './data/venueInsiderTips';
import { buildArtistPreviewLinks } from './utils/musicPreviewLinks';
import { IS_STATIC_MODE } from './config/runtimeMode';
import { useLocale } from './i18n/LocaleContext';

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
const AccountAuthModal = lazy(() =>
  import('./components/AccountAuthModal').then((m) => ({ default: m.AccountAuthModal })),
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
  worldFestivalsExtra: 'oz_amp_world_festivals_saved_v1',
  dedicatedCustomSingers: 'southern_amp_dedicated_custom_singers_v1',
  dedicatedMutedIds: 'southern_amp_dedicated_muted_ids_v1',
  dedicatedRemovedIds: 'southern_amp_dedicated_removed_ids_v1',
};

const REMOVED_WATCHLIST_PREFIX = '__removed__:';

function splitPackedDedicatedMutedIds(rawList: unknown): {
  mutedIds: string[];
  removedIds: string[];
} {
  if (!Array.isArray(rawList)) return { mutedIds: [], removedIds: [] };
  const mutedIds: string[] = [];
  const removedIds: string[] = [];
  for (const item of rawList) {
    const str = String(item || '').trim();
    if (!str) continue;
    if (str.startsWith(REMOVED_WATCHLIST_PREFIX)) {
      const bare = str.slice(REMOVED_WATCHLIST_PREFIX.length);
      if (bare) removedIds.push(bare);
    } else {
      mutedIds.push(str);
    }
  }
  return {
    mutedIds: Array.from(new Set(mutedIds)),
    removedIds: Array.from(new Set(removedIds)),
  };
}

function serializeProfileForCompare(profile: SavedAccountProfile): string {
  const { mutedIds, removedIds } = splitPackedDedicatedMutedIds(profile.dedicatedMutedIds);
  return JSON.stringify({
    theme: profile.theme === 'light' ? 'light' : 'dark',
    cityFilter:
      profile.cityFilter === 'sydney' || profile.cityFilter === 'all'
        ? profile.cityFilter
        : 'melbourne',
    monitoredSingers: Array.isArray(profile.monitoredSingers) ? profile.monitoredSingers : [],
    reminders: Array.isArray(profile.reminders) ? profile.reminders : [],
    savedWorldFestivals: Array.isArray(profile.savedWorldFestivals)
      ? profile.savedWorldFestivals
      : [],
    customConcerts: Array.isArray(profile.customConcerts) ? profile.customConcerts : [],
    dedicatedCustomSingers: Array.isArray(profile.dedicatedCustomSingers)
      ? profile.dedicatedCustomSingers
      : [],
    dedicatedMutedIds: mutedIds,
    dedicatedRemovedIds: removedIds,
  });
}

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

function readBuildTimeFirebaseConfig(): FirebasePublicConfig | null {
  const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
  const authDomain = String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  const projectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const appId = String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
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
  const { locale, intlLocale, isZh, toggleLocale, tr, cityLabel, genreLabel, dropKindLabel, statusLabel: localizeStatus } = useLocale();
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
  const [savedWorldFestivals, setSavedWorldFestivals] = useState<WorldFestivalItem[]>(() =>
    safeReadJson<WorldFestivalItem[]>(STORAGE_KEYS.worldFestivalsExtra, []),
  );
  const [dedicatedCustomSingers, setDedicatedCustomSingers] = useState<WatchlistSingerEntry[]>(() =>
    safeReadJson<WatchlistSingerEntry[]>(STORAGE_KEYS.dedicatedCustomSingers, []),
  );
  const [dedicatedMutedIds, setDedicatedMutedIds] = useState<string[]>(() => {
    const raw = safeReadJson<string[]>(STORAGE_KEYS.dedicatedMutedIds, []);
    return splitPackedDedicatedMutedIds(raw).mutedIds;
  });
  const [dedicatedRemovedIds, setDedicatedRemovedIds] = useState<string[]>(() => {
    const explicit = safeReadJson<string[]>(STORAGE_KEYS.dedicatedRemovedIds, []);
    const legacyPacked = splitPackedDedicatedMutedIds(
      safeReadJson<string[]>(STORAGE_KEYS.dedicatedMutedIds, []),
    ).removedIds;
    return Array.from(new Set([...explicit, ...legacyPacked]));
  });

  const activeWatchlistSingers = useMemo(() => {
    const removedSet = new Set(dedicatedRemovedIds);
    const seen = new Set<string>();
    const combined: WatchlistSingerEntry[] = [];
    for (const s of dedicatedCustomSingers) {
      if (!s?.displayName) continue;
      const key = s.displayName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(s);
      }
    }
    for (const s of UPLOADED_WATCHLIST_SINGERS) {
      if (removedSet.has(s.id)) continue;
      const key = s.displayName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(s);
      }
    }
    return combined;
  }, [dedicatedCustomSingers, dedicatedRemovedIds]);

  const activeWatchlistCount = activeWatchlistSingers.length;

  // Email / Firebase Account & Automatic Cloud Profile Sync State
  const [firebaseConfig, setFirebaseConfig] = useState<FirebasePublicConfig | null>(() =>
    readBuildTimeFirebaseConfig(),
  );
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [cloudAccountsPersistent, setCloudAccountsPersistent] = useState<boolean>(() =>
    Boolean(readBuildTimeFirebaseConfig()),
  );
  const [accountSyncState, setAccountSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastAccountSavedIso, setLastAccountSavedIso] = useState<string | null>(null);
  const lastSyncedProfileHashRef = useRef<string | null>(null);

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
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
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

  // Keep browser tab title synced with the active standalone view and language
  useEffect(() => {
    const titles: Record<typeof activePage, string> = isZh
      ? {
          guide: 'OZ Amp — 墨尔本 & 悉尼演唱会与开票抢票日历',
          watchlist: `OZ Amp — 我的 ${activeWatchlistCount} 位关注歌手与巡演提醒`,
          'world-festivals': 'OZ Amp — 全球标志性音乐节与出行预算指南',
          trending: 'OZ Amp — 全球热门音乐榜与巡演雷达',
        }
      : {
          guide: 'OZ Amp — Melbourne & Sydney Live Concert & Ticket-Drop Guide',
          watchlist: `OZ Amp — My ${activeWatchlistCount} Singer Sessions & Tour Alerts`,
          'world-festivals': 'OZ Amp — Iconic World Music Festivals & Trip Budgets',
          trending: 'OZ Amp — Trending Popular Music & Live Tour Radar',
        };
    document.title = titles[activePage];
  }, [activePage, activeWatchlistCount, isZh]);

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
        setIsAuthModalOpen(false);
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
      window.localStorage.setItem(
        STORAGE_KEYS.worldFestivalsExtra,
        JSON.stringify(savedWorldFestivals),
      );
    } catch {
      // Ignore
    }
  }, [savedWorldFestivals]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.dedicatedCustomSingers,
        JSON.stringify(dedicatedCustomSingers),
      );
    } catch {
      // Ignore
    }
  }, [dedicatedCustomSingers]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.dedicatedMutedIds,
        JSON.stringify(dedicatedMutedIds),
      );
    } catch {
      // Ignore
    }
  }, [dedicatedMutedIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.dedicatedRemovedIds,
        JSON.stringify(dedicatedRemovedIds),
      );
    } catch {
      // Ignore
    }
  }, [dedicatedRemovedIds]);

  const buildCurrentAccountProfile = useCallback((): SavedAccountProfile => ({
    schemaVersion: 2,
    theme,
    cityFilter,
    monitoredSingers,
    reminders,
    savedWorldFestivals,
    customConcerts,
    dedicatedCustomSingers,
    dedicatedMutedIds: [
      ...dedicatedMutedIds,
      ...dedicatedRemovedIds.map((id) => `${REMOVED_WATCHLIST_PREFIX}${id}`),
    ],
  }), [
    theme,
    cityFilter,
    monitoredSingers,
    reminders,
    savedWorldFestivals,
    customConcerts,
    dedicatedCustomSingers,
    dedicatedMutedIds,
    dedicatedRemovedIds,
  ]);

  const applySavedAccountProfile = useCallback((profile: SavedAccountProfile) => {
    const nextTheme: 'dark' | 'light' = profile.theme === 'light' ? 'light' : 'dark';
    const nextCityFilter: CityFilter =
      profile.cityFilter === 'sydney' || profile.cityFilter === 'all'
        ? profile.cityFilter
        : 'melbourne';
    const nextMonitored = Array.isArray(profile.monitoredSingers)
      ? profile.monitoredSingers
      : [];
    const nextReminders = Array.isArray(profile.reminders) ? profile.reminders : [];
    const nextWorldFestivals = Array.isArray(profile.savedWorldFestivals)
      ? profile.savedWorldFestivals
      : [];
    const nextCustomConcerts = Array.isArray(profile.customConcerts)
      ? profile.customConcerts
      : [];
    const nextDedicatedCustom = Array.isArray(profile.dedicatedCustomSingers)
      ? (profile.dedicatedCustomSingers as WatchlistSingerEntry[])
      : [];
    const { mutedIds, removedIds } = splitPackedDedicatedMutedIds(profile.dedicatedMutedIds);

    lastSyncedProfileHashRef.current = serializeProfileForCompare({
      schemaVersion: 2,
      theme: nextTheme,
      cityFilter: nextCityFilter,
      monitoredSingers: nextMonitored,
      reminders: nextReminders,
      savedWorldFestivals: nextWorldFestivals,
      customConcerts: nextCustomConcerts,
      dedicatedCustomSingers: nextDedicatedCustom,
      dedicatedMutedIds: [
        ...mutedIds,
        ...removedIds.map((id) => `${REMOVED_WATCHLIST_PREFIX}${id}`),
      ],
    });

    setTheme(nextTheme);
    setCityFilter(nextCityFilter);
    if (Array.isArray(profile.monitoredSingers)) {
      setMonitoredSingers(nextMonitored);
    }
    if (Array.isArray(profile.reminders)) {
      setReminders(nextReminders);
    }
    if (Array.isArray(profile.savedWorldFestivals)) {
      setSavedWorldFestivals(nextWorldFestivals);
    }
    if (Array.isArray(profile.customConcerts)) {
      setCustomConcerts(nextCustomConcerts);
    }
    if (Array.isArray(profile.dedicatedCustomSingers)) {
      setDedicatedCustomSingers(nextDedicatedCustom);
    }
    if (Array.isArray(profile.dedicatedMutedIds)) {
      setDedicatedMutedIds(mutedIds);
      setDedicatedRemovedIds(removedIds);
    }
    if (profile.updatedAtIso) {
      setLastAccountSavedIso(profile.updatedAtIso);
    }
    setAccountSyncState('saved');
  }, []);

  const persistProfileToAccount = useCallback(
    async (manual = false) => {
      if (!authUser) return;
      const snapshot = buildCurrentAccountProfile();
      const snapshotHash = serializeProfileForCompare(snapshot);
      setAccountSyncState('saving');
      try {
        if (firebaseConfig && authUser.provider === 'firebase') {
          const fb = await import('./services/firebaseClient');
          const updatedAtIso = await fb.firebaseSaveProfile(
            firebaseConfig,
            authUser.id,
            snapshot,
          );
          lastSyncedProfileHashRef.current = snapshotHash;
          setLastAccountSavedIso(updatedAtIso);
          setAccountSyncState('saved');
          if (manual) {
            showToast(
              tr(
                'Saved all your choices to Firebase Cloud Firestore.',
                '已将您的所有选择保存至 Firebase 云端。',
              ),
            );
          }
          return;
        }
        if (IS_STATIC_MODE || !csrfToken) {
          setAccountSyncState('idle');
          return;
        }
        const res = await fetch('/api/account/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify({ profile: snapshot }),
        });
        if (res.ok) {
          const data = await res.json();
          lastSyncedProfileHashRef.current = snapshotHash;
          setLastAccountSavedIso(data.updatedAtIso || new Date().toISOString());
          setAccountSyncState('saved');
          if (manual) {
            showToast(
              tr(
                'Saved all your choices to your OZ Amp account.',
                '已将您的所有选择保存至 OZ Amp 账号。',
              ),
            );
          }
        } else {
          setAccountSyncState('error');
          if (manual) {
            showToast(
              tr(
                'Could not save to account right now — please retry.',
                '暂时无法保存到账号，请重试。',
              ),
            );
          }
        }
      } catch {
        setAccountSyncState('error');
        if (manual) {
          showToast(
            tr('Network error while saving choices.', '保存设置时发生网络错误。'),
          );
        }
      }
    },
    [authUser, firebaseConfig, csrfToken, buildCurrentAccountProfile, showToast, tr],
  );

  // Subscribe to Firebase Auth state whenever Firebase config is active
  useEffect(() => {
    if (!firebaseConfig) return;
    let active = true;
    let unsub: (() => void) | null = null;
    void import('./services/firebaseClient').then((fb) => {
      if (!active) return;
      unsub = fb.subscribeFirebaseAuth(firebaseConfig, (fbUser, fbProfile) => {
        if (!active) return;
        setAuthUser(fbUser);
        if (fbUser && fbProfile) {
          applySavedAccountProfile(fbProfile);
        }
      });
    });
    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [firebaseConfig, applySavedAccountProfile]);

  // Auto-save choices to the signed-in user's account whenever preferences change
  useEffect(() => {
    if (!authUser) return;
    const canSaveFirebase = Boolean(firebaseConfig && authUser.provider === 'firebase');
    const canSaveBff = Boolean(!IS_STATIC_MODE && csrfToken && authUser.provider !== 'firebase');
    if (!canSaveFirebase && !canSaveBff) return;
    const currentHash = serializeProfileForCompare(buildCurrentAccountProfile());
    if (lastSyncedProfileHashRef.current === currentHash) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistProfileToAccount(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    authUser,
    firebaseConfig,
    csrfToken,
    buildCurrentAccountProfile,
    persistProfileToAccount,
  ]);

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
        const msg = tr(
          `CONCERT ANNOUNCED: ${newlyAnnouncedArtists.join(', ')} now confirmed in Sydney/Melbourne!`,
          `新巡演官宣：${newlyAnnouncedArtists.join('、')} 已官宣墨尔本/悉尼场次！`,
        );
        if ('Notification' in window && window.Notification.permission === 'granted') {
          new window.Notification(
            tr('OZ Amp — Singer Tour Announced!', 'OZ Amp — 关注歌手巡演官宣！'),
            { body: msg },
          );
        }
        showToast(msg);
      }
    },
    [showToast, tr],
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
              showToast(
                tr(
                  `Scanned AU radar for ${monitoredSingers.length} favourite singers.`,
                  `已扫描 ${monitoredSingers.length} 位关注歌手的澳洲巡演雷达。`,
                ),
              );
            }
          }
        } else if (IS_STATIC_MODE && refreshFeed) {
          showToast(
            tr(
              `Scanned OZ Amp catalog for ${monitoredSingers.length} favourite singers.`,
              `已在 OZ Amp 演出库中扫描 ${monitoredSingers.length} 位关注歌手。`,
            ),
          );
        }
        evaluateSingerAnnouncements(monitoredSingers, allConcerts, true);
      } catch {
        evaluateSingerAnnouncements(monitoredSingers, allConcerts, false);
      } finally {
        setCheckingRadar(false);
      }
    },
    [csrfToken, monitoredSingers, allConcerts, evaluateSingerAnnouncements, showToast, tr],
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
          setCloudAccountsPersistent(
            Boolean(sData.cloudAccountsPersistent) || Boolean(readBuildTimeFirebaseConfig()),
          );
          if (sData.firebaseConfig) {
            setFirebaseConfig(sData.firebaseConfig as FirebasePublicConfig);
          } else if (sData.user) {
            setAuthUser({ ...(sData.user as AuthUser), provider: 'bff' });
            if (sData.savedProfile) {
              applySavedAccountProfile(sData.savedProfile as SavedAccountProfile);
            }
          }
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
        const alertLoc = rule.regionBadge || cityLabel(rule.city, 'short');
        const alertBody = tr(
          `Starting in ~${rule.leadMinutes === 1440 ? '24 hours' : `${rule.leadMinutes} mins`} at ${rule.venueName} (${alertLoc}).`,
          `将在约 ${rule.leadMinutes === 1440 ? '24 小时' : `${rule.leadMinutes} 分钟`}后开始 · ${rule.venueName}（${alertLoc}）。`,
        );
        if ('Notification' in window && window.Notification.permission === 'granted') {
          new window.Notification(alertTitle, { body: alertBody });
        }
        showToast(tr(`QUEUE ALERT: ${alertTitle}`, `抢票 / 演出提醒：${alertTitle}`));
        return {
          ...rule,
          firedOffsets: [...rule.firedOffsets, rule.leadMinutes],
        };
      }
      return rule;
    });
    if (updated) setReminders(nextReminders);
  }, [nowMs, reminders, showToast, tr, cityLabel]);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    const perm = await window.Notification.requestPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      playReminderChime();
      showToast(
        tr(
          'Browser concert & pre-sale notifications enabled.',
          '已开启浏览器演唱会与预售提醒通知。',
        ),
      );
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
        showToast(
          tr(
            `Synced ${refreshed.concerts.length} Sydney & Melbourne gigs.`,
            `已同步 ${refreshed.concerts.length} 场墨尔本与悉尼演出。`,
          ),
        );
      } else {
        showToast(tr('Sync skipped or rate-limited.', '已跳过同步或触发频率限制。'));
      }
    } catch {
      showToast(tr('Unable to reach sync server.', '无法连接数据同步服务器。'));
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
        showToast(tr(`Stopped monitoring ${canonicalName}.`, `已取消关注 ${canonicalName}。`));
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
          tr(
            `Monitoring ${canonicalName} — ${existingMatches.length} Sydney/Melbourne show(s) already on radar!`,
            `已关注 ${canonicalName} — 雷达已匹配到 ${existingMatches.length} 场墨尔本/悉尼演出！`,
          ),
        );
      } else {
        showToast(
          tr(
            `Monitoring ${canonicalName} — we will alert you as soon as an AU tour is announced.`,
            `已关注 ${canonicalName} — 一旦官宣澳洲巡演将第一时间提醒您。`,
          ),
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
        ? tr(
            `Added ${addedCount} singer${addedCount === 1 ? '' : 's'} to automatic AU announcement radar.`,
            `已添加 ${addedCount} 位歌手至澳洲巡演自动监控雷达。`,
          )
        : tr(
            'All listed singers are already in your monitored radar.',
            '所列歌手均已在您的监控雷达中。',
          ),
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
        : tr(
            `Show Night Doors (${concert.doorsTimeLocal})`,
            `演出当晚入场 (${concert.doorsTimeLocal})`,
          );
    const ruleId = customOverride
      ? `${concert.id}::${customOverride.ruleSuffix}::${leadMinutes}`
      : `${concert.id}::${drop ? drop.id : 'doors'}::${leadMinutes}`;

    setReminders((prev) => {
      const exists = prev.some((r) => r.id === ruleId);
      if (exists) {
        showToast(
          tr(`Removed reminder for ${concert.artist}.`, `已取消 ${concert.artist} 的提醒。`),
        );
        return prev.filter((r) => r.id !== ruleId);
      }
      playReminderChime();
      showToast(
        tr(
          `Saved alert: ${concert.artist} — ${targetLabel}.`,
          `已保存提醒：${concert.artist} — ${targetLabel}。`,
        ),
      );
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
      tr(
        `Imported ${imported.length} Sydney/Melbourne show${imported.length === 1 ? '' : 's'}${autoRemind ? ' & saved queue alerts' : ''}.`,
        `已导入 ${imported.length} 场墨尔本/悉尼演出${autoRemind ? '并同步开启开票提醒' : ''}。`,
      ),
    );
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
        const label = new Intl.DateTimeFormat(intlLocale, {
          month: 'short',
          year: 'numeric',
          timeZone: 'Australia/Sydney',
        }).format(d);
        map.set(key, label);
      }
    }
    return Array.from(map.entries());
  }, [cityScopedConcerts, intlLocale]);

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
        showToast(
          tr(
            `Removed Asia-Pacific trip alert for ${stop.artist} (${stop.city}).`,
            `已取消 ${stop.artist}（${stop.city}）的亚太观演提醒。`,
          ),
        );
        return prev.filter((r) => r.id !== ruleId && r.concertId !== stop.id);
      }
      playReminderChime();
      showToast(
        tr(
          `Saved short-flight alert: ${stop.artist} in ${stop.city} (${stop.dateLabel}).`,
          `已保存短途跨国提醒：${stop.artist} · ${stop.city}（${stop.dateLabel}）。`,
        ),
      );
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
    showToast(
      tr(
        `Downloaded .ics calendar entry for ${concert.artist}.`,
        `已下载 ${concert.artist} 的 .ics 日历文件。`,
      ),
    );
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
            {tr(
              'Offline Mode — Viewing cached gigs, set times, venue sightlines & your saved alerts.',
              '离线模式 — 正在查看已缓存的演出、开演时间、场馆视野攻略与已存提醒。',
            )}
          </span>
        </div>
      )}

      {/* Top Editorial Masthead */}
      <header className="masthead">
        <div className="container masthead-inner">
          <div className="brand-cluster">
            <span className="brand-edition">
              {tr('VIC & NSW LIVE GIG RADAR · AEDT / AEST', '维州 & 新州演唱会雷达 · 澳东时间')}
            </span>
            <button
              type="button"
              className="brand-home-btn"
              onClick={() => switchPage('guide')}
            >
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-wordmark">OZ Amp</span>
            </button>
          </div>

          <nav className="section-jump-nav" aria-label={tr('Primary pages', '主导航')}>
            <div className="page-mode-switcher" role="tablist" aria-label={tr('Switch page view', '切换页面视图')}>
              <button
                type="button"
                id="nav-page-guide-btn"
                role="tab"
                aria-selected={activePage === 'guide'}
                className={`page-mode-btn ${activePage === 'guide' ? 'is-active' : ''}`}
                onClick={() => switchPage('guide')}
              >
                {tr(`All Gigs (${cityScopedConcerts.length})`, `全部演出 (${cityScopedConcerts.length})`)}
              </button>
              <button
                type="button"
                id="nav-page-watchlist-btn"
                role="tab"
                aria-selected={activePage === 'watchlist'}
                className={`page-mode-btn ${activePage === 'watchlist' ? 'is-active' : ''}`}
                onClick={() => switchPage('watchlist')}
              >
                {tr(`My Singers (${activeWatchlistCount})`, `我的歌手 (${activeWatchlistCount})`)}
              </button>
              <button
                type="button"
                id="nav-page-world-festivals-btn"
                role="tab"
                aria-selected={activePage === 'world-festivals'}
                className={`page-mode-btn ${activePage === 'world-festivals' ? 'is-active' : ''}`}
                onClick={() => switchPage('world-festivals')}
              >
                {tr(
                  `World Festivals (${CORE_WORLD_FESTIVALS.length + savedWorldFestivals.length})`,
                  `全球音乐节 (${CORE_WORLD_FESTIVALS.length + savedWorldFestivals.length})`,
                )}
              </button>
              <button
                type="button"
                id="nav-page-trending-btn"
                role="tab"
                aria-selected={activePage === 'trending'}
                className={`page-mode-btn ${activePage === 'trending' ? 'is-active' : ''}`}
                onClick={() => switchPage('trending')}
              >
                {tr('Trending Music', '热门音乐榜')}
              </button>
            </div>
          </nav>

          <div className="masthead-actions">
            <label className="home-base-picker" htmlFor="home-city-select">
              <Plane size={13} />
              <span>{tr('Home:', '常驻:')}</span>
              <select
                id="home-city-select"
                value={cityFilter}
                onChange={(e) => {
                  setCityFilter(e.target.value as CityFilter);
                  setVenueFilter('all');
                }}
              >
                <option value="melbourne">{tr('Melbourne (VIC)', '墨尔本 (VIC)')}</option>
                <option value="sydney">{tr('Sydney (NSW)', '悉尼 (NSW)')}</option>
                <option value="all">{tr('Both Cities', '墨尔本 & 悉尼')}</option>
              </select>
            </label>

            <button
              type="button"
              id="open-smart-import-btn"
              className="btn-outline-sm"
              onClick={() => setIsImportModalOpen(true)}
            >
              <FilePlus2 size={15} />
              <span>{tr('Paste Tour', '导入巡演')}</span>
            </button>

            <button
              type="button"
              id="open-sync-modal-btn"
              className="btn-outline-sm"
              onClick={() => setIsSyncModalOpen(true)}
              title={tr(
                'Sync profile across laptop & phone or set up background push alerts',
                '在电脑与手机间同步备份，或设置后台推送提醒',
              )}
            >
              <Smartphone size={15} />
              <span>{tr('Sync / App', '备份 / 同步')}</span>
            </button>

            <button
              type="button"
              id="open-reminders-btn"
              className="btn-primary-sm"
              onClick={() => setIsReminderDrawerOpen(true)}
            >
              <Bell size={15} />
              <span>
                {tr(
                  `Saved Alerts (${cityScopedReminders.length})`,
                  `已存提醒 (${cityScopedReminders.length})`,
                )}
              </span>
            </button>

            <button
              type="button"
              id="toggle-language-btn"
              className="lang-toggle-btn"
              onClick={toggleLocale}
              aria-label={isZh ? 'Switch language to English' : '切换语言为简体中文'}
              title={isZh ? 'Switch to English' : '切换为简体中文 (Mandarin)'}
            >
              <span className={`lang-toggle-seg ${!isZh ? 'is-active' : ''}`}>EN</span>
              <span className="lang-toggle-sep" aria-hidden="true">/</span>
              <span className={`lang-toggle-seg ${isZh ? 'is-active' : ''}`}>中文</span>
            </button>

            <button
              type="button"
              id="toggle-theme-btn"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={
                theme === 'dark'
                  ? tr('Switch to Broadsheet Day theme', '切换为浅色主题')
                  : tr('Switch to Stage Warm theme', '切换为暗色舞台主题')
              }
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button
              type="button"
              id="open-account-auth-btn"
              className={`${authUser ? 'btn-armed-sm' : 'btn-outline-sm'} masthead-signin-btn`}
              onClick={() => setIsAuthModalOpen(true)}
              title={
                authUser
                  ? tr(
                      `Signed in (${authUser.maskedEmail}) — choices auto-save`,
                      `已登录 (${authUser.maskedEmail}) — 您的偏好会自动云端保存`,
                    )
                  : tr(
                      'Sign in or register to save your choices across visits',
                      '登录或注册账号，跨设备自动保存您的选择',
                    )
              }
            >
              {authUser ? <UserCheck size={15} /> : <UserCircle size={15} />}
              <span>{authUser ? authUser.displayName : tr('Sign In', '登录')}</span>
            </button>
          </div>
        </div>
      </header>

      {activePage === 'guide' && (
        <nav className="section-subnav-ribbon" aria-label={tr('Jump to guide section', '快捷跳转')}>
          <div className="container subnav-inner">
            <a href="#drops" className="subnav-pill">
              {tr(`Ticket Drops (${upcomingDrops.length})`, `即将开票 (${upcomingDrops.length})`)}
            </a>
            <a href="#singers-monitor" className="subnav-pill">
              {tr(`Singer Radar (${monitoredSingers.length})`, `歌手雷达 (${monitoredSingers.length})`)}
            </a>
            <a href="#gigs" className="subnav-pill">
              {tr(`Concerts (${filteredConcerts.length})`, `演唱会列表 (${filteredConcerts.length})`)}
            </a>
            <a href="#venues-heading" className="subnav-pill">
              {tr(`Venue Sightlines (${availableVenues.length})`, `场馆攻略 (${availableVenues.length})`)}
            </a>
            <a href="#music-festivals" className="subnav-pill">
              {tr(`AU Festivals (${cityScopedFestivals.length})`, `澳洲音乐节 (${cityScopedFestivals.length})`)}
            </a>
          </div>
        </nav>
      )}

      <main className="container main-content">
        {activePage === 'trending' ? (
          <Suspense
            fallback={
              <div className="lazy-page-loader">
                {tr('Loading Trending Popular Music…', '正在加载热门音乐榜…')}
              </div>
            }
          >
            <TrendingMusicPage
              concerts={allConcerts}
              musicFestivals={cityScopedFestivals}
              worldFestivals={[...CORE_WORLD_FESTIVALS, ...savedWorldFestivals]}
              monitoredSingers={monitoredSingers}
              watchlistSingers={activeWatchlistSingers}
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
          <Suspense
            fallback={
              <div className="lazy-page-loader">
                {tr('Loading World Festivals…', '正在加载全球音乐节…')}
              </div>
            }
          >
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
              showToast(
                tr(
                  `Added ${fest.name} (${fest.country}) to your World Festivals page!`,
                  `已将 ${fest.name}（${fest.country}）加入您的全球音乐节清单！`,
                ),
              );
            }}
            onRemoveExtraFestival={(festId) => {
              const target = savedWorldFestivals.find((f) => f.id === festId);
              setSavedWorldFestivals((prev) => prev.filter((f) => f.id !== festId));
              if (target) {
                showToast(
                  tr(
                    `Removed ${target.name} from your World Festivals page.`,
                    `已将 ${target.name} 移出您的全球音乐节清单。`,
                  ),
                );
              }
            }}
            onResetExtraFestivals={() => {
              setSavedWorldFestivals([]);
              showToast(
                tr(
                  'Reset World Festivals page to your 6 core festivals.',
                  '已重置为默认 6 大核心全球音乐节。',
                ),
              );
            }}
            monitoredSingers={monitoredSingers}
            watchlistSingers={activeWatchlistSingers}
            onToggleMonitorArtist={(artistName) => handleAddOrToggleSinger({ name: artistName })}
            reminders={cityScopedReminders}
            onToggleFestivalReminder={(fest) => {
              const ruleId = `${fest.id}::world-session::60`;
              setReminders((prev) => {
                const exists = prev.some((r) => r.id === ruleId || r.concertId === fest.id);
                if (exists) {
                  showToast(
                    tr(
                      `Removed session reminder for ${fest.name}.`,
                      `已取消 ${fest.name} 的场次提醒。`,
                    ),
                  );
                  return prev.filter((r) => r.id !== ruleId && r.concertId !== fest.id);
                }
                playReminderChime();
                showToast(
                  tr(
                    `Saved alert: ${fest.name} — ${fest.nextSessionLabel}.`,
                    `已保存提醒：${fest.name} — ${fest.nextSessionLabel}。`,
                  ),
                );
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
                tr(
                  `Saved ${newRules.length} world festival registration & ticket alert${newRules.length === 1 ? '' : 's'}!`,
                  `已批量保存 ${newRules.length} 条全球音乐节注册与开票提醒！`,
                ),
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
          <Suspense
            fallback={
              <div className="lazy-page-loader">
                {tr('Loading Your Singer Sessions…', '正在加载我的歌手页面…')}
              </div>
            }
          >
            <DedicatedWatchlistPage
            concerts={allConcerts}
            festivals={cityScopedFestivals}
            presetSingers={catalog.presetSingers}
            reminders={cityScopedReminders}
            customEntries={dedicatedCustomSingers}
            mutedIds={dedicatedMutedIds}
            removedBuiltInIds={dedicatedRemovedIds}
            onChangeCustomEntries={setDedicatedCustomSingers}
            onChangeMutedIds={setDedicatedMutedIds}
            onChangeRemovedBuiltInIds={setDedicatedRemovedIds}
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
                tr(
                  `Saved ${newRules.length} session & concert alert${newRules.length === 1 ? '' : 's'} for your singer list!`,
                  `已为您的歌手清单批量保存 ${newRules.length} 条开票与演出提醒！`,
                ),
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
              {tr(
                'Ticketek · Ticketmaster · Frontier · Live Nation · Tixel +10% Legal Cap',
                'Ticketek · Ticketmaster · Frontier · Live Nation · Tixel 官方转售 +10% 法定上限',
              )}
            </p>
            <h1 className="hero-headline">
              {tr(
                'Every band, singer & ticket drop across Melbourne and Sydney.',
                '墨尔本与悉尼全部乐队、歌手演唱会与开票抢票日历。',
              )}
            </h1>
            <p className="hero-lede">
              {tr(
                'Monitor favourite singers for instant tour-announcement alerts, catch Telstra Plus & Frontier pre-sales, compare festival passes against theatre sideshows, and plan interstate MEL ↔ SYD gig trips before dynamic hotel prices surge.',
                '关注喜爱的歌手第一时间获取巡演官宣提醒，不错过 Telstra Plus 与 Frontier 预售，对比音乐节通票与剧场专场（Sideshow），并在酒店涨价前规划墨尔本 ↔ 悉尼跨城看演出行程。',
              )}
            </p>

            <div className="city-tab-bar" role="tablist" aria-label={tr('Filter by Australian city', '按澳洲城市筛选')}>
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
                <span>{cityLabel('all')}</span>
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
                <span>{cityLabel('melbourne', 'state')}</span>
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
                <span>{cityLabel('sydney', 'state')}</span>
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
                <span className="plate-tag">{tr('MELBOURNE · NAARM', '墨尔本 · 维多利亚州')}</span>
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
                <span className="plate-tag">{tr('SYDNEY · EORA', '悉尼 · 新南威尔士州')}</span>
                <strong>Opera House Forecourt, Accor, Qudos, Hordern &amp; Enmore</strong>
              </div>
            </button>
          </div>
        </section>

        {/* Dedicated Singer Sessions & Concert Reminder Page Callout */}
        <section className="dedicated-sessions-banner" aria-label={tr('Dedicated singer sessions hub', '我的歌手专属提醒中心')}>
          <div>
            <span className="eyebrow-kicker">
              {tr(
                `Personal Roster · ${activeWatchlistCount} Tracked Singers (A–Z & Chinese Artists)`,
                `个人歌单雷达 · 共追踪 ${activeWatchlistCount} 位歌手（欧美 & 华语）`,
              )}
            </span>
            <h2 className="dedicated-banner-title">
              {tr(
                'Dedicated Ticket Sessions & Upcoming Concert Reminders',
                '我的歌手专属抢票场次与演出提醒',
              )}
            </h2>
            <p className="dedicated-banner-desc">
              {tr(
                `Open your standalone reminder page to add or remove singers, track Melbourne & Sydney ticket drops, and manage all ${activeWatchlistCount} artists in your personal roster.`,
                `打开专属页面自由增删关注歌手、追踪墨尔本与悉尼开票场次，一站式管理您关注的全部 ${activeWatchlistCount} 位艺人。`,
              )}
            </p>
          </div>
          <button
            type="button"
            id="open-dedicated-sessions-banner-btn"
            className="btn-primary-sm"
            onClick={() => switchPage('watchlist')}
          >
            <BellPlus size={15} />
            <span>{tr('Open My Singers Page →', '打开我的歌手页面 →')}</span>
          </button>
        </section>

        {/* Live Pre-Sale & General On-Sale Countdown Radar */}
        {upcomingDrops.length > 0 && (
          <section id="drops" className="drop-radar-section" aria-labelledby="drop-radar-heading">
            <div className="section-header-row">
              <div>
                <span className="eyebrow-kicker">
                  {tr('Queue Watch · Live Countdown', '抢票倒计时 · 实时监控')}
                </span>
                <h2 id="drop-radar-heading" className="section-heading">
                  {tr(
                    `Upcoming Pre-Sales & Ticket Drops (${upcomingDrops.length})`,
                    `即将到来的预售与开票场次 (${upcomingDrops.length})`,
                  )}
                </h2>
              </div>
              <div className="header-cta-group">
                <span className="sync-caption">
                  {tr(
                    'Queue tip: Ticketek & Ticketmaster waiting lounges open 15 minutes before the hour.',
                    '抢票贴士：Ticketek 与 Ticketmaster 候票大厅通常在整点前 15 分钟开放。',
                  )}
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
                        ? tr('Show Next 12 Drops', '仅看最近 12 场')
                        : tr(
                            `Show All ${upcomingDrops.length} Drops`,
                            `展开全部 ${upcomingDrops.length} 场开票`,
                          )}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="drop-strip">
              {(showAllDrops ? upcomingDrops : upcomingDrops.slice(0, 12)).map(({ concert, drop }) => {
                const cd = computeCountdown(drop.opensAtIso, nowMs, locale);
                const ruleId15 = `${concert.id}::${drop.id}::15`;
                const isArmed = reminders.some((r) => r.id === ruleId15);
                const resolvedDropUrl = sanitizeExternalHttpsUrl(drop.bookingUrl, concert.artist);
                const portalLabel = describeTicketingPortal(resolvedDropUrl);

                return (
                  <article key={`${concert.id}-${drop.id}`} className="drop-card">
                    <div className="drop-card-top">
                      <div className="drop-card-badges">
                        <span className={`city-pill city-pill--${concert.city}`}>
                          {cityLabel(concert.city, 'short')}
                        </span>
                        <span className="presale-kind-badge">{dropKindLabel(drop.kind)}</span>
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
                        {tr('Opens', '开票时间')}{' '}
                        {formatAuTimestamp(drop.opensAtIso, concert.city, locale)}
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
                        <span>
                          {isArmed ? tr('Alert On', '已设提醒') : tr('T-15m Alert', '提前15分提醒')}
                        </span>
                      </button>

                      <a
                        href={buildGoogleCalendarDropUrl(concert, drop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost-xs"
                        title={tr('Add pre-sale queue block to Google Calendar', '添加到 Google 日历')}
                      >
                        <Calendar size={12} />
                        <span>{tr('GCal', '日历')}</span>
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
          <section className="news-ticker-bar" aria-label={tr('Australian tour dispatches', '澳洲巡演快讯')}>
            <span className="ticker-badge">
              <Radio size={13} />
              <span>{tr('AU TOUR WIRE', '澳洲巡演快讯')}</span>
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
        <section id="gigs" className="filter-panel" aria-label={tr('Search and filter concerts', '搜索与筛选演唱会')}>
          <div className="filter-top-row">
            <div className="search-field-wrap">
              <Search size={16} className="search-icon" />
              <input
                type="search"
                id="concert-search-input"
                className="search-input"
                placeholder={tr(
                  'Search band, singer, support act, festival, suburb, or venue…',
                  '搜索乐队、歌手、嘉宾、音乐节、区域或场馆…',
                )}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              id="venue-filter-select"
              className="filter-select"
              aria-label={tr('Filter by venue', '按场馆筛选')}
              value={venueFilter}
              onChange={(e) => setVenueFilter(e.target.value)}
            >
              <option value="all">
                {tr(`All Venues (${availableVenues.length})`, `全部场馆 (${availableVenues.length})`)}
              </option>
              {availableVenues.map((v) => (
                <option key={v.id} value={v.id}>
                  [{cityLabel(v.city, 'short')}] {v.name} ({v.suburb})
                </option>
              ))}
            </select>

            <select
              id="month-filter-select"
              className="filter-select"
              aria-label={tr('Filter by month', '按月份筛选')}
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            >
              <option value="all">{tr('All Upcoming Months', '全部未来月份')}</option>
              {availableMonths.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <select
              id="status-filter-select"
              className="filter-select"
              aria-label={tr('Filter by ticket status', '按售票状态筛选')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">{tr('All Ticket Statuses', '全部售票状态')}</option>
              <option value="watched">
                {tr(
                  `My Monitored Singers (${monitoredSingers.length})`,
                  `我关注的雷达歌手 (${monitoredSingers.length})`,
                )}
              </option>
              <option value="drops">{tr('Has Pre-Sale / Upcoming Drop', '有预售 / 即将开票')}</option>
              <option value="selling-fast">{tr('Selling Fast', '余票紧张')}</option>
              <option value="on-sale">{tr('On Sale Now', '公开售票中')}</option>
              <option value="waitlist">{tr('Waitlist / Resale Only', '仅候补 / 官方转售')}</option>
              <option value="interstate-excl">
                {cityFilter === 'melbourne'
                  ? tr('Melbourne Exclusives (No Sydney Show)', '墨尔本独享（悉尼无场次）')
                  : cityFilter === 'sydney'
                    ? tr('Sydney Exclusives (No Melbourne Show)', '悉尼独享（墨尔本无场次）')
                    : tr('Single-City Exclusives (MEL or SYD Only)', '单城独享场次（仅墨或仅悉）')}
              </option>
              <option value="reminded">
                {tr(
                  `My Saved Alerts (${cityScopedReminders.length})`,
                  `我的已存提醒 (${cityScopedReminders.length})`,
                )}
              </option>
            </select>

            <select
              id="sort-order-select"
              className="filter-select"
              aria-label={tr('Sort concerts', '排序方式')}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
            >
              <option value="date">{tr('Sort: Soonest Date', '排序：最近演出日期')}</option>
              <option value="drops-first">{tr('Sort: Next Ticket Drop', '排序：最快开票')}</option>
              <option value="price-asc">{tr('Sort: Lowest Price (AUD)', '排序：最低票价 (澳元)')}</option>
              <option value="artist-az">{tr('Sort: Artist A–Z', '排序：艺人 A–Z')}</option>
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
                <span>
                  {weekendOnly
                    ? tr('✓ Fri–Sun Only', '✓ 仅看周五至周日')
                    : tr('Fri–Sun Only', '仅看周末场')}
                </span>
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
                  {tr('Clear Filters', '清除筛选')}
                </button>
              )}
            </div>
          </div>

          <div className="genre-pill-row" role="group" aria-label={tr('Filter by music genre', '按曲风筛选')}>
            {GENRE_FILTERS.map((g) => (
              <button
                key={g}
                type="button"
                className={`genre-pill ${genreFilter === g ? 'is-active' : ''}`}
                onClick={() => setGenreFilter(g)}
              >
                {genreLabel(g)}
              </button>
            ))}
          </div>
        </section>

        {/* Results Meta Bar + Cards / Monthly Calendar View Switcher */}
        <div className="results-meta-bar">
          <p className="results-summary">
            {isZh ? (
              <>
                共显示 <strong>{filteredConcerts.length}</strong> 场演出（{cityLabel(cityFilter)}）
                {weekendOnly ? ' · 仅周末' : ''}
                {priceRange[0] > 0 || priceRange[1] < 500
                  ? ` · A$${priceRange[0]}–${priceRange[1] >= 500 ? 'A$500+' : `A$${priceRange[1]}`}`
                  : ''}
              </>
            ) : (
              <>
                Showing <strong>{filteredConcerts.length}</strong> live concert
                {filteredConcerts.length === 1 ? '' : 's'}
                {cityFilter !== 'all'
                  ? ` in ${cityFilter === 'melbourne' ? 'Melbourne (VIC)' : 'Sydney (NSW)'}`
                  : ' across Melbourne & Sydney'}
                {weekendOnly ? ' · Fri–Sun' : ''}
                {priceRange[0] > 0 || priceRange[1] < 500
                  ? ` · A$${priceRange[0]}–${priceRange[1] >= 500 ? 'A$500+' : `A$${priceRange[1]}`}`
                  : ''}
              </>
            )}
          </p>

          <div className="sync-status-cluster">
            <div className="page-mode-switcher view-mode-switch" role="tablist" aria-label={tr('Concert view layout', '切换演出视图')}>
              <button
                type="button"
                id="view-mode-grid-btn"
                role="tab"
                aria-selected={gigViewMode === 'grid'}
                className={`page-mode-btn ${gigViewMode === 'grid' ? 'is-active' : ''}`}
                onClick={() => setGigViewMode('grid')}
              >
                <LayoutGrid size={13} />
                <span>{tr('Cards Grid', '卡片列表')}</span>
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
                <span>{tr('Monthly Calendar', '月度日历')}</span>
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
                <span>{syncing ? tr('Syncing…', '同步中…') : tr('Sync Feed', '刷新数据')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Concert Broadsheet Grid OR Interactive Monthly Calendar */}
        {gigViewMode === 'calendar' ? (
          <Suspense fallback={<div className="lazy-page-loader">{tr('Loading Monthly Calendar…', '正在加载月度日历…')}</div>}>
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
            <h2>{tr('No matching gigs under current filters', '当前筛选条件下暂无匹配演出')}</h2>
            <p>
              {tr(
                'Try widening your price slider, clearing Fri–Sun Only, switching cities, or adding the singer to Favourite Singers Radar above so we alert you as soon as dates drop.',
                '您可以放宽票价范围、取消“仅看周末场”、切换城市，或在上方将歌手加入“歌手雷达”，巡演官宣时第一时间提醒您。',
              )}
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
              {tr('Reset All Filters', '重置所有筛选')}
            </button>
          </section>
        ) : (
          <section className="gig-grid" aria-label={tr('Upcoming concerts', '即将上演的演唱会')}>
            {filteredConcerts.map((concert) => {
              const dateParts = formatConcertDate(concert.dateIso, concert.timeZone, locale);
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

              const statusText = localizeStatus(concert.status);

              return (
                <article
                  key={concert.id}
                  className={`gig-card ${watched ? 'gig-card--watched' : ''}`}
                >
                  <div className="gig-card-header">
                    <div className="gig-badge-group">
                      <span className={`city-pill city-pill--${concert.city}`}>
                        {cityLabel(concert.city, 'state').toUpperCase()}
                      </span>
                      <span className={`status-pill status-pill--${concert.status}`}>
                        {statusText}
                      </span>
                      {tripPlan?.isExclusiveToOtherCity && (
                        <span className="interstate-excl-pill">
                          {concert.city === 'sydney'
                            ? tr('SYD Exclusive', '悉尼独享')
                            : tr('MEL/VIC Exclusive', '墨尔本独享')}
                        </span>
                      )}
                      {concert.isCustom && (
                        <span className="custom-pill">{tr('Imported', '已导入')}</span>
                      )}
                    </div>

                    <div className="card-corner-tools">
                      <button
                        type="button"
                        className={`star-btn ${watched ? 'is-starred' : ''}`}
                        onClick={() => handleAddOrToggleSinger({ name: concert.artist })}
                        aria-label={
                          watched
                            ? `Stop monitoring ${concert.artist}`
                            : `Monitor ${concert.artist}`
                        }
                        title={
                          watched
                            ? tr('Monitoring singer', '正在关注该歌手')
                            : tr('Monitor singer for alerts', '关注该歌手获取巡演提醒')
                        }
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
                            {isZh
                              ? `+${concert.additionalDates.length} 场加演`
                              : `+${concert.additionalDates.length} more night${concert.additionalDates.length === 1 ? '' : 's'}`}
                          </span>
                        )}
                        <div className="logistics-sub">
                          <Clock size={12} /> {tr('Doors', '入场')}{' '}
                          {formatAuTime24To12(
                            concert.doorsTimeLocal,
                            concert.dateIso,
                            concert.timeZone,
                            locale,
                          )}{' '}
                          · {tr('Set', '主秀')} {concert.setTimeLocal}
                          {venueMeta?.curfewLocal
                            ? ` · ${tr('Curfew', '散场')} ${venueMeta.curfewLocal}`
                            : ''}
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
                        <strong>{resaleGuard.statutoryLawLabel}:</strong>{' '}
                        {tr('Max fair resale', '法定最高转售价')}{' '}
                        <code>{resaleGuard.maxLegalMaxAud}</code>
                      </span>
                    </div>
                    <a
                      href={sanitizeExternalHttpsUrl(resaleGuard.tixelUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      {tr('Tixel Auto-Buy', 'Tixel 自动蹲票')} <ExternalLink size={10} />
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
                          <Hotel size={12} /> {tr('Stay:', '住宿建议:')} {tripPlan.hotelAreaTip}
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
                          {tr('+Hotel Reminder', '+酒店提醒')}
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
                      <span className="card-drops-heading">
                        {tr('Pre-Sale & On-Sale Schedule', '预售与公售时间表')}
                      </span>
                      <ul className="card-drops-list">
                        {concert.ticketDrops.map((drop) => {
                          const cd = computeCountdown(drop.opensAtIso, nowMs, locale);
                          const isDropArmed = reminders.some(
                            (r) => r.id === `${concert.id}::${drop.id}::15`,
                          );
                          return (
                            <li key={drop.id} className="card-drop-row">
                              <div>
                                <strong>{dropKindLabel(drop.kind)}:</strong>{' '}
                                {formatAuTimestamp(drop.opensAtIso, concert.city, locale)}{' '}
                                <span className="inline-cd">({cd.compact})</span>
                              </div>
                              <button
                                type="button"
                                className={`mini-arm-btn ${isDropArmed ? 'is-armed' : ''}`}
                                onClick={() => addOrToggleReminder(concert, 15, drop)}
                              >
                                {isDropArmed ? tr('Alert On', '已提醒') : tr('+15m Alert', '+15分提醒')}
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
                      <span className="agency-caption">
                        {tr(`via ${concert.agency}`, `官方票务: ${concert.agency}`)}
                      </span>
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
                          <span>{hasReminder ? tr('Alert On', '已设提醒') : tr('Notify Me', '设置提醒')}</span>
                        </button>

                        {isPopoverOpen && (
                          <div className="remind-popover" role="menu">
                            <span className="popover-title">
                              {tr('Queue & Sniper Alerts', '抢票与放票提醒')}
                            </span>
                            {concert.ticketDrops[0] && (
                              <button
                                type="button"
                                className="popover-option"
                                onClick={() =>
                                  addOrToggleReminder(concert, 15, concert.ticketDrops[0])
                                }
                              >
                                {tr(
                                  `T-15m Next Drop (${concert.ticketDrops[0].kind})`,
                                  `开票前 15 分钟 (${dropKindLabel(concert.ticketDrops[0].kind)})`,
                                )}
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
                                {tr(
                                  'T-48h Production-Hold Sniper (10am)',
                                  '演出前 48 小时蹲舞美加放票 (上午10点)',
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              className="popover-option"
                              onClick={() => addOrToggleReminder(concert, 60)}
                            >
                              {tr('1 hour before Show Doors', '开场入场前 1 小时提醒')}
                            </button>
                            <button
                              type="button"
                              className="popover-option"
                              onClick={() => addOrToggleReminder(concert, 1440)}
                            >
                              {tr('24 hours before Show Day', '演出前 24 小时提醒')}
                            </button>
                            <hr className="popover-divider" />
                            <a
                              href={buildGoogleCalendarShowUrl(concert)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="popover-option"
                              onClick={() => setActivePopoverId(null)}
                            >
                              {tr('Add Show to Google Calendar ↗', '添加到 Google 日历 ↗')}
                            </a>
                            <button
                              type="button"
                              className="popover-option"
                              onClick={() => {
                                downloadSingleShowIcs(concert);
                                setActivePopoverId(null);
                              }}
                            >
                              {tr('Download Show .ics File', '下载 .ics 日历文件')}
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
                          <span>{tr('Official Resale', '官方转售')}</span>
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

        {/* Sydney & Melbourne Venue Directory + Sightline, Restricted-View & Bag/Merch Insider Guide */}
        <section className="venues-directory" aria-labelledby="venues-heading">
          <div className="section-header-row">
            <div>
              <span className="eyebrow-kicker">
                {tr(
                  `02 · ${availableVenues.length} Tracked Stages · Sightlines, Curfews & Bag Rules`,
                  `02 · ${availableVenues.length} 座热门场馆 · 视野、散场时间与存包规则`,
                )}
              </span>
              <h2 id="venues-heading" className="section-heading">
                {cityFilter === 'melbourne'
                  ? tr('Melbourne Venue & Sightline Guide', '墨尔本演出场馆与视野攻略')
                  : cityFilter === 'sydney'
                    ? tr('Sydney Venue & Sightline Guide', '悉尼演出场馆与视野攻略')
                    : tr('Melbourne & Sydney Venue & Sightline Guide', '墨尔本与悉尼场馆与视野攻略')}
              </h2>
            </div>

            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => setShowVenueTips((cur) => !cur)}
            >
              <Eye size={14} />
              <span>
                {showVenueTips
                  ? tr('Compact Venue Grid', '收起场馆详情')
                  : tr('Show Sightline & Bag Tips', '展开视野与存包贴士')}
              </span>
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
                      {tr('Cap.', '容量')} {new Intl.NumberFormat(intlLocale).format(v.capacity)} ·{' '}
                      {tr('Curfew', '散场')} {v.curfewLocal || '23:00'}
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
                          <strong>{tr('Best Sightline:', '最佳视野:')}</strong> {insider.bestSectionTip}
                        </span>
                      </div>
                      <div className="venue-insider-row">
                        <AlertTriangle size={13} className="insider-icon insider-icon--warn" />
                        <span>
                          <strong>{tr('Watch Out:', '避坑提示:')}</strong> {insider.restrictedViewWarning}
                        </span>
                      </div>
                      <div className="venue-insider-row">
                        <ShoppingBag size={13} className="insider-icon insider-icon--merch" />
                        <span>
                          <strong>{tr('Bags & Merch:', '存包与周边:')}</strong> {insider.cloakAndMerchTip}
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
                          ? tr(
                              `✓ Filtering ${count} Show${count === 1 ? '' : 's'}`,
                              `✓ 已筛选 ${count} 场演出`,
                            )
                          : tr(
                              `Filter ${count} Show${count === 1 ? '' : 's'} Here`,
                              `查看该场馆 ${count} 场演出`,
                            )}
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
          watchlistSingers={activeWatchlistSingers}
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
                showToast(
                  tr(
                    `Removed festival reminder for ${fest.name}.`,
                    `已取消 ${fest.name} 音乐节提醒。`,
                  ),
                );
                return prev.filter((r) => r.id !== ruleId);
              }
              playReminderChime();
              showToast(
                tr(
                  `Saved festival alert for ${fest.name} (${matchingStop.dateLabel}).`,
                  `已保存 ${fest.name} 音乐节提醒（${matchingStop.dateLabel}）。`,
                ),
              );
              return [
                {
                  id: ruleId,
                  concertId: fest.id,
                  artist: fest.name,
                  venueName: matchingStop.venueName,
                  city: matchingStop.city,
                  targetType: 'show-day',
                  targetLabel: tr(
                    `Festival Gates & Lineup Alert (${matchingStop.dateLabel})`,
                    `音乐节入场与阵容提醒 (${matchingStop.dateLabel})`,
                  ),
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
            {isZh ? (
              <>
                <strong>OZ Amp</strong> — 墨尔本与悉尼演唱会及预售抢票指南。受维州大型活动法案与新州公平交易局{' '}
                <strong>+10% 官方转售法定上限</strong>保护（<strong>Ticketek Marketplace</strong>{' '}
                &amp; <strong>Tixel</strong>）。
              </>
            ) : (
              <>
                <strong>OZ Amp</strong> — Melbourne (Naarm) &amp; Sydney (Eora) Live Music &amp;
                Pre-Sale Reminder Guide. Protected by VIC Major Events Act &amp; NSW Fair Trading{' '}
                <strong>+10% statutory resale caps</strong> via <strong>Ticketek Marketplace</strong>{' '}
                &amp; <strong>Tixel</strong>.
              </>
            )}
          </p>
        </div>
      </footer>

      {showBackToTop && (
        <button
          type="button"
          className="back-to-top-fab"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={tr('Scroll back to top', '返回顶部')}
        >
          <ArrowUp size={15} />
          <span>{tr('Top', '顶部')}</span>
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
              showToast(tr('Cleared elapsed ticket drops.', '已清理已过期的开票提醒。'));
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
            monitoredSingers={monitoredSingers}
            savedWorldFestivals={savedWorldFestivals}
            customConcerts={customConcerts}
            onRestoreBackup={(backup) => {
              setTheme(backup.theme);
              setCityFilter(backup.cityFilter);
              setReminders(backup.reminders);
              if (backup.monitoredSingers.length > 0) {
                setMonitoredSingers(backup.monitoredSingers);
              }
              setSavedWorldFestivals(backup.savedWorldFestivals);
              setCustomConcerts(backup.customConcerts);
              if (Array.isArray(backup.dedicatedCustomSingers)) {
                setDedicatedCustomSingers(backup.dedicatedCustomSingers as WatchlistSingerEntry[]);
              }
              if (Array.isArray(backup.dedicatedMutedIds)) {
                const { mutedIds, removedIds } = splitPackedDedicatedMutedIds(
                  backup.dedicatedMutedIds,
                );
                setDedicatedMutedIds(mutedIds);
                setDedicatedRemovedIds(removedIds);
              }
              playReminderChime();
              showToast(
                tr(
                  `Restored OZ Amp profile (${backup.reminders.length} reminders, ${backup.monitoredSingers.length} singers)!`,
                  `已恢复 OZ Amp 备份（${backup.reminders.length} 条提醒，${backup.monitoredSingers.length} 位歌手）！`,
                ),
              );
            }}
            onShowToast={showToast}
          />
        </Suspense>
      )}

      {isAuthModalOpen && (
        <Suspense fallback={null}>
          <AccountAuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            csrfToken={csrfToken}
            firebaseConfig={firebaseConfig}
            user={authUser}
            cloudAccountsPersistent={cloudAccountsPersistent}
            syncState={accountSyncState}
            lastSavedIso={lastAccountSavedIso}
            monitoredCount={monitoredSingers.length}
            mySingersCount={activeWatchlistCount}
            remindersCount={reminders.length}
            worldFestivalsCount={savedWorldFestivals.length}
            buildCurrentProfile={buildCurrentAccountProfile}
            onAuthenticated={(user, profile, isRegistration) => {
              setAuthUser(user);
              if (profile) {
                applySavedAccountProfile(profile);
              }
              playReminderChime();
              showToast(
                isRegistration
                  ? tr(
                      `Welcome ${user.displayName}! Your OZ Amp choices are now saved to your account.`,
                      `欢迎 ${user.displayName}！您的 OZ Amp 偏好已保存至账号。`,
                    )
                  : tr(
                      `Welcome back, ${user.displayName}! Loaded your saved choices.`,
                      `欢迎回来，${user.displayName}！已加载您保存的偏好。`,
                    ),
              );
            }}
            onForceSaveNow={() => persistProfileToAccount(true)}
            onLoggedOut={() => {
              lastSyncedProfileHashRef.current = null;
              setAuthUser(null);
              setAccountSyncState('idle');
              setLastAccountSavedIso(null);
              setIsAuthModalOpen(false);
              try {
                for (const key of Object.values(STORAGE_KEYS)) {
                  window.localStorage.removeItem(key);
                }
              } catch {
                // Ignore storage access errors
              }
              window.location.reload();
            }}
            onShowToast={showToast}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
