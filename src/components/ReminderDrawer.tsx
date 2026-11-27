import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarPlus,
  ExternalLink,
  Send,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { ReminderRule } from '../types/gig';
import {
  computeCountdown,
  describeTicketingPortal,
  exportRemindersToIcs,
  formatAuTimestamp,
  playReminderChime,
  sanitizeExternalHttpsUrl,
} from '../utils/formatters';
import { ArtistAvatar } from './ArtistAvatar';
import { useLocale } from '../i18n/LocaleContext';

interface ReminderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  reminders: ReminderRule[];
  onRemoveReminder: (id: string) => void;
  onClearPastReminders: () => void;
  nowMs: number;
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotificationPermission: () => void;
  onShowToast: (message: string) => void;
  csrfToken: string;
  readonlyMode: boolean;
  defaultWebhookMasked: string | null;
}

export const ReminderDrawer: React.FC<ReminderDrawerProps> = ({
  isOpen,
  onClose,
  reminders,
  onRemoveReminder,
  onClearPastReminders,
  nowMs,
  notificationPermission,
  onRequestNotificationPermission,
  onShowToast,
  csrfToken,
  readonlyMode,
  defaultWebhookMasked,
}) => {
  const { locale, tr, cityLabel } = useLocale();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sendingWebhook, setSendingWebhook] = useState(false);

  if (!isOpen) return null;

  const sorted = [...reminders].sort(
    (a, b) => new Date(a.targetIso).getTime() - new Date(b.targetIso).getTime(),
  );

  const handleTestBrowserAlert = () => {
    playReminderChime();
    if (notificationPermission === 'granted' && 'Notification' in window) {
      new Notification('OZ Amp — Queue Open Test', {
        body: 'Ticketek & Ticketmaster pre-sale alerts are active for Melbourne & Sydney.',
      });
    }
    onShowToast('Stage chime & reminder alert verified.');
  };

  const handleSendTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readonlyMode) {
      onShowToast('Webhook dispatch is disabled in public read-only cloud mode.');
      return;
    }
    setSendingWebhook(true);
    try {
      const res = await fetch('/api/reminders/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          webhookUrl: webhookUrl.trim() || undefined,
          message: `OZ Amp Alert: ${reminders.length} Melbourne & Sydney concert reminder(s) active!`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onShowToast(`Push delivered to ${data.targetMasked || 'webhook'}.`);
      } else {
        onShowToast(data.error || 'Webhook push could not be delivered.');
      }
    } catch {
      onShowToast('Network error while testing webhook.');
    } finally {
      setSendingWebhook(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="side-drawer">
        <header className="modal-header">
          <div>
            <span className="eyebrow-kicker">
              {tr('Queue & Show-Night Dispatch', '开票与演出夜提醒中心')}
            </span>
            <h2 id="reminder-drawer-title" className="modal-title">
              {tr(`Saved Alerts (${reminders.length})`, `已存提醒 (${reminders.length})`)}
            </h2>
          </div>
          <button
            type="button"
            id="close-reminder-drawer-btn"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close reminder drawer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {/* Browser Notification & Audio Chime Panel */}
          <section className="utility-panel">
            <div className="utility-panel-row">
              <div>
                <h3 className="panel-heading">
                  {tr('Browser & Audio Queue Alerts', '浏览器通知与铃声提醒')}
                </h3>
                <p className="panel-subtext">
                  {notificationPermission === 'granted'
                    ? tr(
                        'Desktop browser notifications and harmonic queue chimes are active.',
                        '浏览器桌面弹窗提醒与开票提示音已开启。',
                      )
                    : notificationPermission === 'denied'
                      ? tr(
                          'Browser notifications are blocked in site settings — in-app banners & chimes still fire.',
                          '浏览器通知权限被屏蔽 — 页面内横幅与提示音仍会正常工作。',
                        )
                      : tr(
                          'Enable browser notifications so you never miss a 10:00 AM AEDT Telstra or Frontier queue.',
                          '开启浏览器通知，避免错过澳东时间上午 10:00 的 Telstra 或 Frontier 预售排队。',
                        )}
                </p>
              </div>
              <div className="panel-actions">
                {notificationPermission === 'default' && (
                  <button
                    type="button"
                    id="enable-browser-notifications-btn"
                    className="btn-primary-sm"
                    onClick={onRequestNotificationPermission}
                  >
                    <BellRing size={14} />
                    <span>{tr('Enable Alerts', '开启浏览器通知')}</span>
                  </button>
                )}
                <button
                  type="button"
                  id="test-chime-btn"
                  className="btn-outline-sm"
                  onClick={handleTestBrowserAlert}
                >
                  <Volume2 size={14} />
                  <span>{tr('Test Chime', '测试铃声')}</span>
                </button>
              </div>
            </div>

            {reminders.length > 0 && (
              <div className="utility-footer-bar">
                <button
                  type="button"
                  id="export-all-ics-btn"
                  className="btn-outline-sm"
                  onClick={() => {
                    exportRemindersToIcs(reminders);
                    onShowToast(
                      tr(
                        `Exported ${reminders.length} reminder(s) to .ics calendar file.`,
                        `已导出 ${reminders.length} 条提醒至 .ics 日历文件。`,
                      ),
                    );
                  }}
                >
                  <CalendarPlus size={14} />
                  <span>{tr('Download All as .ics Calendar', '全部导出为 .ics 日历')}</span>
                </button>
                <button
                  type="button"
                  id="clear-past-reminders-btn"
                  className="text-link-btn"
                  onClick={onClearPastReminders}
                >
                  {tr('Clear elapsed drops', '清理已过期提醒')}
                </button>
              </div>
            )}
          </section>

          {/* Active Reminder List */}
          <section className="reminder-list-section">
            {sorted.length === 0 ? (
              <div className="empty-box">
                <Bell size={24} />
                <p className="empty-title">{tr('No saved alerts yet', '暂未保存任何提醒')}</p>
                <p className="empty-desc">
                  {tr(
                    'Click Notify Me on any Pre-Sale window or concert card to set a 15-minute Ticketek/Ticketmaster waiting-room alarm, 1-hour heads-up, or 24-hour alert.',
                    '点击任意预售场次或演出卡片上的“设置提醒”，即可添加提前 15 分钟抢票候场提醒、开场前 1 小时或 24 小时提醒。',
                  )}
                </p>
              </div>
            ) : (
              <ul className="reminder-list">
                {sorted.map((item) => {
                  const cd = computeCountdown(item.targetIso, nowMs, locale);
                  const leadText =
                    item.leadMinutes === 15
                      ? tr('15m before (Queue Open)', '提前 15 分钟（进入候票室）')
                      : item.leadMinutes === 60
                        ? tr('1h before', '提前 1 小时')
                        : tr('24h before', '提前 24 小时');
                  return (
                    <li key={item.id} className="reminder-item">
                      <div className="reminder-item-visual">
                        <ArtistAvatar name={item.artist} size="sm" shape="rounded" />
                        <div className="reminder-item-main">
                          <div className="reminder-badges">
                            <span
                              className={`city-pill ${
                                item.regionBadge ? 'city-pill--global' : `city-pill--${item.city}`
                              }`}
                            >
                              {item.regionBadge
                                ? item.regionBadge
                                : cityLabel(item.city, 'short')}
                            </span>
                            <span className="lead-pill">{leadText}</span>
                            <span className={`mono-countdown ${cd.isImminent ? 'is-urgent' : ''}`}>
                              {cd.compact}
                            </span>
                          </div>
                          <h4 className="reminder-artist">{item.artist}</h4>
                          <p className="reminder-label">
                            {item.targetLabel} · {item.venueName}
                          </p>
                          <p className="reminder-timestamp">
                            {formatAuTimestamp(item.targetIso, item.city)}
                          </p>
                        </div>
                      </div>
                      <div className="reminder-item-actions">
                        <a
                          href={sanitizeExternalHttpsUrl(item.ticketUrl, item.artist)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline-sm"
                          title={`Open ${item.artist} ticketing page`}
                        >
                          <span>{describeTicketingPortal(sanitizeExternalHttpsUrl(item.ticketUrl, item.artist))}</span>
                          <ExternalLink size={13} />
                        </a>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          onClick={() => onRemoveReminder(item.id)}
                          aria-label={`Remove reminder for ${item.artist}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Optional Mobile Push Webhook Integration */}
          {!readonlyMode && (
            <form className="utility-panel webhook-form" onSubmit={handleSendTestWebhook}>
              <h3 className="panel-heading">Mobile Push Webhook (Optional)</h3>
              <p className="panel-subtext">
                Send a test dispatch to Bark (<code>api.day.app</code>), Telegram (
                <code>api.telegram.org</code>), Discord, or Slack.
                {defaultWebhookMasked ? ` Default configured: ${defaultWebhookMasked}` : ''}
              </p>
              <div className="inline-input-group">
                <input
                  type="url"
                  id="webhook-url-input"
                  className="text-input"
                  placeholder="https://api.day.app/your-bark-key/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <button
                  type="submit"
                  id="send-webhook-test-btn"
                  className="btn-outline-sm"
                  disabled={sendingWebhook}
                >
                  <Send size={14} />
                  <span>{sendingWebhook ? 'Sending…' : 'Test Push'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
};
