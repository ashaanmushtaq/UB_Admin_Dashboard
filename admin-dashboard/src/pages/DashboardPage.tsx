import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { signOut } from '../lib/auth';
import type { UserProfile, TenantBranding } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { SupplierLedgerPage } from './SupplierLedgerPage';
import { EmployeePage } from './EmployeePage';
import { ProductionPage } from './ProductionPage';
import { CustomerLedgerPage } from './CustomerLedgerPage';
import { FinancePage } from './FinancePage';
import { ReportsPage } from './ReportsPage';
import { NotificationsInboxPage } from './NotificationsInboxPage';
import { OpeningBalancesPage } from './OpeningBalancesPage';
import './DashboardPage.css';

interface DashboardPageProps {
  user: User;
  profile: UserProfile | null;
  branding?: TenantBranding | null;
}

type ActivePage = 'home' | 'fabric-ledger' | 'employees' | 'production' | 'customer-ledger' | 'finance' | 'reports' | 'notifications' | 'opening-balances' | 'pos' | 'mobile-app';

const ROLE_BADGE_COLORS: Record<string, string> = {
  owner:             '#e8b84b',
  shop_staff:        '#38bdf8',
  cutting_master:    '#a78bfa',
  tailor:            '#34d399',
  iron_presser:      '#fb923c',
  packing_staff:     '#f472b6',
  kaj_overlock_staff:'#60a5fa',
  driver:            '#94a3b8',
  helper:            '#6b7280',
};

const MODULES = [
  { id: 'fabric-ledger' as ActivePage,   label: 'Fabric Ledger',    icon: '🧵', status: 'live',    desc: 'Suppliers, fabric receipts, payment tracking, running balances' },
  { id: 'employees' as ActivePage,       label: 'Employees',        icon: '👷', status: 'live',    desc: 'Staff roster, wage terms, salary advances, in-app notifications' },
  { id: 'production' as ActivePage,      label: 'Production',       icon: '⚙️', status: 'live',    desc: 'Cutting → Tailoring → Ironing → Kaj/Overlock → Packing → Dispatch' },
  { id: 'customer-ledger' as ActivePage, label: 'Customer Ledger',  icon: '📒', status: 'live',    desc: 'Bulk orders, customer dues, payment history, outstanding balances' },
  { id: 'finance' as ActivePage,         label: 'Finance P&L',      icon: '💰', status: 'live',    desc: 'Money In vs Money Out, payment method matrix & net cash flow' },
  { id: 'reports' as ActivePage,         label: 'Reports',          icon: '📊', status: 'live',    desc: 'Sales volume, stage throughput & outstanding liabilities' },
  { id: 'notifications' as ActivePage,   label: 'Inbox',            icon: '🔔', status: 'live',    desc: 'System notifications, payment notices & due reminders' },
  { id: 'opening-balances' as ActivePage, label: 'Opening Balances',icon: '📥', status: 'live',    desc: 'One-time data migration for starting dues & fabric stock' },
  { id: 'pos' as ActivePage,             label: 'POS Counter',      icon: '🏪', status: 'live',    desc: 'Offline-first shop counter PWA for walk-in customers' },
  { id: 'mobile-app' as ActivePage,      label: 'Mobile App',       icon: '📱', status: 'live',    desc: 'React Native app for production staff floor management' },
];

