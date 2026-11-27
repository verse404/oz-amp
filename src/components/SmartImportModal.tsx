import React, { useState } from 'react';
import { FileText, PlusCircle, Sparkles, X } from 'lucide-react';
import type { ConcertEvent } from '../types/gig';
import { formatAudRange, formatAuTimestamp, formatConcertDate } from '../utils/formatters';
import { IS_STATIC_MODE } from '../config/runtimeMode';
import { parseTourAnnouncement } from '../../server/parseAnnouncement.mjs';
import { useLocale } from '../i18n/LocaleContext';

interface SmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  csrfToken: string;
  onImportConcerts: (concerts: ConcertEvent[], autoRemind: boolean) => void;
}

function buildFreshSampleAnnouncement(): string {
  const fmtAu = (daysAhead: number) => {
    const d = new Date(Date.now() + daysAhead * 86_400_000);
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Australia/Melbourne',
    }).format(d);
  };
  return `Tame Impala — Deadbeat Australian Arena Tour 2027
Presented by Frontier Touring & Chugg Entertainment
Tickets from A$139.90 - A$219.90 via Ticketek

Friday 16 April 2027 — Rod Laver Arena, Melbourne VIC
Wednesday 21 April 2027 — Qudos Bank Arena, Sydney NSW

Telstra Plus Pre-Sale: ${fmtAu(2)} 11:00am AEDT
Frontier Members Pre-Sale: ${fmtAu(4)} 1:00pm AEDT
General Public On-Sale: ${fmtAu(6)} 12:00pm AEDT`;
}

export const SmartImportModal: React.FC<SmartImportModalProps> = ({
  isOpen,
  onClose,
  csrfToken,
  onImportConcerts,
}) => {
  const { locale, tr, cityLabel } = useLocale();
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<ConcertEvent[] | null>(null);
  const [autoRemind, setAutoRemind] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleParse = async (textToParse: string) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      if (IS_STATIC_MODE) {
        const parsed = parseTourAnnouncement(textToParse);
        setPreview((parsed.concerts || []) as ConcertEvent[]);
        return;
      }
      const res = await fetch('/api/parse-announcement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ text: textToParse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not parse tour announcement.');
        setPreview(null);
      } else {
        setPreview(data.concerts || []);
      }
    } catch (err) {
      if (IS_STATIC_MODE) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not parse tour announcement.');
        setPreview(null);
      } else {
        // Fallback to local parser if backend is momentarily unreachable
        try {
          const parsed = parseTourAnnouncement(textToParse);
          setPreview((parsed.concerts || []) as ConcertEvent[]);
        } catch {
          setErrorMsg('Unable to parse tour announcement.');
          setPreview(null);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = () => {
    if (!preview || preview.length === 0) return;
    onImportConcerts(preview, autoRemind);
    setRawText('');
    setPreview(null);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-import-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="center-modal">
        <header className="modal-header">
          <div>
            <span className="eyebrow-kicker">Frontier · Live Nation · Ticketek · Instagram</span>
            <h2 id="smart-import-title" className="modal-title">
              {tr('Paste Tour or Pre-Sale Announcement', '粘贴巡演官宣或预售公告')}
            </h2>
          </div>
          <button
            type="button"
            id="close-import-modal-btn"
            className="icon-btn"
            onClick={onClose}
            aria-label={tr('Close announcement importer', '关闭导入弹窗')}
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <p className="panel-subtext">
            {tr(
              'Paste any Australian tour press release, Frontier Touring email, or social caption. We automatically extract Sydney & Melbourne venues, dates, AUD pricing, and Telstra / Frontier / General On-Sale windows.',
              '粘贴任意澳洲巡演新闻稿、Frontier 邮件或社媒官宣文案，系统将自动提取墨尔本与悉尼场馆、日期、澳元票价及各阶段预售/公售时间。',
            )}
          </p>

          <div className="sample-bar">
            <button
              type="button"
              id="load-sample-tour-btn"
              className="btn-outline-sm"
              onClick={() => {
                const sample = buildFreshSampleAnnouncement();
                setRawText(sample);
                void handleParse(sample);
              }}
            >
              <Sparkles size={14} />
              <span>{tr('Try Sample Frontier / Telstra Tour Drop', '试试示例巡演文案')}</span>
            </button>
          </div>

          <textarea
            id="announcement-textarea"
            className="announcement-textarea"
            rows={7}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={tr(
              'Paste tour dates, Sydney/Melbourne venues, and pre-sale times here...',
              '在此粘贴巡演日期、墨尔本/悉尼场馆和预售时间…',
            )}
          />

          {errorMsg && <p className="inline-error">{errorMsg}</p>}

          <div className="modal-action-row">
            <button
              type="button"
              id="parse-announcement-btn"
              className="btn-primary"
              disabled={loading || rawText.trim().length < 10}
              onClick={() => void handleParse(rawText)}
            >
              <FileText size={16} />
              <span>
                {loading
                  ? tr('Extracting Dates…', '正在识别日期…')
                  : tr('Extract Sydney & Melbourne Dates', '智能识别墨尔本与悉尼场次')}
              </span>
            </button>
          </div>

          {preview && preview.length > 0 && (
            <div className="preview-box">
              <div className="preview-header">
                <h3 className="panel-heading">
                  {tr(
                    `Extracted ${preview.length} Tour Stop${preview.length === 1 ? '' : 's'}`,
                    `已识别 ${preview.length} 场演出`,
                  )}
                </h3>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoRemind}
                    onChange={(e) => setAutoRemind(e.target.checked)}
                  />
                  <span>
                    {tr(
                      'Auto-set 15m Queue Reminders for all extracted pre-sales',
                      '自动为所有预售场次开启提前 15 分钟开票提醒',
                    )}
                  </span>
                </label>
              </div>

              <ul className="preview-list">
                {preview.map((c) => {
                  const formattedDate = formatConcertDate(c.dateIso, c.timeZone, locale);
                  return (
                    <li key={c.id} className="preview-card">
                      <div>
                        <span className={`city-pill city-pill--${c.city}`}>
                          {cityLabel(c.city, 'state')}
                        </span>
                        <strong className="preview-artist">
                          {c.artist} — {c.venueName}
                        </strong>
                        <p className="preview-meta">
                          {formattedDate.fullLabel} · {formatAudRange(c.priceMinAud, c.priceMaxAud)}{' '}
                          · {c.agency}
                        </p>
                        {c.ticketDrops.length > 0 && (
                          <ul className="preview-drops">
                            {c.ticketDrops.map((d) => (
                              <li key={d.id}>
                                <strong>{d.kind}:</strong>{' '}
                                {formatAuTimestamp(d.opensAtIso, c.city, locale)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                id="confirm-import-btn"
                className="btn-primary full-width"
                onClick={handleConfirmImport}
              >
                <PlusCircle size={16} />
                <span>
                  {autoRemind
                    ? tr('Add to My Gig Guide & Save Alerts', '添加到演出列表并保存提醒')
                    : tr('Add to My Gig Guide', '添加到演出列表')}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
