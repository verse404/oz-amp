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
import { useLocale } from '../i18n/LocaleContext';

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
  'Indie, Rock & Electronic',
  'Mandopop & Cantopop',
  'K-Pop & J-Pop',
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
  const { intlLocale, isZh, tr, cityLabel, genreLabel } = useLocale();
  const cityCodeLabel =
    cityFilter === 'melbourne'
      ? cityLabel('melbourne', 'short')
      : cityFilter === 'sydney'
        ? cityLabel('sydney', 'short')
        : tr('AU', '澳洲');
  const cityHeadingLabel =
    cityFilter === 'melbourne'
      ? cityLabel('melbourne')
      : cityFilter === 'sydney'
        ? cityLabel('sydney')
        : tr('Melbourne / Sydney', '墨尔本 / 悉尼');
  const [activeCategory, setActiveCategory] = useState<PresetSinger['category']>('Global Pop');
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
            {tr(
              '01 · Favourite Singers Radar · Apple Music AU + MusicBrainz Bilingual Monitor',
              '01 · 喜爱歌手雷达 · Apple Music AU + MusicBrainz 中英双语监控',
            )}
          </span>
          <h2 id="singer-monitor-heading" className="section-heading">
            {isZh
              ? `选择并关注喜爱的歌手，第一时间获取${cityHeadingLabel}巡演官宣`
              : `Select & Monitor Favourite Singers for ${cityHeadingLabel} Announcements`}
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
            <span>
              {showBulkBox
                ? tr('Hide Bulk List', '收起批量导入')
                : tr('Paste My Singer List', '批量粘贴歌手名单')}
            </span>
          </button>

          <button
            type="button"
            id="scan-monitored-singers-btn"
            className="btn-primary-sm"
            onClick={() => onRunMonitorScan(true)}
            disabled={checkingRadar}
          >
            <RefreshCw size={14} className={checkingRadar ? 'spin-icon' : ''} />
            <span>
              {checkingRadar
                ? tr('Scanning AU Radar…', '正在扫描澳洲巡演…')
                : tr('Check AU Announcements Now', '立即检查澳洲巡演动态')}
            </span>
          </button>
        </div>
      </div>

      <p className="section-sublead">
        {isZh ? (
          <>
            点击下方喜爱的歌手、批量粘贴歌单，或搜索全球任意艺人（支持英文、中文{' '}
            <code>周杰伦 / 陈奕迅</code>、日文 <code>藤井風</code> 与韩文）。一旦墨尔本或悉尼官宣巡演，将自动触发浏览器与铃声提醒。
          </>
        ) : (
          <>
            Pick favourite singers below, paste your own list, or search any artist worldwide
            (supports English, Chinese <code>周杰伦 / 陈奕迅</code>, Japanese <code>藤井風</code>,
            and Korean names). Monitored artists automatically trigger browser &amp; chime alerts as
            soon as a Sydney or Melbourne tour date lands.
          </>
        )}
      </p>

      {/* Bulk Singer List Importer */}
      {showBulkBox && (
        <form className="bulk-singer-box" onSubmit={handleBulkSubmit}>
          <label htmlFor="bulk-singer-textarea" className="panel-heading">
            {tr(
              'Paste Your Favourite Singers List (comma, slash, or line-separated)',
              '粘贴您喜爱的歌手名单（支持逗号、斜杠或换行分隔）',
            )}
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
              <span>{tr('Monitor All & Turn On Alerts', '全部加入关注并开启提醒')}</span>
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
              placeholder={tr(
                'Search any new singer or band (e.g., Eason Chan, 陈奕迅, Sabrina Carpenter, Fujii Kaze, Turnstile)…',
                '搜索任意新歌手或乐队（如：陈奕迅、周杰伦、Sabrina Carpenter、藤井風）…',
              )}
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
            <span>
              {searching ? tr('Searching…', '搜索中…') : tr('Search Artist', '搜索歌手')}
            </span>
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
              {tr('Clear', '清除')}
            </button>
          )}
        </form>

        {searchResults && (
          <div className="live-artist-results">
            {searchResults.length === 0 ? (
              <p className="panel-subtext">
                {tr('No profiles returned — try another spelling.', '未找到相关艺人，请尝试其他拼写。')}
              </p>
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
                    cityFilter === 'all' ? cityLabel('all', 'short') : cityCodeLabel;
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
                            ? isZh
                              ? `${badgeLoc} ${scopedShowCount} 场演出进行中`
                              : `${scopedShowCount} ${badgeLoc} show${scopedShowCount === 1 ? '' : 's'} live!`
                            : isZh
                              ? `暂无${badgeLoc}场次`
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
                          <span>
                            {following
                              ? tr('Monitoring', '已关注')
                              : tr('Monitor & Alert', '关注并提醒')}
                          </span>
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
        <div className="category-tabs" role="tablist" aria-label={tr('Singer categories', '歌手分类')}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat}
              className={`genre-pill ${activeCategory === cat ? 'is-active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {genreLabel(cat)}
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
            {tr(
              `Your Monitored Singers & Announcement Alerts (${monitoredSingers.length})`,
              `我关注的雷达歌手与官宣提醒 (${monitoredSingers.length})`,
            )}
          </h3>
          {lastCheckedIso && (
            <span className="sync-source-label">
              {tr('Last radar sweep:', '上次扫描:')}{' '}
              {new Intl.DateTimeFormat(intlLocale, {
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
            <p className="empty-title">
              {tr('No singers in your radar yet', '雷达中暂无关注歌手')}
            </p>
            <p className="empty-desc">
              {tr(
                'Click any singer chip above, paste your list, or search above to start automatic Sydney & Melbourne tour announcement monitoring.',
                '点击上方任意歌手标签、批量粘贴或搜索歌手，即可自动监控墨尔本与悉尼的巡演官宣。',
              )}
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
                            ? isZh
                              ? `已官宣 (${matchedSummaries.length} 场${cityFilter === 'all' ? '墨/悉' : cityCodeLabel})`
                              : `Announced (${matchedSummaries.length} ${cityFilter === 'all' ? 'MEL/SYD' : cityCodeLabel} ${matchedSummaries.length === 1 ? 'show' : 'shows'})`
                            : hasNews
                              ? tr('Spotted in AU Tour Press!', '澳洲巡演媒体已报道！')
                              : singer.notifyOnAnnounce
                                ? isZh
                                  ? `正在监控${cityCodeLabel} · 自动提醒已开`
                                  : `Watching ${cityCodeLabel} Radar · Auto-Alert ON`
                                : isZh
                                  ? `正在监控${cityCodeLabel}（已静音）`
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
                            ? tr('Announcement alert on (click to mute)', '官宣提醒已开（点击静音）')
                            : tr('Click to turn on announcement alert', '点击开启官宣提醒')
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
                            {cityLabel(m.city, 'short')}
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
                        {tr(
                          'View show card & pre-sale countdowns ↓',
                          '查看演出卡片与预售倒计时 ↓',
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="monitored-waiting-note">
                      {check?.radarNote ||
                        singer.radarNote ||
                        tr(
                          'No Sydney or Melbourne dates on sale yet — scanning Ticketmaster AU, promoter wires & tour press automatically.',
                          '暂未官宣墨尔本或悉尼场次 — 系统正持续自动扫描 Ticketmaster AU 与主办方巡演动态。',
                        )}
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
                      {hasAnnounced ? tr('Direct Show', '直达演出页') : 'Ticketek'}{' '}
                      <ExternalLink size={10} />
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
                      {tr('Tixel Waitlist', 'Tixel 转售候补')} <ExternalLink size={10} />
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
