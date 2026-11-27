import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Info,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { AuthUser, FirebasePublicConfig, SavedAccountProfile } from '../types/gig';
import { IS_STATIC_MODE } from '../config/runtimeMode';

interface AccountAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  csrfToken: string;
  firebaseConfig: FirebasePublicConfig | null;
  user: AuthUser | null;
  cloudAccountsPersistent: boolean;
  syncState: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedIso: string | null;
  monitoredCount: number;
  remindersCount: number;
  worldFestivalsCount: number;
  buildCurrentProfile: () => SavedAccountProfile;
  onAuthenticated: (
    user: AuthUser,
    profile: SavedAccountProfile | null,
    isRegistration: boolean,
  ) => void;
  onForceSaveNow: () => Promise<void>;
  onLoggedOut: () => void;
  onShowToast: (msg: string) => void;
}

export const AccountAuthModal: React.FC<AccountAuthModalProps> = ({
  isOpen,
  onClose,
  csrfToken,
  firebaseConfig,
  user,
  cloudAccountsPersistent,
  syncState,
  lastSavedIso,
  monitoredCount,
  remindersCount,
  worldFestivalsCount,
  buildCurrentProfile,
  onAuthenticated,
  onForceSaveNow,
  onLoggedOut,
  onShowToast,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const useFirebase = Boolean(firebaseConfig);
  const authUnavailable = IS_STATIC_MODE && !useFirebase;

  const handleGoogleSignIn = async () => {
    if (!firebaseConfig) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const fb = await import('../services/firebaseClient');
      const result = await fb.firebaseSignInWithGoogle(firebaseConfig, buildCurrentProfile());
      onAuthenticated(result.user, result.profile, result.isNewUser);
      onClose();
    } catch (err) {
      const fb = await import('../services/firebaseClient');
      setErrorMsg(fb.mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!firebaseConfig) return;
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrorMsg('Enter your email address above first, then click Forgot Password.');
      return;
    }
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const fb = await import('../services/firebaseClient');
      await fb.firebaseSendPasswordReset(firebaseConfig, cleanEmail);
      setInfoMsg('Password reset email sent! Check your inbox (and spam folder).');
    } catch (err) {
      const fb = await import('../services/firebaseClient');
      setErrorMsg(fb.mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    if (authUnavailable) {
      setErrorMsg('Email sign-in requires Firebase config or the live OZ Amp server.');
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long (12+ recommended).');
      return;
    }

    setSubmitting(true);
    try {
      if (firebaseConfig) {
        const fb = await import('../services/firebaseClient');
        if (mode === 'register') {
          const res = await fb.firebaseRegisterWithEmail(
            firebaseConfig,
            cleanEmail,
            password,
            displayName.trim(),
            buildCurrentProfile(),
          );
          setPassword('');
          onAuthenticated(res.user, res.profile, true);
          onClose();
        } else {
          const res = await fb.firebaseLoginWithEmail(firebaseConfig, cleanEmail, password);
          setPassword('');
          onAuthenticated(res.user, res.profile, false);
          onClose();
        }
        return;
      }

      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'register'
          ? {
              email: cleanEmail,
              password,
              displayName: displayName.trim(),
              profile: buildCurrentProfile(),
            }
          : {
              email: cleanEmail,
              password,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Authentication failed. Please check your details and retry.');
        return;
      }

      setPassword('');
      onAuthenticated(
        data.user as AuthUser,
        (data.profile as SavedAccountProfile) || null,
        mode === 'register',
      );
      onClose();
    } catch (err) {
      if (firebaseConfig) {
        const fb = await import('../services/firebaseClient');
        setErrorMsg(fb.mapFirebaseAuthError(err));
      } else {
        setErrorMsg('Unable to reach the OZ Amp server right now. Please try again in a moment.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (firebaseConfig && user?.provider === 'firebase') {
        const fb = await import('../services/firebaseClient');
        await fb.firebaseSignOut(firebaseConfig);
      } else {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: '{}',
        });
      }
      onShowToast('Signed out cleanly.');
      onLoggedOut();
    } catch {
      setErrorMsg('Could not sign out right now. Please refresh and retry.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-auth-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="center-modal auth-modal-panel">
        <div className="modal-header">
          <div>
            <span className="eyebrow-kicker">
              {useFirebase
                ? 'FIREBASE CLOUD ACCOUNT · AUTO-SYNC ACROSS VISITS & DEVICES'
                : 'OZ AMP ACCOUNT · AUTO-SAVE ACROSS VISITS & DEVICES'}
            </span>
            <h2 id="account-auth-modal-title" className="modal-title">
              {user ? `Signed In as ${user.displayName}` : 'Sign In or Create Your Account'}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close account modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body auth-modal-body">
          {authUnavailable ? (
            <div className="cloud-guide-card">
              <div className="cloud-guide-title">
                <Info size={16} />
                <strong>Static Preview Mode</strong>
              </div>
              <p className="sync-helper-copy">
                This static preview saves your choices automatically in this browser’s local storage.
                For cloud email &amp; Google sign-in, configure Firebase or open the live Render app.
              </p>
            </div>
          ) : user ? (
            <div className="auth-signed-in-stack">
              <div className="auth-profile-card">
                <div className="auth-profile-head">
                  <div className="auth-avatar-badge" aria-hidden="true">
                    <UserCheck size={20} />
                  </div>
                  <div>
                    <strong className="auth-display-name">{user.displayName}</strong>
                    <span className="auth-masked-email">{user.maskedEmail}</span>
                  </div>
                  <span className={`auth-sync-badge auth-sync-badge--${syncState}`}>
                    <Cloud size={12} />
                    <span>
                      {syncState === 'saving'
                        ? 'Saving…'
                        : syncState === 'error'
                          ? 'Sync Retry Needed'
                          : useFirebase
                            ? 'Firestore Synced'
                            : 'Auto-Sync Active'}
                    </span>
                  </span>
                </div>

                <div className="auth-saved-metrics">
                  <div className="auth-metric-pill">
                    <strong>{monitoredCount}</strong>
                    <span>Favourite Singers</span>
                  </div>
                  <div className="auth-metric-pill">
                    <strong>{remindersCount}</strong>
                    <span>Saved Alerts</span>
                  </div>
                  <div className="auth-metric-pill">
                    <strong>{worldFestivalsCount}</strong>
                    <span>Custom Festivals</span>
                  </div>
                </div>

                {lastSavedIso && (
                  <p className="auth-sync-meta">
                    <CheckCircle2 size={13} />
                    <span>
                      Last saved at{' '}
                      {new Date(lastSavedIso).toLocaleTimeString('en-AU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      — your singers, reminders, Home City &amp; theme load automatically whenever
                      you open OZ Amp.
                    </span>
                  </p>
                )}
              </div>

              {!cloudAccountsPersistent && (
                <div className="auth-storage-notice">
                  <Info size={14} />
                  <span>
                    <strong>Permanent Cloud Persistence (\$0 on Render):</strong> Add your free
                    Firebase Web App env vars (<code>FIREBASE_API_KEY</code>,{' '}
                    <code>FIREBASE_AUTH_DOMAIN</code>, <code>FIREBASE_PROJECT_ID</code>,{' '}
                    <code>FIREBASE_APP_ID</code>) in Render → Environment to enable permanent Cloud
                    Firestore sync + Google Sign-In &amp; Password Reset emails.
                  </span>
                </div>
              )}

              {errorMsg && <p className="inline-error">{errorMsg}</p>}

              <div className="auth-actions-row">
                <button
                  type="button"
                  className="btn-outline-sm"
                  disabled={submitting || syncState === 'saving'}
                  onClick={() => void onForceSaveNow()}
                >
                  <RefreshCw size={14} className={syncState === 'saving' ? 'spin-icon' : ''} />
                  <span>Save Choices Now</span>
                </button>

                <button
                  type="button"
                  id="account-sign-out-btn"
                  className="btn-outline-sm auth-logout-btn"
                  disabled={submitting}
                  onClick={() => void handleSignOut()}
                >
                  <LogOut size={14} />
                  <span>{useFirebase ? 'Sign Out' : 'Sign Out (All Devices)'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {useFirebase && (
                <>
                  <button
                    type="button"
                    id="auth-google-signin-btn"
                    className="btn-google-auth"
                    disabled={submitting}
                    onClick={() => void handleGoogleSignIn()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.58-5.15 3.58-8.82z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.01c-1.07.72-2.45 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.97H1.25v3.1A12 12 0 0 0 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.25 14.26A7.2 7.2 0 0 1 4.88 12c0-.79.14-1.56.37-2.26v-3.1H1.25A12 12 0 0 0 0 12c0 1.94.46 3.77 1.25 5.36l4-3.1z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.77c1.76 0 3.35.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.25 6.64l4 3.1C6.2 6.89 8.86 4.77 12 4.77z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>

                  <div className="auth-divider" aria-hidden="true">
                    <span>or use email &amp; password</span>
                  </div>
                </>
              )}

              <div className="page-mode-switcher auth-mode-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={`page-mode-btn ${mode === 'login' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'register'}
                  className={`page-mode-btn ${mode === 'register' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                >
                  Register with Email
                </button>
              </div>

              <p className="panel-subtext">
                {mode === 'register'
                  ? 'Create a free account to automatically save your favourite singers, ticket-drop reminders, custom festivals, and Home City across visits and devices.'
                  : 'Sign in with your email to immediately load your saved favourite singers, saved alerts, and preferences.'}
              </p>

              <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
                {mode === 'register' && (
                  <label className="form-field">
                    <span>Display Name (Optional)</span>
                    <input
                      type="text"
                      maxLength={40}
                      autoComplete="name"
                      className="text-input"
                      placeholder="e.g., Alex"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </label>
                )}

                <label className="form-field">
                  <span>Email Address</span>
                  <div className="auth-input-wrap">
                    <Mail size={15} className="auth-input-icon" />
                    <input
                      type="email"
                      id="auth-email-input"
                      required
                      maxLength={120}
                      autoComplete="email"
                      className="text-input auth-text-input"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </label>

                <label className="form-field">
                  <div className="auth-label-row">
                    <span>Password</span>
                    {useFirebase && mode === 'login' && (
                      <button
                        type="button"
                        className="auth-forgot-link"
                        disabled={submitting}
                        onClick={() => void handlePasswordReset()}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="auth-input-wrap">
                    <KeyRound size={15} className="auth-input-icon" />
                    <input
                      type="password"
                      id="auth-password-input"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      className="text-input auth-text-input"
                      placeholder={
                        mode === 'register'
                          ? 'At least 8 characters (12+ recommended)'
                          : 'Enter your password'
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </label>

                {errorMsg && <p className="inline-error">{errorMsg}</p>}
                {infoMsg && <p className="auth-info-msg">{infoMsg}</p>}

                <button
                  type="submit"
                  id="auth-submit-btn"
                  className="btn-primary full-width"
                  disabled={submitting}
                >
                  {mode === 'register' ? <UserPlus size={16} /> : <UserCheck size={16} />}
                  <span>
                    {submitting
                      ? mode === 'register'
                        ? 'Creating Account…'
                        : 'Signing In…'
                      : mode === 'register'
                        ? 'Create Account & Save My Choices'
                        : 'Sign In & Load My Choices'}
                  </span>
                </button>
              </form>

              <p className="auth-security-footnote">
                <ShieldCheck size={13} />
                <span>
                  {useFirebase
                    ? 'Powered by Firebase Authentication & owner-only Cloud Firestore rules. Your email is never shown publicly.'
                    : 'Secured with salted memory-hard scrypt password hashing and HttpOnly session cookies. Your email is never shown publicly.'}
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
