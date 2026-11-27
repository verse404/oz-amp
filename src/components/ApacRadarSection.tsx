import React, { useMemo, useState } from 'react';
import {
  BellPlus,
  Calendar,
  Check,
  ExternalLink,
  Headphones,
  ListMusic,
  MapPin,
  Plane,
  Sparkles,
} from 'lucide-react';
import type { ApacTourStop, CityId, ReminderRule } from '../types/gig';
import { APAC_PROMOTER_PORTALS, APAC_SHORT_FLIGHT_STOPS } from '../data/apacTourRadar';
import { sanitizeExternalHttpsUrl } from '../utils/formatters';
import { buildArtistPreviewLinks } from '../utils/musicPreviewLinks';
import { ArtistAvatar } from './ArtistAvatar';
import { useLocale } from '../i18n/LocaleContext';

interface ApacRadarSectionProps {
  cityFilter: 'all' | CityId;
  reminders: ReminderRule[];
  onToggleApacReminder: (stop: ApacTourStop) => void;
}

const APAC_CITIES: Array<'All Hubs' | ApacTourStop['city']> = [
  'All Hubs',
  'Tokyo',
  'Singapore',
  'Bangkok',
  'Hong Kong',
  'Auckland',
];

export const ApacRadarSection: React.FC<ApacRadarSectionProps> = ({
  cityFilter,
  reminders,
  onToggleApacReminder,
}) => {
  const { isZh, tr, cityLabel, genreLabel } = useLocale();
  const [hubFilter, setHubFilter] = useState<'All Hubs' | ApacTourStop['city']>('All Hubs');
  const [onlyAsiaExclusive, setOnlyAsiaExclusive] = useState(false);

  const remindedIds = useMemo(() => new Set(reminders.map((r) => r.concertId)), [reminders]);

  const filteredStops = useMemo(() => {
    const todayAu = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne',
    }).format(new Date());
    return APAC_SHORT_FLIGHT_STOPS.filter((stop) => {
      if (stop.dateIso < todayAu) return false;
      if (hubFilter !== 'All Hubs' && stop.city !== hubFilter) return false;
      if (onlyAsiaExclusive && stop.auStatus === 'au-confirmed') return false;
      return true;
    });
  }, [hubFilter, onlyAsiaExclusive]);

  return (
    <section className="feature-section apac-radar-section" aria-labelledby="apac-radar-heading">
      <div className="section-header-row">
        <div>
          <span className="eyebrow-kicker">
            {tr(
              'SHORT-FLIGHT ASIA-PACIFIC RADAR · TOKYO · SINGAPORE · BANGKOK · HONG KONG · AUCKLAND',
              '亚太短途飞行看演出雷达 · 东京 · 新加坡 · 曼谷 · 香港 · 奥克兰',
            )}
          </span>
          <h2 id="apac-radar-heading" className="section-heading">
            {tr(
              `Nearby Asia-Pacific Tour Stops (${filteredStops.length})`,
              `周边亚太短途巡演场次 (${filteredStops.length})`,
            )}
          </h2>
        </div>

        <button
          type="button"
          aria-pressed={onlyAsiaExclusive}
          className={`genre-pill ${onlyAsiaExclusive ? 'is-selected' : ''}`}
          onClick={() => setOnlyAsiaExclusive((v) => !v)}
        >
          <Sparkles size={13} />
          <span>
            {onlyAsiaExclusive
              ? tr('Showing Skipping-AU Only', '仅看暂未官宣澳洲场')
              : tr('Filter: Skipping AU So Far', '筛选：暂未官宣澳洲场')}
          </span>
        </button>
      </div>

      <p className="section-subcopy">
        {isZh ? (
          <>
            关注清单中的歌手常在官宣澳洲之前先官宣<strong>东京、新加坡、曼谷、香港或奥克兰</strong>场次（或跳过澳洲）。从<strong>{cityLabel(cityFilter)}</strong>出发即可周末直飞打卡。
          </>
        ) : (
          <>
            Watchlist singers often announce{' '}
            <strong>Tokyo, Singapore, Bangkok, Hong Kong, or Auckland</strong> dates weeks before
            Australia—or skip VIC/NSW altogether. Catch easy nonstop weekend gig hops from{' '}
            <strong>
              {cityFilter === 'sydney'
                ? 'Sydney (SYD)'
                : cityFilter === 'melbourne'
                  ? 'Melbourne (MEL)'
                  : 'Melbourne & Sydney'}
            </strong>
            .
          </>
        )}
      </p>

      <div className="apac-hub-bar">
        <div className="genre-scroll-row" role="group" aria-label={tr('Filter by Asia-Pacific hub city', '按亚太城市筛选')}>
          {APAC_CITIES.map((hub) => (
            <button
              key={hub}
              type="button"
              className={`genre-pill ${hubFilter === hub ? 'is-selected' : ''}`}
              onClick={() => setHubFilter(hub)}
            >
              {genreLabel(hub)}
            </button>
          ))}
        </div>

        <div className="apac-portals-row">
          {APAC_PROMOTER_PORTALS.map((portal) => (
            <a
              key={portal.label}
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="platform-mini-link"
            >
              <span>{portal.label}</span>
              <ExternalLink size={11} />
            </a>
          ))}
        </div>
      </div>

      {filteredStops.length === 0 ? (
        <div className="empty-state-box">
          <Sparkles size={20} />
          <p>
            No upcoming {hubFilter === 'All Hubs' ? 'Asia-Pacific' : hubFilter} stops match the
            current filter.
          </p>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => {
              setHubFilter('All Hubs');
              setOnlyAsiaExclusive(false);
            }}
          >
            Reset Asia-Pacific Filters
          </button>
        </div>
      ) : (
      <div className="apac-grid">
        {filteredStops.map((stop) => {
          const isArmed = remindedIds.has(stop.id);
          const preview = buildArtistPreviewLinks(stop.artist);
          const safeUrl = sanitizeExternalHttpsUrl(stop.ticketUrl, stop.artist);

          return (
            <article key={stop.id} className={`apac-card ${isArmed ? 'is-armed' : ''}`}>
              <div className="apac-card-top">
                <span className="world-country-pill">{stop.countryCode}</span>
                <span className={`apac-signal-pill apac-signal-pill--${stop.auStatus}`}>
                  {stop.auStatusLabel}
                </span>
              </div>

              <div className="drop-artist-row">
                <ArtistAvatar name={stop.artist} size="md" />
                <div className="drop-artist-meta">
                  <strong className="apac-artist-name">{stop.artist}</strong>
                  <span className="apac-tour-sub">{stop.tourTitle}</span>
                </div>
              </div>

              <div className="apac-logistics">
                <div className="apac-meta-line">
                  <Calendar size={13} />
                  <strong>{stop.dateLabel}</strong>
                </div>
                <div className="apac-meta-line">
                  <MapPin size={13} />
                  <span>
                    {stop.venueName}, {stop.city}
                  </span>
                </div>
                {(cityFilter === 'melbourne' || cityFilter === 'all') && (
                  <div className="apac-meta-line apac-flight-line">
                    <Plane size={13} />
                    <span>{stop.melFlightDuration}</span>
                  </div>
                )}
                {(cityFilter === 'sydney' || cityFilter === 'all') && (
                  <div className="apac-meta-line apac-flight-line">
                    <Plane size={13} />
                    <span>{stop.sydFlightDuration}</span>
                  </div>
                )}
              </div>

              <p className="apac-note">{stop.note}</p>

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

              <div className="apac-card-footer">
                <button
                  type="button"
                  className={isArmed ? 'btn-armed-sm' : 'btn-outline-sm'}
                  onClick={() => onToggleApacReminder(stop)}
                >
                  {isArmed ? <Check size={14} /> : <BellPlus size={14} />}
                  <span>{isArmed ? tr('Alert On', '已设提醒') : tr('Notify Me', '设置提醒')}</span>
                </button>

                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary-sm"
                >
                  <span>{stop.portalLabel}</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            </article>
          );
        })}
      </div>
      )}
    </section>
  );
};
