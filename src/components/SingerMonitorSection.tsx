import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  ExternalLink,
  ListPlus,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  ArtistSearchProfile,
  CityId,
  ConcertEvent,
  MonitoredSinger,
  PresetSinger,
  SingerMonitorCheckResult,
} from '../types/gig';
import { sanitizeExternalHttpsUrl } from '../utils/formatters';
import { ArtistAvatar } from './ArtistAvatar';
import { IS_STATIC_MODE } from '../config/runtimeMode';
import { UPLOADED_WATCHLIST_SINGERS } from '../data/userSingerList';

interface SingerMonitorSectionProps {
  monitoredSingers: MonitoredSinger[];
  presetSingers: PresetSinger[];
  concerts: ConcertEvent[];
  cityFilter: 'all' | CityId;
  monitorResults: Record<string, SingerMonitorCheckResult>;
  lastCheckedIso: string | null;
  checkingRadar: boolean;
  onRunMonitorScan: (refreshFeed?: boolean) => void;
  onAddOrToggleSinger: (singer: {
    name: string;
    aliases?: string[];
    genre?: string;
    artworkUrl?: string;
  }) => void;
  onBulkAddSingers: (rawListText: string) => void;
  onToggleNotifySinger: (name: string) => void;
  onRemoveSinger: (name: string) => void;
  onJumpToArtistConcerts: (artistName: string) => void;
}

const CATEGORIES: Array<PresetSinger['category']> = [
  'Global Pop',
  'Mandopop & Cantopop',
  'K-Pop & J-Pop',
  'Indie, Rock & Electronic',
];

