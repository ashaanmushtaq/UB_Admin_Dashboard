import { useState, type FormEvent, useEffect } from 'react';
import { signIn } from '../lib/auth';
import { checkSupabaseConnection } from '../lib/supabase';
import './LoginPage.css';
import { ThemeToggle } from '../lib/theme';
import karobitMark from '../assets/karobit-mark.png';

interface LoginPageProps {
  onSuccess: () => void;
  initialNotice?: string | null;
}

export function LoginPage({ onSuccess, initialNotice }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialNotice ?? '');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionMsg, setConnectionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialNotice) {
      setError(initialNotice);
    }
  }, [initialNotice]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email.trim(), password);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(msg === 'Invalid login credentials'
        ? 'Incorrect email or password. Please try again.'
        : msg
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await checkSupabaseConnection();
        if (mounted) {
          setConnectionMsg(res.connected ? null : res.message);
        }
      } catch (err: any) {
        if (mounted) setConnectionMsg(`Connection check failed: ${err?.message || err}`);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="login-root">
      {/* Background ambient orbs */}
      <div className="login-orb login-orb--1" />
      <div className="login-orb login-orb--2" />
      <div className="login-orb login-orb--3" />

      <div className="login-card" role="main">
        {/* Brand Header */}
        <div className="login-brand">
          <div className="login-logo" aria-hidden="true">
            <img
              src={karobitMark}
              alt="Karobit"
              style={{ width: '42px', height: '42px', objectFit: 'contain' }}
            />
          </div>
          <div>
            <h1 className="login-brand-name">Karobit</h1>
            <p className="login-brand-tagline">Powering Smarter Businesses.</p>
          </div>
        </div>

        <div className="login-divider" />

        {/* Form */}
        <form id="login-form" onSubmit={handleSubmit} noValidate>
          <h2 className="login-heading">Sign in to your account</h2>
          <p className="login-subheading">
            Access your business dashboard and operations portal
          </p>

          {connectionMsg && (
            <div className="login-error" role="alert" id="login-connection-msg">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="#f87171" strokeWidth="1.5"/>
                <path d="M8 5v4M8 11v0.5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {connectionMsg}
            </div>
          )}

          {error && (
            <div className="login-error" role="alert" id="login-error-msg">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="#f87171" strokeWidth="1.5"/>
                <path d="M8 5v4M8 11v0.5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <div className="login-field">
            <label htmlFor="login-email" className="login-label">
              Email address
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25"/>
                  <path d="M1.5 5.5L8 9.5L14.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                id="login-email"
                type="email"
                className="login-input"
                placeholder="owner@shop.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password" className="login-label">
              Password
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25"/>
                  <path d="M5 7V5a3 3 0 116 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input login-input--with-action"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                id="login-toggle-password"
                className="login-input-action"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.25"/>
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25"/>
                    <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.25"/>
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            className={`login-btn${loading ? ' login-btn--loading' : ''}`}
            disabled={loading || !email || !password}
          >
            {loading ? (
              <>
                <span className="login-spinner" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="login-footer">
          Garments Wholesale ERP · Multi-Tenant Edition
        </p>
      </div>
      <ThemeToggle />
    </div>
  );
}
