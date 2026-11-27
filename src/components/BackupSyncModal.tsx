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
import { useLocale } from '../i18n/LocaleContext';

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
  const { isZh, tr } = useLocale();
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
    onShowToast(
      tr('Downloaded your OZ Amp profile backup (.json).', '已下载您的 OZ Amp 配置文件备份 (.json)。'),
    );
  };

  const handleCopyJson = async () => {
    try {
      const payload = buildBackupObject();
      await navigator.clipboard.writeText(JSON.stringify(payload));
      setCopied(true);
      onShowToast(
        tr(
          'Copied sync JSON to clipboard — paste it on your phone or laptop!',
          '已复制同步码至剪贴板 — 可直接粘贴到手机或电脑上恢复！',
        ),
      );
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onShowToast(
        tr(
          'Clipboard blocked by browser — use Download .json instead.',
          '浏览器拦截了剪贴板访问 — 请改用“下载备份文件 (.json)”。',
        ),
      );
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
      setErrorMsg(
        isZh
          ? '无法解析备份 JSON，请确认文件内容或同步码完整无误。'
          : err instanceof Error
            ? err.message
            : 'Could not parse backup JSON.',
      );
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
            <span className="eyebrow-kicker">
              {tr('ZERO-DATABASE CLOUD PORTABILITY · PWA & PUSH', '跨设备 JSON 备份 · 手机桌面应用与推送')}
            </span>
            <h2 id="sync-modal-title" className="modal-title">
              {tr('Device Sync, Phone App & Background Alerts', '设备同步、手机安装与后台提醒')}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={tr('Close sync modal', '关闭同步弹窗')}
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
              {tr(
                `1. Sync Laptop ↔ Phone (${reminders.length} Alerts · ${monitoredSingers.length} Singers)`,
                `1. 电脑 ↔ 手机备份 (${reminders.length} 提醒 · ${monitoredSingers.length} 歌手)`,
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'cloud-push'}
              className={`page-mode-btn ${activeTab === 'cloud-push' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('cloud-push')}
            >
              {tr('2. Background Phone Push & PWA Setup', '2. 后台推送与手机主屏安装')}
            </button>
          </div>

          {activeTab === 'sync' ? (
          <div className="sync-modal-body">
            <p className="sync-helper-copy">
              {tr(
                'Export your saved alerts, monitored singers, custom World Festivals, and Home City preference to transfer between your laptop and mobile phone—or sign in with your account for automatic Firebase sync.',
                '导出您的已存提醒、关注歌手、自选全球音乐节和常驻城市设置，方便在电脑和手机间迁移（或直接登录账号开启 Firebase 自动同步）。',
              )}
            </p>

            <div className="sync-export-row">
              <button type="button" className="btn-primary-sm" onClick={handleDownloadJson}>
                <Download size={15} />
                <span>{tr('Download Backup (.json)', '下载备份文件 (.json)')}</span>
              </button>

              <button type="button" className="btn-outline-sm" onClick={() => void handleCopyJson()}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span>
                  {copied
                    ? tr('Copied Sync Code!', '已复制同步码！')
                    : tr('Copy Sync Code', '复制同步码')}
                </span>
              </button>

              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={15} />
                <span>{tr('Restore from .json File', '从 .json 文件恢复')}</span>
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
                <span>
                  {tr(
                    'Or paste a copied Sync Code from your other device:',
                    '或直接粘贴来自其他设备的同步码：',
                  )}
                </span>
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
                  <span>{tr('Restore Pasted Sync Code', '恢复粘贴的同步码')}</span>
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
                  <strong>
                    {tr(
                      'Private Per-Browser Storage & Calendar Alerts',
                      '本地私密存储与日历提醒',
                    )}
                  </strong>
                </div>
                <p className="sync-helper-copy">
                  {isZh ? (
                    <>
                      您的已存提醒、关注歌手与自选全球音乐节均私密保存在当前浏览器本地（
                      <code>localStorage</code>），其他访客无法看到您的个人设置。
                    </>
                  ) : (
                    <>
                      Your reminders, watched singers, and custom world festivals are stored privately
                      inside your own browser (<code>localStorage</code>) — other visitors never see your
                      personal selections.
                    </>
                  )}
                </p>
                <ul className="cloud-secrets-list">
                  <li>
                    {isZh ? (
                      <>
                        在<strong>已存提醒</strong>侧栏中点击<strong>全部导出为 .ics 日历</strong>，或在任意开票场次点击<strong>日历</strong>，即可将提前 15 分钟抢票候场提醒同步到手机上的 Google 日历 / Apple 日历。
                      </>
                    ) : (
                      <>
                        Use <strong>Download All as .ics Calendar</strong> inside the{' '}
                        <strong>Saved Alerts</strong> drawer or click <strong>GCal</strong> on any ticket
                        drop to sync 15-minute pre-sale queue alerts directly to Google Calendar / Apple
                        Calendar on your phone.
                      </>
                    )}
                  </li>
                  <li>
                    {isZh ? (
                      <>
                        切换设备时，使用<strong>标签页 1（电脑 ↔ 手机备份）</strong>导出或复制 JSON 配置即可一键迁移。
                      </>
                    ) : (
                      <>
                        Use <strong>Tab 1 (Sync Laptop ↔ Phone)</strong> to export or copy your JSON
                        profile whenever you switch devices.
                      </>
                    )}
                  </li>
                </ul>
              </div>
            ) : (
              <div className="cloud-guide-card">
                <div className="cloud-guide-title">
                  <BellRing size={16} />
                  <strong>
                    {tr(
                      'Background 7:30 AM AEDT Phone Push Alerts ($0 via GitHub Actions)',
                      '每日澳东 7:30 后台手机推送（基于 GitHub Actions，免费）',
                    )}
                  </strong>
                </div>
                <p className="sync-helper-copy">
                  {isZh ? (
                    <>
                      仓库（<code>verse404/oz-amp</code>）支持在关闭电脑和浏览器时，每天早晨自动扫描<strong>您追踪的全部歌手</strong>与<strong> 6 大全球音乐节</strong>。只需在 GitHub 的{' '}
                      <strong>Settings → Secrets and variables → Actions</strong> 中配置以下两项免费密钥：
                    </>
                  ) : (
                    <>
                      Your repository (<code>verse404/oz-amp</code>) runs an automated morning radar
                      check across <strong>all your tracked singers</strong> and{' '}
                      <strong>6 World Festivals</strong> even when your laptop and browser tabs are
                      closed. Add two optional free secrets in GitHub{' '}
                      <strong>Settings → Secrets and variables → Actions</strong>:
                    </>
                  )}
                </p>
                <ul className="cloud-secrets-list">
                  <li>
                    {isZh ? (
                      <>
                        <code>REMINDER_WEBHOOK_URL</code> — 填入 <strong>Discord</strong>、<strong>Slack</strong>、<strong>Telegram</strong> 或 <strong>Bark（iOS 推送）</strong> 的免费 HTTPS Webhook，有墨尔本/悉尼新巡演或 36 小时内即将开票时即刻推送到手机。
                      </>
                    ) : (
                      <>
                        <code>REMINDER_WEBHOOK_URL</code> — Paste a free HTTPS webhook from{' '}
                        <strong>Discord</strong>, <strong>Slack</strong>, <strong>Telegram</strong>, or{' '}
                        <strong>Bark (iOS Push)</strong> to receive instant morning phone alerts when
                        new Melbourne/Sydney tours or &lt;36h pre-sales appear.
                      </>
                    )}
                  </li>
                  <li>
                    {isZh ? (
                      <>
                        <code>TICKETMASTER_API_KEY</code> — 前往 Ticketmaster 开发者平台申请免费密钥（每日 5,000 次配额），定时任务即可自动拉取维州与新州新上架的 Ticketmaster / Live Nation 演出。
                      </>
                    ) : (
                      <>
                        <code>TICKETMASTER_API_KEY</code> — Grab a free key (5,000 calls/day) from
                        Ticketmaster Developer Portal so the morning job automatically pulls newly
                        listed VIC &amp; NSW Ticketmaster/Live Nation shows.
                      </>
                    )}
                  </li>
                </ul>
                <div className="sync-export-row">
                  <a
                    href="https://github.com/verse404/oz-amp/settings/secrets/actions"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary-sm"
                  >
                    <span>{tr('Open GitHub Actions Secrets', '打开 GitHub Actions 密钥设置')}</span>
                    <ExternalLink size={13} />
                  </a>
                  <a
                    href="https://developer.ticketmaster.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline-sm"
                  >
                    <span>{tr('Free Ticketmaster Key', '申请免费 Ticketmaster 密钥')}</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            )}

            <div className="cloud-guide-card">
              <div className="cloud-guide-title">
                <Smartphone size={16} />
                <strong>
                  {tr(
                    'Install OZ Amp on iPhone / Android Home Screen (PWA Enabled)',
                    '将 OZ Amp 添加到 iPhone / Android 主屏幕（支持 PWA 应用模式）',
                  )}
                </strong>
              </div>
              <p className="sync-helper-copy">
                {isZh ? (
                  <>
                    在手机 Safari（iOS）或 Chrome（Android）中打开本页，点击<strong>分享 → 添加到主屏幕</strong>，即可像原生 App 一样全屏启动，并一键直达<em>全部演出</em>、<em>我的歌手</em>、<em>全球音乐节</em>与<em>热门音乐榜</em>。
                  </>
                ) : (
                  <>
                    Open this page in Safari (iOS) or Chrome (Android), tap{' '}
                    <strong>Share → Add to Home Screen</strong>, and OZ Amp launches full-screen with
                    direct shortcuts to <em>All Gigs</em>, <em>My Singer Sessions</em>,{' '}
                    <em>World Festivals</em>, and <em>Trending Music</em>.
                  </>
                )}
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
