import React, { useMemo, useState } from 'react';
import {
  BellPlus,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  Star,
  Ticket,
} from 'lucide-react';
import type {
  CityId,
  FestivalAdvisorItem,
  MonitoredSinger,
  MusicFestivalDirectoryItem,
} from '../types/gig';
import { formatAudPrice, sanitizeExternalHttpsUrl } from '../utils/formatters';
import { FestivalAdvisorSection } from './FestivalAdvisorSection';
import { ArtistAvatar } from './ArtistAvatar';
import type { WatchlistSingerEntry } from '../data/userSingerList';
import { useLocale } from '../i18n/LocaleContext';

interface MusicFestivalsSectionProps {
  festivals: MusicFestivalDirectoryItem[];
  advisorFestivals: FestivalAdvisorItem[];
  monitoredSingers: MonitoredSinger[];
  watchlistSingers: WatchlistSingerEntry[];
  homeCity: CityId;
  cityFilter: 'all' | CityId;
  onChangeCityFilter: (city: 'all' | CityId) => void;
  armedFestivalIds: Set<string>;
  onArmFestivalReminder: (fest: MusicFestivalDirectoryItem) => void;
  onToggleMonitorArtist: (artistName: string) => void;
}

export const MusicFestivalsSection: React.FC<MusicFestivalsSectionProps> = ({
  festivals,
  advisorFestivals,
  monitoredSingers,
  watchlistSingers,
  homeCity,
  cityFilter,
  onChangeCityFilter,
  armedFestivalIds,
  onArmFestivalReminder,
  onToggleMonitorArtist,
}) => {
  const { isZh, tr, cityLabel, genreLabel } = useLocale();
  const [formatFilter, setFormatFilter] = useState<
    'all' | 'City Day Festival' | 'Multi-Day Camping'
  >('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showSideshowCalculator, setShowSideshowCalculator] = useState(false);

  const isArtistWatched = (actName: string) => {
    const cleanAct = actName.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase();
    if (!cleanAct) return false;
    return monitoredSingers.some((s) => {
      const terms = [s.name, ...s.aliases]
        .map((al) => al.trim().toLowerCase())
        .filter((al) => al.length >= 2);
      return terms.some((t) => {
        if (cleanAct === t) return true;
        if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t)) return cleanAct.includes(t);
        const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(cleanAct);
      });
    });
  };

  const filteredFestivals = useMemo(() => {
    const todayAu = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne',
    }).format(new Date());
    return festivals
      .map((fest) => ({
        ...fest,
        stops: fest.stops.filter((st) => st.dateIso >= todayAu),
      }))
      .filter((fest) => {
        if (fest.stops.length === 0) return false;
        if (cityFilter !== 'all' && !fest.stops.some((st) => st.city === cityFilter)) {
          return false;
        }
        if (formatFilter !== 'all' && fest.format !== formatFilter) {
          return false;
        }
        return true;
      });
  }, [festivals, cityFilter, formatFilter]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section
      id="music-festivals"
      className="feature-section festivals-directory-section"
      aria-labelledby="music-festivals-heading"
    >
      <div className="section-header-row">
        <div>
          <span className="eyebrow-kicker">
            {tr(
              '03 · Music Festivals & Full Artist Lineups (VIC & NSW)',
              '03 · 澳洲本地音乐节与完整阵容 (维州 & 新州)',
            )}
          </span>
          <h2 id="music-festivals-heading" className="section-heading">
            {tr(
              `Upcoming Music Festivals — Who’s Performing (${filteredFestivals.length})`,
              `近期澳洲音乐节与演出阵容 (${filteredFestivals.length})`,
            )}
          </h2>
        </div>

        <div className="festival-filter-Cluster">
          <div className="category-tabs" role="group" aria-label={tr('Filter festivals by state', '按城市筛选音乐节')}>
            <button
              type="button"
              className={`genre-pill ${cityFilter === 'melbourne' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('melbourne')}
            >
              {tr('Melbourne & VIC', '墨尔本 · VIC')}
            </button>
            <button
              type="button"
              className={`genre-pill ${cityFilter === 'sydney' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('sydney')}
            >
              {tr('Sydney & NSW', '悉尼 · NSW')}
            </button>
            <button
              type="button"
              className={`genre-pill ${cityFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('all')}
            >
              {cityLabel('all')}
            </button>
          </div>

          <div className="category-tabs" role="group" aria-label={tr('Filter festivals by format', '按形式筛选音乐节')}>
            <button
              type="button"
              className={`genre-pill ${formatFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFormatFilter('all')}
            >
              {tr('All Formats', '全部形式')}
            </button>
            <button
              type="button"
              className={`genre-pill ${formatFilter === 'City Day Festival' ? 'is-active' : ''}`}
              onClick={() => setFormatFilter('City Day Festival')}
            >
              {tr('1-Day City Festivals', '城市单日音乐节')}
            </button>
            <button
              type="button"
              className={`genre-pill ${formatFilter === 'Multi-Day Camping' ? 'is-active' : ''}`}
              onClick={() => setFormatFilter('Multi-Day Camping')}
            >
              {tr('Multi-Day Camping', '多日露营音乐节')}
            </button>
          </div>
        </div>
      </div>

      <p className="section-sublead">
        {isZh ? (
          <>
            每张音乐节卡片均展示<strong>领衔艺人（Headliners）</strong>与<strong>参演阵容</strong>。点击任意歌手即可一键加入关注，或点击<strong>官方完整阵容 ↗</strong>查看官网。
          </>
        ) : (
          <>
            Every festival card shows the <strong>Headliners</strong> and{' '}
            <strong>Supporting Artists</strong> right on the bill. Click any artist name to
            monitor them, or click <strong>Official Full Lineup ↗</strong> to open the festival’s
            official lineup webpage.
          </>
        )}
      </p>

      <div className="festival-poster-list">
        {filteredFestivals.map((fest) => {
          const isLineupTba = fest.lineupAnnounced === false || fest.fullLineup.length === 0;
          const headlinerSet = new Set(fest.headliners.map((h) => h.toLowerCase()));
          const undercard = fest.fullLineup.filter(
            (act) =>
              !fest.headliners.some((h) => act.toLowerCase().startsWith(h.toLowerCase())) &&
              !headlinerSet.has(act.toLowerCase()),
          );

          const isExpanded = Boolean(expandedIds[fest.id]);
          const visibleUndercard = isExpanded ? undercard : undercard.slice(0, 10);
          const hiddenCount = undercard.length - visibleUndercard.length;

          const watchedMatches = fest.fullLineup.filter((act) => isArtistWatched(act));
          const isArmed = armedFestivalIds.has(fest.id);

          const statusLabel =
            fest.status === 'presale-soon'
              ? tr('Pre-Sale / Ballot Soon', '即将预售 / 抽签')
              : fest.status === 'selling-fast'
                ? tr('Selling Fast', '余票紧张')
                : fest.status === 'waitlist-resale'
                  ? tr('Ballot Closed · Resale', '抽签已截止 · 官方转售')
                  : tr('On Sale', '公开售票中');

          return (
            <article key={fest.id} className="festival-poster-card">
              {/* 1. Clear Title + Dates/Venues Header */}
              <div className="poster-card-top">
                <div className="poster-title-block">
                  <div className="poster-meta-badges">
                    <span className="custom-pill">{genreLabel(fest.format)}</span>
                    <span className={`status-pill status-pill--${fest.status}`}>
                      {statusLabel}
                    </span>
                    {watchedMatches.length > 0 && (
                      <span className="watched-match-pill">
                        <Star size={11} fill="currentColor" />{' '}
                        {tr(
                          `${watchedMatches.length} of your singers playing`,
                          `命中 ${watchedMatches.length} 位您关注的歌手`,
                        )}
                      </span>
                    )}
                  </div>
                  <div className="poster-title-row">
                    <div>
                      <h3 className="poster-festival-title">{fest.name}</h3>
                      <p className="poster-tagline">{fest.tagline}</p>
                    </div>
                    {!isLineupTba && fest.headliners.length > 0 && (
                      <div className="festival-avatar-stack" aria-hidden="true">
                        {fest.headliners.slice(0, 4).map((hl) => (
                          <ArtistAvatar
                            key={hl}
                            name={hl.replace(/\s*\([^)]*\)\s*/g, '').trim()}
                            size="md"
                            shape="circle"
                            className="stacked-fest-avatar"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Clear City + Date + Venue Schedule Rows (Filtered to selected city) */}
                <div className="poster-stops-list">
                  {[...fest.stops]
                    .filter((st) => cityFilter === 'all' || st.city === cityFilter)
                    .sort((a, b) => (a.city === b.city ? 0 : a.city === 'melbourne' ? -1 : 1))
                    .map((st) => (
                      <div key={`${fest.id}-${st.venueName}`} className="poster-stop-pill">
                        <span className={`city-pill city-pill--${st.city}`}>
                          {cityLabel(st.city, 'state').toUpperCase()}
                        </span>
                        <Calendar size={13} className="stop-cal-icon" />
                        <strong>{st.dateLabel}</strong>
                        <span className="stop-venue-name">· {st.venueName}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* 2. Poster Billboard: WHO IS COMING */}
              <div className="poster-lineup-stage">
                {isLineupTba ? (
                  <div className="lineup-tba-notice">
                    <Sparkles size={16} />
                    <div>
                      <strong>
                        {tr(
                          'Artist Lineup Not Announced Yet (Phase 1 Dropping Soon)',
                          '阵容尚未官宣（第一批名单即将公布）',
                        )}
                      </strong>
                      <p>
                        {isZh ? (
                          <>
                            举办日期与场地已确定。点击下方<strong>设置提醒</strong>，第一批阵容官宣时即可收到通知。
                          </>
                        ) : (
                          <>
                            Dates and venue are locked in. Click <strong>Notify Me</strong> below to
                            get notified when the Phase 1 lineup drops, or check the official page.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Tier 1: HEADLINERS */}
                    <div className="lineup-tier-group">
                      <span className="lineup-tier-label">{tr('HEADLINERS', '领衔压轴阵容')}</span>
                      <div className="headliner-pills-row">
                        {fest.headliners.map((headliner) => {
                          const cleanName = headliner.replace(/\s*\([^)]*\)\s*/g, '').trim();
                          const watched = isArtistWatched(cleanName);
                          return (
                            <button
                              key={headliner}
                              type="button"
                              className={`poster-headliner-pill ${watched ? 'is-watched' : ''}`}
                              onClick={() => onToggleMonitorArtist(cleanName)}
                              title={
                                watched
                                  ? tr(
                                      `Monitoring ${cleanName} (click to remove)`,
                                      `正在关注 ${cleanName}（点击取消）`,
                                    )
                                  : tr(`Click to monitor ${cleanName}`, `点击关注 ${cleanName}`)
                              }
                            >
                              <ArtistAvatar name={cleanName} size="xs" shape="circle" />
                              {watched && <Star size={13} fill="currentColor" />}
                              <span>{headliner}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tier 2: SUPPORTING & UNDERCARD LINEUP */}
                    {undercard.length > 0 && (
                      <div className="lineup-tier-group">
                        <span className="lineup-tier-label">
                          {tr(
                            `ALSO PERFORMING (${undercard.length} ARTISTS)`,
                            `其余参演艺人（共 ${undercard.length} 组）`,
                          )}
                        </span>
                        <div className="undercard-pills-row">
                          {visibleUndercard.map((act) => {
                            const cleanName = act.replace(/\s*\([^)]*\)\s*/g, '').trim();
                            const watched = isArtistWatched(cleanName);
                            return (
                              <button
                                key={act}
                                type="button"
                                className={`poster-undercard-pill ${watched ? 'is-watched' : ''}`}
                                onClick={() => onToggleMonitorArtist(cleanName)}
                                title={tr(`Click to monitor ${cleanName}`, `点击关注 ${cleanName}`)}
                              >
                                <ArtistAvatar name={cleanName} size="xs" shape="circle" />
                                {watched && <Check size={11} />}
                                <span>{act}</span>
                              </button>
                            );
                          })}

                          {hiddenCount > 0 && (
                            <button
                              type="button"
                              className="expand-lineup-btn"
                              onClick={() => toggleExpand(fest.id)}
                            >
                              <span>
                                {tr(
                                  `+${hiddenCount} more artists (Show Full Roster)`,
                                  `展开其余 ${hiddenCount} 组艺人`,
                                )}
                              </span>
                              <ChevronDown size={13} />
                            </button>
                          )}

                          {isExpanded && undercard.length > 10 && (
                            <button
                              type="button"
                              className="expand-lineup-btn"
                              onClick={() => toggleExpand(fest.id)}
                            >
                              <span>{tr('Show fewer', '收起阵容')}</span>
                              <ChevronUp size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 3. Clear Action Footer: Price + Official Full Lineup Link + Remind + Tickets */}
              <div className="poster-card-footer">
                <div className="price-block">
                  <span className="price-aud">
                    {tr(`Passes from ${formatAudPrice(fest.priceAud)}`, `通票 ${formatAudPrice(fest.priceAud)} 起`)}
                  </span>
                  <span className="agency-caption">
                    {tr(`Authorised seller: ${fest.agency}`, `官方票务: ${fest.agency}`)}
                  </span>
                </div>

                <div className="poster-cta-row">
                  <a
                    href={sanitizeExternalHttpsUrl(fest.lineupUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-lineup-link"
                  >
                    <span>{tr('Official Full Lineup', '官方完整阵容')}</span>
                    <ExternalLink size={14} />
                  </a>

                  <button
                    type="button"
                    className={`btn-outline-sm ${isArmed ? 'is-armed-btn' : ''}`}
                    onClick={() => onArmFestivalReminder(fest)}
                  >
                    {isArmed ? <Check size={14} /> : <BellPlus size={14} />}
                    <span>{isArmed ? tr('Alert On', '已设提醒') : tr('Notify Me', '设置提醒')}</span>
                  </button>

                  <a
                    href={sanitizeExternalHttpsUrl(fest.ticketUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary-sm"
                  >
                    <Ticket size={14} />
                    <span>{tr('Buy Passes', '购买通票')}</span>
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Optional Collapsible Sideshow & Clash Calculator */}
      <div className="sideshow-drawer-toggle-wrap">
        <button
          type="button"
          id="toggle-sideshow-calculator-btn"
          className="btn-outline-sm"
          onClick={() => setShowSideshowCalculator((v) => !v)}
        >
          <span>
            {showSideshowCalculator
              ? tr('Hide Pass vs. Headline Sideshow Calculator', '收起音乐节通票 vs 专场计算器')
              : tr(
                  'Compare Festival Pass vs. Individual Sydney/Melbourne Sideshows',
                  '对比音乐节通票与墨尔本 / 悉尼单场专场票价',
                )}
          </span>
          {showSideshowCalculator ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showSideshowCalculator && (
          <div className="nested-advisor-wrap">
            <FestivalAdvisorSection
              festivals={advisorFestivals}
              monitoredSingers={monitoredSingers}
              watchlistSingers={watchlistSingers}
              homeCity={homeCity}
            />
          </div>
        )}
      </div>
    </section>
  );
};
