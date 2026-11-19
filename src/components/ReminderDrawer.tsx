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
        body: 'Ticketek & Ticketmaster pre-sale alerts are armed for Melbourne & Sydney.',
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
            <span className="eyebrow-kicker">Queue &amp; Show-Night Dispatch</span>
            <h2 id="reminder-drawer-title" className="modal-title">
              My Concert Reminders ({reminders.length})
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
                <h3 className="panel-heading">Browser &amp; Audio Queue Alerts</h3>
                <p className="panel-subtext">
                  {notificationPermission === 'granted'
                    ? 'Desktop browser notifications and harmonic queue chimes are active.'
                    : notificationPermission === 'denied'
                      ? 'Browser notifications are blocked in site settings — in-app banners & chimes still fire.'
                      : 'Enable browser notifications so you never miss a 10:00 AM AEDT Telstra or Frontier queue.'}
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
                    <span>Enable Alerts</span>
                  </button>
                )}
                <button
                  type="button"
                  id="test-chime-btn"
                  className="btn-outline-sm"
                  onClick={handleTestBrowserAlert}
                >
                  <Volume2 size={14} />
                  <span>Test Chime</span>
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
                    onShowToast(`Exported ${reminders.length} reminder(s) to .ics calendar file.`);
                  }}
                >
                  <CalendarPlus size={14} />
                  <span>Download All as .ics Calendar</span>
                </button>
                <button
                  type="button"
                  id="clear-past-reminders-btn"
                  className="text-link-btn"
                  onClick={onClearPastReminders}
                >
                  Clear elapsed drops
                </button>
              </div>
            )}
          </section>

          {/* Active Reminder List */}
          <section className="reminder-list-section">
            {sorted.length === 0 ? (
              <div className="empty-box">
                <Bell size={24} />
                <p className="empty-title">No ticket drops or gigs armed yet</p>
                <p className="empty-desc">
                  Click <strong>Remind Me</strong> on any Pre-Sale window or concert card to set a
                  15-minute Ticketek/Ticketmaster waiting-room alarm, 1-hour heads-up, or 24-hour alert.
                </p>
              </div>
            ) : (
              <ul className="reminder-list">
                {sorted.map((item) => {
                  const cd = computeCountdown(item.targetIso, nowMs);
                  const leadText =
                    item.leadMinutes === 15
                      ? '15m before (Queue Open)'
                      : item.leadMinutes === 60
                        ? '1h before'
                        : '24h before';
                  return (
                    <li key={item.id} className="reminder-item">
                      <div className="reminder-item-visual">
                        <ArtistAvatar name={item.artist} size="sm" shape="rounded" />
                        <div className="reminder-item-main">
                          <div className="reminder-badges">
                            <span className={`city-pill city-pill--${item.city}`}>
                              {item.regionBadge
                                ? item.regionBadge
                                : item.city === 'sydney'
                                  ? 'SYD'
                                  : 'MEL'}
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
