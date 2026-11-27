// Secure Email Authentication & Cross-Device Profile Persistence Store
// Uses Node.js built-in memory-hard scrypt (unique 16-byte salt per user),
// cryptographic HttpOnly session tokens with 14-day TTL & full logout revocation,
// and dual persistence: Upstash Redis REST ($0 forever on Render) or local 0600 JSON fallback.
//
// TODO(security): Consider adding OAuth 2.0 / OIDC login, MFA (TOTP/Passkeys),
// and k-anonymity breached-password screening for future production hardening.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, 'data');
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14-day bounded expiration
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

// Serializes local file writes to avoid race conditions across concurrent requests
let localWriteChain = Promise.resolve();

function getUpstashConfig() {
  const rawUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!rawUrl || !token) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (!parsed.hostname.toLowerCase().endsWith('.upstash.io')) return null;
    return { baseUrl: parsed.origin, token };
  } catch {
    return null;
  }
}

export function isPersistentCloudAuthConfigured() {
  return Boolean(getUpstashConfig());
}

function resolveSafeLocalStorePath() {
  const customDir = process.env.OZ_AMP_AUTH_DIR
    ? path.resolve(process.env.OZ_AMP_AUTH_DIR)
    : DEFAULT_DATA_DIR;
  const targetFile = path.resolve(customDir, 'accounts.json');
  if (!targetFile.startsWith(customDir + path.sep)) {
    throw new Error('Invalid auth storage path boundary.');
  }
  return { dir: customDir, file: targetFile };
}

async function upstashCommand(args) {
  const cfg = getUpstashConfig();
  if (!cfg) throw new Error('Upstash Redis is not configured.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Cloud storage error (${res.status}).`);
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error('Cloud storage command failed.');
    }
    return data?.result ?? null;
  } finally {
    clearTimeout(timer);
  }
}

async function readLocalDb() {
  const { file } = resolveSafeLocalStorePath();
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      usersByEmail: parsed?.usersByEmail && typeof parsed.usersByEmail === 'object' ? parsed.usersByEmail : {},
      profilesByUserId:
        parsed?.profilesByUserId && typeof parsed.profilesByUserId === 'object' ? parsed.profilesByUserId : {},
      sessionsByHash:
        parsed?.sessionsByHash && typeof parsed.sessionsByHash === 'object' ? parsed.sessionsByHash : {},
    };
  } catch {
    return { usersByEmail: {}, profilesByUserId: {}, sessionsByHash: {} };
  }
}

async function writeLocalDb(db) {
  const { dir, file } = resolveSafeLocalStorePath();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpFile = path.resolve(dir, `.accounts-${crypto.randomBytes(6).toString('hex')}.tmp`);
  if (!tmpFile.startsWith(dir + path.sep)) {
    throw new Error('Invalid temporary auth storage path.');
  }
  await fs.writeFile(tmpFile, JSON.stringify(db), { encoding: 'utf-8', mode: 0o600 });
  await fs.rename(tmpFile, file);
}

function withLocalWriteLock(fn) {
  const next = localWriteChain.then(fn, fn);
  localWriteChain = next.catch(() => {});
  return next;
}

export function normalizeEmail(rawEmail) {
  const clean = String(rawEmail || '').trim().toLowerCase();
  if (clean.length < 5 || clean.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return null;
  return clean;
}

export function maskEmailForUi(email) {
  const clean = String(email || '').trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const maskedLocal =
    local.length <= 2
      ? `${local[0]}***`
      : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

export function validatePasswordStrength(password, email = '') {
  if (typeof password !== 'string') {
    return 'Password must be a valid string.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long (12+ characters recommended).';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (/^(.)\1+$/.test(password)) {
    return 'Please choose a stronger password with varied characters.';
  }
  if (email && password.toLowerCase() === email.toLowerCase()) {
    return 'Password cannot be identical to your email address.';
  }
  return null;
}

function scryptAsync(password, saltHex) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, saltHex, 64, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const saltHex = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, saltHex);
  return { saltHex, hashHex: derived.toString('hex') };
}

async function verifyPassword(password, saltHex, expectedHashHex) {
  const derived = await scryptAsync(password, saltHex);
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sanitizeHttpsUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const u = new URL(rawUrl.trim());
    return u.protocol === 'https:' ? u.toString().slice(0, 400) : '';
  } catch {
    return '';
  }
}

