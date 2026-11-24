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

interface MusicFestivalsSectionProps {
  festivals: MusicFestivalDirectoryItem[];
  advisorFestivals: FestivalAdvisorItem[];
  monitoredSingers: MonitoredSinger[];
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
  homeCity,
  cityFilter,
  onChangeCityFilter,
  armedFestivalIds,
  onArmFestivalReminder,
  onToggleMonitorArtist,
}) => {
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
            04 · Music Festivals &amp; Full Artist Lineups (VIC &amp; NSW)
          </span>
          <h2 id="music-festivals-heading" className="section-heading">
            Upcoming Music Festivals — Who’s Performing ({filteredFestivals.length})
          </h2>
        </div>

        <div className="festival-filter-Cluster">
          <div className="category-tabs" role="group" aria-label="Filter festivals by state">
            <button
              type="button"
              className={`genre-pill ${cityFilter === 'melbourne' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('melbourne')}
            >
              Melbourne &amp; VIC
            </button>
            <button
              type="button"
              className={`genre-pill ${cityFilter === 'sydney' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('sydney')}
            >
              Sydney &amp; NSW
            </button>
            <button
              type="button"
              className={`genre-pill ${cityFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => onChangeCityFilter('all')}
            >
              Both Cities
            </button>
          </div>

          <div className="category-tabs" role="group" aria-label="Filter festivals by format">
            <button
              type="button"
              className={`genre-pill ${formatFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setFormatFilter('all')}
            >
              All Formats
            </button>
            <button
              type="button"
              className={`genre-pill ${formatFilter === 'City Day Festival' ? 'is-active' : ''}`}
              onClick={() => setFormatFilter('City Day Festival')}
            >
              1-Day City Festivals
            </button>
            <button
              type="button"
              className={`genre-pill ${formatFilter === 'Multi-Day Camping' ? 'is-active' : ''}`}
              onClick={() => setFormatFilter('Multi-Day Camping')}
            >
              Multi-Day Camping
            </button>
          </div>
        </div>
      </div>

      <p className="section-sublead">
        Every festival card shows the <strong>Headliners</strong> and{' '}
        <strong>Supporting Artists</strong> right on the bill. Click any artist name to monitor
        them, or click <strong>Official Full Lineup ↗</strong> to open the festival’s official
        lineup webpage.
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
              ? 'Pre-Sale / Ballot Soon'
              : fest.status === 'selling-fast'
                ? 'Selling Fast'
                : fest.status === 'waitlist-resale'
                  ? 'Ballot Closed · Resale'
                  : 'On Sale';

          return (
            <article key={fest.id} className="festival-poster-card">
              {/* 1. Clear Title + Dates/Venues Header */}
              <div className="poster-card-top">
                <div className="poster-title-block">
                  <div className="poster-meta-badges">
                    <span className="custom-pill">{fest.format}</span>
                    <span className={`status-pill status-pill--${fest.status}`}>
                      {statusLabel}
                    </span>
                    {watchedMatches.length > 0 && (
                      <span className="watched-match-pill">
                        <Star size={11} fill="currentColor" /> {watchedMatches.length} of your
                        singers playing
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
                          {st.city === 'melbourne' ? 'MELBOURNE / VIC' : 'SYDNEY / NSW'}
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
                      <strong>Artist Lineup Not Announced Yet (Phase 1 Dropping Soon)</strong>
                      <p>
                        Dates and venue are locked in. Click <strong>Remind Me</strong> below to
                        get notified when the Phase 1 lineup drops, or check the official page.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Tier 1: HEADLINERS */}
                    <div className="lineup-tier-group">
                      <span className="lineup-tier-label">HEADLINERS</span>
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
                                  ? `Monitoring ${cleanName} (click to remove)`
                                  : `Click to monitor ${cleanName}`
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
                          ALSO PERFORMING ({undercard.length} ARTISTS)
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
                                title={`Click to monitor ${cleanName}`}
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
                              <span>+{hiddenCount} more artists (Show Full Roster)</span>
                              <ChevronDown size={13} />
                            </button>
                          )}

                          {isExpanded && undercard.length > 10 && (
                            <button
                              type="button"
                              className="expand-lineup-btn"
                              onClick={() => toggleExpand(fest.id)}
                            >
                              <span>Show fewer</span>
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
                  <span className="price-aud">Passes from {formatAudPrice(fest.priceAud)}</span>
                  <span className="agency-caption">Authorised seller: {fest.agency}</span>
                </div>

                <div className="poster-cta-row">
                  <a
                    href={sanitizeExternalHttpsUrl(fest.lineupUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-lineup-link"
                  >
                    <span>Official Full Lineup</span>
                    <ExternalLink size={14} />
                  </a>

                  <button
                    type="button"
                    className={`btn-outline-sm ${isArmed ? 'is-armed-btn' : ''}`}
                    onClick={() => onArmFestivalReminder(fest)}
                  >
                    {isArmed ? <Check size={14} /> : <BellPlus size={14} />}
                    <span>{isArmed ? 'Reminder Armed' : 'Remind Me'}</span>
                  </button>

                  <a
                    href={sanitizeExternalHttpsUrl(fest.ticketUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary-sm"
                  >
                    <Ticket size={14} />
                    <span>Buy Passes</span>
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
              ? 'Hide Pass vs. Headline Sideshow Calculator'
              : 'Compare Festival Pass vs. Individual Sydney/Melbourne Sideshows'}
          </span>
          {showSideshowCalculator ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showSideshowCalculator && (
          <div className="nested-advisor-wrap">
            <FestivalAdvisorSection
              festivals={advisorFestivals}
              monitoredSingers={monitoredSingers}
              homeCity={homeCity}
            />
          </div>
        )}
      </div>
    </section>
  );
};
