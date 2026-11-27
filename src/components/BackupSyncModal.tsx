import React, { useRef, useState } from 'react';
import {
  BellRing,
  Check,
  Copy,
  Download,
  ExternalLink,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import type {
  CityId,
  ConcertEvent,
  MonitoredSinger,
  ReminderRule,
  WorldFestivalItem,
} from '../types/gig';
import { sanitizeExternalHttpsUrl } from '../utils/formatters';
import { IS_STATIC_MODE } from '../config/runtimeMode';

export interface OzAmpProfileBackup {
  schemaVersion: 1;
  exportedAtIso: string;
  theme: 'dark' | 'light';
  cityFilter: 'all' | CityId;
  reminders: ReminderRule[];
  monitoredSingers: MonitoredSinger[];
  savedWorldFestivals: WorldFestivalItem[];
  customConcerts: ConcertEvent[];
  dedicatedCustomSingers?: unknown[];
  dedicatedMutedIds?: string[];
}

interface BackupSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  cityFilter: 'all' | CityId;
  reminders: ReminderRule[];
  monitoredSingers: MonitoredSinger[];
  savedWorldFestivals: WorldFestivalItem[];
  customConcerts: ConcertEvent[];
  onRestoreBackup: (payload: OzAmpProfileBackup) => void;
  onShowToast: (msg: string) => void;
}

const CUSTOM_WATCHLIST_STORAGE_KEY = 'southern_amp_dedicated_custom_singers_v1';
const MUTED_WATCHLIST_STORAGE_KEY = 'southern_amp_dedicated_muted_ids_v1';
const REMOVED_WATCHLIST_STORAGE_KEY = 'southern_amp_dedicated_removed_ids_v1';
const REMOVED_WATCHLIST_PREFIX = '__removed__:';

function safeParseStorageArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function validateAndSanitizeBackup(rawText: string): OzAmpProfileBackup {
  if (!rawText || rawText.length > 1_500_000) {
    throw new Error('Backup file is empty or exceeds the 1.5 MB safety limit.');
  }

  const parsed = JSON.parse(rawText, (key, value) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  });

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid OZ Amp backup JSON structure.');
  }

  const theme: 'dark' | 'light' = parsed.theme === 'light' ? 'light' : 'dark';
  const cityFilter: 'all' | CityId =
    parsed.cityFilter === 'sydney' || parsed.cityFilter === 'all'
      ? parsed.cityFilter
      : 'melbourne';

  const reminders: ReminderRule[] = Array.isArray(parsed.reminders)
    ? parsed.reminders.slice(0, 300).map((r: ReminderRule) => ({
        ...r,
        id: String(r.id || '').slice(0, 120),
        concertId: String(r.concertId || '').slice(0, 100),
        artist: String(r.artist || '').slice(0, 100),
        venueName: String(r.venueName || '').slice(0, 120),
        city: r.city === 'sydney' ? 'sydney' : 'melbourne',
        regionBadge: r.regionBadge ? String(r.regionBadge).slice(0, 24) : undefined,
        ticketUrl: sanitizeExternalHttpsUrl(r.ticketUrl, String(r.artist || '')),
        firedOffsets: Array.isArray(r.firedOffsets) ? r.firedOffsets.slice(0, 5) : [],
      }))
    : [];

  const monitoredSingers: MonitoredSinger[] = Array.isArray(parsed.monitoredSingers)
    ? parsed.monitoredSingers.slice(0, 400).map((m: MonitoredSinger) => ({
        ...m,
        name: String(m.name || '').slice(0, 80),
        aliases: Array.isArray(m.aliases)
          ? m.aliases.slice(0, 10).map((a) => String(a).slice(0, 60))
          : [],
        knownConcertIds: Array.isArray(m.knownConcertIds)
          ? m.knownConcertIds.slice(0, 50).map((id) => String(id).slice(0, 80))
          : [],
      }))
    : [];

  const savedWorldFestivals: WorldFestivalItem[] = Array.isArray(parsed.savedWorldFestivals)
    ? parsed.savedWorldFestivals.slice(0, 100).map((wf: WorldFestivalItem) => ({
        ...wf,
        id: String(wf.id || '').slice(0, 90),
        name: String(wf.name || '').slice(0, 100),
        officialUrl: sanitizeExternalHttpsUrl(wf.officialUrl, String(wf.name || '')),
        ticketsUrl: sanitizeExternalHttpsUrl(
          wf.ticketsUrl || wf.officialUrl,
          String(wf.name || ''),
        ),
        imageUrl:
          typeof wf.imageUrl === 'string' && wf.imageUrl.startsWith('https://')
            ? wf.imageUrl
            : '',
      }))
    : [];

  const customConcerts: ConcertEvent[] = Array.isArray(parsed.customConcerts)
    ? parsed.customConcerts.slice(0, 150).map((c: ConcertEvent) => ({
        ...c,
        ticketUrl: sanitizeExternalHttpsUrl(c.ticketUrl, String(c.artist || '')),
      }))
    : [];

  return {
    schemaVersion: 1,
    exportedAtIso: new Date().toISOString(),
    theme,
    cityFilter,
    reminders,
    monitoredSingers,
    savedWorldFestivals,
    customConcerts,
    dedicatedCustomSingers: Array.isArray(parsed.dedicatedCustomSingers)
      ? parsed.dedicatedCustomSingers.slice(0, 300)
      : undefined,
    dedicatedMutedIds: Array.isArray(parsed.dedicatedMutedIds)
      ? parsed.dedicatedMutedIds.slice(0, 700).map((x: unknown) => String(x).slice(0, 96))
      : undefined,
  };
}

