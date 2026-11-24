import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, ExternalLink, PlusCircle, Star, Ticket, Trash2 } from 'lucide-react';
import type { CityId, ConcertEvent, TicketStubRecord } from '../types/gig';
import { formatAudPrice, formatConcertDate } from '../utils/formatters';
import { ArtistAvatar } from './ArtistAvatar';

interface StubArchiveSectionProps {
  stubs: TicketStubRecord[];
  concerts: ConcertEvent[];
  cityFilter: 'all' | CityId;
  onAddStub: (stub: Omit<TicketStubRecord, 'id' | 'createdAtIso'>) => void;
  onToggleStubStatus: (id: string) => void;
  onRemoveStub: (id: string) => void;
}

export const StubArchiveSection: React.FC<StubArchiveSectionProps> = ({
  stubs,
  concerts,
  cityFilter,
  onAddStub,
  onToggleStubStatus,
  onRemoveStub,
}) => {
  const visibleStubs =
    cityFilter === 'all' ? stubs : stubs.filter((s) => s.city === cityFilter);
  const [showAddForm, setShowAddForm] = useState(false);
  const [entryMode, setEntryMode] = useState<'catalog' | 'custom'>('catalog');
  const [selectedConcertId, setSelectedConcertId] = useState<string>(concerts[0]?.id || '');
  const [customArtist, setCustomArtist] = useState<string>('');
  const [customVenue, setCustomVenue] = useState<string>('');
  const [customCity, setCustomCity] = useState<CityId>(
    cityFilter === 'sydney' ? 'sydney' : 'melbourne',
  );
  const [customDateIso, setCustomDateIso] = useState<string>(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date()),
  );
  const [paidAud, setPaidAud] = useState<string>(() =>
    String(concerts[0]?.priceMinAud ?? '149.90'),
  );
  const [sectionNote, setSectionNote] = useState<string>('');
  const [venueRating, setVenueRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [stubStatus, setStubStatus] = useState<'secured' | 'attended'>('secured');

  // Keep selected concert & custom city synced when Home City changes
  useEffect(() => {
    if (cityFilter === 'sydney' || cityFilter === 'melbourne') {
      setCustomCity(cityFilter);
    }
    if (concerts.length > 0 && !concerts.some((c) => c.id === selectedConcertId)) {
      setSelectedConcertId(concerts[0].id);
      setPaidAud(String(concerts[0].priceMinAud));
    }
  }, [concerts, selectedConcertId, cityFilter]);

  const effectiveSelectedId = concerts.some((c) => c.id === selectedConcertId)
    ? selectedConcertId
    : concerts[0]?.id || '';

  const totalAudSpent = visibleStubs.reduce((acc, s) => acc + (Number(s.paidAud) || 0), 0);
  const sydneyCount = visibleStubs.filter((s) => s.city === 'sydney').length;
  const melbourneCount = visibleStubs.filter((s) => s.city === 'melbourne').length;
  const avgRating =
    visibleStubs.length > 0
      ? (visibleStubs.reduce((acc, s) => acc + s.venueRating, 0) / visibleStubs.length).toFixed(1)
      : '—';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entryMode === 'custom') {
      const artistTrim = customArtist.trim().slice(0, 90);
      const venueTrim = customVenue.trim().slice(0, 100);
      if (!artistTrim || !venueTrim) return;
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(customDateIso)
        ? customDateIso
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
      onAddStub({
        concertId: `custom-stub-${Date.now().toString(36)}`,
        artist: artistTrim,
        city: customCity,
        venueName: venueTrim,
        dateIso: safeDate,
        paidAud: Math.max(0, Math.min(5000, Number(paidAud) || 0)),
        sectionNote:
          sectionNote.trim().slice(0, 140) ||
          'General Admission / Stalls — clear sightline & punchy mix.',
        venueRating,
        status: stubStatus,
      });
      setCustomArtist('');
      setCustomVenue('');
      setSectionNote('');
      setShowAddForm(false);
      return;
    }

    const matched = concerts.find((c) => c.id === effectiveSelectedId) || concerts[0];
    if (!matched) return;
    onAddStub({
      concertId: matched.id,
      artist: matched.artist,
      tourTitle: matched.tourTitle,
      city: matched.city,
      venueName: matched.venueName,
      dateIso: matched.dateIso,
      paidAud: Math.max(0, Math.min(5000, Number(paidAud) || matched.priceMinAud)),
      sectionNote:
        sectionNote.trim().slice(0, 140) ||
        'General Admission / Stalls — clear sightline & punchy mix.',
      venueRating,
      status: stubStatus,
    });
    setSectionNote('');
    setShowAddForm(false);
  };

  return (
    <section id="stub-wall" className="feature-section" aria-labelledby="stub-wall-heading">
      <div className="section-header-row">
        <div>
          <span className="eyebrow-kicker">
            02 · Collectible Australian Ticket-Stub Archive &amp; Sightline Notes
          </span>
          <h2 id="stub-wall-heading" className="section-heading">
            My Ticket-Stub Memory Wall &amp; Section Reviews ({visibleStubs.length})
          </h2>
        </div>

        <button
          type="button"
          id="toggle-log-stub-btn"
          className="btn-outline-sm"
          onClick={() => setShowAddForm((v) => !v)}
        >
          <PlusCircle size={14} />
          <span>{showAddForm ? 'Cancel' : 'Log Ticket / Attended Gig'}</span>
        </button>
      </div>

      {/* Summary Ledger */}
      <div className="stub-stats-strip">
        <div className="stub-stat-cell">
          <span className="stat-label">Logged Stubs</span>
          <strong className="stat-val">{visibleStubs.length}</strong>
        </div>
        <div className="stub-stat-cell">
          <span className="stat-label">VIC / NSW Split</span>
          <strong className="stat-val">
            {melbourneCount} MEL · {sydneyCount} SYD
          </strong>
        </div>
        <div className="stub-stat-cell">
          <span className="stat-label">Total Invested</span>
          <strong className="stat-val">{formatAudPrice(totalAudSpent)}</strong>
        </div>
        <div className="stub-stat-cell">
          <span className="stat-label">Avg Sightline / Sound</span>
          <strong className="stat-val">{avgRating} ★</strong>
        </div>
      </div>

      {showAddForm && (
        <form className="utility-panel stub-log-form" onSubmit={handleSubmit}>
          <div className="stub-mode-bar" role="tablist" aria-label="Choose concert source">
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === 'catalog'}
              className={`genre-pill ${entryMode === 'catalog' ? 'is-active' : ''}`}
              onClick={() => setEntryMode('catalog')}
            >
              Upcoming Catalog Show
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={entryMode === 'custom'}
              className={`genre-pill ${entryMode === 'custom' ? 'is-active' : ''}`}
              onClick={() => {
                setEntryMode('custom');
                setStubStatus('attended');
              }}
            >
              Custom / Past Concert Memory
            </button>
          </div>

          <div className="stub-form-grid">
            {entryMode === 'catalog' ? (
              <label className="form-field">
                <span>Select Concert</span>
                <select
                  className="filter-select"
                  value={effectiveSelectedId}
                  onChange={(e) => {
                    setSelectedConcertId(e.target.value);
                    const found = concerts.find((c) => c.id === e.target.value);
                    if (found) setPaidAud(String(found.priceMinAud));
                  }}
                >
                  {concerts.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.city === 'sydney' ? 'SYD' : 'MEL'}] {c.artist} — {c.venueName} ({c.dateIso})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="form-field">
                  <span>Artist / Band Name</span>
                  <input
                    type="text"
                    required
                    maxLength={90}
                    className="text-input"
                    placeholder="e.g., Coldplay, Fred again.., Taylor Swift"
                    value={customArtist}
                    onChange={(e) => setCustomArtist(e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>Venue Name</span>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    className="text-input"
                    placeholder="e.g., Rod Laver Arena, Forum Melbourne, Accor Stadium"
                    value={customVenue}
                    onChange={(e) => setCustomVenue(e.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>City</span>
                  <select
                    className="filter-select"
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value as CityId)}
                  >
                    <option value="melbourne">Melbourne · VIC</option>
                    <option value="sydney">Sydney · NSW</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Show Date</span>
                  <input
                    type="date"
                    className="text-input"
                    value={customDateIso}
                    onChange={(e) => setCustomDateIso(e.target.value)}
                  />
                </label>
              </>
            )}

            <label className="form-field">
              <span>Ticket Status</span>
              <select
                className="filter-select"
                value={stubStatus}
                onChange={(e) => setStubStatus(e.target.value as 'secured' | 'attended')}
              >
                <option value="secured">Ticket Secured (Upcoming)</option>
                <option value="attended">Attended (Memory Archive)</option>
              </select>
            </label>

            <label className="form-field">
              <span>Paid (AUD)</span>
              <input
                type="number"
                step="0.10"
                min="0"
                max="5000"
                className="text-input"
                value={paidAud}
                onChange={(e) => setPaidAud(e.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Venue Sightline / Sound Rating</span>
              <select
                className="filter-select"
                value={venueRating}
                onChange={(e) => setVenueRating(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
              >
                <option value={5}>5 ★ — Iconic sightline &amp; mix</option>
                <option value={4}>4 ★ — Great view</option>
                <option value={3}>3 ★ — Decent / slight pillar</option>
                <option value={2}>2 ★ — Obstructed / muddy sound</option>
                <option value={1}>1 ★ — Avoid this section</option>
              </select>
            </label>
          </div>

          <label className="form-field">
            <span>Section / Row Sightline &amp; Encore Notes</span>
            <input
              type="text"
              className="text-input"
              placeholder="e.g., Forum Upstairs Booth B — clear view over stalls; or Rod Laver Sec 7 Row G"
              value={sectionNote}
              onChange={(e) => setSectionNote(e.target.value)}
            />
          </label>

          <div className="panel-actions">
            <button type="submit" className="btn-primary-sm">
              <Ticket size={14} />
              <span>Stamp Collectible Ticket Stub</span>
            </button>
          </div>
        </form>
      )}

      {visibleStubs.length === 0 ? (
        <div className="empty-box">
          <Award size={24} />
          <p className="empty-title">
            {cityFilter === 'all'
              ? 'Your Australian concert stub wall is ready'
              : `No ${cityFilter === 'melbourne' ? 'Melbourne' : 'Sydney'} stubs logged yet`}
          </p>
          <p className="empty-desc">
            Australian mobile QR tickets vanish after doors close — click{' '}
            <strong>Stamp Stub</strong> on any concert card or above to archive your section
            sightlines, AUD spend, and setlists.
          </p>
        </div>
      ) : (
        <div className="stub-wall-grid">
          {visibleStubs.map((stub) => {
            const tz = stub.city === 'melbourne' ? 'Australia/Melbourne' : 'Australia/Sydney';
            const dParts = formatConcertDate(stub.dateIso, tz);
            const setlistUrl = `https://www.setlist.fm/search?query=${encodeURIComponent(`${stub.artist} ${stub.city === 'sydney' ? 'Sydney' : 'Melbourne'}`)}`;
            return (
              <article key={stub.id} className="thermal-stub-card">
                <div className="stub-perforation" aria-hidden="true" />
                <div className="stub-main">
                  <div className="stub-header">
                    <span className={`city-pill city-pill--${stub.city}`}>
                      {stub.city === 'sydney' ? 'SYDNEY · NSW' : 'MELBOURNE · VIC'}
                    </span>
                    <button
                      type="button"
                      className={`stub-stamp stub-stamp--btn ${stub.status === 'attended' ? 'is-attended' : ''}`}
                      onClick={() => onToggleStubStatus(stub.id)}
                      title="Click to toggle between Ticket Secured and Attended"
                    >
                      {stub.status === 'attended' && <CheckCircle2 size={11} />}
                      <span>{stub.status === 'attended' ? 'ATTENDED' : 'TICKET SECURED'}</span>
                    </button>
                  </div>

                  <div className="stub-artist-row">
                    <ArtistAvatar name={stub.artist} size="md" shape="rounded" />
                    <div>
                      <h3 className="stub-artist">{stub.artist}</h3>
                      <p className="stub-venue">
                        {stub.venueName} · {dParts.dayMonth}
                      </p>
                    </div>
                  </div>
                  <p className="stub-note">“{stub.sectionNote}”</p>

                  <div className="stub-footer">
                    <span className="price-aud">{formatAudPrice(stub.paidAud)}</span>
                    <span className="stub-stars" aria-label={`${stub.venueRating} out of 5 stars`}>
                      {Array.from({ length: stub.venueRating }).map((_, idx) => (
                        <Star key={idx} size={12} fill="currentColor" />
                      ))}
                    </span>
                    <a
                      href={setlistUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="platform-mini-link"
                    >
                      Setlist.fm <ExternalLink size={10} />
                    </a>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      onClick={() => onRemoveStub(stub.id)}
                      aria-label={`Delete stub for ${stub.artist}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
