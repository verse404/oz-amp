import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECT_ROOT,
  getApiConfig,
  loadOrSyncCatalog,
  syncLiveCatalog,
} from './syncCatalog.mjs';
import { parseTourAnnouncement } from './parseAnnouncement.mjs';
import {
  checkMonitoredSingersAnnouncements,
  searchArtistsLive,
} from './artistMonitor.mjs';
import { resolvePortraitsForNames } from './artistPortraitsService.mjs';
import { searchWorldFestivalsLive } from './worldFestivalsSearch.mjs';
import {
  ALLOWED_TRENDING_REGIONS,
  fetchTrendingMusic,
} from './trendingMusicService.mjs';
import {
  authenticateSessionToken,
  getUserProfile,
  isPersistentCloudAuthConfigured,
  loginUserAccount,
  registerUserAccount,
  revokeAllUserSessions,
  saveUserProfile,
} from './authStore.mjs';

// Cryptographic synchronizer CSRF token generated per server boot (never hardcoded).
const SERVER_CSRF_TOKEN = crypto.randomBytes(32).toString('hex');

const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const SERVE_STATIC = process.env.SERVE_STATIC === '1';
const PUBLIC_READONLY_MODE = process.env.PUBLIC_READONLY_MODE === '1';
const CONTAINER_RUNTIME = process.env.CONTAINER_RUNTIME === '1';
const GITHUB_CRON_MANAGED = process.env.GITHUB_CRON_MANAGED === '1';

const ALLOWED_WEBHOOK_HOSTS = new Set([
  'api.day.app',
  'api.telegram.org',
  'discord.com',
  'hooks.slack.com',
]);