export function sanitizeSavedProfile(rawProfile) {
  if (!rawProfile || typeof rawProfile !== 'object') {
    throw new Error('Profile payload must be an object.');
  }

  const theme = rawProfile.theme === 'light' ? 'light' : 'dark';
  const cityFilter =
    rawProfile.cityFilter === 'sydney' || rawProfile.cityFilter === 'all'
      ? rawProfile.cityFilter
      : 'melbourne';

  const monitoredSingers = Array.isArray(rawProfile.monitoredSingers)
    ? rawProfile.monitoredSingers
        .slice(0, 300)
        .filter((m) => m && typeof m === 'object' && typeof m.name === 'string' && m.name.trim())
        .map((m) => ({
          name: String(m.name).trim().slice(0, 80),
          aliases: Array.isArray(m.aliases)
            ? m.aliases.slice(0, 10).map((a) => String(a || '').trim().slice(0, 60)).filter(Boolean)
            : [],
          genre: m.genre ? String(m.genre).slice(0, 50) : undefined,
          artworkUrl: sanitizeHttpsUrl(m.artworkUrl) || undefined,
          radarNote: m.radarNote ? String(m.radarNote).slice(0, 260) : undefined,
          notifyOnAnnounce: Boolean(m.notifyOnAnnounce),
          addedAtIso: typeof m.addedAtIso === 'string' ? m.addedAtIso.slice(0, 40) : new Date().toISOString(),
          knownConcertIds: Array.isArray(m.knownConcertIds)
            ? m.knownConcertIds.slice(0, 50).map((id) => String(id).slice(0, 80))
            : [],
        }))
    : [];

  const reminders = Array.isArray(rawProfile.reminders)
    ? rawProfile.reminders
        .slice(0, 300)
        .filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && typeof r.artist === 'string')
        .map((r) => ({
          id: String(r.id).slice(0, 120),
          concertId: String(r.concertId || '').slice(0, 100),
          dropId: r.dropId ? String(r.dropId).slice(0, 100) : undefined,
          artist: String(r.artist).slice(0, 100),
          venueName: String(r.venueName || '').slice(0, 120),
          city: r.city === 'sydney' ? 'sydney' : 'melbourne',
          regionBadge: r.regionBadge ? String(r.regionBadge).slice(0, 24) : undefined,
          targetType: ['presale', 'onsale', 'show-day', 'production-hold', 'hotel-lock'].includes(
            String(r.targetType),
          )
            ? r.targetType
            : 'presale',
          targetLabel: String(r.targetLabel || '').slice(0, 140),
          targetIso: String(r.targetIso || '').slice(0, 40),
          leadMinutes: [15, 60, 1440].includes(Number(r.leadMinutes)) ? Number(r.leadMinutes) : 15,
          ticketUrl: sanitizeHttpsUrl(r.ticketUrl) || 'https://www.ticketmaster.com.au/',
          firedOffsets: Array.isArray(r.firedOffsets)
            ? r.firedOffsets.slice(0, 5).map((n) => Number(n)).filter(Number.isFinite)
            : [],
          createdAtIso: typeof r.createdAtIso === 'string' ? r.createdAtIso.slice(0, 40) : new Date().toISOString(),
        }))
    : [];

  const savedWorldFestivals = Array.isArray(rawProfile.savedWorldFestivals)
    ? rawProfile.savedWorldFestivals
        .slice(0, 80)
        .filter((wf) => wf && typeof wf === 'object' && typeof wf.id === 'string' && typeof wf.name === 'string')
        .map((wf) => ({
          id: String(wf.id).slice(0, 90),
          name: String(wf.name).slice(0, 100),
          city: String(wf.city || '').slice(0, 60),
          country: String(wf.country || '').slice(0, 60),
          countryCode: String(wf.countryCode || 'GLOBAL').slice(0, 16),
          region: String(wf.region || 'Europe').slice(0, 40),
          vibe: String(wf.vibe || 'Multi-Genre Iconic').slice(0, 40),
          datesLabel: String(wf.datesLabel || '').slice(0, 80),
          startDateIso: String(wf.startDateIso || '').slice(0, 20),
          endDateIso: wf.endDateIso ? String(wf.endDateIso).slice(0, 20) : undefined,
          venueName: String(wf.venueName || '').slice(0, 100),
          themeOrEdition: wf.themeOrEdition ? String(wf.themeOrEdition).slice(0, 80) : undefined,
          status: ['lineup-live', 'registration-soon', 'ballot-upcoming', 'sold-out-resale'].includes(
            String(wf.status),
          )
            ? wf.status
            : 'registration-soon',
          statusLabel: String(wf.statusLabel || '').slice(0, 60),
          passPriceApprox: String(wf.passPriceApprox || '').slice(0, 60),
          melbourneFlightTip: String(wf.melbourneFlightTip || '').slice(0, 140),
          sydneyFlightTip: String(wf.sydneyFlightTip || '').slice(0, 140),
          imageUrl: sanitizeHttpsUrl(wf.imageUrl),
          officialUrl: sanitizeHttpsUrl(wf.officialUrl) || 'https://en.wikipedia.org/wiki/Music_festival',
          ticketsUrl:
            sanitizeHttpsUrl(wf.ticketsUrl || wf.officialUrl) ||
            'https://en.wikipedia.org/wiki/Music_festival',
          lineupAnnounced: Boolean(wf.lineupAnnounced),
          lineupHighlights: Array.isArray(wf.lineupHighlights)
            ? wf.lineupHighlights.slice(0, 30).map((x) => String(x).slice(0, 80))
            : [],
          stagesOrCamps: Array.isArray(wf.stagesOrCamps)
            ? wf.stagesOrCamps.slice(0, 15).map((x) => String(x).slice(0, 80))
            : [],
          nextSessionLabel: String(wf.nextSessionLabel || '').slice(0, 100),
          nextSessionIso: String(wf.nextSessionIso || '').slice(0, 40),
          description: String(wf.description || '').slice(0, 320),
          isCustomAdded: Boolean(wf.isCustomAdded),
        }))
    : [];

  const customConcerts = Array.isArray(rawProfile.customConcerts)
    ? rawProfile.customConcerts
        .slice(0, 100)
        .filter((c) => c && typeof c === 'object' && typeof c.id === 'string' && typeof c.artist === 'string')
        .map((c) => ({
          ...c,
          id: String(c.id).slice(0, 80),
          artist: String(c.artist).slice(0, 100),
          city: c.city === 'sydney' ? 'sydney' : 'melbourne',
          ticketUrl: sanitizeHttpsUrl(c.ticketUrl) || 'https://www.ticketmaster.com.au/',
          resaleUrl: c.resaleUrl ? sanitizeHttpsUrl(c.resaleUrl) || undefined : undefined,
        }))
    : [];

  const dedicatedCustomSingers = Array.isArray(rawProfile.dedicatedCustomSingers)
    ? rawProfile.dedicatedCustomSingers
        .slice(0, 200)
        .filter((s) => s && typeof s === 'object' && typeof s.displayName === 'string')
        .map((s) => ({
          id: String(s.id || '').slice(0, 80),
          displayName: String(s.displayName).slice(0, 80),
          matchTerms: Array.isArray(s.matchTerms)
            ? s.matchTerms.slice(0, 8).map((t) => String(t).slice(0, 60))
            : [String(s.displayName).slice(0, 80)],
          group: String(s.group || 'T - Z & Others').slice(0, 30),
          isChinese: Boolean(s.isChinese),
        }))
    : [];

  const dedicatedMutedIds = Array.isArray(rawProfile.dedicatedMutedIds)
    ? rawProfile.dedicatedMutedIds.slice(0, 400).map((x) => String(x).slice(0, 80))
    : [];

  return {
    schemaVersion: 2,
    updatedAtIso: new Date().toISOString(),
    theme,
    cityFilter,
    monitoredSingers,
    reminders,
    savedWorldFestivals,
    customConcerts,
    dedicatedCustomSingers,
    dedicatedMutedIds,
  };
}

