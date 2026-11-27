// Modular Firebase Auth (Google + Email/Password + Reset Email) & Cloud Firestore Profile Sync
// Dynamically imported only when Firebase Web App config is present, keeping initial bundle lean.

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, setDoc, type Firestore } from 'firebase/firestore/lite';
import type { AuthUser, FirebasePublicConfig, SavedAccountProfile } from '../types/gig';
import { sanitizeExternalHttpsUrl } from '../utils/formatters';

interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let cachedHandles: FirebaseHandles | null = null;
let cachedKey = '';

function ensureHandles(config: FirebasePublicConfig): FirebaseHandles {
  const key = `${config.projectId}|${config.apiKey}`;
  if (cachedHandles && cachedKey === key) {
    return cachedHandles;
  }
  const existing = getApps()[0];
  const app = existing || initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  cachedHandles = { app, auth, db };
  cachedKey = key;
  return cachedHandles;
}

export function maskEmailForUi(rawEmail?: string | null): string {
  const clean = String(rawEmail || '').trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const maskedLocal =
    local.length <= 2 ? `${local[0]}***` : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}@${domain}`;
}

function toAuthUser(user: User): AuthUser {
  const fallbackName = (user.email || 'Member').split('@')[0].slice(0, 24);
  return {
    id: user.uid,
    displayName: (user.displayName || fallbackName).trim().slice(0, 40),
    maskedEmail: maskEmailForUi(user.email),
    provider: 'firebase',
  };
}

function sanitizeProfileForFirestore(profile: SavedAccountProfile): SavedAccountProfile {
  return {
    schemaVersion: 2,
    updatedAtIso: new Date().toISOString(),
    theme: profile.theme === 'light' ? 'light' : 'dark',
    cityFilter:
      profile.cityFilter === 'sydney' || profile.cityFilter === 'all'
        ? profile.cityFilter
        : 'melbourne',
    monitoredSingers: Array.isArray(profile.monitoredSingers)
      ? profile.monitoredSingers.slice(0, 300).map((m) => ({
          ...m,
          name: String(m.name || '').slice(0, 80),
          aliases: Array.isArray(m.aliases)
            ? m.aliases.slice(0, 10).map((a) => String(a).slice(0, 60))
            : [],
          artworkUrl:
            m.artworkUrl && m.artworkUrl.startsWith('https://') ? m.artworkUrl.slice(0, 400) : '',
          radarNote: m.radarNote ? String(m.radarNote).slice(0, 260) : '',
          knownConcertIds: Array.isArray(m.knownConcertIds)
            ? m.knownConcertIds.slice(0, 50).map((id) => String(id).slice(0, 80))
            : [],
        }))
      : [],
    reminders: Array.isArray(profile.reminders)
      ? profile.reminders.slice(0, 300).map((r) => ({
          ...r,
          id: String(r.id || '').slice(0, 120),
          concertId: String(r.concertId || '').slice(0, 100),
          artist: String(r.artist || '').slice(0, 100),
          venueName: String(r.venueName || '').slice(0, 120),
          city: r.city === 'sydney' ? 'sydney' : 'melbourne',
          ticketUrl: sanitizeExternalHttpsUrl(r.ticketUrl, String(r.artist || '')),
          firedOffsets: Array.isArray(r.firedOffsets) ? r.firedOffsets.slice(0, 5) : [],
        }))
      : [],
    savedWorldFestivals: Array.isArray(profile.savedWorldFestivals)
      ? profile.savedWorldFestivals.slice(0, 80).map((wf) => ({
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
              ? wf.imageUrl.slice(0, 400)
              : '',
        }))
      : [],
    customConcerts: Array.isArray(profile.customConcerts)
      ? profile.customConcerts.slice(0, 100).map((c) => ({
          ...c,
          ticketUrl: sanitizeExternalHttpsUrl(c.ticketUrl, String(c.artist || '')),
        }))
      : [],
    dedicatedCustomSingers: Array.isArray(profile.dedicatedCustomSingers)
      ? profile.dedicatedCustomSingers.slice(0, 300)
      : [],
    dedicatedMutedIds: Array.isArray(profile.dedicatedMutedIds)
      ? profile.dedicatedMutedIds.slice(0, 700).map((x) => String(x).slice(0, 96))
      : [],
  };
}

// Firestore rejects `undefined` property values; strip them cleanly via JSON round-trip.
function stripUndefinedDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 8 characters long (12+ recommended).';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before finishing.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser — allow popups or sign in with email.';
    case 'auth/unauthorized-domain':
      return 'This domain needs to be added under Firebase Console → Authentication → Settings → Authorized domains.';
    default:
      return 'Authentication could not be completed right now. Please try again.';
  }
}

export async function firebaseLoadProfile(
  config: FirebasePublicConfig,
  uid: string,
): Promise<SavedAccountProfile | null> {
  const { db } = ensureHandles(config);
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const raw = snap.data() as SavedAccountProfile;
  return sanitizeProfileForFirestore(raw);
}

export async function firebaseSaveProfile(
  config: FirebasePublicConfig,
  uid: string,
  profile: SavedAccountProfile,
): Promise<string> {
  const { db } = ensureHandles(config);
  const clean = stripUndefinedDeep(sanitizeProfileForFirestore(profile));
  await setDoc(doc(db, 'users', uid), clean, { merge: true });
  return clean.updatedAtIso || new Date().toISOString();
}

export function subscribeFirebaseAuth(
  config: FirebasePublicConfig,
  onChange: (user: AuthUser | null, profile: SavedAccountProfile | null) => void,
): () => void {
  const { auth } = ensureHandles(config);
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      onChange(null, null);
      return;
    }
    const mapped = toAuthUser(fbUser);
    try {
      const profile = await firebaseLoadProfile(config, fbUser.uid);
      onChange(mapped, profile);
    } catch {
      onChange(mapped, null);
    }
  });
}

export async function firebaseSignInWithGoogle(
  config: FirebasePublicConfig,
  currentProfile: SavedAccountProfile,
): Promise<{ user: AuthUser; profile: SavedAccountProfile | null; isNewUser: boolean }> {
  const { auth } = ensureHandles(config);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const mapped = toAuthUser(cred.user);

  let existing: SavedAccountProfile | null = null;
  try {
    existing = await firebaseLoadProfile(config, cred.user.uid);
  } catch {
    existing = null;
  }

  if (!existing) {
    try {
      await firebaseSaveProfile(config, cred.user.uid, currentProfile);
      return { user: mapped, profile: currentProfile, isNewUser: true };
    } catch {
      return { user: mapped, profile: null, isNewUser: true };
    }
  }
  return { user: mapped, profile: existing, isNewUser: false };
}

export async function firebaseRegisterWithEmail(
  config: FirebasePublicConfig,
  email: string,
  password: string,
  displayName: string,
  initialProfile: SavedAccountProfile,
): Promise<{ user: AuthUser; profile: SavedAccountProfile }> {
  const { auth } = ensureHandles(config);
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const cleanName = displayName.trim().slice(0, 40);
  if (cleanName) {
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
  }
  const mapped = toAuthUser(cred.user);
  if (cleanName) mapped.displayName = cleanName;
  await firebaseSaveProfile(config, cred.user.uid, initialProfile);
  return { user: mapped, profile: initialProfile };
}

export async function firebaseLoginWithEmail(
  config: FirebasePublicConfig,
  email: string,
  password: string,
): Promise<{ user: AuthUser; profile: SavedAccountProfile | null }> {
  const { auth } = ensureHandles(config);
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const mapped = toAuthUser(cred.user);
  let profile: SavedAccountProfile | null = null;
  try {
    profile = await firebaseLoadProfile(config, cred.user.uid);
  } catch {
    profile = null;
  }
  return { user: mapped, profile };
}

export async function firebaseSendPasswordReset(
  config: FirebasePublicConfig,
  email: string,
): Promise<void> {
  const { auth } = ensureHandles(config);
  await sendPasswordResetEmail(auth, email.trim());
}

export async function firebaseSignOut(config: FirebasePublicConfig): Promise<void> {
  const { auth } = ensureHandles(config);
  await signOut(auth);
}