export const BackupSyncModal: React.FC<BackupSyncModalProps> = ({
  isOpen,
  onClose,
  theme,
  cityFilter,
  reminders,
  monitoredSingers,
  savedWorldFestivals,
  customConcerts,
  onRestoreBackup,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'cloud-push'>('sync');
  const [pasteJson, setPasteJson] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const buildBackupObject = (): OzAmpProfileBackup => ({
    schemaVersion: 1,
    exportedAtIso: new Date().toISOString(),
    theme,
    cityFilter,
    reminders,
    monitoredSingers,
    savedWorldFestivals,
    customConcerts,
    dedicatedCustomSingers: safeParseStorageArray(CUSTOM_WATCHLIST_STORAGE_KEY),
    dedicatedMutedIds: [
      ...safeParseStorageArray<string>(MUTED_WATCHLIST_STORAGE_KEY),
      ...safeParseStorageArray<string>(REMOVED_WATCHLIST_STORAGE_KEY).map(
        (id) => `${REMOVED_WATCHLIST_PREFIX}${id}`,
      ),
    ],
  });

  const handleDownloadJson = () => {
    const payload = buildBackupObject();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oz-amp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onShowToast('Downloaded your OZ Amp profile backup (.json).');
  };

  const handleCopyJson = async () => {
    try {
      const payload = buildBackupObject();
      await navigator.clipboard.writeText(JSON.stringify(payload));
      setCopied(true);
      onShowToast('Copied sync JSON to clipboard — paste it on your phone or laptop!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onShowToast('Clipboard blocked by browser — use Download .json instead.');
    }
  };

  const applyRawImport = (raw: string) => {
    try {
      setErrorMsg(null);
      const clean = validateAndSanitizeBackup(raw);
      if (clean.dedicatedCustomSingers) {
        window.localStorage.setItem(
          CUSTOM_WATCHLIST_STORAGE_KEY,
          JSON.stringify(clean.dedicatedCustomSingers),
        );
      }
      if (clean.dedicatedMutedIds) {
        window.localStorage.setItem(
          MUTED_WATCHLIST_STORAGE_KEY,
          JSON.stringify(clean.dedicatedMutedIds),
        );
      }
      onRestoreBackup(clean);
      setPasteJson('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not parse backup JSON.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      applyRawImport(String(reader.result || ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="center-modal sync-modal-panel">
        <div className="modal-header">
          <div>
            <span className="eyebrow-kicker">ZERO-DATABASE CLOUD PORTABILITY · PWA &amp; PUSH</span>
            <h2 id="sync-modal-title" className="modal-title">
              Device Sync, Phone App &amp; Background Alerts
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close sync modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body sync-modal-scroll">
          <div className="page-mode-switcher sync-modal-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sync'}
              className={`page-mode-btn ${activeTab === 'sync' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('sync')}
            >
              1. Sync Laptop ↔ Phone ({reminders.length} Alarms · {monitoredSingers.length} Singers)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'cloud-push'}
              className={`page-mode-btn ${activeTab === 'cloud-push' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('cloud-push')}
            >
              2. Background Phone Push &amp; PWA Setup
            </button>
          </div>

          {activeTab === 'sync' ? (
          <div className="sync-modal-body">
            <p className="sync-helper-copy">
              Export your saved alerts (<strong>{reminders.length}</strong>), monitored
              singers (<strong>{monitoredSingers.length}</strong>), custom World Festivals (
              <strong>{savedWorldFestivals.length}</strong>), and Home City preference to transfer
              between your laptop and mobile phone—or sign in with your email for automatic sync.
            </p>

            <div className="sync-export-row">
              <button type="button" className="btn-primary-sm" onClick={handleDownloadJson}>
                <Download size={15} />
                <span>Download Backup (.json)</span>
              </button>

              <button type="button" className="btn-outline-sm" onClick={() => void handleCopyJson()}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span>{copied ? 'Copied Sync Code!' : 'Copy Sync Code'}</span>
              </button>

              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={15} />
                <span>Restore from .json File</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only-input"
                onChange={handleFileUpload}
              />
            </div>

            <div className="sync-paste-box">
              <label className="form-field">
                <span>Or paste a copied Sync Code from your other device:</span>
                <textarea
                  rows={4}
                  value={pasteJson}
                  onChange={(e) => setPasteJson(e.target.value)}
                  placeholder='{"schemaVersion":1,"cityFilter":"melbourne",...}'
                />
              </label>
              {errorMsg && <p className="sync-error-msg">{errorMsg}</p>}
              <div className="world-custom-actions">
                <button
                  type="button"
                  disabled={!pasteJson.trim()}
                  className="btn-primary-sm"
                  onClick={() => applyRawImport(pasteJson)}
                >
                  <Upload size={14} />
                  <span>Restore Pasted Sync Code</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="sync-modal-body">
            {IS_STATIC_MODE ? (
              <div className="cloud-guide-card">
                <div className="cloud-guide-title">
                  <BellRing size={16} />
                  <strong>Private Per-Browser Storage &amp; Calendar Alerts</strong>
                </div>
                <p className="sync-helper-copy">
                  Your reminders, watched singers, and custom world festivals are stored privately
                  inside your own browser (<code>localStorage</code>) — other visitors never see your
                  personal selections.
                </p>
                <ul className="cloud-secrets-list">
                  <li>
                    Use <strong>Download All as .ics Calendar</strong> inside the{' '}
                    <strong>Reminders</strong> drawer or click <strong>GCal</strong> on any ticket
                    drop to sync 15-minute pre-sale queue alerts directly to Google Calendar / Apple
                    Calendar on your phone.
                  </li>
                  <li>
                    Use <strong>Tab 1 (Sync Laptop ↔ Phone)</strong> to export or copy your JSON
                    profile whenever you switch devices.
                  </li>
                </ul>
              </div>
            ) : (
              <div className="cloud-guide-card">
                <div className="cloud-guide-title">
                  <BellRing size={16} />
                  <strong>Background 7:30 AM AEDT Phone Push Alerts ($0 via GitHub Actions)</strong>
                </div>
                <p className="sync-helper-copy">
                  Your repository (<code>verse404/oz-amp</code>) runs an automated morning radar
                  check across <strong>all your tracked singers</strong> and{' '}
                  <strong>6 World Festivals</strong> even when your laptop and browser tabs are
                  closed. Add two optional free secrets in GitHub{' '}
                  <strong>Settings → Secrets and variables → Actions</strong>:
                </p>
                <ul className="cloud-secrets-list">
                  <li>
                    <code>REMINDER_WEBHOOK_URL</code> — Paste a free HTTPS webhook from{' '}
                    <strong>Discord</strong>, <strong>Slack</strong>, <strong>Telegram</strong>, or{' '}
                    <strong>Bark (iOS Push)</strong> to receive instant morning phone alerts when
                    new Melbourne/Sydney tours or &lt;36h pre-sales appear.
                  </li>
                  <li>
                    <code>TICKETMASTER_API_KEY</code> — Grab a free key (5,000 calls/day) from
                    Ticketmaster Developer Portal so the morning job automatically pulls newly
                    listed VIC &amp; NSW Ticketmaster/Live Nation shows.
                  </li>
                </ul>
                <div className="sync-export-row">
                  <a
                    href="https://github.com/verse404/oz-amp/settings/secrets/actions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary-sm"
                  >
                    <span>Open GitHub Actions Secrets</span>
                    <ExternalLink size={13} />
                  </a>
                  <a
                    href="https://developer.ticketmaster.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline-sm"
                  >
                    <span>Free Ticketmaster Key</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            )}

            <div className="cloud-guide-card">
              <div className="cloud-guide-title">
                <Smartphone size={16} />
                <strong>Install OZ Amp on iPhone / Android Home Screen (PWA Enabled)</strong>
              </div>
              <p className="sync-helper-copy">
                Open this page in Safari (iOS) or Chrome (Android), tap{' '}
                <strong>Share → Add to Home Screen</strong>, and OZ Amp launches full-screen with
                direct shortcuts to <em>All Gigs</em>, <em>My Singer Sessions</em>,{' '}
                <em>World Festivals</em>, and <em>Trending Music</em>.
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