// ── Storage Operations (Cloud Upstash Redis or Atomic Local 0600 JSON) ──────

async function getUserByEmail(email) {
  if (isPersistentCloudAuthConfigured()) {
    const raw = await upstashCommand(['GET', `ozamp:user:${sha256Hex(email)}`]);
    return raw ? JSON.parse(raw) : null;
  }
  const db = await readLocalDb();
  return db.usersByEmail[email] || null;
}

async function getUserById(userId) {
  if (isPersistentCloudAuthConfigured()) {
    const raw = await upstashCommand(['GET', `ozamp:uid:${userId}`]);
    return raw ? JSON.parse(raw) : null;
  }
  const db = await readLocalDb();
  return Object.values(db.usersByEmail).find((u) => u.id === userId) || null;
}

async function createSessionForUser(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(rawToken);
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  const sessionObj = {
    userId: user.id,
    createdAtIso: new Date().toISOString(),
    expiresAtMs,
  };

  if (isPersistentCloudAuthConfigured()) {
    await upstashCommand(['SETEX', `ozamp:sess:${tokenHash}`, SESSION_TTL_SECONDS, JSON.stringify(sessionObj)]);
    await upstashCommand(['SADD', `ozamp:usersess:${user.id}`, tokenHash]);
    return { rawToken, expiresAtMs };
  }

  await withLocalWriteLock(async () => {
    const db = await readLocalDb();
    // Opportunistically purge expired sessions
    const now = Date.now();
    for (const [h, s] of Object.entries(db.sessionsByHash)) {
      if (!s || s.expiresAtMs <= now) delete db.sessionsByHash[h];
    }
    db.sessionsByHash[tokenHash] = sessionObj;
    await writeLocalDb(db);
  });

  return { rawToken, expiresAtMs };
}

