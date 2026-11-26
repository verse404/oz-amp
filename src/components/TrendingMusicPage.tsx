import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BellPlus,
  Check,
  ExternalLink,
  Flame,
  Globe,
  Headphones,
  ListMusic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Ticket,
  Volume2,
} from 'lucide-react';
import type {
  CityId,
  ConcertEvent,
  MonitoredSinger,
  MusicFestivalDirectoryItem,
  TrendingRegion,
  TrendingTrackItem,
  WorldFestivalItem,
} from '../types/gig';
import { UPLOADED_WATCHLIST_SINGERS } from '../data/userSingerList';
import { buildArtistPreviewLinks } from '../utils/musicPreviewLinks';
import { formatConcertDate } from '../utils/formatters';
import { ArtistAvatar } from './ArtistAvatar';
import { IS_STATIC_MODE } from '../config/runtimeMode';

interface TrendingMusicPageProps {
  concerts: ConcertEvent[];
  musicFestivals: MusicFestivalDirectoryItem[];
  worldFestivals: WorldFestivalItem[];
  monitoredSingers: MonitoredSinger[];
  cityFilter: 'all' | CityId;
  onToggleMonitorArtist: (artistName: string, artworkUrl?: string, genre?: string) => void;
  onJumpToAuConcert: (artistName: string) => void;
  onJumpToAuFestival: () => void;
  onJumpToWorldFestivals: () => void;
  onBackToMainGuide: () => void;
  onShowToast: (msg: string) => void;
}

const REGION_OPTIONS: Array<{ id: TrendingRegion; label: string; flag: string }> = [
  { id: 'au', label: 'Australia Top 25', flag: 'AU' },
  { id: 'us', label: 'Global / US Top 25', flag: 'US' },
  { id: 'gb', label: 'UK Top 25', flag: 'UK' },
  { id: 'jp', label: 'Japan Top 25', flag: 'JP' },
];

function splitTrackArtists(rawArtist: string): string[] {
  return rawArtist
    .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bx\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function normalizeTerm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.’'`]/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesPerformerName(candidateRaw: string, targetRaw: string): boolean {
  const cand = normalizeTerm(candidateRaw);
  const target = normalizeTerm(targetRaw);
  if (cand.length < 2 || target.length < 2) return false;
  if (cand === target) return true;
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(cand)) {
    return target.includes(cand);
  }
  const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(target);
}