export const SingerMonitorSection: React.FC<SingerMonitorSectionProps> = ({
  monitoredSingers,
  presetSingers,
  concerts,
  cityFilter,
  monitorResults,
  lastCheckedIso,
  checkingRadar,
  onRunMonitorScan,
  onAddOrToggleSinger,
  onBulkAddSingers,
  onToggleNotifySinger,
  onRemoveSinger,
  onJumpToArtistConcerts,
}) => {
  const cityCodeLabel =
    cityFilter === 'melbourne' ? 'MEL' : cityFilter === 'sydney' ? 'SYD' : 'AU';
  const cityHeadingLabel =
    cityFilter === 'melbourne'
      ? 'Melbourne'
      : cityFilter === 'sydney'
        ? 'Sydney'
        : 'Melbourne / Sydney';
  const [activeCategory, setActiveCategory] = useState<PresetSinger['category']>('Mandopop & Cantopop');
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ArtistSearchProfile[] | null>(null);
  const [showBulkBox, setShowBulkBox] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const isMonitored = (name: string) =>
    monitoredSingers.some((s) => s.name.toLowerCase() === name.toLowerCase());

  const buildLocalSearchProfiles = (q: string): ArtistSearchProfile[] => {
    const qLower = q.toLowerCase();
    const seen = new Set<string>();
    const results: ArtistSearchProfile[] = [];

    const makeLinks = (artistName: string) => ({
      ticketek: `https://marketplace.ticketek.com.au/purchase/searchlist?keyword=${encodeURIComponent(artistName)}`,
      ticketmaster: `https://www.ticketmaster.com.au/search?q=${encodeURIComponent(artistName)}`,
      frontier: `https://www.livenation.com.au/search?keyword=${encodeURIComponent(artistName)}`,
      livenation: `https://www.livenation.com.au/search?keyword=${encodeURIComponent(artistName)}`,
      tixel: `https://tixel.com/au/discover/tickets?q=${encodeURIComponent(artistName)}`,
    });

    const addProfile = (name: string, aliases: string[], genre: string, origin = '') => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      const matched = concerts.filter((c) =>
        [c.artist, ...c.supportActs].some((act) => act.toLowerCase().includes(key)),
      );
      const matchedCities = Array.from(new Set(matched.map((c) => c.city)));
      results.push({
        name,
        aliases,
        genre,
        origin,
        artworkUrl: '',
        upcomingAuCount: matched.length,
        matchedCities,
        auLinks: makeLinks(name),
      });
    };

    for (const p of presetSingers) {
      if (
        p.name.toLowerCase().includes(qLower) ||
        p.aliases.some((al) => al.toLowerCase().includes(qLower))
      ) {
        addProfile(p.name, p.aliases, p.genre, p.origin);
      }
    }
    for (const w of UPLOADED_WATCHLIST_SINGERS) {
      if (
        w.displayName.toLowerCase().includes(qLower) ||
        w.matchTerms.some((t) => t.toLowerCase().includes(qLower))
      ) {
        addProfile(w.displayName, w.matchTerms.slice(1), w.group);
      }
    }
    for (const c of concerts) {
      if (c.artist.toLowerCase().includes(qLower)) {
        addProfile(c.artist, [], c.genres[0] || 'Touring AU');
      }
    }
    if (results.length === 0) {
      addProfile(q.slice(0, 60), [], 'Custom Monitored Singer');
    }
    return results.slice(0, 8);
  };

  const handleLiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;
    if (IS_STATIC_MODE) {
      setSearchResults(buildLocalSearchProfiles(q));
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.profiles || []);
      } else {
        setSearchResults(buildLocalSearchProfiles(q));
      }
    } catch {
      setSearchResults(buildLocalSearchProfiles(q));
    } finally {
      setSearching(false);
    }
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    onBulkAddSingers(bulkText);
    setBulkText('');
    setShowBulkBox(false);
  };

  const categoryPresets = presetSingers.filter((p) => p.category === activeCategory);

  const countDirectMatches = (preset: PresetSinger) => {
    const terms = [preset.name, ...preset.aliases]
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length >= 2);
    return concerts.filter((c) => {
      const acts = [c.artist, ...c.supportActs].map((a) =>
        a.replace(/\s*\[[^\]]*\]|\s*\([^)]*\)/g, '').trim().toLowerCase(),
      );
      return terms.some((t) =>
        acts.some((act) => {
          if (act === t) return true;
          if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t)) return act.includes(t);
          const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(act);
        }),
      );
    }).length;
  };

  return (
    <section
      id="singers-monitor"
      className="feature-section singer-monitor-section"
      aria-labelledby="singer-monitor-heading"
    >
      <div className="section-header-row">
        <div>
          <span className="eyebrow-kicker">
            01 · Favourite Singers Radar · Apple Music AU + MusicBrainz Bilingual Monitor
          </span>
          <h2 id="singer-monitor-heading" className="section-heading">
            Select &amp; Monitor Favourite Singers for {cityHeadingLabel} Announcements
          </h2>
        </div>

        <div className="header-cta-group">
          <button
            type="button"
            id="toggle-bulk-singer-paste-btn"
            className="btn-outline-sm"
            onClick={() => setShowBulkBox((v) => !v)}
          >
            <ListPlus size={14} />
            <span>{showBulkBox ? 'Hide Bulk List' : 'Paste My Singer List'}</span>
          </button>

          <button
            type="button"
            id="scan-monitored-singers-btn"
            className="btn-primary-sm"
            onClick={() => onRunMonitorScan(true)}
            disabled={checkingRadar}
          >
            <RefreshCw size={14} className={checkingRadar ? 'spin-icon' : ''} />
            <span>{checkingRadar ? 'Scanning AU Radar…' : 'Check AU Announcements Now'}</span>
          </button>
        </div>
      </div>

      <p className="section-sublead">
        Pick favourite singers below, paste your own list, or search any artist worldwide (supports
        English, Chinese <code>周杰伦 / 陈奕迅</code>, Japanese <code>藤井風</code>, and Korean names).
        Monitored artists automatically trigger browser &amp; chime alerts as soon as a Sydney or
        Melbourne tour date lands.
      </p>

      {/* Bulk Singer List Importer */}
      {showBulkBox && (
        <form className="bulk-singer-box" onSubmit={handleBulkSubmit}>
          <label htmlFor="bulk-singer-textarea" className="panel-heading">
            Paste Your Favourite Singers List (comma, slash, or line-separated)
          </label>
          <textarea
            id="bulk-singer-textarea"
            className="announcement-textarea"
            rows={3}
            placeholder="e.g. Jay Chou 周杰伦, Eason Chan, Olivia Rodrigo, Taylor Swift, Fujii Kaze, Oasis, G.E.M., Tame Impala"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="panel-actions">
            <button type="submit" id="submit-bulk-singers-btn" className="btn-primary-sm">
              <Sparkles size={14} />
              <span>Monitor All &amp; Turn On Alerts</span>
            </button>
          </div>
        </form>
      )}

      {/* Future Singer Discovery Search Bar */}
      <div className="singer-search-card">
        <form className="singer-search-form" onSubmit={(e) => void handleLiveSearch(e)}>
          <div className="search-field-wrap">
            <Search size={16} className="search-icon" />
            <input
              type="search"
              id="global-singer-search-input"
              className="search-input"
              placeholder="Search any new singer or band (e.g., Eason Chan, 陈奕迅, Sabrina Carpenter, Fujii Kaze, Turnstile)…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="submit"
            id="global-singer-search-btn"
            className="btn-primary-sm"
            disabled={searching || !searchTerm.trim()}
          >
            <Search size={14} />
            <span>{searching ? 'Searching…' : 'Search Artist'}</span>
          </button>
          {searchResults !== null && (
            <button
              type="button"
              className="btn-ghost-xs"
              onClick={() => {
                setSearchResults(null);
                setSearchTerm('');
              }}
            >
              Clear
            </button>
          )}
        </form>

        {searchResults && (
          <div className="live-artist-results">
            {searchResults.length === 0 ? (
              <p className="panel-subtext">No profiles returned — try another spelling.</p>
            ) : (
              <div className="artist-result-grid">
                {searchResults.map((prof) => {
                  const following = isMonitored(prof.name);
                  const scopedShowCount = countDirectMatches({
                    name: prof.name,
                    aliases: prof.aliases,
                    category: 'Global Pop',
                    genre: prof.genre,
                    origin: prof.origin,
                  });
                  const badgeLoc =
                    cityCodeLabel === 'AU' ? 'MEL/SYD' : cityCodeLabel;
                  return (
                    <div key={prof.name} className="artist-search-tile">
                      <div className="artist-tile-head">
                        <ArtistAvatar
                          name={prof.name}
                          explicitUrl={prof.artworkUrl}
                          size="md"
                          shape="rounded"
                        />
                        <div className="artist-tile-meta">
                          <strong>{prof.name}</strong>
                          {prof.aliases.length > 0 && (
                            <span className="alias-line">{prof.aliases.slice(0, 3).join(' · ')}</span>
                          )}
                          <span className="genre-origin-line">
                            {prof.genre}
                            {prof.origin ? ` · ${prof.origin}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="artist-tile-foot">
                        <span
                          className={`au-count-pill ${scopedShowCount > 0 ? 'has-shows' : ''}`}
                        >
                          {scopedShowCount > 0
                            ? `${scopedShowCount} ${badgeLoc} show${scopedShowCount === 1 ? '' : 's'} live!`
                            : `No ${badgeLoc} date yet`}
                        </span>

                        <button
                          type="button"
                          className={`btn-remind-chip ${following ? 'is-armed' : ''}`}
                          onClick={() =>
                            onAddOrToggleSinger({
                              name: prof.name,
                              aliases: prof.aliases,
                              genre: prof.genre,
                              artworkUrl: prof.artworkUrl,
                            })
                          }
                        >
                          {following ? <Check size={13} /> : <Plus size={13} />}
                          <span>{following ? 'Monitoring' : 'Monitor & Alert'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick-Select Favourite Singers by Category */}
      <div className="preset-picker-block">
        <div className="category-tabs" role="tablist" aria-label="Singer categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat}
              className={`genre-pill ${activeCategory === cat ? 'is-active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="chip-cloud">
          {categoryPresets.map((p) => {
            const active = isMonitored(p.name);
            const showCount = countDirectMatches(p);
            const nativeMandopopLabel =
              p.category === 'Mandopop & Cantopop' && p.aliases[0] ? ` (${p.aliases[0]})` : '';
            return (
              <button
                key={p.name}
                type="button"
                className={`artist-chip ${active ? 'is-active' : ''}`}
                onClick={() =>
                  onAddOrToggleSinger({
                    name: p.name,
                    aliases: p.aliases,
                    genre: p.genre,
                  })
                }
              >
                <ArtistAvatar name={p.name} size="xs" shape="circle" />
                {active ? <Check size={12} /> : <Plus size={12} />}
                <span>
                  {p.name}
                  {nativeMandopopLabel}
                </span>
                {showCount > 0 && (
                  <span className="chip-badge">
                    {showCount} {cityCodeLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Monitored Singers Radar Grid */}
      <div className="monitored-radar-board">
        <div className="utility-panel-row">
          <h3 className="panel-heading">
            Your Monitored Singers &amp; Announcement Alerts ({monitoredSingers.length})
          </h3>
          {lastCheckedIso && (
            <span className="sync-source-label">
              Last radar sweep:{' '}
              {new Intl.DateTimeFormat('en-AU', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
                timeZone: 'Australia/Sydney',
              }).format(new Date(lastCheckedIso))}
            </span>
          )}
        </div>

        {monitoredSingers.length === 0 ? (
          <div className="empty-box">
            <Radio size={22} />
            <p className="empty-title">No singers in your radar yet</p>
            <p className="empty-desc">
              Click any singer chip above, paste your list, or search above to start automatic
              Sydney &amp; Melbourne tour announcement monitoring.
            </p>
          </div>
        ) : (
          <div className="monitored-cards-grid">
            {monitoredSingers.map((singer) => {
              const check = monitorResults[singer.name.toLowerCase()];
              const matchedSummaries = (check?.matchedConcertsSummary || []).filter(
                (m) => cityFilter === 'all' || m.city === cityFilter,
              );
              const hasAnnounced = matchedSummaries.length > 0;
              const hasNews = (check?.breakingHeadlines?.length || 0) > 0;

              const qEnc = encodeURIComponent(singer.name);
              const links = check?.auLinks || {
                ticketek: `https://marketplace.ticketek.com.au/purchase/searchlist?keyword=${qEnc}`,
                ticketmaster: `https://www.ticketmaster.com.au/search?q=${qEnc}`,
                frontier: `https://www.livenation.com.au/search?keyword=${qEnc}`,
                livenation: `https://www.livenation.com.au/search?keyword=${qEnc}`,
                tixel: `https://tixel.com/au/discover/tickets?q=${qEnc}`,
              };

              return (
                <article
                  key={singer.name}
                  className={`monitored-singer-card ${hasAnnounced ? 'is-announced' : ''}`}
                >
                  <div className="monitored-card-top">
                    <div className="monitored-identity-row">
                      <ArtistAvatar
                        name={singer.name}
                        explicitUrl={singer.artworkUrl}
                        size="lg"
                        shape="rounded"
                      />
                      <div>
                        <div className="monitored-title-line">
                          <strong className="monitored-name">{singer.name}</strong>
                          {singer.genre?.includes('Mandopop') && singer.aliases[0] && (
                            <span className="monitored-alias">{singer.aliases[0]}</span>
                          )}
                        </div>
                        <span
                          className={`monitor-status-badge ${
                            hasAnnounced
                              ? 'badge-announced'
                              : hasNews
                                ? 'badge-rumour'
                                : 'badge-watching'
                          }`}
                        >
                          {hasAnnounced
                            ? `Announced (${matchedSummaries.length} ${cityCodeLabel === 'AU' ? 'MEL/SYD' : cityCodeLabel} ${matchedSummaries.length === 1 ? 'show' : 'shows'})`
                            : hasNews
                              ? 'Spotted in AU Tour Press!'
                              : singer.notifyOnAnnounce
                                ? `Watching ${cityCodeLabel} Radar · Auto-Alert ON`
                                : `Watching ${cityCodeLabel} Radar (Muted)`}
                        </span>
                      </div>
                    </div>

                    <div className="reminder-item-actions">
                      <button
                        type="button"
                        className={`icon-btn ${singer.notifyOnAnnounce ? 'is-bell-on' : ''}`}
                        onClick={() => onToggleNotifySinger(singer.name)}
                        title={
                          singer.notifyOnAnnounce
                            ? 'Announcement alert on (click to mute)'
                            : 'Click to turn on announcement alert'
                        }
                        aria-label={`Toggle announcement reminder for ${singer.name}`}
                      >
                        {singer.notifyOnAnnounce ? <Bell size={15} /> : <BellOff size={15} />}
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        onClick={() => onRemoveSinger(singer.name)}
                        aria-label={`Stop monitoring ${singer.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {hasAnnounced ? (
                    <div className="monitored-matches-box">
                      {matchedSummaries.slice(0, 2).map((m) => (
                        <div key={m.id} className="monitored-match-line">
                          <span className={`city-pill city-pill--${m.city}`}>
                            {m.city === 'sydney' ? 'SYD' : 'MEL'}
                          </span>
                          <span>
                            {m.venueName} · {m.dateIso}
                          </span>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-link-btn"
                        onClick={() => onJumpToArtistConcerts(singer.name)}
                      >
                        View show card &amp; pre-sale countdowns ↓
                      </button>
                    </div>
                  ) : (
                    <p className="monitored-waiting-note">
                      {check?.radarNote ||
                        singer.radarNote ||
                        'No Sydney or Melbourne dates on sale yet — scanning Ticketmaster AU, promoter wires & tour press automatically.'}
                    </p>
                  )}

                  {/* 1-Click Direct Australian Promoter & Ticketing Search Shortcuts */}
                  <div className="au-platform-links">
                    <a
                      href={sanitizeExternalHttpsUrl(links.ticketek, singer.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      {hasAnnounced ? 'Direct Show' : 'Ticketek'} <ExternalLink size={10} />
                    </a>
                    <a
                      href={sanitizeExternalHttpsUrl(links.ticketmaster, singer.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Ticketmaster <ExternalLink size={10} />
                    </a>
                    <a
                      href={sanitizeExternalHttpsUrl(links.livenation || links.frontier, singer.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Live Nation <ExternalLink size={10} />
                    </a>
                    <a
                      href={sanitizeExternalHttpsUrl(links.tixel, singer.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Tixel Waitlist <ExternalLink size={10} />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
