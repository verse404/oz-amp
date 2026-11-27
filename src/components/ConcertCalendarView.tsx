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
import { useLocale } from '../i18n/LocaleContext';

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

const WEEKDAY_HEADERS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_HEADERS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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

function formatMonthTitle(monthKey: string, intlLocale: 'en-AU' | 'zh-CN'): string {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 15));
  return new Intl.DateTimeFormat(intlLocale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function formatMonthShort(monthKey: string, intlLocale: 'en-AU' | 'zh-CN'): string {
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, 15));
  return new Intl.DateTimeFormat(intlLocale, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

function formatFullDayHeading(dateIso: string, intlLocale: 'en-AU' | 'zh-CN'): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  return new Intl.DateTimeFormat(intlLocale, {
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
  const { locale, intlLocale, isZh, tr, cityLabel, dropKindLabel } = useLocale();
  const weekdayHeaders = isZh ? WEEKDAY_HEADERS_ZH : WEEKDAY_HEADERS_EN;
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
      return { key: mk, label: formatMonthShort(mk, intlLocale), gigCount, worldCount };
    });
  }, [todayAu, dayMap, intlLocale]);

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
    setSelectedDayIso('');
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
            <h2 className="calendar-month-title">{formatMonthTitle(activeMonth, intlLocale)}</h2>
            <span className="calendar-month-stats">
              {isZh ? (
                <>
                  {monthSummary.gigs} 场演出
                  {showDropsOverlay ? ` · ${monthSummary.drops} 场开票` : ''}
                  {showWorldOverlay && monthSummary.worldFestsCount > 0
                    ? ` · ${monthSummary.worldFestsCount} 个全球音乐节`
                    : ''}
                  {monthSummary.clashes > 0 ? ` · ${monthSummary.clashes} 处行程重叠` : ''}
                </>
              ) : (
                <>
                  {monthSummary.gigs} gig{monthSummary.gigs === 1 ? '' : 's'}
                  {showDropsOverlay ? ` · ${monthSummary.drops} drop${monthSummary.drops === 1 ? '' : 's'}` : ''}
                  {showWorldOverlay && monthSummary.worldFestsCount > 0
                    ? ` · ${monthSummary.worldFestsCount} world fest${monthSummary.worldFestsCount === 1 ? '' : 's'}`
                    : ''}
                  {monthSummary.clashes > 0 ? ` · ${monthSummary.clashes} travel overlap` : ''}
                </>
              )}
            </span>
          </div>

          <button
            type="button"
            className="icon-btn"
            onClick={() => jumpToMonth(shiftMonthKey(activeMonth, 1))}
            aria-label={tr('Next month', '下个月')}
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
            <span>{tr('Ticket Drops', '开票场次')}</span>
          </button>
          <button
            type="button"
            className={`genre-pill ${showWorldOverlay ? 'is-active' : ''}`}
            onClick={() => setShowWorldOverlay((v) => !v)}
          >
            <Globe size={12} />
            <span>{tr('World Festivals', '全球音乐节')}</span>
          </button>
          <button
            type="button"
            className="btn-subtle-sm"
            onClick={() => {
              setActiveMonth(todayAu.slice(0, 7));
              setSelectedDayIso(todayAu);
            }}
          >
            {tr('Today', '今天')}
          </button>
        </div>
      </div>

      {/* Quick 12-Month Jump Strip */}
      <div className="calendar-month-strip" role="tablist" aria-label={tr('Jump to month', '快捷切换月份')}>
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
            {m.worldCount > 0 && (
              <span className="cal-world-dot" title={tr('World Festival dates', '全球音乐节日期')} />
            )}
          </button>
        ))}
      </div>

      {/* Color Legend */}
      <div className="calendar-legend" aria-hidden="true">
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--mel" /> {tr('Melbourne Gig', '墨尔本演出')}
        </span>
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--syd" /> {tr('Sydney Gig', '悉尼演出')}
        </span>
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--drop" /> {tr('Ticket Drop / Pre-Sale', '预售 / 开票')}
        </span>
        <span className="cal-legend-item">
          <i className="cal-dot cal-dot--world" /> {tr('World Festival Travel Window', '全球音乐节档期')}
        </span>
      </div>

      {/* 7-Column Mon–Sun Grid */}
      <p className="calendar-mobile-hint">
        {tr(
          'Swipe calendar horizontally ↔ or tap any highlighted day to inspect its agenda below.',
          '左右滑动日历 ↔ 或点击任意高亮日期查看当日演出详情。',
        )}
      </p>
      <div className="calendar-grid-scroll">
        <div className="calendar-grid">
          {weekdayHeaders.map((wd, idx) => (
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
                    <span
                      className="cal-clash-flag"
                      title={tr(
                        'AU gig overlaps with a World Festival',
                        '澳洲演出与全球音乐节日期重叠',
                      )}
                    >
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
                      <span className="cal-more-count">
                        {tr(`+${pillRows.length - 3} more`, `另 +${pillRows.length - 3} 项`)}
                      </span>
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
            <span className="eyebrow-kicker">{tr('SELECTED DAY SCHEDULE', '当日演出日程')}</span>
            <h3 className="calendar-agenda-title">
              {formatFullDayHeading(effectiveSelectedIso, intlLocale)}
            </h3>
          </div>
          {selectedBucket &&
            selectedBucket.concerts.length > 0 &&
            selectedBucket.worldFests.length > 0 && (
              <span className="watched-match-pill">
                <AlertTriangle size={12} />
                <span>
                  {tr(
                    'Travel Clash: AU gig overlaps World Festival window',
                    '档期提示：澳洲演出与全球音乐节日期重叠',
                  )}
                </span>
              </span>
            )}
        </div>

        {!selectedBucket ||
        (selectedBucket.concerts.length === 0 &&
          selectedBucket.drops.length === 0 &&
          selectedBucket.worldFests.length === 0) ? (
          <p className="calendar-agenda-empty">
            {tr(
              'No matching gigs, ticket drops, or tracked world festivals on this day. Click any highlighted day on the calendar above to inspect its full lineup.',
              '当日暂无匹配的演出、开票或全球音乐节。点击上方任意高亮日期即可查看详情。',
            )}
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
                    <span>{tr('World Page', '全球页面')}</span>
                  </button>
                  <a
                    href={sanitizeExternalHttpsUrl(wf.officialUrl, wf.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary-sm"
                  >
                    <span>{tr('Official', '官网')}</span>
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
                          {cityLabel(concert.city, 'short')}
                        </span>
                        <span className="presale-kind-badge">⚡ {dropKindLabel(drop.kind)}</span>
                      </div>
                      <strong>
                        {concert.artist} — {drop.label}
                      </strong>
                      <span className="calendar-agenda-sub">
                        <Clock size={12} /> {tr('Opens', '开票')}{' '}
                        {formatAuTimestamp(drop.opensAtIso, concert.city, locale)} ·{' '}
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
                      <span>{isArmed ? tr('Alert On', '已设提醒') : tr('T-15m Alert', '提前15分提醒')}</span>
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
                          {cityLabel(concert.city, 'state').toUpperCase()}
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
                        <MapPin size={12} /> {concert.venueName} ({concert.suburb}) ·{' '}
                        {tr('Doors', '入场')} {concert.doorsTimeLocal} · {tr('Set', '主秀')}{' '}
                        {concert.setTimeLocal}
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
                      <span>{isArmed ? tr('Alert On', '已设提醒') : tr('Notify 1h', '提前1小时提醒')}</span>
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