// Per-IP token-bucket rate limiter (90 requests / minute)
const rateBuckets = new Map();
function allowRateLimit(remoteIp) {
  const now = Date.now();
  const entry = rateBuckets.get(remoteIp);
  if (!entry || now - entry.windowStart > 60_000) {
    rateBuckets.set(remoteIp, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= 90) return false;
  entry.count += 1;
  return true;
}

// Stricter per-IP rate limiter for authentication endpoints (20 attempts / 15 min)
const authRateBuckets = new Map();
function allowAuthRateLimit(remoteIp) {
  const now = Date.now();
  const entry = authRateBuckets.get(remoteIp);
  if (!entry || now - entry.windowStart > 15 * 60_000) {
    authRateBuckets.set(remoteIp, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count += 1;
  return true;
}

const STATIC_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const SPA_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://apis.google.com; worker-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https://*.dzcdn.net https://cdn-images.dzcdn.net https://e-cdns-images.dzcdn.net https://*.scdn.co https://*.mzstatic.com https://s1.ticketm.net https://*.wikimedia.org https://upload.wikimedia.org https://lh3.googleusercontent.com data:; media-src 'self' https://audio-ssl.itunes.apple.com; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.firebaseio.com https://www.googleapis.com; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self';",
};

function getFirebasePublicConfig() {
  const apiKey = String(process.env.FIREBASE_API_KEY || '').trim();
  const authDomain = String(process.env.FIREBASE_AUTH_DOMAIN || '').trim();
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const appId = String(process.env.FIREBASE_APP_ID || '').trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  const storageBucket = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  const messagingSenderId = String(process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim();
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

function isAllowedOrigin(origin, requestHostHeader) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (requestHostHeader && u.host === requestHostHeader) return true;
    if (process.env.PUBLIC_ALLOWED_ORIGIN && origin === process.env.PUBLIC_ALLOWED_ORIGIN) {
      return true;
    }
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader) {
  const map = new Map();
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
    }
  }
  return map;
}

function getCsrfCookieName(req) {
  const isTls =
    req.headers['x-forwarded-proto'] === 'https' || CONTAINER_RUNTIME;
  return isTls ? '__Host-southern_amp_csrf' : 'southern_amp_csrf';
}

function buildCsrfSetCookieHeader(req) {
  const isTls =
    req.headers['x-forwarded-proto'] === 'https' || CONTAINER_RUNTIME;
  const name = getCsrfCookieName(req);
  const attrs = [
    `${name}=${SERVER_CSRF_TOKEN}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=28800',
  ];
  if (isTls) attrs.push('Secure');
  return attrs.join('; ');
}

function getSessionCookieName(req) {
  const isTls =
    req.headers['x-forwarded-proto'] === 'https' || CONTAINER_RUNTIME;
  return isTls ? '__Host-oz_amp_session' : 'oz_amp_session';
}

function buildSessionSetCookieHeader(req, rawToken, clear = false) {
  const isTls =
    req.headers['x-forwarded-proto'] === 'https' || CONTAINER_RUNTIME;
  const name = getSessionCookieName(req);
  const attrs = [
    `${name}=${clear ? '' : rawToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    clear ? 'Max-Age=0' : 'Max-Age=1209600',
  ];
  if (isTls) attrs.push('Secure');
  return attrs.join('; ');
}

function readSessionCookieToken(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies.get('__Host-oz_amp_session') || cookies.get('oz_amp_session') || '';
}

function verifyCsrf(req) {
  const headerToken = String(req.headers['x-csrf-token'] || '');
  const cookies = parseCookies(req.headers.cookie || '');
  const cookieToken =
    cookies.get('__Host-southern_amp_csrf') ||
    cookies.get('southern_amp_csrf') ||
    '';
  if (!headerToken || !cookieToken) return false;
  // Require 64-char cryptographic hex token issued via HttpOnly SameSite=Strict cookie
  // and matching X-CSRF-Token header (survives container sleep/restart on Render Free Tier).
  if (!/^[a-f0-9]{64}$/i.test(headerToken) || !/^[a-f0-9]{64}$/i.test(cookieToken)) {
    return false;
  }
  try {
    const a = Buffer.from(headerToken, 'utf-8');
    const c = Buffer.from(cookieToken, 'utf-8');
    if (a.length !== c.length) return false;
    return crypto.timingSafeEqual(a, c);
  } catch {
    return false;
  }
}

function readBoundedJsonBody(req, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(
          raw
            ? JSON.parse(raw, (key, value) =>
                key === '__proto__' || key === 'constructor' || key === 'prototype'
                  ? undefined
                  : value,
              )
            : {},
        );
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function maskUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    return `${u.protocol}//${u.hostname}/••••${u.pathname.slice(-4)}`;
  } catch {
    return null;
  }
}

function validateSafeWebhookUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 400) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (!ALLOWED_WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

// TODO(security): Single-owner personal BFF protected by cryptographic CSRF Synchronizer cookies,
// strict loopback binding (`127.0.0.1`), and `PUBLIC_READONLY_MODE=1` in cloud containers.
// Add OAuth 2.0 / OIDC multi-user authentication + MFA before enabling shared multi-tenant writes.
function writeJson(req, res, statusCode, payload, extraHeaders = {}) {
  const origin = req.headers.origin;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...extraHeaders,
  };
  if (origin && isAllowedOrigin(origin, req.headers.host)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

async function serveStaticAsset(req, res, pathname) {
  const relativeTarget = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(DIST_DIR, relativeTarget);
  if (resolved !== DIST_DIR && !resolved.startsWith(DIST_DIR + path.sep)) {
    writeJson(req, res, 403, { error: 'Forbidden path' });
    return;
  }

  let filePath = resolved;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath).toLowerCase();
    const mime = STATIC_MIME_TYPES[ext] || 'application/octet-stream';
    const isNoCacheAsset =
      ext === '.html' || ext === '.webmanifest' || baseName === 'sw.js';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': isNoCacheAsset
        ? 'no-store, no-cache, must-revalidate, max-age=0'
        : 'public, max-age=31536000, immutable',
      ...(isNoCacheAsset ? { Pragma: 'no-cache', Expires: '0' } : {}),
      ...(baseName === 'sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
      ...SPA_SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(content);
    }
  } catch {
    writeJson(req, res, 404, { error: 'Static bundle not found. Run npm run build first.' });
  }
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    const remoteIp = req.socket?.remoteAddress || '127.0.0.1';
    if (!allowRateLimit(remoteIp)) {
      writeJson(req, res, 429, { error: 'Too many requests. Please wait a moment.' });
      return;
    }

    if (!['GET', 'HEAD', 'POST'].includes(req.method || '')) {
      writeJson(req, res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD, POST' });
      return;
    }

    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin, req.headers.host)) {
      writeJson(req, res, 403, { error: 'Origin not permitted' });
      return;
    }

    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
      writeJson(req, res, 200, { status: 'ok', service: 'oz-amp-bff' });
      return;
    }

    if (pathname === '/api/session' && req.method === 'GET') {
      const cfg = getApiConfig();
      const firebaseConfig = getFirebasePublicConfig();
      const user = await authenticateSessionToken(readSessionCookieToken(req));
      const savedProfile = user ? await getUserProfile(user.id) : null;
      writeJson(
        req,
        res,
        200,
        {
          csrfToken: SERVER_CSRF_TOKEN,
          readonlyMode: PUBLIC_READONLY_MODE,
          ticketmasterConfigured: Boolean(cfg.ticketmasterApiKey),
          defaultWebhookMasked: maskUrl(cfg.reminderWebhookUrl),
          cloudAccountsPersistent: Boolean(firebaseConfig) || isPersistentCloudAuthConfigured(),
          firebaseConfig,
          user,
          savedProfile,
        },
        {
          'Set-Cookie': buildCsrfSetCookieHeader(req),
        },
      );
      return;
    }

    // Account Registration (Email + Password, CSRF-protected, memory-hard scrypt)
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed. Refresh and retry.' });
        return;
      }
      if (!allowAuthRateLimit(remoteIp)) {
        writeJson(req, res, 429, { error: 'Too many authentication attempts. Please wait 15 minutes.' });
        return;
      }
      try {
        const body = await readBoundedJsonBody(req, 262_144);
        const result = await registerUserAccount({
          email: body?.email,
          password: body?.password,
          displayName: body?.displayName,
          initialProfile: body?.profile,
        });
        if (!result.ok) {
          writeJson(req, res, result.status, { error: result.error });
          return;
        }
        writeJson(
          req,
          res,
          201,
          {
            user: result.user,
            profile: result.profile,
            cloudAccountsPersistent: isPersistentCloudAuthConfigured(),
          },
          {
            'Set-Cookie': buildSessionSetCookieHeader(req, result.sessionToken, false),
          },
        );
      } catch {
        writeJson(req, res, 400, { error: 'Unable to complete registration.' });
      }
      return;
    }

    // Account Sign-In (Email + Password, CSRF-protected, HttpOnly SameSite=Strict cookie)
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed. Refresh and retry.' });
        return;
      }
      if (!allowAuthRateLimit(remoteIp)) {
        writeJson(req, res, 429, { error: 'Too many authentication attempts. Please wait 15 minutes.' });
        return;
      }
      try {
        const body = await readBoundedJsonBody(req, 8192);
        const result = await loginUserAccount({
          email: body?.email,
          password: body?.password,
        });
        if (!result.ok) {
          writeJson(req, res, result.status, { error: result.error });
          return;
        }
        writeJson(
          req,
          res,
          200,
          {
            user: result.user,
            profile: result.profile,
            cloudAccountsPersistent: isPersistentCloudAuthConfigured(),
          },
          {
            'Set-Cookie': buildSessionSetCookieHeader(req, result.sessionToken, false),
          },
        );
      } catch {
        writeJson(req, res, 400, { error: 'Unable to sign in.' });
      }
      return;
    }

    // Account Sign-Out (CSRF-protected; revokes ALL active sessions for the user)
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed.' });
        return;
      }
      try {
        await revokeAllUserSessions(readSessionCookieToken(req));
      } catch {
        // Clear cookie even if backing store had an error
      }
      writeJson(
        req,
        res,
        200,
        { ok: true },
        {
          'Set-Cookie': buildSessionSetCookieHeader(req, '', true),
        },
      );
      return;
    }

    // Authenticated User Profile Read / Save (strictly scoped to session owner)
    if (pathname === '/api/account/profile' && req.method === 'GET') {
      const user = await authenticateSessionToken(readSessionCookieToken(req));
      if (!user) {
        writeJson(req, res, 401, { error: 'Please sign in to access your saved profile.' });
        return;
      }
      try {
        const profile = await getUserProfile(user.id);
        writeJson(req, res, 200, { user, profile });
      } catch {
        writeJson(req, res, 500, { error: 'Unable to load saved profile.' });
      }
      return;
    }

    if (pathname === '/api/account/profile' && req.method === 'POST') {
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed.' });
        return;
      }
      const user = await authenticateSessionToken(readSessionCookieToken(req));
      if (!user) {
        writeJson(req, res, 401, { error: 'Please sign in to save your choices.' });
        return;
      }
      try {
        const body = await readBoundedJsonBody(req, 262_144);
        const saved = await saveUserProfile(user.id, body?.profile || body);
        writeJson(req, res, 200, { ok: true, updatedAtIso: saved.updatedAtIso });
      } catch {
        writeJson(req, res, 400, { error: 'Invalid profile data.' });
      }
      return;
    }

    if (pathname === '/api/catalog' && req.method === 'GET') {
      try {
        const catalog = await loadOrSyncCatalog();
        writeJson(req, res, 200, catalog, {
          'Set-Cookie': buildCsrfSetCookieHeader(req),
        });
      } catch {
        writeJson(req, res, 500, { error: 'Unable to load concert catalog.' });
      }
      return;
    }

    // Live Batch Artist Portrait Resolver (for newly added/imported singers)
    if (pathname === '/api/artists/portraits' && req.method === 'GET') {
      const rawNames = String(parsedUrl.searchParams.get('names') || '').trim();
      if (!rawNames) {
        writeJson(req, res, 200, { portraits: {} });
        return;
      }
      const names = rawNames
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 40);
      try {
        const portraits = await resolvePortraitsForNames(names);
        writeJson(req, res, 200, { portraits });
      } catch {
        writeJson(req, res, 200, { portraits: {} });
      }
      return;
    }

    // Live Global Singer & Band Search (Apple Music AU + MusicBrainz Bilingual Aliases)
    if (pathname === '/api/artists/search' && req.method === 'GET') {
      const q = String(parsedUrl.searchParams.get('q') || '').trim();
      if (q.length < 1 || q.length > 60) {
        writeJson(req, res, 400, { error: 'Search query must be 1 to 60 characters.' });
        return;
      }
      try {
        const catalog = await loadOrSyncCatalog();
        const profiles = await searchArtistsLive(q, catalog.concerts);
        writeJson(req, res, 200, { query: q, profiles });
      } catch {
        writeJson(req, res, 500, { error: 'Artist search temporarily unavailable.' });
      }
      return;
    }

    // Live Trending Popular Music Charts (Apple Music / iTunes RSS)
    if (pathname === '/api/trending-music' && req.method === 'GET') {
      const region = String(parsedUrl.searchParams.get('region') || 'au').trim().toLowerCase();
      if (!ALLOWED_TRENDING_REGIONS.has(region)) {
        writeJson(req, res, 400, { error: 'Region must be one of au, us, gb, or jp.' });
        return;
      }
      try {
        const payload = await fetchTrendingMusic(region);
        writeJson(req, res, 200, payload);
      } catch {
        writeJson(req, res, 500, { error: 'Trending music charts temporarily unavailable.' });
      }
      return;
    }

    // Live Worldwide Music Festival Discovery Search
    if (pathname === '/api/world-festivals/search' && req.method === 'GET') {
      const q = String(parsedUrl.searchParams.get('q') || '').trim();
      if (q.length < 2 || q.length > 70) {
        writeJson(req, res, 400, { error: 'Search query must be 2 to 70 characters.' });
        return;
      }
      try {
        const festivals = await searchWorldFestivalsLive(q);
        writeJson(req, res, 200, { query: q, festivals, results: festivals });
      } catch {
        writeJson(req, res, 500, { error: 'World festival search temporarily unavailable.' });
      }
      return;
    }

    // Live Singer Tour Announcement Monitor Check
    if (pathname === '/api/artists/monitor-check' && req.method === 'POST') {
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed. Refresh and retry.' });
        return;
      }
      try {
        const body = await readBoundedJsonBody(req, 24_576);
        const singers = Array.isArray(body?.singers) ? body.singers : [];
        const forceRefresh = Boolean(body?.refreshFeed) && !PUBLIC_READONLY_MODE;
        const catalog = forceRefresh ? await syncLiveCatalog() : await loadOrSyncCatalog();
        const report = checkMonitoredSingersAnnouncements(singers, catalog);
        writeJson(req, res, 200, {
          ...report,
          catalogSyncedAtIso: catalog.syncedAtIso,
        });
      } catch {
        writeJson(req, res, 400, { error: 'Could not evaluate monitored singers.' });
      }
      return;
    }

    if (pathname === '/api/parse-announcement' && req.method === 'POST') {
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed. Refresh the page and retry.' });
        return;
      }
      try {
        const body = await readBoundedJsonBody(req, 12_288);
        const parsed = parseTourAnnouncement(String(body?.text || ''));
        writeJson(req, res, 200, parsed);
      } catch (err) {
        writeJson(req, res, 400, { error: err?.message || 'Could not parse announcement text.' });
      }
      return;
    }

    if (pathname === '/api/sync' && req.method === 'POST') {
      if (PUBLIC_READONLY_MODE) {
        writeJson(req, res, 403, { error: 'Manual sync is disabled in public read-only mode.' });
        return;
      }
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed.' });
        return;
      }
      try {
        const refreshed = await syncLiveCatalog();
        writeJson(req, res, 200, refreshed);
      } catch {
        writeJson(req, res, 500, { error: 'Live sync encountered an error.' });
      }
      return;
    }

    if (pathname === '/api/reminders/test-webhook' && req.method === 'POST') {
      if (PUBLIC_READONLY_MODE) {
        writeJson(req, res, 403, { error: 'External webhook test is disabled in public read-only mode.' });
        return;
      }
      if (!verifyCsrf(req)) {
        writeJson(req, res, 403, { error: 'CSRF token validation failed.' });
        return;
      }
      try {
        const body = await readBoundedJsonBody(req, 4096);
        const cfg = getApiConfig();
        const candidateUrl = body?.webhookUrl ? String(body.webhookUrl).trim() : cfg.reminderWebhookUrl;
        const safeUrl = validateSafeWebhookUrl(candidateUrl);
        if (!safeUrl) {
          writeJson(req, res, 400, {
            error:
              'Invalid webhook URL. Must use HTTPS on an approved push host (api.day.app, api.telegram.org, discord.com, or hooks.slack.com).',
          });
          return;
        }
        const messageText = String(
          body?.message || 'OZ Amp Test Alert: Melbourne & Sydney ticket-drop radar is connected!',
        ).slice(0, 280);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const upstream = await fetch(safeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: messageText,
              text: messageText,
              title: 'OZ Amp — Ticket Drop Alert',
              body: messageText,
            }),
            signal: controller.signal,
          });
          writeJson(req, res, upstream.ok ? 200 : 502, {
            ok: upstream.ok,
            status: upstream.status,
            targetMasked: maskUrl(safeUrl),
          });
        } finally {
          clearTimeout(timer);
        }
      } catch {
        writeJson(req, res, 502, { error: 'Webhook delivery failed or timed out.' });
      }
      return;
    }

    if (SERVE_STATIC && !pathname.startsWith('/api/')) {
      await serveStaticAsset(req, res, pathname);
      return;
    }

    writeJson(req, res, 404, { error: 'Endpoint not found' });
  });
}

const isDirectMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith(path.join('server', 'index.mjs'));

if (isDirectMain) {
  const host = CONTAINER_RUNTIME ? '0.0.0.0' : process.env.BFF_HOST || '127.0.0.1';
  const port = Number(process.env.PORT || process.env.BFF_PORT || 3102);

  const server = createAppServer();
  server.listen(port, host, () => {
    process.stdout.write(`OZ Amp BFF listening on http://${host}:${port}\n`);
    if (!GITHUB_CRON_MANAGED) {
      loadOrSyncCatalog().catch(() => {});
    }
  });
}