export function DashboardPage({ user, profile, branding }: DashboardPageProps) {
  const [activePage, setActivePage] = useState<ActivePage>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tenantStatus, setTenantStatus] = useState<'loading' | 'active' | 'suspended' | 'expired'>('loading');
  const roleColor = ROLE_BADGE_COLORS[profile?.role ?? ''] ?? '#94a3b8';

  const shopName = branding?.display_name || branding?.name || 'Wholesale ERP';

  useEffect(() => {
    document.title = `${shopName} · Admin Dashboard`;
  }, [shopName]);

  // ── Check tenant subscription status on mount ──
  useEffect(() => {
    if (!profile?.tenant_id) {
      // Profile not yet loaded — wait
      if (profile !== null) setTenantStatus('active'); // no profile = let RLS handle it
      return;
    }
    supabase
      .rpc('get_tenant_subscription', { p_tenant_id: profile.tenant_id })
      .then(({ data }) => {
        if (!data || !data.found) { setTenantStatus('active'); return; }
        if (data.subscription_status === 'suspended') { setTenantStatus('suspended'); return; }
        if (!data.is_effective_active) { setTenantStatus('expired'); return; }
        setTenantStatus('active');
      })
      .catch(() => setTenantStatus('active')); // on error, let RLS block instead
  }, [profile?.tenant_id]);

  // ── Suspended / Expired gate ──
  if (tenantStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090c14' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 40, height: 40, border: '2px solid rgba(79,142,247,0.2)', borderTopColor: '#4f8ef7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#4e607d', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (tenantStatus === 'suspended' || tenantStatus === 'expired') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#060912', fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          maxWidth: 480, width: '100%', margin: '0 1rem',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 20, padding: '3rem 2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {tenantStatus === 'suspended' ? '🚫' : '⌛'}
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f87171', margin: '0 0 0.75rem' }}>
            {tenantStatus === 'suspended' ? 'Account Suspended' : 'Subscription Expired'}
          </h1>
          <p style={{ color: '#94a3b8', lineHeight: 1.65, margin: '0 0 2rem' }}>
            {tenantStatus === 'suspended'
              ? 'Your shop account has been suspended by the platform administrator. Please contact support to resolve this.'
              : 'Your subscription has expired. Please contact the platform administrator to renew your access.'}
          </p>
          <p style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '1.5rem' }}>
            Platform support: <strong style={{ color: '#64748b' }}>ashaan@platform.admin</strong>
          </p>
          <button
            id="btn-suspended-signout"
            onClick={() => signOut().catch(() => {})}
            style={{
              padding: '0.65rem 1.5rem', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
              fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Close sidebar on nav item click (mobile)
  function navigate(page: ActivePage) {
    setActivePage(page);
    setSidebarOpen(false);
  }

  // Close sidebar on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  async function handleSignOut() {
    try { await signOut(); } catch (err) { console.error('Sign out error:', err); }
  }

  return (
    <div className="dash-root">
      {/* ── Mobile top bar ── */}
      <div className="dash-mobile-topbar">
        <button
          id="btn-mobile-menu"
          className="dash-hamburger"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <div className="dash-mobile-brand">
          <span className="dash-logo-box" aria-hidden="true">👑</span>
          <span className="dash-sidebar-title" style={{ fontSize: '1rem' }}>{shopName.toUpperCase()}</span>
        </div>
        <div className="dash-mobile-avatar" aria-hidden="true">
          {(profile?.full_name ?? user.email ?? '?')[0].toUpperCase()}
        </div>
      </div>

      {/* ── Overlay backdrop ── */}
      {sidebarOpen && (
        <div className="dash-overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ── Sidebar ── */}
      <aside className={`dash-sidebar${sidebarOpen ? ' dash-sidebar--open' : ''}`} aria-label="Navigation">
        <div className="dash-sidebar-brand">
          <div className="dash-logo-box" aria-hidden="true">👑</div>
          <div className="dash-brand-text">
            <div className="dash-sidebar-title">{shopName.toUpperCase()}</div>
            <div className="dash-sidebar-sub">Wholesale Garments ERP</div>
          </div>
        </div>

        <button
          id="nav-home"
          className={`dash-nav-home${activePage === 'home' ? ' dash-nav-item--active' : ''}`}
          onClick={() => navigate('home')}
        >
          🏠 Dashboard
        </button>

        <nav className="dash-nav" aria-label="Module navigation">
          {MODULES.map(m => (
            <button
              key={m.id}
              id={`nav-${m.id}`}
              className={`dash-nav-item${m.status === 'coming' ? ' dash-nav-item--disabled' : ''}${activePage === m.id ? ' dash-nav-item--active' : ''}`}
              disabled={m.status === 'coming'}
              onClick={() => m.status === 'live' && navigate(m.id)}
              aria-label={m.status === 'coming' ? `${m.label} — coming soon` : m.label}
            >
              <span className="dash-nav-icon" aria-hidden="true">{m.icon}</span>
              <span className="dash-nav-label">{m.label}</span>
              {m.status === 'coming' && (
                <span className="dash-nav-badge" aria-hidden="true">Soon</span>
              )}
            </button>
          ))}
        </nav>

        <div className="dash-sidebar-footer">
          <div className="dash-user-chip">
            <div className="dash-avatar" aria-hidden="true">
              {(profile?.full_name ?? user.email ?? '?')[0].toUpperCase()}
            </div>
            <div className="dash-user-info">
              <div className="dash-user-name">{profile?.full_name ?? user.email}</div>
              <div className="dash-user-role" style={{ color: roleColor }}>
                {profile?.role ?? 'loading…'}
              </div>
            </div>
          </div>
          <button
            id="btn-sign-out"
            className="dash-signout-btn"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="dash-main" id="main-content">
        {activePage === 'fabric-ledger' ? (
          <SupplierLedgerPage />
        ) : activePage === 'employees' ? (
          <EmployeePage />
        ) : activePage === 'production' ? (
          <ProductionPage />
        ) : activePage === 'customer-ledger' ? (
          <CustomerLedgerPage />
        ) : activePage === 'finance' ? (
          <FinancePage />
        ) : activePage === 'reports' ? (
          <ReportsPage />
        ) : activePage === 'notifications' ? (
          <NotificationsInboxPage />
        ) : activePage === 'opening-balances' ? (
          <OpeningBalancesPage />
        ) : (
          <HomePage user={user} profile={profile} roleColor={roleColor} onNavigate={setActivePage} />
        )}
      </main>
    </div>
  );
}

/* ─── Home overview page ──────────────────────────────────────────────────── */
function HomePage({ user, profile, roleColor, onNavigate }: {
  user: User;
  profile: UserProfile | null;
  roleColor: string;
  onNavigate: (page: ActivePage) => void;
}) {
  return (
    <>
      <header className="dash-header">
        <div>
          <h1 className="dash-header-title">Dashboard</h1>
          <p className="dash-header-sub">Welcome back, <strong>{profile?.full_name ?? user.email}</strong></p>
        </div>
        <div className="dash-header-meta">
          <div className="dash-status-chip dash-status-chip--live">
            <span className="dash-status-dot" aria-hidden="true" />
            Supabase Connected
          </div>
        </div>
      </header>

      {/* Stats row */}
      <div className="dash-stats" role="list">
        <div className="dash-stat-card" role="listitem">
          <div className="dash-stat-icon dash-stat-icon--blue" aria-hidden="true">🧵</div>
          <div className="dash-stat-body">
            <div className="dash-stat-label">Modules Live</div>
            <div className="dash-stat-value">1</div>
          </div>
        </div>
        <div className="dash-stat-card" role="listitem">
          <div className="dash-stat-icon dash-stat-icon--purple" aria-hidden="true">⚙️</div>
          <div className="dash-stat-body">
            <div className="dash-stat-label">Modules Coming</div>
            <div className="dash-stat-value">5</div>
          </div>
        </div>
        <div className="dash-stat-card" role="listitem">
          <div className="dash-stat-icon dash-stat-icon--gold" aria-hidden="true">🏢</div>
          <div className="dash-stat-body">
            <div className="dash-stat-label">Your Role</div>
            <div className="dash-stat-value" style={{ color: roleColor, fontSize: '1rem', fontWeight: 600 }}>
              {profile?.role ?? '—'}
            </div>
          </div>
        </div>
        <div className="dash-stat-card" role="listitem">
          <div className="dash-stat-icon dash-stat-icon--green" aria-hidden="true">🔐</div>
          <div className="dash-stat-body">
            <div className="dash-stat-label">Schema Version</div>
            <div className="dash-stat-value" style={{ fontSize: '0.95rem' }}>v0.3</div>
          </div>
        </div>
      </div>

      {/* Module grid */}
      <section aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="dash-section-title">System Modules</h2>
        <div className="dash-module-grid">
          {MODULES.map(m => (
            <div
              key={m.id}
              id={`module-card-${m.id}`}
              className={`dash-module-card${m.status === 'coming' ? ' dash-module-card--coming' : ''}`}
              onClick={() => m.status === 'live' && onNavigate(m.id)}
              style={{ cursor: m.status === 'live' ? 'pointer' : 'default' }}
              role={m.status === 'live' ? 'button' : undefined}
              tabIndex={m.status === 'live' ? 0 : undefined}
              onKeyDown={e => { if (m.status === 'live' && (e.key === 'Enter' || e.key === ' ')) onNavigate(m.id); }}
            >
              <div className="dash-module-top">
                <span className="dash-module-icon" aria-hidden="true">{m.icon}</span>
                <span className={`dash-module-status ${m.status === 'live' ? 'dash-module-status--live' : 'dash-module-status--coming'}`}>
                  {m.status === 'live' ? 'Live' : 'Coming Soon'}
                </span>
              </div>
              <h3 className="dash-module-title">{m.label}</h3>
              <p className="dash-module-desc">{m.desc}</p>
              {m.status === 'live' && (
                <div className="dash-module-action">Open →</div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