export const TrendingMusicPage: React.FC<TrendingMusicPageProps> = ({
  concerts,
  musicFestivals,
  worldFestivals,
  monitoredSingers,
  cityFilter,
  onToggleMonitorArtist,
  onJumpToAuConcert,
  onJumpToAuFestival,
  onJumpToWorldFestivals,
  onBackToMainGuide,
  onShowToast,
}) => {
  const [region, setRegion] = useState<TrendingRegion>('au');
  const [tracks, setTracks] = useState<TrendingTrackItem[]>([]);
  const [chartSource, setChartSource] = useState<string>('Apple Music Live Charts');
  const [updatedAtIso, setUpdatedAtIso] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('All Genres');
  const [onlyLiveEvents, setOnlyLiveEvents] = useState(false);

  // Single-instance 30-second audio preview state + progress bar
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestSeqRef = useRef<number>(0);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number>(0);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingTrackId(null);
    setAudioProgress(0);
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const loadCharts = async (targetRegion: TrendingRegion, manual = false) => {
    const seq = ++requestSeqRef.current;
    stopAudio();
    setLoading(true);
    try {
      const endpoint = IS_STATIC_MODE
        ? `./data/trending-${encodeURIComponent(targetRegion)}.json`
        : `/api/trending-music?region=${encodeURIComponent(targetRegion)}`;
      const res = await fetch(endpoint);
      if (seq !== requestSeqRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as {
          tracks?: TrendingTrackItem[];
          source?: string;
          updatedAtIso?: string;
        };
        if (seq !== requestSeqRef.current) return;
        setTracks(Array.isArray(data.tracks) ? data.tracks : []);
        setChartSource(data.source || `Apple Music ${targetRegion.toUpperCase()} Top 25`);
        setUpdatedAtIso(data.updatedAtIso || new Date().toISOString());
        if (manual) {
          onShowToast(
            `Refreshed ${targetRegion.toUpperCase()} Top ${data.tracks?.length || 25} trending songs.`,
          );
        }
      }
    } catch {
      if (seq === requestSeqRef.current) {
        onShowToast('Unable to reach trending music feed right now.');
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadCharts(region);
    setGenreFilter('All Genres');
  }, [region]);

  const toggleAudioPreview = (track: TrendingTrackItem) => {
    if (!track.previewUrl) {
      onShowToast(`No 30s preview audio provided for "${track.title}".`);
      return;
    }

    if (playingTrackId === track.id) {
      stopAudio();
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.ontimeupdate = () => {
        const el = audioRef.current;
        if (el && el.duration && Number.isFinite(el.duration) && el.duration > 0) {
          setAudioProgress(Math.min(100, Math.round((el.currentTime / el.duration) * 100)));
        }
      };
      audioRef.current.onended = () => {
        setPlayingTrackId(null);
        setAudioProgress(0);
      };
      audioRef.current.onerror = () => {
        setPlayingTrackId(null);
        setAudioProgress(0);
        onShowToast('Audio preview could not be played in this browser.');
      };
    }

    audioRef.current.pause();
    audioRef.current.src = track.previewUrl;
    audioRef.current.currentTime = 0;
    setAudioProgress(0);
    void audioRef.current.play().then(
      () => setPlayingTrackId(track.id),
      () => {
        setPlayingTrackId(null);
        setAudioProgress(0);
        onShowToast('Click again or open Spotify / Apple Music to listen.');
      },
    );
  };

  // Lookup sets for Watchlist & Monitored Radar
  const watchlistSet = useMemo(() => {
    const set = new Set<string>();
    for (const entry of UPLOADED_WATCHLIST_SINGERS) {
      set.add(normalizeTerm(entry.displayName));
      entry.matchTerms.forEach((t) => set.add(normalizeTerm(t)));
    }
    return set;
  }, []);

  const monitoredSet = useMemo(
    () => new Set(monitoredSingers.map((s) => normalizeTerm(s.name))),
    [monitoredSingers],
  );

  // Match track artists against upcoming Melbourne / Sydney solo concerts
  const matchTrackToConcerts = (artistParts: string[]): ConcertEvent[] => {
    if (artistParts.length === 0) return [];
    return concerts.filter((c) => {
      if (cityFilter !== 'all' && c.city !== cityFilter) return false;
      const acts = [c.artist, ...c.supportActs];
      return artistParts.some((cand) => acts.some((act) => matchesPerformerName(cand, act)));
    });
  };

  // Match track artists against upcoming Australian & World Music Festivals
  const matchTrackToAuFestivals = (artistParts: string[]): MusicFestivalDirectoryItem[] => {
    if (artistParts.length === 0) return [];
    return musicFestivals.filter((fest) =>
      artistParts.some((cand) =>
        fest.fullLineup.some((act) => matchesPerformerName(cand, act)),
      ),
    );
  };

  const matchTrackToWorldFestivals = (artistParts: string[]): WorldFestivalItem[] => {
    if (artistParts.length === 0) return [];
    return worldFestivals.filter((wf) =>
      artistParts.some((cand) =>
        wf.lineupHighlights.some((act) => matchesPerformerName(cand, act)),
      ),
    );
  };

  const availableGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks) {
      if (t.genre) counts.set(t.genre, (counts.get(t.genre) || 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);
    return ['All Genres', ...sorted];
  }, [tracks]);

  const enrichedTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tracks
      .map((track) => {
        const artistParts = splitTrackArtists(track.artist);
        const primaryArtist = artistParts[0] || track.artist;
        const matchedAuShows = matchTrackToConcerts(artistParts);
        const matchedAuFests = matchTrackToAuFestivals(artistParts);
        const matchedWorldFests = matchTrackToWorldFestivals(artistParts);
        const isWatched = artistParts.some(
          (p) => watchlistSet.has(normalizeTerm(p)) || monitoredSet.has(normalizeTerm(p)),
        );
        const isMonitored = monitoredSet.has(normalizeTerm(primaryArtist));
        const hasLiveCrossover =
          matchedAuShows.length > 0 ||
          matchedAuFests.length > 0 ||
          matchedWorldFests.length > 0;
        return {
          track,
          primaryArtist,
          matchedAuShows,
          matchedAuFests,
          matchedWorldFests,
          hasLiveCrossover,
          isWatched,
          isMonitored,
        };
      })
      .filter(({ track, hasLiveCrossover }) => {
        if (genreFilter !== 'All Genres' && track.genre !== genreFilter) return false;
        if (onlyLiveEvents && !hasLiveCrossover) return false;
        if (q) {
          const hay = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [
    tracks,
    genreFilter,
    onlyLiveEvents,
    searchQuery,
    concerts,
    musicFestivals,
    worldFestivals,
    cityFilter,
    watchlistSet,
    monitoredSet,
  ]);

  const liveCrossoversCount = useMemo(
    () =>
      tracks.filter((t) => {
        const parts = splitTrackArtists(t.artist);
        return (
          matchTrackToConcerts(parts).length > 0 ||
          matchTrackToAuFestivals(parts).length > 0 ||
          matchTrackToWorldFestivals(parts).length > 0
        );
      }).length,
    [tracks, concerts, musicFestivals, worldFestivals, cityFilter],
  );

  const watchlistCrossoversCount = useMemo(
    () =>
      tracks.filter((t) =>
        splitTrackArtists(t.artist).some(
          (p) => watchlistSet.has(normalizeTerm(p)) || monitoredSet.has(normalizeTerm(p)),
        ),
      ).length,
    [tracks, watchlistSet, monitoredSet],
  );

  const activePlayingTrack = tracks.find((t) => t.id === playingTrackId) || null;

  return (
    <div className="trending-music-page">
      {/* Top Hero Card */}
      <section className="watchlist-hero-card trending-hero-card" aria-labelledby="trending-title">
        <div className="watchlist-hero-top">
          <button type="button" className="btn-outline-sm" onClick={onBackToMainGuide}>
            <ArrowLeft size={14} />
            <span>Back to Melbourne &amp; Sydney Gig Guide</span>
          </button>
          <span className="eyebrow-kicker">
            LIVE TRENDING CHARTS · 30S AUDIO PREVIEWS · AU TOUR CROSSOVER
          </span>
        </div>

        <div className="watchlist-hero-grid">
          <div>
            <h1 id="trending-title" className="hero-headline watchlist-headline">
              Trending Popular Music &amp; Live Tour Radar.
            </h1>
            <p className="hero-lede">
              Discover what’s surging right now across <strong>Australia</strong>,{' '}
              <strong>Global / US</strong>, <strong>UK</strong>, and <strong>Japan</strong>—play
              instant 30-second song previews, spot which chart-toppers are playing{' '}
              <strong>Melbourne or Sydney</strong> soon, and add rising artists straight to your OZ
              Amp tour monitor.
            </p>

            <div className="watchlist-cta-row">
              <div className="city-tab-bar" role="tablist" aria-label="Select chart region">
                {REGION_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={region === opt.id}
                    className={`city-tab ${region === opt.id ? 'is-active' : ''}`}
                    onClick={() => setRegion(opt.id)}
                  >
                    <span className="trending-flag-badge">{opt.flag}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => void loadCharts(region, true)}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
                <span>{loading ? 'Refreshing…' : 'Refresh Charts'}</span>
              </button>
            </div>
          </div>

          <div className="watchlist-stat-grid">
            <div className="watchlist-stat-tile is-accent">
              <span className="watchlist-stat-num">{tracks.length}</span>
              <span className="watchlist-stat-label">Live Chart Tracks ({region.toUpperCase()})</span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{liveCrossoversCount}</span>
              <span className="watchlist-stat-label">AU Shows &amp; Festival Crossovers</span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{watchlistCrossoversCount}</span>
              <span className="watchlist-stat-label">On Your 275-Singer Watchlist</span>
            </div>
            <div className="watchlist-stat-tile">
              <span className="watchlist-stat-num">{tracks.filter((t) => Boolean(t.previewUrl)).length}</span>
              <span className="watchlist-stat-label">30s Audio Previews Ready</span>
            </div>
          </div>
        </div>

        {/* Now Playing Mini Bar */}
        {activePlayingTrack && (
          <div className="now-playing-bar" role="status">
            <div className="now-playing-main">
              <div className="now-playing-info">
                <Volume2 size={16} className="now-playing-icon" />
                <span>
                  <strong>Now Previewing #{activePlayingTrack.rank}:</strong>{' '}
                  {activePlayingTrack.title} — {activePlayingTrack.artist}
                </span>
              </div>
              <button type="button" className="btn-outline-sm" onClick={stopAudio}>
                <Pause size={13} />
                <span>Stop Preview</span>
              </button>
            </div>
            <div className="now-playing-progress" aria-hidden="true">
              <div
                className="now-playing-progress-fill"
                style={{ width: `${audioProgress}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Search & Genre Filters */}
      <section className="feature-section" aria-labelledby="trending-list-heading">
        <div className="section-header-row">
          <div>
            <span className="eyebrow-kicker">
              {chartSource}
              {updatedAtIso ? ` · Synced ${new Date(updatedAtIso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
            <h2 id="trending-list-heading" className="section-heading">
              <Flame size={19} className="trending-flame-icon" /> Top Trending Tracks ({enrichedTracks.length})
            </h2>
          </div>

          <button
            type="button"
            aria-pressed={onlyLiveEvents}
            className={`weekend-toggle-pill ${onlyLiveEvents ? 'is-active' : ''}`}
            onClick={() => setOnlyLiveEvents((v) => !v)}
          >
            <Ticket size={14} />
            <span>
              {onlyLiveEvents
                ? `✓ Touring / Festivals (${liveCrossoversCount})`
                : `Filter: Touring / Festivals (${liveCrossoversCount})`}
            </span>
          </button>
        </div>

        <div className="trending-controls-stack">
          <div className="search-field-wrap">
            <Search size={16} className="search-icon" />
            <input
              type="search"
              id="trending-music-search-input"
              className="search-input"
              placeholder="Search trending song, artist, album, or genre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="genre-scroll-row" role="group" aria-label="Filter trending songs by genre">
            {availableGenres.map((g) => (
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
        </div>

        {loading && tracks.length === 0 ? (
          <div className="lazy-page-loader">Loading live {region.toUpperCase()} trending music…</div>
        ) : enrichedTracks.length === 0 ? (
          <div className="empty-state-box">
            <Sparkles size={22} />
            <p>No trending tracks match your current filter.</p>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => {
                setSearchQuery('');
                setGenreFilter('All Genres');
                setOnlyLiveEvents(false);
              }}
            >
              Reset Chart Filters
            </button>
          </div>
        ) : (
          <div className="trending-tracks-grid">
            {enrichedTracks.map(
              ({
                track,
                primaryArtist,
                matchedAuShows,
                matchedAuFests,
                matchedWorldFests,
                hasLiveCrossover,
                isWatched,
                isMonitored,
              }) => {
                const isPlaying = playingTrackId === track.id;
                const previewLinks = buildArtistPreviewLinks(primaryArtist);
                const firstShow = matchedAuShows[0];
                const firstAuFest = matchedAuFests[0];
                const firstWorldFest = matchedWorldFests[0];
                const showDateLabel = firstShow
                  ? formatConcertDate(firstShow.dateIso, firstShow.timeZone).dayMonth
                  : '';

                return (
                  <article
                    key={track.id}
                    className={`trending-track-card ${isPlaying ? 'is-playing' : ''} ${
                      hasLiveCrossover ? 'is-touring-au' : ''
                    }`}
                  >
                    <div className="trending-card-top">
                      <span className="trending-rank-pill">#{track.rank}</span>
                      <span className="presale-kind-badge">{track.genre}</span>
                      {isWatched && (
                        <span className="watched-match-pill">
                          <Star size={11} />
                          <span>Watchlist</span>
                        </span>
                      )}
                      {firstShow && (
                        <span className={`city-pill city-pill--${firstShow.city}`}>
                          {firstShow.city === 'sydney' ? 'SYD' : 'MEL'} · {showDateLabel}
                        </span>
                      )}
                      {firstAuFest && (
                        <span className="city-pill city-pill--melbourne">
                          {firstAuFest.name}
                        </span>
                      )}
                      {firstWorldFest && (
                        <span className="city-pill city-pill--global">
                          <Globe size={11} />
                          <span>{firstWorldFest.name}</span>
                        </span>
                      )}
                    </div>

                    <div className="trending-track-identity">
                      <div className="trending-cover-wrap">
                        <ArtistAvatar
                          name={primaryArtist}
                          explicitUrl={track.artworkUrl || undefined}
                          size="lg"
                          shape="rounded"
                        />
                        {track.previewUrl && (
                          <button
                            type="button"
                            className={`trending-play-overlay ${isPlaying ? 'is-playing' : ''}`}
                            onClick={() => toggleAudioPreview(track)}
                            aria-label={
                              isPlaying
                                ? `Pause preview for ${track.title}`
                                : `Play 30 second preview for ${track.title}`
                            }
                          >
                            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                          </button>
                        )}
                      </div>

                      <div className="trending-track-meta">
                        <h3 className="trending-track-title" title={track.title}>
                          {track.title}
                        </h3>
                        <p className="trending-track-artist" title={track.artist}>
                          {track.artist}
                        </p>
                        {track.album && (
                          <p className="trending-track-album" title={track.album}>
                            {track.album}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="music-preview-strip">
                      {track.previewUrl && (
                        <button
                          type="button"
                          className={`preview-chip preview-chip--audio ${isPlaying ? 'is-playing' : ''}`}
                          onClick={() => toggleAudioPreview(track)}
                        >
                          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                          <span>{isPlaying ? 'Playing 30s' : '30s Preview'}</span>
                        </button>
                      )}
                      <a
                        href={previewLinks.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="preview-chip"
                      >
                        <Headphones size={12} />
                        <span>Spotify</span>
                      </a>
                      <a
                        href={track.appleMusicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="preview-chip"
                      >
                        <Radio size={12} />
                        <span>Apple Music</span>
                      </a>
                      <a
                        href={previewLinks.setlistFm}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="preview-chip preview-chip--setlist"
                      >
                        <ListMusic size={12} />
                        <span>Setlist.fm</span>
                      </a>
                    </div>

                    <div className="trending-card-footer">
                      <button
                        type="button"
                        className={isMonitored ? 'btn-armed-sm' : 'btn-outline-sm'}
                        onClick={() =>
                          onToggleMonitorArtist(
                            primaryArtist,
                            track.artworkUrl || undefined,
                            track.genre,
                          )
                        }
                      >
                        {isMonitored ? <Check size={14} /> : <BellPlus size={14} />}
                        <span>{isMonitored ? 'Monitoring' : 'Monitor Artist'}</span>
                      </button>

                      <div className="trending-footer-actions">
                        {firstShow && (
                          <button
                            type="button"
                            className="btn-primary-sm"
                            onClick={() => onJumpToAuConcert(firstShow.artist)}
                          >
                            <Ticket size={13} />
                            <span>AU Show</span>
                          </button>
                        )}
                        {firstAuFest && (
                          <button
                            type="button"
                            className="btn-primary-sm"
                            onClick={onJumpToAuFestival}
                          >
                            <Ticket size={13} />
                            <span>AU Fest</span>
                          </button>
                        )}
                        {firstWorldFest && (
                          <button
                            type="button"
                            className="btn-primary-sm"
                            onClick={onJumpToWorldFestivals}
                          >
                            <Globe size={13} />
                            <span>World Fest</span>
                          </button>
                        )}
                        <a
                          href={track.appleMusicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-subtle-sm"
                        >
                          <span>Open Track</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>
    </div>
  );
};