export async function registerUserAccount({ email, password, displayName, initialProfile }) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) {
    return { ok: false, status: 400, error: 'Please enter a valid email address.' };
  }
  const pwErr = validatePasswordStrength(password, cleanEmail);
  if (pwErr) {
    return { ok: false, status: 400, error: pwErr };
  }

  const cleanName = String(displayName || '')
    .replace(/[\u0000-\u001F]/g, '')
    .trim()
    .slice(0, 40);

  const existing = await getUserByEmail(cleanEmail);
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: 'An account with this email already exists. Please sign in instead.',
    };
  }

  const { saltHex, hashHex } = await hashPassword(password);
  const userId = `usr_${crypto.randomBytes(12).toString('hex')}`;
  const userRecord = {
    id: userId,
    email: cleanEmail,
    displayName: cleanName || cleanEmail.split('@')[0].slice(0, 24),
    saltHex,
    passwordHashHex: hashHex,
    createdAtIso: new Date().toISOString(),
  };

  const sanitizedProfile = initialProfile ? sanitizeSavedProfile(initialProfile) : null;

  if (isPersistentCloudAuthConfigured()) {
    const emailKey = `ozamp:user:${sha256Hex(cleanEmail)}`;
    const setRes = await upstashCommand(['SET', emailKey, JSON.stringify(userRecord), 'NX']);
    if (setRes !== 'OK') {
      return {
        ok: false,
        status: 409,
        error: 'An account with this email already exists. Please sign in instead.',
      };
    }
    await upstashCommand(['SET', `ozamp:uid:${userId}`, JSON.stringify(userRecord)]);
    if (sanitizedProfile) {
      await upstashCommand(['SET', `ozamp:profile:${userId}`, JSON.stringify(sanitizedProfile)]);
    }
  } else {
    let conflict = false;
    await withLocalWriteLock(async () => {
      const db = await readLocalDb();
      if (db.usersByEmail[cleanEmail]) {
        conflict = true;
        return;
      }
      db.usersByEmail[cleanEmail] = userRecord;
      if (sanitizedProfile) {
        db.profilesByUserId[userId] = sanitizedProfile;
      }
      await writeLocalDb(db);
    });
    if (conflict) {
      return {
        ok: false,
        status: 409,
        error: 'An account with this email already exists. Please sign in instead.',
      };
    }
  }

  const { rawToken } = await createSessionForUser(userRecord);
  return {
    ok: true,
    status: 201,
    sessionToken: rawToken,
    user: {
      id: userRecord.id,
      displayName: userRecord.displayName,
      maskedEmail: maskEmailForUi(userRecord.email),
    },
    profile: sanitizedProfile,
  };
}

