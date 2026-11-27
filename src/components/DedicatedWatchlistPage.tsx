import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  BellPlus,
  Calendar,
  CalendarPlus,
  Check,
  Clock,
  ExternalLink,
  Headphones,
  ListMusic,
  MapPin,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import type {
  ApacTourStop,
  CityId,
  ConcertEvent,
  LeadMinutes,
  MusicFestivalDirectoryItem,
  PresetSinger,
  ReminderRule,
  TicketDropWindow,
} from '../types/gig';
import {
  UPLOADED_WATCHLIST_SINGERS,
  WATCHLIST_GROUPS,
  parseCustomWatchlistInput,
  type WatchlistGroupKey,
  type WatchlistSingerEntry,
} from '../data/userSingerList';
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
  sanitizeExternalHttpsUrl,
} from '../utils/formatters';
import { computeResaleGuard } from '../utils/auMarketTools';
import { buildArtistPreviewLinks } from '../utils/musicPreviewLinks';
import { ArtistAvatar, ConcertMediaBanner } from './ArtistAvatar';
import { ApacRadarSection } from './ApacRadarSection';

interface DedicatedWatchlistPageProps {
  concerts: ConcertEvent[];
  festivals: MusicFestivalDirectoryItem[];
  presetSingers: PresetSinger[];
  reminders: ReminderRule[];
  customEntries: WatchlistSingerEntry[];
  mutedIds: string[];
  removedBuiltInIds: string[];
  onChangeCustomEntries: React.Dispatch<React.SetStateAction<WatchlistSingerEntry[]>>;
  onChangeMutedIds: React.Dispatch<React.SetStateAction<string[]>>;
  onChangeRemovedBuiltInIds: React.Dispatch<React.SetStateAction<string[]>>;
  nowMs: number;
  cityFilter: 'all' | CityId;
  onChangeCityFilter: (city: 'all' | CityId) => void;
  onAddOrToggleReminder: (
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
  ) => void;
  onBulkArmReminders: (newRules: ReminderRule[]) => void;
  onToggleApacReminder: (stop: ApacTourStop) => void;
  onOpenReminderDrawer: () => void;
  onBackToMainGuide: () => void;
  onShowToast: (msg: string) => void;
}

function normalizeArtistToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.’'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPerformerTokens(rawAct: string): string[] {
  const tokens = new Set<string>();
  const full = normalizeArtistToken(rawAct);
  if (full) tokens.add(full);

  // Extract main name before parenthetical and alias inside parenthetical
  const stripped = normalizeArtistToken(rawAct.replace(/\([^)]*\)/g, ' '));
  if (stripped) tokens.add(stripped);

  const parenMatches = rawAct.matchAll(/\(([^)]+)\)/g);
  for (const m of parenMatches) {
    const inner = normalizeArtistToken(m[1]);
    if (inner && inner !== 'dj' && inner !== 'live') {
      tokens.add(inner);
    }
  }
  return Array.from(tokens);
}

