import { useState, type FormEvent, useEffect } from 'react';
import { signIn } from '../lib/auth';
import { checkSupabaseConnection } from '../lib/supabase';
import './LoginPage.css';

interface LoginPageProps {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionMsg, setConnectionMsg] = useState<string | null>(null);

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
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="url(#logoGrad)" />
              <path d="M9 27L12 9H24L27 27" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 18H25" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#4f8ef7"/>
                  <stop offset="100%" stopColor="#2563eb"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="login-brand-name">UB Collection</h1>
            <p className="login-brand-tagline">Admin Dashboard</p>
          </div>
        </div>

        <div className="login-divider" />

        {/* Form */}
        <form id="login-form" onSubmit={handleSubmit} noValidate>
          <h2 className="login-heading">Sign in to your account</h2>
          <p className="login-subheading">
            Manage your garments wholesale ERP system
          </p>

          {connectionMsg && (
            <div className="login-error" role="alert" id="login-error-msg">
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
            <label htmlFor="login-email" className="login-label">Email address</label>
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
                placeholder="owner@ubcollection.pk"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
                aria-describedby={error ? 'login-error-msg' : undefined}
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
    </div>
  );
}