export async function loginUserAccount({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || typeof password !== 'string' || password.length === 0 || password.length > 128) {
    return { ok: false, status: 401, error: 'Invalid email or password.' };
  }

  const user = await getUserByEmail(cleanEmail);
  if (!user) {
    // Perform dummy scrypt work to reduce user-enumeration timing signal
    await scryptAsync(password, '00000000000000000000000000000000');
    return { ok: false, status: 401, error: 'Invalid email or password.' };
  }

  const valid = await verifyPassword(password, user.saltHex, user.passwordHashHex);
  if (!valid) {
    return { ok: false, status: 401, error: 'Invalid email or password.' };
  }

  const { rawToken } = await createSessionForUser(user);
  const profile = await getUserProfile(user.id);
  return {
    ok: true,
    status: 200,
    sessionToken: rawToken,
    user: {
      id: user.id,
      displayName: user.displayName,
      maskedEmail: maskEmailForUi(user.email),
    },
    profile,
  };
}

export async function authenticateSessionToken(rawToken) {
  if (typeof rawToken !== 'string' || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return null;
  }
  const tokenHash = sha256Hex(rawToken);
  let session = null;

  if (isPersistentCloudAuthConfigured()) {
    const raw = await upstashCommand(['GET', `ozamp:sess:${tokenHash}`]);
    session = raw ? JSON.parse(raw) : null;
  } else {
    const db = await readLocalDb();
    session = db.sessionsByHash[tokenHash] || null;
  }

  if (!session || !session.userId || Number(session.expiresAtMs) <= Date.now()) {
    return null;
  }

  const user = await getUserById(session.userId);
  if (!user) return null;

  return {
    id: user.id,
    displayName: user.displayName,
    maskedEmail: maskEmailForUi(user.email),
  };
}

// Invalidates ALL active sessions for the user on logout (per mandatory session security rules)
export async function revokeAllUserSessions(rawToken) {
  if (typeof rawToken !== 'string' || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return;
  }
  const tokenHash = sha256Hex(rawToken);

  if (isPersistentCloudAuthConfigured()) {
    const raw = await upstashCommand(['GET', `ozamp:sess:${tokenHash}`]);
    const session = raw ? JSON.parse(raw) : null;
    await upstashCommand(['DEL', `ozamp:sess:${tokenHash}`]);
    if (session?.userId) {
      const hashes = await upstashCommand(['SMEMBERS', `ozamp:usersess:${session.userId}`]);
      if (Array.isArray(hashes)) {
        await Promise.all(
          hashes.map((h) => upstashCommand(['DEL', `ozamp:sess:${String(h)}`]).catch(() => {})),
        );
      }
      await upstashCommand(['DEL', `ozamp:usersess:${session.userId}`]);
    }
    return;
  }

  await withLocalWriteLock(async () => {
    const db = await readLocalDb();
    const session = db.sessionsByHash[tokenHash];
    const targetUserId = session?.userId || null;
    delete db.sessionsByHash[tokenHash];
    if (targetUserId) {
      for (const [h, s] of Object.entries(db.sessionsByHash)) {
        if (s?.userId === targetUserId) {
          delete db.sessionsByHash[h];
        }
      }
    }
    await writeLocalDb(db);
  });
}

export async function getUserProfile(userId) {
  if (!userId) return null;
  if (isPersistentCloudAuthConfigured()) {
    const raw = await upstashCommand(['GET', `ozamp:profile:${userId}`]);
    return raw ? JSON.parse(raw) : null;
  }
  const db = await readLocalDb();
  return db.profilesByUserId[userId] || null;
}

export async function saveUserProfile(userId, rawProfile) {
  if (!userId) throw new Error('Unauthenticated profile write.');
  const clean = sanitizeSavedProfile(rawProfile);

  if (isPersistentCloudAuthConfigured()) {
    await upstashCommand(['SET', `ozamp:profile:${userId}`, JSON.stringify(clean)]);
    return clean;
  }

  await withLocalWriteLock(async () => {
    const db = await readLocalDb();
    db.profilesByUserId[userId] = clean;
    await writeLocalDb(db);
  });
  return clean;
}