export const DedicatedWatchlistPage: React.FC<DedicatedWatchlistPageProps> = ({
  concerts,
  festivals,
  presetSingers,
  reminders,
  customEntries,
  mutedIds,
  removedBuiltInIds,
  onChangeCustomEntries,
  onChangeMutedIds,
  onChangeRemovedBuiltInIds,
  nowMs,
  cityFilter,
  onChangeCityFilter,
  onAddOrToggleReminder,
  onBulkArmReminders,
  onToggleApacReminder,
  onOpenReminderDrawer,
  onBackToMainGuide,
  onShowToast,
}) => {
  const [groupFilter, setGroupFilter] = useState<'all' | 'active-au' | WatchlistGroupKey>('all');
  const [rosterSearch, setRosterSearch] = useState('');
  const [addSingerInput, setAddSingerInput] = useState('');
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const [showRemovedTray, setShowRemovedTray] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addSingerInputRef = useRef<HTMLInputElement | null>(null);

  const removedBuiltInSet = useMemo(() => new Set(removedBuiltInIds), [removedBuiltInIds]);

  const activeBuiltInSingers = useMemo(
    () => UPLOADED_WATCHLIST_SINGERS.filter((s) => !removedBuiltInSet.has(s.id)),
    [removedBuiltInSet],
  );

  const removedBuiltInSingers = useMemo(
    () => UPLOADED_WATCHLIST_SINGERS.filter((s) => removedBuiltInSet.has(s.id)),
    [removedBuiltInSet],
  );

  const allSingers = useMemo(() => {
    const seen = new Set<string>();
    const combined: WatchlistSingerEntry[] = [];
    for (const item of [...customEntries, ...activeBuiltInSingers]) {
      const key = item.displayName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(item);
      }
    }
    return combined;
  }, [customEntries, activeBuiltInSingers]);

  const mutedSet = useMemo(() => new Set(mutedIds), [mutedIds]);

  const addSuggestions = useMemo(() => {
    const q = addSingerInput.trim().toLowerCase();
    if (q.length < 2) return [];
    const activeLower = new Set(allSingers.map((s) => s.displayName.toLowerCase()));
    const seen = new Set<string>();
    const list: Array<{ label: string; badge: string; isRestore?: boolean }> = [];

    for (const rem of removedBuiltInSingers) {
      if (
        rem.displayName.toLowerCase().includes(q) ||
        rem.matchTerms.some((t) => t.toLowerCase().includes(q))
      ) {
        const key = rem.displayName.toLowerCase();
        if (!seen.has(key) && !activeLower.has(key)) {
          seen.add(key);
          list.push({ label: rem.displayName, badge: 'Restore', isRestore: true });
        }
      }
    }

    for (const c of concerts) {
      const key = c.artist.toLowerCase();
      if (key.includes(q) && !seen.has(key) && !activeLower.has(key)) {
        seen.add(key);
        list.push({
          label: c.artist,
          badge: c.city === 'melbourne' ? 'Touring MEL' : 'Touring SYD',
        });
      }
    }

    for (const p of presetSingers) {
      const key = p.name.toLowerCase();
      if (
        (key.includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q))) &&
        !seen.has(key) &&
        !activeLower.has(key)
      ) {
        seen.add(key);
        list.push({ label: p.name, badge: p.genre });
      }
    }

    return list.slice(0, 6);
  }, [addSingerInput, allSingers, removedBuiltInSingers, concerts, presetSingers]);

  const toggleMuteSinger = (entry: WatchlistSingerEntry) => {
    onChangeMutedIds((prev) => {
      const next = prev.includes(entry.id)
        ? prev.filter((id) => id !== entry.id)
        : [...prev, entry.id];
      onShowToast(
        next.includes(entry.id)
          ? `Muted session alerts for ${entry.displayName}.`
          : `Enabled automatic session & concert alerts for ${entry.displayName}.`,
      );
      return next;
    });
  };

  const handleRemoveSinger = (entry: WatchlistSingerEntry) => {
    const isCustomEntry = customEntries.some((item) => item.id === entry.id);
    if (isCustomEntry) {
      onChangeCustomEntries((prev) => prev.filter((item) => item.id !== entry.id));
    } else {
      onChangeRemovedBuiltInIds((prev) =>
        prev.includes(entry.id) ? prev : [...prev, entry.id],
      );
    }
    onChangeMutedIds((prev) => prev.filter((id) => id !== entry.id));
    onShowToast(`Removed ${entry.displayName} from My Singers.`);
  };

  const handleRestoreSinger = (entry: WatchlistSingerEntry) => {
    onChangeRemovedBuiltInIds((prev) => prev.filter((id) => id !== entry.id));
    onShowToast(`Restored ${entry.displayName} to My Singers.`);
  };

  const handleRestoreAllRemoved = () => {
    const count = removedBuiltInSingers.length;
    onChangeRemovedBuiltInIds([]);
    setShowRemovedTray(false);
    onShowToast(`Restored ${count} removed singer${count === 1 ? '' : 's'} to My Singers.`);
  };

  const handleAppendSingers = (rawText: string, clearSource: 'quick' | 'bulk' | 'none' = 'bulk') => {
    const parsed = parseCustomWatchlistInput(rawText);
    if (parsed.length === 0) {
      onShowToast('Enter a valid singer or band name (at least 2 characters).');
      return;
    }

    const activeLower = new Set(allSingers.map((s) => s.displayName.toLowerCase()));
    const removedByLower = new Map<string, WatchlistSingerEntry>();
    for (const rem of removedBuiltInSingers) {
      removedByLower.set(rem.displayName.toLowerCase(), rem);
    }

    const toRestoreIds: string[] = [];
    const freshCustom: WatchlistSingerEntry[] = [];
    const addedNames = new Set<string>();

    for (const entry of parsed) {
      const lower = entry.displayName.toLowerCase();
      if (activeLower.has(lower) || addedNames.has(lower)) continue;
      addedNames.add(lower);

      const removedMatch = removedByLower.get(lower);
      if (removedMatch) {
        toRestoreIds.push(removedMatch.id);
      } else {
        freshCustom.push(entry);
      }
    }

    if (toRestoreIds.length === 0 && freshCustom.length === 0) {
      onShowToast(
        parsed.length === 1
          ? `${parsed[0].displayName} is already in My Singers.`
          : 'All entered singers are already in My Singers.',
      );
      return;
    }

    if (toRestoreIds.length > 0) {
      const restoreSet = new Set(toRestoreIds);
      onChangeRemovedBuiltInIds((prev) => prev.filter((id) => !restoreSet.has(id)));
    }
    if (freshCustom.length > 0) {
      onChangeCustomEntries((prev) => [...freshCustom, ...prev]);
    }

    if (clearSource === 'quick') {
      setAddSingerInput('');
    } else if (clearSource === 'bulk') {
      setPasteInput('');
      setShowUploadDrawer(false);
    }

    const totalAdded = toRestoreIds.length + freshCustom.length;
    if (totalAdded === 1) {
      const onlyName =
        freshCustom[0]?.displayName ||
        removedBuiltInSingers.find((r) => r.id === toRestoreIds[0])?.displayName ||
        parsed[0].displayName;
      onShowToast(
        toRestoreIds.length === 1
          ? `Restored ${onlyName} to My Singers.`
          : `Added ${onlyName} to My Singers.`,
      );
    } else {
      onShowToast(`Added ${totalAdded} singers to My Singers.`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 256 * 1024) {
      onShowToast('Upload file must be under 256 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      handleAppendSingers(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Exact performer matching across all Melbourne & Sydney concerts and festivals
  const singerMatches = useMemo(() => {
    const bySingerId = new Map<
      string,
      {
        concerts: ConcertEvent[];
        festivals: MusicFestivalDirectoryItem[];
      }
    >();

    // Pre-compute normalized performer token sets for each concert and festival
    const concertTokenMap = concerts.map((c) => {
      const set = new Set<string>();
      for (const act of [c.artist, ...c.supportActs]) {
        for (const tok of extractPerformerTokens(act)) set.add(tok);
      }
      return { concert: c, tokens: set };
    });

    const festivalTokenMap = festivals.map((f) => {
      const set = new Set<string>();
      for (const act of f.fullLineup) {
        for (const tok of extractPerformerTokens(act)) set.add(tok);
      }
      return { festival: f, tokens: set };
    });

    for (const singer of allSingers) {
      const normTerms = singer.matchTerms.map(normalizeArtistToken).filter(Boolean);
      const matchedConcerts = concertTokenMap
        .filter(
          ({ concert, tokens }) =>
            (cityFilter === 'all' || concert.city === cityFilter) &&
            normTerms.some((t) => tokens.has(t)),
        )
        .map(({ concert }) => concert);
      const matchedFestivals = festivalTokenMap
        .filter(
          ({ festival, tokens }) =>
            (cityFilter === 'all' || festival.stops.some((st) => st.city === cityFilter)) &&
            normTerms.some((t) => tokens.has(t)),
        )
        .map(({ festival }) => festival);

      bySingerId.set(singer.id, {
        concerts: matchedConcerts,
        festivals: matchedFestivals,
      });
    }

    return bySingerId;
  }, [allSingers, concerts, festivals, cityFilter]);

  // Minute-granular clock avoids rebuilding upcomingWatchlistSessions every 1 second
  const clockMinute = Math.floor(nowMs / 60_000);

  // Deduplicated matched concerts (Melbourne prioritized first, then date)
  const matchedWatchlistConcerts = useMemo(() => {
    const map = new Map<
      string,
      { concert: ConcertEvent; matchedSingers: string[]; hasUnmutedSinger: boolean }
    >();
    for (const singer of allSingers) {
      const m = singerMatches.get(singer.id);
      if (!m) continue;
      const isUnmuted = !mutedSet.has(singer.id);
      for (const c of m.concerts) {
        if (cityFilter !== 'all' && c.city !== cityFilter) continue;
        const cur = map.get(c.id);
        if (cur) {
          if (!cur.matchedSingers.includes(singer.displayName)) {
            cur.matchedSingers.push(singer.displayName);
          }
          if (isUnmuted) cur.hasUnmutedSinger = true;
        } else {
          map.set(c.id, {
            concert: c,
            matchedSingers: [singer.displayName],
            hasUnmutedSinger: isUnmuted,
          });
        }
      }
    }
    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.concert.city !== b.concert.city) {
        return a.concert.city === 'melbourne' ? -1 : 1;
      }
      return a.concert.dateIso.localeCompare(b.concert.dateIso);
    });
    return list;
  }, [allSingers, singerMatches, cityFilter, mutedSet]);

  // Extract all upcoming ticket-sale sessions / drops for matched concerts (Melbourne first on ties)
  const upcomingWatchlistSessions = useMemo(() => {
    const refMs = clockMinute * 60_000;
    const items: Array<{
      concert: ConcertEvent;
      drop: TicketDropWindow;
      matchedSingers: string[];
      hasUnmutedSinger: boolean;
      opensMs: number;
    }> = [];
    for (const { concert, matchedSingers, hasUnmutedSinger } of matchedWatchlistConcerts) {
      for (const drop of concert.ticketDrops) {
        const opensMs = new Date(drop.opensAtIso).getTime();
        if (opensMs >= refMs - 18 * 3600 * 1000) {
          items.push({ concert, drop, matchedSingers, hasUnmutedSinger, opensMs });
        }
      }
    }
    items.sort((a, b) => {
      if (a.opensMs !== b.opensMs) return a.opensMs - b.opensMs;
      if (a.concert.city === b.concert.city) return 0;
      return a.concert.city === 'melbourne' ? -1 : 1;
    });
    return items;
  }, [matchedWatchlistConcerts, clockMinute]);

  const activeSingersCount = useMemo(() => {
    let n = 0;
    for (const singer of allSingers) {
      const m = singerMatches.get(singer.id);
      if (m && (m.concerts.length > 0 || m.festivals.length > 0)) n += 1;
    }
    return n;
  }, [allSingers, singerMatches]);

  const filteredRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return allSingers.filter((s) => {
      const m = singerMatches.get(s.id);
      const hasAuActivity = Boolean(m && (m.concerts.length > 0 || m.festivals.length > 0));
      if (groupFilter === 'active-au' && !hasAuActivity) return false;
      if (
        groupFilter !== 'all' &&
        groupFilter !== 'active-au' &&
        s.group !== groupFilter
      ) {
        return false;
      }
      if (q) {
        const hay = [s.displayName, ...s.matchTerms, s.group, s.tourContextNote || '']
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allSingers, singerMatches, groupFilter, rosterSearch]);

  const handleArmAllWatchlistSessions = () => {
    const existingIds = new Set(reminders.map((r) => r.id));
    const toAdd: ReminderRule[] = [];

    for (const { concert, drop, hasUnmutedSinger } of upcomingWatchlistSessions) {
      if (!hasUnmutedSinger) continue;
      const ruleId = `${concert.id}::${drop.id}::15`;
      if (!existingIds.has(ruleId)) {
        existingIds.add(ruleId);
        toAdd.push({
          id: ruleId,
          concertId: concert.id,
          dropId: drop.id,
          artist: concert.artist,
          venueName: concert.venueName,
          city: concert.city,
          targetType: drop.kind === 'General On-Sale' ? 'onsale' : 'presale',
          targetLabel: drop.label,
          targetIso: drop.opensAtIso,
          leadMinutes: 15,
          ticketUrl: sanitizeExternalHttpsUrl(drop.bookingUrl, concert.artist),
          firedOffsets: [],
          createdAtIso: new Date().toISOString(),
        });
      }
    }

    for (const { concert, hasUnmutedSinger } of matchedWatchlistConcerts) {
      if (!hasUnmutedSinger) continue;
      const showRuleId = `${concert.id}::doors::1440`;
      if (!existingIds.has(showRuleId)) {
        existingIds.add(showRuleId);
        toAdd.push({
          id: showRuleId,
          concertId: concert.id,
          artist: concert.artist,
          venueName: concert.venueName,
          city: concert.city,
          targetType: 'show-day',
          targetLabel: `Show Night Doors (${concert.doorsTimeLocal})`,
          targetIso: buildConcertDoorsIso(concert),
          leadMinutes: 1440,
          ticketUrl: sanitizeExternalHttpsUrl(concert.ticketUrl, concert.artist),
          firedOffsets: [],
          createdAtIso: new Date().toISOString(),
        });
      }
    }

    if (toAdd.length === 0) {
      onShowToast('All sessions and upcoming concerts for your singer list already have alerts saved!');
      return;
    }
    onBulkArmReminders(toAdd);
  };

  const handleExportWatchlistCalendar = () => {
    const events: Array<{
      uid: string;
      summary: string;
      description: string;
      location: string;
      startDate: Date;
      endDate: Date;
      alarmMinutes?: number;
    }> = [];

    for (const { concert, drop, matchedSingers, hasUnmutedSinger } of upcomingWatchlistSessions) {
      if (!hasUnmutedSinger) continue;
      const start = new Date(drop.opensAtIso);
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      const url = sanitizeExternalHttpsUrl(drop.bookingUrl, concert.artist);
      events.push({
        uid: `wl-drop-${concert.id}-${drop.id}`,
        summary: `[SESSION] ${matchedSingers.join(' / ')} — ${drop.label} (${concert.city === 'melbourne' ? 'MEL' : 'SYD'})`,
        location: url,
        description: `Venue: ${concert.venueName} (${concert.dateIso}) | Queue Link: ${url}`,
        startDate: start,
        endDate: end,
        alarmMinutes: 15,
      });
    }

    for (const { concert, matchedSingers, hasUnmutedSinger } of matchedWatchlistConcerts) {
      if (!hasUnmutedSinger) continue;
      const start = new Date(buildConcertDoorsIso(concert));
      const end = new Date(start.getTime() + 3.5 * 3600 * 1000);
      const url = sanitizeExternalHttpsUrl(concert.ticketUrl, concert.artist);
      events.push({
        uid: `wl-show-${concert.id}`,
        summary: `[CONCERT] ${matchedSingers.join(' / ')} Live — ${concert.venueName}`,
        location: `${concert.venueName}, ${concert.suburb}`,
        description: `${concert.tourTitle || 'Australia Tour'} | Tickets: ${url}`,
        startDate: start,
        endDate: end,
        alarmMinutes: 60,
      });
    }

    if (events.length === 0) {
      onShowToast('No sessions or concerts under the current city filter to export.');
      return;
    }
    downloadIcsEvents('my-singer-sessions-melbourne-sydney.ics', events);
    onShowToast(`Exported ${events.length} session & concert reminder(s) to .ics calendar!`);
  };

  return (
    <div className="watchlist-standalone-page">
      {/* Dedicated Standalone Page Header Banner */}
      <section className="watchlist-hero-card" aria-labelledby="watchlist-page-title">
        <div className="watchlist-hero-top">
          <button
            type="button"
            id="back-to-main-guide-btn"
            className="btn-ghost-xs"
            onClick={onBackToMainGuide}
          >
            <ArrowLeft size={14} />
            <span>Back to Full Melbourne &amp; Sydney Gig Guide</span>
          </button>
          <span className="eyebrow-kicker">
            DEDICATED SESSIONS &amp; CONCERT REMINDER HUB · MELBOURNE FIRST
          </span>
        </div>

        <div className="watchlist-hero-grid">
          <div>
            <h1 id="watchlist-page-title" className="hero-headline watchlist-headline">
              My Uploaded Singers — Ticket Sessions &amp; Upcoming Concerts
            </h1>
            <p className="hero-lede">
              Tracking all <strong>{allSingers.length}</strong> singers and bands from your personal
              A–Z &amp; Chinese Artists roster across Melbourne (VIC) and Sydney (NSW). Set 15-minute
              waiting-room alarms for pre-sale &amp; on-sale sessions, lock T-48h production-hold
              drops, and automatically monitor unannounced artists for 2027 tour drops.
            </p>

            <div className="watchlist-cta-row">
              <button
                type="button"
                id="arm-all-watchlist-sessions-btn"
                className="btn-primary-sm"
                onClick={handleArmAllWatchlistSessions}
              >
                <BellPlus size={15} />
                <span>Notify All Sessions &amp; Concerts ({upcomingWatchlistSessions.length + matchedWatchlistConcerts.length})</span>
              </button>

              <button
                type="button"
                id="export-watchlist-ics-btn"
                className="btn-outline-sm"
                onClick={handleExportWatchlistCalendar}
              >
                <CalendarPlus size={15} />
                <span>Export Sessions &amp; Shows (.ics)</span>
              </button>

              <button
                type="button"
                id="toggle-upload-more-singers-btn"
                className="btn-outline-sm"
                onClick={() => setShowUploadDrawer((v) => !v)}
              >
                <Upload size={15} />
                <span>{showUploadDrawer ? 'Hide Bulk Import' : 'Bulk Import (.txt / .csv)'}</span>
              </button>

              <button
                type="button"
                className="btn-ghost-xs"
                onClick={onOpenReminderDrawer}
              >
                <Bell size={14} />
                <span>Saved Alerts ({reminders.length})</span>
              </button>
            </div>

            {/* Inline Quick-Add Singer Bar (syncs automatically to account) */}
            <form
              className="watchlist-quick-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleAppendSingers(addSingerInput, 'quick');
              }}
            >
              <div className="watchlist-quick-add-field">
                <UserPlus size={15} className="search-icon" />
                <input
                  ref={addSingerInputRef}
                  type="text"
                  id="watchlist-quick-add-input"
                  className="search-input"
                  placeholder="Add a singer or band to My Singers (e.g. Taylor Swift, SZA, 周杰倫 — comma-separated supported)…"
                  value={addSingerInput}
                  onChange={(e) => setAddSingerInput(e.target.value)}
                />
              </div>
              <button
                type="submit"
                id="watchlist-quick-add-submit-btn"
                className="btn-primary-sm"
                disabled={addSingerInput.trim().length < 2}
              >
                <Plus size={15} />
                <span>Add Singer</span>
              </button>
            </form>

            {addSuggestions.length > 0 && (
              <div className="watchlist-quick-picks" aria-label="Suggested singers to add">
                <span className="watchlist-quick-picks-label">Quick add:</span>
                {addSuggestions.map((sug) => (
                  <button
                    key={sug.label}
                    type="button"
                    className={`watchlist-quick-pick-chip ${sug.isRestore ? 'is-restore' : ''}`}
                    onClick={() => handleAppendSingers(sug.label, 'quick')}
                  >
                    {sug.isRestore ? <RotateCcw size={12} /> : <Plus size={12} />}
                    <span>{sug.label}</span>
                    <em>{sug.badge}</em>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="watchlist-stat-grid">
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{allSingers.length}</span>
              <span className="watchlist-stat-label">Singers Tracked</span>
            </div>
            <div className="watchlist-stat-tile is-accent">
              <span className="watchlist-stat-num">{upcomingWatchlistSessions.length}</span>
              <span className="watchlist-stat-label">Upcoming Ticket Sessions</span>
            </div>
            <div className="watchlist-stat-tile is-accent">
              <span className="watchlist-stat-num">{matchedWatchlistConcerts.length}</span>
              <span className="watchlist-stat-label">MEL &amp; SYD Concerts Live</span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{allSingers.length - mutedSet.size}</span>
              <span className="watchlist-stat-label">Auto-Drop Alerts On</span>
            </div>
          </div>
        </div>

        {/* City Priority Filter (Synced with Top Masthead Dropdown) */}
        <div className="city-tab-bar watchlist-city-tabs" role="tablist" aria-label="Filter sessions by city">
          <button
            type="button"
            role="tab"
            aria-selected={cityFilter === 'melbourne'}
            className={`city-tab ${cityFilter === 'melbourne' ? 'is-active' : ''}`}
            onClick={() => onChangeCityFilter('melbourne')}
          >
            <span>Melbourne · VIC</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cityFilter === 'sydney'}
            className={`city-tab ${cityFilter === 'sydney' ? 'is-active' : ''}`}
            onClick={() => onChangeCityFilter('sydney')}
          >
            <span>Sydney · NSW</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cityFilter === 'all'}
            className={`city-tab ${cityFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => onChangeCityFilter('all')}
          >
            <span>Both Cities</span>
          </button>
        </div>

        {/* Optional Upload / Paste Additional Singers Box */}
        {showUploadDrawer && (
          <div className="bulk-singer-box watchlist-upload-box">
            <div className="utility-panel-row">
              <div>
                <h2 className="panel-heading">Upload .txt / .csv List or Paste Additional Singers</h2>
                <p className="panel-subtext">
                  New singers are merged cleanly into your A–Z &amp; Chinese Artists sections without
                  duplicating existing entries or translating non-Chinese names.
                </p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  className="sr-only-input"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  <span>Choose .txt / .csv File</span>
                </button>
              </div>
            </div>

            <textarea
              className="announcement-textarea"
              rows={3}
              placeholder="Paste one singer per line or comma-separated…"
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
            />
            <div className="panel-actions">
              <button
                type="button"
                className="btn-primary-sm"
                onClick={() => handleAppendSingers(pasteInput)}
              >
                <Sparkles size={14} />
                <span>Add to My Dedicated Watchlist</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 1: DEDICATED TICKET-SALE SESSIONS & PRE-SALE QUEUES */}
      <section className="feature-section" aria-labelledby="watchlist-sessions-heading">
        <div className="section-header-row">
          <div>
            <span className="eyebrow-kicker">01 · Session Queue Alarms · Waiting Room T-15m</span>
            <h2 id="watchlist-sessions-heading" className="section-heading">
              Dedicated Ticket-Sale Sessions for Your Singers ({upcomingWatchlistSessions.length})
            </h2>
          </div>
          <span className="sync-caption">
            Direct verified show links — zero generic homepages.
          </span>
        </div>

        {upcomingWatchlistSessions.length === 0 ? (
          <div className="empty-box">
            <Clock size={22} />
            <p className="empty-title">No pending ticket-sale sessions under this city filter</p>
            <p className="empty-desc">
              Switch to <strong>Melbourne &amp; Sydney</strong> above or check the confirmed concerts
              and watched roster below.
            </p>
          </div>
        ) : (
          <div className="drop-strip">
            {upcomingWatchlistSessions.map(({ concert, drop, matchedSingers }) => {
              const cd = computeCountdown(drop.opensAtIso, nowMs);
              const rule15 = `${concert.id}::${drop.id}::15`;
              const rule60 = `${concert.id}::${drop.id}::60`;
              const armed15 = reminders.some((r) => r.id === rule15);
              const armed60 = reminders.some((r) => r.id === rule60);
              const resolvedUrl = sanitizeExternalHttpsUrl(drop.bookingUrl, concert.artist);
              const portal = describeTicketingPortal(resolvedUrl);

              const primaryArtist = matchedSingers[0] || concert.artist;
              const isSupporting =
                primaryArtist.toLowerCase() !== concert.artist.toLowerCase();
              const subtitleText = isSupporting
                ? `with ${concert.artist} · ${concert.venueName}`
                : `${concert.venueName} · ${concert.suburb}`;

              return (
                <article key={`${concert.id}-${drop.id}`} className="drop-card">
                  <div className="drop-card-top">
                    <div className="drop-card-badges">
                      <span className={`city-pill city-pill--${concert.city}`}>
                        {concert.city === 'melbourne' ? 'MEL' : 'SYD'}
                      </span>
                      <span className="presale-kind-badge">{drop.kind}</span>
                    </div>
                    <span className={`mono-countdown ${cd.isImminent ? 'is-urgent' : ''}`}>
                      {cd.compact}
                    </span>
                  </div>

                  <div className="drop-artist-row">
                    <ArtistAvatar name={primaryArtist} size="md" shape="rounded" />
                    <div className="drop-artist-meta">
                      <h3 className="drop-artist" title={matchedSingers.join(' · ')}>
                        {matchedSingers.join(' · ')}
                      </h3>
                      <p className="drop-artist-sub" title={subtitleText}>
                        {subtitleText}
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

                  <div className="drop-card-actions drop-card-actions--quad">
                    <button
                      type="button"
                      className={`btn-remind-chip ${armed15 ? 'is-armed' : ''}`}
                      onClick={() => onAddOrToggleReminder(concert, 15, drop)}
                    >
                      {armed15 ? <Check size={13} /> : <BellPlus size={13} />}
                      <span>{armed15 ? 'T-15m On' : 'Notify T-15m'}</span>
                    </button>

                    <button
                      type="button"
                      className={`btn-ghost-xs ${armed60 ? 'is-armed-btn' : ''}`}
                      onClick={() => onAddOrToggleReminder(concert, 60, drop)}
                    >
                      <span>{armed60 ? 'T-1h On' : '+1h Alert'}</span>
                    </button>

                    <a
                      href={buildGoogleCalendarDropUrl(concert, drop)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost-xs"
                    >
                      <Calendar size={12} />
                      <span>Google Cal</span>
                    </a>

                    <a
                      href={resolvedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost-xs"
                    >
                      <span>{portal}</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: CONFIRMED UPCOMING CONCERTS & SHOW-NIGHT SESSIONS FROM YOUR LIST */}
      <section className="feature-section" aria-labelledby="watchlist-concerts-heading">
        <div className="section-header-row">
          <div>
            <span className="eyebrow-kicker">
              02 · Confirmed Live Concerts · Melbourne Prioritized First
            </span>
            <h2 id="watchlist-concerts-heading" className="section-heading">
              Upcoming{' '}
              {cityFilter === 'melbourne'
                ? 'Melbourne'
                : cityFilter === 'sydney'
                  ? 'Sydney'
                  : 'Melbourne & Sydney'}{' '}
              Concerts From Your List ({matchedWatchlistConcerts.length})
            </h2>
          </div>
          <span className="sync-caption">
            {activeSingersCount} singer{activeSingersCount === 1 ? '' : 's'} from your list currently
            on the 2026–2027 AU slate
          </span>
        </div>

        {matchedWatchlistConcerts.length === 0 ? (
          <div className="empty-box">
            <Ticket size={22} />
            <p className="empty-title">No confirmed concerts match the selected city filter</p>
          </div>
        ) : (
          <div className="gig-grid">
            {matchedWatchlistConcerts.map(({ concert, matchedSingers }) => {
              const dateParts = formatConcertDate(concert.dateIso, concert.timeZone);
              const resaleGuard = computeResaleGuard(concert, nowMs);
              const doorsRule60 = `${concert.id}::doors::60`;
              const showDayRule = `${concert.id}::doors::1440`;
              const prodHoldRule = `${concert.id}::prod-hold-48h::15`;

              const isDoors60Armed = reminders.some((r) => r.id === doorsRule60);
              const isShowDayArmed = reminders.some((r) => r.id === showDayRule);
              const isProdArmed = reminders.some((r) => r.id === prodHoldRule);
              const ticketHref = sanitizeExternalHttpsUrl(concert.ticketUrl, concert.artist);
              const portal = describeTicketingPortal(ticketHref);

              return (
                <article key={concert.id} className="gig-card gig-card--watched">
                  <div className="gig-card-header">
                    <div className="gig-badge-group">
                      <span className={`city-pill city-pill--${concert.city}`}>
                        {concert.city === 'melbourne' ? 'MELBOURNE · VIC' : 'SYDNEY · NSW'}
                      </span>
                      <span className={`status-pill status-pill--${concert.status}`}>
                        {concert.status === 'presale-live'
                          ? 'Session Live'
                          : concert.status === 'presale-soon'
                            ? 'Session Upcoming'
                            : concert.status === 'selling-fast'
                              ? 'Selling Fast'
                              : 'On Sale'}
                      </span>
                    </div>
                    <span className="interstate-excl-pill">
                      Matched: {matchedSingers.join(', ')}
                    </span>
                  </div>

                  <ConcertMediaBanner
                    artist={concert.artist}
                    tourTitle={concert.tourTitle}
                    supportActs={concert.supportActs}
                  />

                  <div className="gig-logistics">
                    <div className="logistics-row">
                      <Calendar size={15} className="logistics-icon" />
                      <div>
                        <strong className="logistics-primary">{dateParts.fullLabel}</strong>
                        {concert.additionalDates && concert.additionalDates.length > 0 && (
                          <span className="multi-night-badge">
                            +{concert.additionalDates.length} more session
                            {concert.additionalDates.length === 1 ? '' : 's'} (
                            {concert.additionalDates.join(', ')})
                          </span>
                        )}
                        <div className="logistics-sub">
                          <Clock size={12} /> Doors{' '}
                          {formatAuTime24To12(
                            concert.doorsTimeLocal,
                            concert.dateIso,
                            concert.timeZone,
                          )}{' '}
                          · Main Set {concert.setTimeLocal}
                        </div>
                      </div>
                    </div>

                    <div className="logistics-row">
                      <MapPin size={15} className="logistics-icon" />
                      <div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${concert.venueName} ${concert.suburb}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="venue-map-link"
                        >
                          <strong>{concert.venueName}</strong> · {concert.suburb}
                        </a>
                      </div>
                    </div>
                  </div>

                  <p className="gig-editorial-note">{concert.editorialNote}</p>

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

                  {/* Dedicated Session & Show-Night Reminder Buttons */}
                  <div className="watchlist-session-pill-bar">
                    <button
                      type="button"
                      className={`mini-arm-btn ${isShowDayArmed ? 'is-armed' : ''}`}
                      onClick={() => onAddOrToggleReminder(concert, 1440)}
                    >
                      {isShowDayArmed ? '✓ 24h Show Alert' : '+24h Show Alert'}
                    </button>

                    <button
                      type="button"
                      className={`mini-arm-btn ${isDoors60Armed ? 'is-armed' : ''}`}
                      onClick={() => onAddOrToggleReminder(concert, 60)}
                    >
                      {isDoors60Armed ? '✓ 1h Doors Alert' : '+1h Doors Alert'}
                    </button>

                    {resaleGuard.productionHoldFuture && (
                      <button
                        type="button"
                        className={`mini-arm-btn ${isProdArmed ? 'is-armed' : ''}`}
                        onClick={() =>
                          onAddOrToggleReminder(concert, 15, undefined, {
                            ruleSuffix: 'prod-hold-48h',
                            targetType: 'production-hold',
                            targetLabel: 'T-48h Production-Hold Release Session',
                            targetIso: resaleGuard.productionHoldIso,
                            ticketUrl: ticketHref,
                          })
                        }
                      >
                        {isProdArmed ? '✓ T-48h Sniper' : '+T-48h Hold Sniper'}
                      </button>
                    )}

                    <a
                      href={buildGoogleCalendarShowUrl(concert)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mini-arm-btn"
                    >
                      +Google Cal ↗
                    </a>
                  </div>

                  <div className="gig-card-footer">
                    <div className="price-block">
                      <span className="price-aud">
                        {formatAudRange(concert.priceMinAud, concert.priceMaxAud)}
                      </span>
                      <span className="agency-caption">via {concert.agency}</span>
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
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <a
                        href={ticketHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary-sm"
                      >
                        <Ticket size={14} />
                        <span>{portal}</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* NEARBY ASIA-PACIFIC SHORT-FLIGHT GIG RADAR FOR YOUR SINGERS */}
      <ApacRadarSection
        cityFilter={cityFilter}
        reminders={reminders}
        onToggleApacReminder={onToggleApacReminder}
      />

      {/* SECTION 4: FULL 275+ UPLOADED SINGERS ROSTER (A-Z + CHINESE ARTISTS) */}
      <section className="feature-section" aria-labelledby="watchlist-roster-heading">
        <div className="section-header-row">
          <div>
            <span className="eyebrow-kicker">
              03 · Complete Uploaded Singer Directory · A–Z &amp; Chinese Artists
            </span>
            <h2 id="watchlist-roster-heading" className="section-heading">
              All Monitored Singers in Your Watchlist ({filteredRoster.length} of {allSingers.length})
            </h2>
          </div>
          <span className="sync-caption">
            Auto-alerts fire the moment any watched singer announces a Melbourne or Sydney session.
          </span>
        </div>

        <div className="watchlist-roster-controls">
          <div className="watchlist-roster-top-bar">
            <div className="search-field-wrap">
              <Search size={16} className="search-icon" />
              <input
                type="search"
                id="watchlist-roster-search-input"
                className="search-input"
                placeholder={`Filter your ${allSingers.length} singers (e.g. Gracie Abrams, bbno$, FKJ, 袁娅维, 橘子海)…`}
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
              />
            </div>

            <div className="watchlist-roster-actions">
              <button
                type="button"
                className="btn-primary-sm"
                onClick={() => {
                  addSingerInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  window.setTimeout(() => addSingerInputRef.current?.focus(), 220);
                }}
              >
                <Plus size={14} />
                <span>Add New Singer</span>
              </button>

              {removedBuiltInSingers.length > 0 && (
                <button
                  type="button"
                  id="toggle-removed-singers-btn"
                  className={`btn-outline-sm ${showRemovedTray ? 'is-active' : ''}`}
                  onClick={() => setShowRemovedTray((v) => !v)}
                >
                  <RotateCcw size={14} />
                  <span>Removed ({removedBuiltInSingers.length})</span>
                </button>
              )}
            </div>
          </div>

          {showRemovedTray && removedBuiltInSingers.length > 0 && (
            <div className="watchlist-removed-drawer" aria-label="Removed singers you can restore">
              <div className="watchlist-removed-header">
                <span>
                  Removed from your roster ({removedBuiltInSingers.length}) — click any singer to
                  restore them:
                </span>
                <button
                  type="button"
                  className="btn-ghost-xs"
                  onClick={handleRestoreAllRemoved}
                >
                  <RotateCcw size={12} />
                  <span>Restore All</span>
                </button>
              </div>
              <div className="watchlist-removed-chips">
                {removedBuiltInSingers.map((rem) => (
                  <button
                    key={rem.id}
                    type="button"
                    className="watchlist-removed-chip"
                    onClick={() => handleRestoreSinger(rem)}
                    title={`Restore ${rem.displayName} to My Singers`}
                  >
                    <RotateCcw size={12} />
                    <span>{rem.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="genre-pill-row" role="tablist" aria-label="Singer alphabetical groups">
            <button
              type="button"
              role="tab"
              aria-selected={groupFilter === 'all'}
              className={`genre-pill ${groupFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setGroupFilter('all')}
            >
              All ({allSingers.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={groupFilter === 'active-au'}
              className={`genre-pill ${groupFilter === 'active-au' ? 'is-active' : ''}`}
              onClick={() => setGroupFilter('active-au')}
            >
              Touring{' '}
              {cityFilter === 'melbourne'
                ? 'MEL'
                : cityFilter === 'sydney'
                  ? 'SYD'
                  : 'MEL/SYD'}{' '}
              ({activeSingersCount})
            </button>
            {WATCHLIST_GROUPS.map((grp) => {
              const count = allSingers.filter((s) => s.group === grp).length;
              return (
                <button
                  key={grp}
                  type="button"
                  role="tab"
                  aria-selected={groupFilter === grp}
                  className={`genre-pill ${groupFilter === grp ? 'is-active' : ''}`}
                  onClick={() => setGroupFilter(grp)}
                >
                  {grp} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {filteredRoster.length === 0 ? (
          <div className="empty-box">
            <Radio size={22} />
            <p className="empty-title">
              {rosterSearch.trim()
                ? `"${rosterSearch.trim()}" is not in My Singers yet`
                : 'No singers under this filter'}
            </p>
            <div className="empty-box-actions">
              {rosterSearch.trim().length >= 2 && (
                <button
                  type="button"
                  className="btn-primary-sm"
                  onClick={() => {
                    handleAppendSingers(rosterSearch.trim(), 'none');
                    setGroupFilter('all');
                  }}
                >
                  <Plus size={14} />
                  <span>Add &ldquo;{rosterSearch.trim()}&rdquo; to My Singers</span>
                </button>
              )}
              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => {
                  setGroupFilter('all');
                  setRosterSearch('');
                }}
              >
                Reset Roster Filter
              </button>
            </div>
          </div>
        ) : (
          <div className="watchlist-directory-grid">
            {filteredRoster.map((singer) => {
              const m = singerMatches.get(singer.id);
              const matchedShows = m?.concerts || [];
              const matchedFests = m?.festivals || [];
              const isTouring = matchedShows.length > 0 || matchedFests.length > 0;
              const isMuted = mutedSet.has(singer.id);

              const primarySearchName = singer.matchTerms[0] || singer.displayName;
              const qEnc = encodeURIComponent(primarySearchName);
              const festStopsCount = matchedFests.reduce(
                (acc, fe) =>
                  acc +
                  ((fe.stops || []).filter((st) => cityFilter === 'all' || st.city === cityFilter)
                    .length || 1),
                0,
              );
              const cityBadgeCode =
                cityFilter === 'melbourne'
                  ? 'MEL'
                  : cityFilter === 'sydney'
                    ? 'SYD'
                    : 'MEL/SYD';
              const directOrResaleTicketek =
                matchedShows[0]?.ticketUrl ||
                matchedFests[0]?.ticketUrl ||
                `https://marketplace.ticketek.com.au/purchase/searchlist?keyword=${qEnc}`;

              return (
                <article
                  key={singer.id}
                  className={`watchlist-singer-tile ${isTouring ? 'is-touring' : ''}`}
                >
                  <div className="watchlist-tile-header">
                    <ArtistAvatar name={singer.displayName} size="lg" shape="rounded" />
                    <div className="watchlist-title-col">
                      <span className="watchlist-group-tag">{singer.group}</span>
                      <h3 className="watchlist-singer-name" title={singer.displayName}>
                        {singer.displayName}
                      </h3>
                      <span
                        className={`monitor-status-badge ${
                          isTouring
                            ? 'badge-announced'
                            : isMuted
                              ? 'badge-muted'
                              : 'badge-watching'
                        }`}
                      >
                        {isTouring
                          ? `Confirmed (${matchedShows.length + festStopsCount} ${cityBadgeCode})`
                          : isMuted
                            ? 'Alert Muted'
                            : 'Watching 2027'}
                      </span>
                    </div>

                    <div className="reminder-item-actions">
                      <button
                        type="button"
                        className={`icon-btn ${!isMuted ? 'is-bell-on' : ''}`}
                        onClick={() => toggleMuteSinger(singer)}
                        title={
                          isMuted
                            ? 'Click to enable session & tour drop alerts'
                            : 'Session & tour drop alert on (click to mute)'
                        }
                        aria-label={`Toggle alert for ${singer.displayName}`}
                      >
                        {isMuted ? <BellOff size={14} /> : <Bell size={14} />}
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        onClick={() => handleRemoveSinger(singer)}
                        title={`Remove ${singer.displayName} from My Singers`}
                        aria-label={`Remove ${singer.displayName} from My Singers`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {isTouring && (
                    <div className="watchlist-mini-dates">
                      {matchedShows.map((sh) => (
                        <div key={sh.id} className="monitored-match-line">
                          <span className={`city-pill city-pill--${sh.city}`}>
                            {sh.city === 'melbourne' ? 'MEL' : 'SYD'}
                          </span>
                          <span>
                            {sh.venueName} · {sh.dateIso}
                          </span>
                        </div>
                      ))}
                      {matchedFests.flatMap((fe) =>
                        [...(fe.stops || [])]
                          .filter((st) => cityFilter === 'all' || st.city === cityFilter)
                          .sort((a, b) => (a.city === b.city ? 0 : a.city === 'melbourne' ? -1 : 1))
                          .map((st) => (
                            <div key={`${fe.id}-${st.city}`} className="monitored-match-line">
                              <span className={`city-pill city-pill--${st.city}`}>
                                {st.city === 'melbourne' ? 'MEL' : 'SYD'}
                              </span>
                              <span>
                                {fe.name} · {st.dateIso}
                              </span>
                            </div>
                          )),
                      )}
                    </div>
                  )}

                  {singer.tourContextNote && (
                    <p className="watchlist-context-note">{singer.tourContextNote}</p>
                  )}

                  <div className="au-platform-links">
                    <a
                      href={sanitizeExternalHttpsUrl(directOrResaleTicketek, primarySearchName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      {isTouring ? 'Show Page' : 'Ticketek'} <ExternalLink size={10} />
                    </a>
                    <a
                      href={`https://www.ticketmaster.com.au/search?q=${qEnc}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Ticketmaster <ExternalLink size={10} />
                    </a>
                    <a
                      href={`https://www.livenation.com.au/search?keyword=${qEnc}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Live Nation <ExternalLink size={10} />
                    </a>
                    <a
                      href={`https://tixel.com/au/discover/tickets?q=${qEnc}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Tixel <ExternalLink size={10} />
                    </a>
                    <a
                      href={`https://open.spotify.com/search/${qEnc}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Spotify <ExternalLink size={10} />
                    </a>
                    <a
                      href={`https://www.setlist.fm/search?query=${qEnc}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Setlist.fm <ExternalLink size={10} />
                    </a>
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
