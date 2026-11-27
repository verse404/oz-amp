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
import type { AuthUser, SavedAccountProfile } from '../types/gig';
import { IS_STATIC_MODE } from '../config/runtimeMode';

interface AccountAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  csrfToken: string;
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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (IS_STATIC_MODE) {
      setErrorMsg('Email sign-in requires the live OZ Amp server.');
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
      onAuthenticated(data.user as AuthUser, (data.profile as SavedAccountProfile) || null, mode === 'register');
      onClose();
    } catch {
      setErrorMsg('Unable to reach the OZ Amp server right now. Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: '{}',
      });
      onShowToast('Signed out from all sessions.');
      onLoggedOut();
    } catch {
      setErrorMsg('Could not reach server to sign out. Please refresh and retry.');
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
            <span className="eyebrow-kicker">OZ AMP ACCOUNT · AUTO-SAVE ACROSS VISITS &amp; DEVICES</span>
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
          {IS_STATIC_MODE ? (
            <div className="cloud-guide-card">
              <div className="cloud-guide-title">
                <Info size={16} />
                <strong>Static Preview Mode</strong>
              </div>
              <p className="sync-helper-copy">
                This static preview saves your choices automatically in this browser’s local storage.
                For email registration and cross-device cloud sync, open the live server or use{' '}
                <strong>Sync / App</strong> to export your `.json` backup.
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
                    <span>Armed Reminders</span>
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
                      you sign in.
                    </span>
                  </p>
                )}
              </div>

              {!cloudAccountsPersistent && (
                <div className="auth-storage-notice">
                  <Info size={14} />
                  <span>
                    <strong>Persistence tip (Render Free Tier):</strong> Accounts are currently saved
                    on the server’s local disk. To keep accounts permanently across Render container
                    redeploys at $0, add free <code>UPSTASH_REDIS_REST_URL</code> &amp;{' '}
                    <code>UPSTASH_REDIS_REST_TOKEN</code> in Render → Environment.
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
                  <span>Sign Out (All Devices)</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="page-mode-switcher auth-mode-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={`page-mode-btn ${mode === 'login' ? 'is-active' : ''}`}
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
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
                  }}
                >
                  Register with Email
                </button>
              </div>

              <p className="panel-subtext">
                {mode === 'register'
                  ? 'Create a free account to automatically save your favourite singers, ticket-drop reminders, custom festivals, and Home City across visits and devices.'
                  : 'Sign in with your email to immediately load your saved favourite singers, armed reminders, and preferences.'}
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
                  <span>Password</span>
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
                  Secured with salted memory-hard <code>scrypt</code> password hashing and{' '}
                  <code>HttpOnly</code> session cookies. Your email is never shown publicly.
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
