import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Sparkles } from 'lucide-react';
import type { CityId, FestivalAdvisorItem, MonitoredSinger } from '../types/gig';
import { analyzeFestivalDecision } from '../utils/auMarketTools';
import { formatAudPrice, sanitizeExternalHttpsUrl } from '../utils/formatters';

interface FestivalAdvisorSectionProps {
  festivals: FestivalAdvisorItem[];
  monitoredSingers: MonitoredSinger[];
  homeCity: CityId;
}

export const FestivalAdvisorSection: React.FC<FestivalAdvisorSectionProps> = ({
  festivals,
  monitoredSingers,
  homeCity,
}) => {
  const [selectedFestivalId, setSelectedFestivalId] = useState<string>(
    festivals[0]?.id || 'laneway-2027',
  );
  const [targetCity, setTargetCity] = useState<CityId>(homeCity);
  const [pickedActs, setPickedActs] = useState<string[]>(['Fontaines D.C.', 'Hayley Williams']);

  useEffect(() => {
    setTargetCity(homeCity);
  }, [homeCity]);

  const festival = useMemo(
    () => festivals.find((f) => f.id === selectedFestivalId) || festivals[0],
    [festivals, selectedFestivalId],
  );

  if (!festival) return null;

  const toggleAct = (artist: string) => {
    setPickedActs((prev) =>
      prev.includes(artist) ? prev.filter((a) => a !== artist) : [...prev, artist],
    );
  };

  const syncWithMonitored = () => {
    const matched = festival.slots
      .map((s) => s.artist)
      .filter((act) =>
        monitoredSingers.some(
          (m) =>
            m.name.toLowerCase() === act.toLowerCase() ||
            act.toLowerCase().includes(m.name.toLowerCase()),
        ),
      );
    if (matched.length > 0) {
      setPickedActs(matched);
    } else {
      // Select top 3 acts on this festival to demonstrate comparison
      setPickedActs(festival.slots.slice(-3).map((s) => s.artist));
    }
  };

  const effectivePicked = pickedActs.filter((a) =>
    festival.slots.some((s) => s.artist === a),
  );

  const analysis = analyzeFestivalDecision(festival, effectivePicked, targetCity);

  return (
    <section
      id="festival-advisor"
      className="feature-section"
      aria-labelledby="festival-advisor-heading"
    >
      <div className="section-header-row">
        <div>
          <span className="eyebrow-kicker">
            Australian Festival vs. Headline Sideshow Calculator
          </span>
          <h2 id="festival-advisor-heading" className="section-heading">
            Festival Pass vs. Sydney/Melbourne Sideshows &amp; Clash Advisor
          </h2>
        </div>

        <div className="header-cta-group">
          <button
            type="button"
            id="sync-festival-monitored-btn"
            className="btn-outline-sm"
            onClick={syncWithMonitored}
          >
            <Sparkles size={14} />
            <span>Match My Monitored Singers</span>
          </button>
        </div>
      </div>

      <p className="section-sublead">
        Most international festival acts in Australia also play intimate theatre sideshows (Enmore,
        Forum, Hordern, Northcote). Toggle the acts you want to see below to check stage set-time
        clashes and whether individual sideshow tickets beat a full festival pass.
      </p>

      <div className="festival-controls-bar">
        <div className="category-tabs" role="tablist" aria-label="Select Australian festival">
          {festivals.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={festival.id === f.id}
              className={`genre-pill ${festival.id === f.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedFestivalId(f.id);
                setPickedActs(f.slots.slice(-2).map((s) => s.artist));
              }}
            >
              {f.name} ({formatAudPrice(f.festivalPassAud)})
            </button>
          ))}
        </div>

        <div className="city-mini-switch">
          <button
            type="button"
            className={`genre-pill ${targetCity === 'melbourne' ? 'is-active' : ''}`}
            onClick={() => setTargetCity('melbourne')}
          >
            Compare Melbourne
          </button>
          <button
            type="button"
            className={`genre-pill ${targetCity === 'sydney' ? 'is-active' : ''}`}
            onClick={() => setTargetCity('sydney')}
          >
            Compare Sydney
          </button>
        </div>
      </div>

      {/* Interactive Lineup Slot Toggles */}
      <div className="festival-slots-grid">
        {festival.slots.map((slot) => {
          const isSelected = effectivePicked.includes(slot.artist);
          return (
            <button
              key={slot.artist}
              type="button"
              className={`festival-slot-chip ${isSelected ? 'is-selected' : ''}`}
              onClick={() => toggleAct(slot.artist)}
            >
              <div className="slot-chip-top">
                <strong>{slot.artist}</strong>
                {isSelected && <Check size={14} />}
              </div>
              <span className="slot-chip-meta">
                {slot.stage} · {slot.start}–{slot.end}
              </span>
            </button>
          );
        })}
      </div>

      {/* Verdict & Clash Output Card */}
      <div className="festival-verdict-grid">
        <div className="verdict-summary-card">
          <span className="eyebrow-kicker">Smart Cost &amp; Set-Length Verdict</span>
          <h3 className="verdict-headline">{analysis.verdictBadge}</h3>
          <p className="panel-subtext">{analysis.verdictExplanation}</p>

          <div className="cost-compare-bars">
            <div className="cost-row">
              <span>Full {festival.name} Pass</span>
              <strong>{formatAudPrice(festival.festivalPassAud)}</strong>
            </div>
            <div className="cost-row">
              <span>
                Selected {targetCity === 'sydney' ? 'Sydney' : 'Melbourne'} Sideshows (
                {effectivePicked.length})
              </span>
              <strong>{formatAudPrice(analysis.sideshowTotalAud)}</strong>
            </div>
          </div>

          {analysis.clashes.length > 0 ? (
            <div className="clash-warnings-box">
              {analysis.clashes.map((cl, idx) => (
                <div key={idx} className="clash-item">
                  <AlertTriangle size={14} />
                  <span>{cl.summary}</span>
                </div>
              ))}
            </div>
          ) : (
            effectivePicked.length >= 2 && (
              <p className="clean-run-badge">
                Zero set-time clashes across your {effectivePicked.length} selected acts!
              </p>
            )
          )}

          <div className="panel-actions">
            <a
              href={sanitizeExternalHttpsUrl(festival.ticketUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary-sm"
            >
              <span>Official {festival.agency} Page</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Sideshow Comparison Ledger */}
        <div className="sideshow-table-card">
          <h3 className="panel-heading">
            Sydney &amp; Melbourne Headline Sideshow Ledger
          </h3>
          <div className="sideshow-list">
            {festival.sideshows.map((side) => {
              const highlighted = effectivePicked.includes(side.artist);
              return (
                <div
                  key={side.artist}
                  className={`sideshow-row ${highlighted ? 'is-highlighted' : ''}`}
                >
                  <div>
                    <strong>{side.artist}</strong>
                    <span className="sideshow-venues">
                      SYD: {side.sydneyVenue} · MEL: {side.melbourneVenue}
                    </span>
                  </div>
                  <span className="sideshow-price">
                    {side.festivalOnly ? 'Fest Only' : formatAudPrice(side.priceAud)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
