import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellPlus,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Ticket,
  Zap,
} from 'lucide-react';
import type {
  ConcertEvent,
  LeadMinutes,
  ReminderRule,
  TicketDropWindow,
  WorldFestivalItem,
} from '../types/gig';
import {
  describeTicketingPortal,
  formatAudRange,
  formatAuTimestamp,
  sanitizeExternalHttpsUrl,
} from '../utils/formatters';
import { ArtistAvatar } from './ArtistAvatar';

interface ConcertCalendarViewProps {
  concerts: ConcertEvent[];
  upcomingDrops: Array<{ concert: ConcertEvent; drop: TicketDropWindow; opensMs: number }>;
  worldFestivals: WorldFestivalItem[];
  reminders: ReminderRule[];
  onAddOrToggleReminder: (
    concert: ConcertEvent,
    leadMinutes: LeadMinutes,
    drop?: TicketDropWindow,
  ) => void;
  onOpenWorldFestivalsPage: () => void;
}

interface DayBucket {
  concerts: ConcertEvent[];
  drops: Array<{ concert: ConcertEvent; drop: TicketDropWindow }>;
  worldFests: WorldFestivalItem[];
}

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toAuDateIso(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
  }).format(d);
}

function expandIsoDateSpan(startIso: string, endIso?: string, maxDays = 10): string[] {
  const result: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso)) return result;
  const start = new Date(`${startIso}T12:00:00Z`);
  const end =
    endIso && /^\d{4}-\d{2}-\d{2}$/.test(endIso)
      ? new Date(`${endIso}T12:00:00Z`)
      : start;
  const cur = new Date(start.getTime());
  let count = 0;
  while (cur <= end && count < maxDays) {
    result.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    count += 1;
  }
  return result;
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1 + delta, 15));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthTitle(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 15));
  return new Intl.DateTimeFormat('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function formatMonthShort(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 15));
  return new Intl.DateTimeFormat('en-AU', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

function formatFullDayHeading(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export const ConcertCalendarView: React.FC<ConcertCalendarViewProps> = ({
  concerts,
  upcomingDrops,
  worldFestivals,
  reminders,
  onAddOrToggleReminder,
  onOpenWorldFestivalsPage,
}) => {
  const todayAu = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne',
      }).format(new Date()),
    [],
  );

  const [showDropsOverlay, setShowDropsOverlay] = useState(true);
  const [showWorldOverlay, setShowWorldOverlay] = useState(true);
  const [activeMonth, setActiveMonth] = useState<string>(() => todayAu.slice(0, 7));
  const [selectedDayIso, setSelectedDayIso] = useState<string>(() => todayAu);

  // Build date -> events lookup across concerts (incl. additionalDates), drops & world festivals
  const dayMap = useMemo(() => {
    const map = new Map<string, DayBucket>();
    const ensure = (iso: string): DayBucket => {
      let bucket = map.get(iso);
      if (!bucket) {
        bucket = { concerts: [], drops: [], worldFests: [] };
        map.set(iso, bucket);
      }
      return bucket;
    };

    for (const c of concerts) {
      const dates = [c.dateIso, ...(c.additionalDates || [])];
      for (const dIso of dates) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dIso)) {
          ensure(dIso).concerts.push(c);
        }
      }
    }

    if (showDropsOverlay) {
      for (const item of upcomingDrops) {
        const dropDay = toAuDateIso(item.drop.opensAtIso);
        if (dropDay) {
          ensure(dropDay).drops.push({ concert: item.concert, drop: item.drop });
        }
      }
    }

    if (showWorldOverlay) {
      for (const wf of worldFestivals) {
        const span = expandIsoDateSpan(wf.startDateIso, wf.endDateIso, 10);
        for (const dIso of span) {
          ensure(dIso).worldFests.push(wf);
        }
      }
    }

    return map;
  }, [concerts, upcomingDrops, worldFestivals, showDropsOverlay, showWorldOverlay]);

  // Quick-jump month strip (12 months starting from current AU month)
  const quickMonths = useMemo(() => {
    const base = todayAu.slice(0, 7);
    return Array.from({ length: 12 }, (_, idx) => {
      const mk = shiftMonthKey(base, idx);
      let gigCount = 0;
      let worldCount = 0;
      for (const [iso, bucket] of dayMap.entries()) {
        if (iso.startsWith(mk)) {
          gigCount += bucket.concerts.length;
          worldCount += bucket.worldFests.length > 0 ? 1 : 0;
        }
      }
      return { key: mk, label: formatMonthShort(mk), gigCount, worldCount };
    });
  }, [todayAu, dayMap]);

  // Build 7-column Mon–Sun grid cells for activeMonth
  const calendarCells = useMemo(() => {
    const [yStr, mStr] = activeMonth.split('-');
    const year = Number(yStr);
    const monthIdx = Number(mStr) - 1;
    const firstOfMonth = new Date(Date.UTC(year, monthIdx, 1));
    const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    // Monday = 0 ... Sunday = 6
    const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;

    const cells: Array<{
      iso: string | null;
      dayNum?: number;
      isWeekend?: boolean;
      isToday?: boolean;
      bucket?: DayBucket;
    }> = [];

    for (let i = 0; i < leadingBlanks; i += 1) {
      cells.push({ iso: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${activeMonth}-${String(day).padStart(2, '0')}`;
      const dow = (leadingBlanks + day - 1) % 7; // 4=Fri, 5=Sat, 6=Sun
      cells.push({
        iso,
        dayNum: day,
        isWeekend: dow >= 4,
        isToday: iso === todayAu,
        bucket: dayMap.get(iso),
      });
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < trailing; i += 1) {
      cells.push({ iso: null });
    }
    return cells;
  }, [activeMonth, dayMap, todayAu]);

  // Summary counts for activeMonth + auto-pick sensible selected day when switching months
  const monthSummary = useMemo(() => {
    let gigs = 0;
    let drops = 0;
    const wfNames = new Set<string>();
    let clashes = 0;
    let firstActiveIso: string | null = null;

    for (const cell of calendarCells) {
      if (!cell.iso || !cell.bucket) continue;
      const b = cell.bucket;
      const hasAny = b.concerts.length > 0 || b.drops.length > 0 || b.worldFests.length > 0;
      if (hasAny && !firstActiveIso) firstActiveIso = cell.iso;
      gigs += b.concerts.length;
      drops += b.drops.length;
      b.worldFests.forEach((wf) => wfNames.add(wf.name));
      if (b.concerts.length > 0 && b.worldFests.length > 0) clashes += 1;
    }

    return { gigs, drops, worldFestsCount: wfNames.size, clashes, firstActiveIso };
  }, [calendarCells]);

  const effectiveSelectedIso = selectedDayIso.startsWith(activeMonth)
    ? selectedDayIso
    : monthSummary.firstActiveIso || `${activeMonth}-01`;

  const selectedBucket = dayMap.get(effectiveSelectedIso);

  const remindedConcertIds = useMemo(
    () => new Set(reminders.map((r) => r.concertId)),
    [reminders],
  );

  const jumpToMonth = (nextMonth: string) => {
    setActiveMonth(nextMonth);
    setSelectedDayIso(`${nextMonth}-01`);
  };

  return (
    <section className="calendar-view-shell" aria-label="Interactive monthly concert calendar">
      {/* Calendar Header & Overlay Controls */}
      <div className="calendar-toolbar">
        <div className="calendar-nav-group">
          <button
            type="button"
            className="icon-btn"
            onClick={() => jumpToMonth(shiftMonthKey(activeMonth, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="calendar-month-heading">
            <h2 className="calendar-month-title">{formatMonthTitle(activeMonth)}</h2>
            <span className="calendar-month-stats">
              {monthSummary.gigs} gig{monthSummary.gigs === 1 ? '' : 's'}
              {showDropsOverlay ? ` · ${monthSummary.drops} drop${monthSummary.drops === 1 ? '' : 's'}` : ''}
              {showWorldOverlay && monthSummary.worldFestsCount > 0
                ? ` · ${monthSummary.worldFestsCount} world fest${monthSummary.worldFestsCount === 1 ? '' : 's'}`
                : ''}
              {monthSummary.clashes > 0 ? ` · ${monthSummary.clashes} travel overlap` : ''}
            </span>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={() => jumpToMonth(shiftMonthKey(activeMonth, 1))}
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="calendar-overlay-toggles">
          <button
            type="button"
            className={`genre-pill ${showDropsOverlay ? 'is-active' : ''}`}
            onClick={() => setShowDropsOverlay((v) => !v)}
          >
            <Zap size={12} />
            <span>Ticket Drops</span>
          </button>
          <button
            type="button"
            className={`genre-pill ${showWorldOverlay ? 'is-active' : ''}`}
            onClick={() => setShowWorldOverlay((v) => !v)}
          >
            <Globe size={12} />
            <span>World Festivals</span>
          </button>
          <button
            type="button"
            className="btn-subtle-sm"
            onClick={() => {
              setActiveMonth(todayAu.slice(0, 7));
              setSelectedDayIso(todayAu);
            }}
          >
            Today
          </button>
        </div>
      </div>

      {/* Quick 12-Month Jump Strip */}
      <div className="calendar-month-strip" role="tablist" aria-label="Jump to month">
        {quickMonths.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={activeMonth === m.key}
            className={`cal-month-chip ${activeMonth === m.key ? 'is-active' : ''}`}
            onClick={() => jumpToMonth(m.key)}
          >
            <span>{m.label}</span>
            <span className="cal-month-count">{m.gigCount}</span>
            {m.worldCount > 0 && <span className="cal-world-dot" title="World Festival dates" />}
          </button>
        ))}
      </div>

      {/* Color Legend */}
      <div className="calendar-legend" aria-hidden="true">
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--mel" /> Melbourne Gig
        </span>
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--syd" /> Sydney Gig
        </span>
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--drop" /> Ticket Drop / Pre-Sale
        </span>
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--world" /> World Festival Travel Window
        </span>
      </div>

      {/* 7-Column Mon–Sun Grid */}
      <div className="calendar-grid-scroll">
        <div className="calendar-grid">
          {WEEKDAY_HEADERS.map((wd, idx) => (
            <div
              key={wd}
              className={`calendar-dow-head ${idx >= 4 ? 'is-weekend' : ''}`}
            >
              {wd}
            </div>
          ))}

          {calendarCells.map((cell, i) => {
            if (!cell.iso) {
              return <div key={`blank-${i}`} className="calendar-cell is-blank" aria-hidden="true" />;
            }
            const b = cell.bucket;
            const totalItems =
              (b?.concerts.length || 0) + (b?.drops.length || 0) + (b?.worldFests.length || 0);
            const hasClash = Boolean(b && b.concerts.length > 0 && b.worldFests.length > 0);
            const isSelected = cell.iso === effectiveSelectedIso;

            const pillRows: Array<{
              key: string;
              kind: 'mel' | 'syd' | 'drop' | 'world';
              label: string;
            }> = [];

            if (b) {
              for (const wf of b.worldFests) {
                pillRows.push({ key: `wf-${wf.id}`, kind: 'world', label: `🌍 ${wf.name}` });
              }
              for (const d of b.drops) {
                pillRows.push({
                  key: `dr-${d.drop.id}`,
                  kind: 'drop',
                  label: `⚡ ${d.concert.artist}`,
                });
              }
              for (const c of b.concerts) {
                pillRows.push({
                  key: `c-${c.id}`,
                  kind: c.city === 'sydney' ? 'syd' : 'mel',
                  label: c.artist,
                });
              }
            }

            return (
              <button
                key={cell.iso}
                type="button"
                className={`calendar-cell ${cell.isWeekend ? 'is-weekend' : ''} ${
                  cell.isToday ? 'is-today' : ''
                } ${isSelected ? 'is-selected' : ''} ${totalItems > 0 ? 'has-events' : ''}`}
                onClick={() => setSelectedDayIso(cell.iso!)}
              >
                <div className="calendar-day-top">
                  <span className="calendar-day-num">{cell.dayNum}</span>
                  {hasClash && (
                    <span className="cal-clash-flag" title="AU gig overlaps with a World Festival">
                      <AlertTriangle size={11} />
                    </span>
                  )}
                </div>

                {pillRows.length > 0 && (
                  <div className="calendar-cell-pills">
                    {pillRows.slice(0, 3).map((p) => (
                      <span key={p.key} className={`cal-ev-pill cal-ev-pill--${p.kind}`}>
                        {p.label}
                      </span>
                    ))}
                    {pillRows.length > 3 && (
                      <span className="cal-more-count">+{pillRows.length - 3} more</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Agenda Detail Panel */}
      <div className="calendar-day-agenda" aria-live="polite">
        <div className="calendar-agenda-head">
          <div>
            <span className="eyebrow-kicker">SELECTED DAY SCHEDULE</span>
            <h3 className="calendar-agenda-title">{formatFullDayHeading(effectiveSelectedIso)}</h3>
          </div>
          {selectedBucket &&
            selectedBucket.concerts.length > 0 &&
            selectedBucket.worldFests.length > 0 && (
              <span className="watched-match-pill">
                <AlertTriangle size={12} />
                <span>Travel Clash: AU gig overlaps World Festival window</span>
              </span>
            )}
        </div>

        {!selectedBucket ||
        (selectedBucket.concerts.length === 0 &&
          selectedBucket.drops.length === 0 &&
          selectedBucket.worldFests.length === 0) ? (
          <p className="calendar-agenda-empty">
            No matching gigs, ticket drops, or tracked world festivals on this day. Click any
            highlighted day on the calendar above to inspect its full lineup.
          </p>
        ) : (
          <div className="calendar-agenda-list">
            {selectedBucket.worldFests.map((wf) => (
              <div key={`ag-wf-${wf.id}`} className="calendar-agenda-row is-world">
                <div className="calendar-agenda-main">
                  <span className="city-pill city-pill--global">{wf.countryCode}</span>
                  <div>
                    <strong>{wf.name}</strong>
                    <span className="calendar-agenda-sub">
                      {wf.datesLabel} · {wf.venueName}, {wf.city}
                    </span>
                  </div>
                </div>
                <div className="calendar-agenda-actions">
                  <button
                    type="button"
                    className="btn-outline-sm"
                    onClick={onOpenWorldFestivalsPage}
                  >
                    <Globe size={13} />
                    <span>World Page</span>
                  </button>
                  <a
                    href={sanitizeExternalHttpsUrl(wf.officialUrl, wf.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary-sm"
                  >
                    <span>Official</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}

            {selectedBucket.drops.map(({ concert, drop }) => {
              const isArmed = reminders.some(
                (r) => r.id === `${concert.id}::${drop.id}::15`,
              );
              const href = sanitizeExternalHttpsUrl(drop.bookingUrl, concert.artist);
              return (
                <div key={`ag-drop-${drop.id}`} className="calendar-agenda-row is-drop">
                  <div className="calendar-agenda-main">
                    <ArtistAvatar name={concert.artist} size="sm" />
                    <div>
                      <div className="calendar-agenda-badges">
                        <span className={`city-pill city-pill--${concert.city}`}>
                          {concert.city === 'sydney' ? 'SYD' : 'MEL'}
                        </span>
                        <span className="presale-kind-badge">⚡ {drop.kind}</span>
                      </div>
                      <strong>
                        {concert.artist} — {drop.label}
                      </strong>
                      <span className="calendar-agenda-sub">
                        <Clock size={12} /> Opens {formatAuTimestamp(drop.opensAtIso, concert.city)} ·{' '}
                        {concert.venueName}
                      </span>
                    </div>
                  </div>
                  <div className="calendar-agenda-actions">
                    <button
                      type="button"
                      className={isArmed ? 'btn-armed-sm' : 'btn-outline-sm'}
                      onClick={() => onAddOrToggleReminder(concert, 15, drop)}
                    >
                      {isArmed ? <Check size={13} /> : <BellPlus size={13} />}
                      <span>{isArmed ? 'Armed' : 'T-15m Alert'}</span>
                    </button>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary-sm"
                    >
                      <span>{describeTicketingPortal(href)}</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}

            {selectedBucket.concerts.map((concert) => {
              const isArmed = remindedConcertIds.has(concert.id);
              const href = sanitizeExternalHttpsUrl(concert.ticketUrl, concert.artist);
              return (
                <div key={`ag-gig-${concert.id}`} className="calendar-agenda-row">
                  <div className="calendar-agenda-main">
                    <ArtistAvatar name={concert.artist} size="sm" />
                    <div>
                      <div className="calendar-agenda-badges">
                        <span className={`city-pill city-pill--${concert.city}`}>
                          {concert.city === 'sydney' ? 'SYD · NSW' : 'MEL · VIC'}
                        </span>
                        <span className="calendar-price-mini">
                          {formatAudRange(concert.priceMinAud, concert.priceMaxAud)}
                        </span>
                      </div>
                      <strong>
                        {concert.artist}
                        {concert.tourTitle ? ` — ${concert.tourTitle}` : ''}
                      </strong>
                      <span className="calendar-agenda-sub">
                        <MapPin size={12} /> {concert.venueName} ({concert.suburb}) · Doors{' '}
                        {concert.doorsTimeLocal} · Set {concert.setTimeLocal}
                      </span>
                    </div>
                  </div>
                  <div className="calendar-agenda-actions">
                    <button
                      type="button"
                      className={isArmed ? 'btn-armed-sm' : 'btn-outline-sm'}
                      onClick={() => onAddOrToggleReminder(concert, 60)}
                    >
                      {isArmed ? <Check size={13} /> : <Calendar size={13} />}
                      <span>{isArmed ? 'Armed' : 'Remind 1h'}</span>
                    </button>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary-sm"
                    >
                      <Ticket size={13} />
                      <span>{concert.agency}</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
