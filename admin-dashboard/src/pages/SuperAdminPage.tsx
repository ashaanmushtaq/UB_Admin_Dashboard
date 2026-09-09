import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { signOut } from '../lib/auth';
import {
  listAllTenants,
  updateTenantSubscription,
  createTenant,
} from '../lib/superAdmin';
import type { TenantRow, CreateTenantPayload } from '../lib/superAdmin';
import './SuperAdminPage.css';

interface SuperAdminPageProps {
  user: User;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function effectiveStatus(t: TenantRow): 'active' | 'suspended' | 'expired' {
  if (t.subscription_status === 'suspended') return 'suspended';
  if (new Date(t.subscription_end_date) <= new Date()) return 'expired';
  return 'active';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function StatusBadge({ status }: { status: 'active' | 'suspended' | 'expired' }) {
  const labels = { active: '● Active', suspended: '● Suspended', expired: '● Expired' };
  return (
    <span className={`sa-badge sa-badge--${status}`}>
      {labels[status]}
    </span>
  );
}

function PlanBadge({ plan }: { plan: 'trial' | 'premium' }) {
  const label = plan === 'premium' ? '★ Premium' : '◌ Trial';
  return <span className={`sa-badge sa-badge--${plan}`}>{label}</span>;
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  body: string;
  icon?: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

function ConfirmDialog({
  title, body, icon, confirmLabel, confirmClass, onConfirm, onCancel, loading,
}: ConfirmDialogProps) {
  return (
    <div className="sa-dialog-overlay" onClick={onCancel}>
      <div className="sa-dialog" onClick={e => e.stopPropagation()}>
        {icon && <div className="sa-dialog-icon">{icon}</div>}
        <h3 className="sa-dialog-title">{title}</h3>
        <p className="sa-dialog-body">{body}</p>
        <div className="sa-dialog-actions">
          <button className="sa-btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className={confirmClass ?? 'sa-btn-danger'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Tenant Form ───────────────────────────────────────────────────────

const EMPTY_FORM: CreateTenantPayload = {
  name: '',
  owner_email: '',
  owner_password: '',
  owner_full_name: '',
  plan_type: 'trial',
};

function CreateTenantForm({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [form, setForm] = useState<CreateTenantPayload>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function field(key: keyof CreateTenantPayload) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm(f => ({ ...f, [key]: e.target.value }));
      setError(null);
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.owner_email.trim() || !form.owner_password.trim()) {
      setError('Shop name, owner email, and password are required.');
      return;
    }
    if (form.owner_password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createTenant(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      onSuccess(
        `✅ Created "${result.tenant.name}" (${result.owner.email}) — ${result.tenant.plan_type} plan, expires ${formatDate(result.tenant.subscription_end_date)}.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const planInfo: Record<string, string> = {
    trial:   'Rs. 5,000 — 30 days access',
    premium: 'Rs. 50,000 (one-time setup) — 12 months access',
  };

  return (
    <div className="sa-card">
      <div className="sa-card-header">
        <h2 className="sa-card-title">
          <span>➕</span> Create New Tenant
        </h2>
        <button
          id="btn-toggle-create-form"
          className="sa-btn-primary"
          onClick={() => setShowForm(o => !o)}
          type="button"
        >
          {showForm ? '✕ Cancel' : '+ New Shop'}
        </button>
      </div>

      <div className={`sa-form-collapse ${showForm ? 'sa-form-collapse--open' : 'sa-form-collapse--closed'}`}>
        <hr className="sa-form-divider" />

        {error && (
          <div className="sa-error" style={{ margin: '1rem 1.5rem 0' }}>
            ⚠ {error}
          </div>
        )}

        <form className="sa-form" onSubmit={handleSubmit} id="form-create-tenant">
          {/* Shop Name */}
          <div className="sa-form-group sa-form-full">
            <label className="sa-label sa-label-required" htmlFor="input-shop-name">
              Shop / Company Name
            </label>
            <input
              id="input-shop-name"
              className="sa-input"
              type="text"
              placeholder="e.g. Al-Hamza Garments"
              value={form.name}
              onChange={field('name')}
              required
              autoComplete="off"
            />
          </div>

          {/* Owner Full Name */}
          <div className="sa-form-group">
            <label className="sa-label" htmlFor="input-owner-name">
              Owner Full Name
            </label>
            <input
              id="input-owner-name"
              className="sa-input"
              type="text"
              placeholder="e.g. Muhammad Hamza"
              value={form.owner_full_name}
              onChange={field('owner_full_name')}
              autoComplete="off"
            />
          </div>

          {/* Owner Email */}
          <div className="sa-form-group">
            <label className="sa-label sa-label-required" htmlFor="input-owner-email">
              Owner Email (login)
            </label>
            <input
              id="input-owner-email"
              className="sa-input"
              type="email"
              placeholder="owner@shop.com"
              value={form.owner_email}
              onChange={field('owner_email')}
              required
              autoComplete="off"
            />
          </div>

          {/* Temp Password */}
          <div className="sa-form-group">
            <label className="sa-label sa-label-required" htmlFor="input-owner-password">
              Temporary Password
            </label>
            <input
              id="input-owner-password"
              className="sa-input"
              type="text"
              placeholder="min 8 chars"
              value={form.owner_password}
              onChange={field('owner_password')}
              required
              autoComplete="new-password"
            />
          </div>

          {/* Plan type */}
          <div className="sa-form-group">
            <label className="sa-label" htmlFor="select-plan-type">
              Subscription Plan
            </label>
            <select
              id="select-plan-type"
              className="sa-select"
              value={form.plan_type}
              onChange={field('plan_type')}
            >
              <option value="trial">Trial — Rs. 5,000 / 30 days</option>
              <option value="premium">Premium — Rs. 50,000 / 12 months</option>
            </select>
            <div className="sa-plan-info">{planInfo[form.plan_type]}</div>
          </div>

          <div className="sa-form-actions">
            <button
              id="btn-submit-create-tenant"
              type="submit"
              className="sa-btn-primary"
              disabled={submitting}
            >
              {submitting ? '⏳ Creating…' : '🚀 Create Tenant'}
            </button>
            <button
              type="button"
              className="sa-btn-secondary"
              onClick={() => { setForm(EMPTY_FORM); setShowForm(false); setError(null); }}
              disabled={submitting}
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tenant Table ─────────────────────────────────────────────────────────────

interface TenantTableProps {
  tenants: TenantRow[];
  onAction: (tenant: TenantRow, action: 'suspend' | 'reactivate') => void;
  pendingId: string | null;
}

function TenantTable({ tenants, onAction, pendingId }: TenantTableProps) {
  if (tenants.length === 0) {
    return (
      <div className="sa-empty">
        <div className="sa-empty-icon">🏢</div>
        <div className="sa-empty-text">No tenants on the platform yet.</div>
      </div>
    );
  }

  return (
    <div className="sa-table-wrap">
      <table className="sa-table" aria-label="Tenant list">
        <thead>
          <tr>
            <th>Shop</th>
            <th>Owner</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Subscription End</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map(t => {
            const status = effectiveStatus(t);
            const days   = daysUntil(t.subscription_end_date);
            const isBusy = pendingId === t.id;

            return (
              <tr key={t.id}>
                <td>
                  <div className="sa-tenant-name">{t.name}</div>
                  <div className="sa-tenant-slug">{t.slug}</div>
                </td>
                <td>
                  <div className="sa-owner-name">{t.owner_name ?? '—'}</div>
                  <div className="sa-owner-email">{t.owner_email ?? '—'}</div>
                </td>
                <td>
                  <PlanBadge plan={t.plan_type} />
                </td>
                <td>
                  <StatusBadge status={status} />
                </td>
                <td>
                  <div className={
                    `sa-date${days < 0 ? ' sa-date--expired' : days < 10 ? ' sa-date--expiring' : ''}`
                  }>
                    {formatDate(t.subscription_end_date)}
                    {days < 0 ? ' (expired)' : days < 10 ? ` (${days}d left)` : ''}
                  </div>
                </td>
                <td>
                  <div className="sa-date">{formatDate(t.created_at)}</div>
                </td>
                <td>
                  <div className="sa-actions-cell">
                    {status === 'suspended' || status === 'expired' ? (
                      <button
                        id={`btn-reactivate-${t.id}`}
                        className="sa-btn-success"
                        disabled={isBusy}
                        onClick={() => onAction(t, 'reactivate')}
                        aria-label={`Reactivate ${t.name}`}
                      >
                        {isBusy ? '⏳' : '✓ Reactivate'}
                      </button>
                    ) : (
                      <button
                        id={`btn-suspend-${t.id}`}
                        className="sa-btn-danger"
                        disabled={isBusy}
                        onClick={() => onAction(t, 'suspend')}
                        aria-label={`Suspend ${t.name}`}
                      >
                        {isBusy ? '⏳' : '⊘ Suspend'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main SuperAdminPage ──────────────────────────────────────────────────────

export function SuperAdminPage({ user }: SuperAdminPageProps) {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    tenant: TenantRow;
    action: 'suspend' | 'reactivate';
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listAllTenants();
      setTenants(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss success message after 6s
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 6000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // Tenant action handler
  function requestAction(tenant: TenantRow, action: 'suspend' | 'reactivate') {
    setConfirmDialog({ tenant, action });
  }

  async function executeAction() {
    if (!confirmDialog) return;
    const { tenant, action } = confirmDialog;
    setConfirmDialog(null);
    setPendingId(tenant.id);
    try {
      const newStatus = action === 'suspend' ? 'suspended' : 'active';
      const extendDays = action === 'reactivate' && effectiveStatus(tenant) === 'expired'
        ? (tenant.plan_type === 'premium' ? 365 : 30)
        : undefined;

      await updateTenantSubscription(tenant.id, newStatus, extendDays);
      setSuccessMsg(
        action === 'suspend'
          ? `🚫 "${tenant.name}" suspended — all users blocked immediately.`
          : `✅ "${tenant.name}" reactivated — access restored.`
      );
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setPendingId(null);
    }
  }

  async function handleSignOut() {
    try { await signOut(); } catch { /* ignore */ }
  }

  // Derived stats
  const activeCount    = tenants.filter(t => effectiveStatus(t) === 'active').length;
  const suspendedCount = tenants.filter(t => effectiveStatus(t) === 'suspended').length;
  const expiredCount   = tenants.filter(t => effectiveStatus(t) === 'expired').length;
  const premiumCount   = tenants.filter(t => t.plan_type === 'premium').length;

  const confirmInfo = confirmDialog
    ? confirmDialog.action === 'suspend'
      ? {
          title: `Suspend "${confirmDialog.tenant.name}"?`,
          body:  `ALL users under this tenant (owner + all staff) will be blocked from logging in and accessing any data immediately. You can reactivate at any time.`,
          icon: '🚫',
          confirmLabel: 'Yes, Suspend',
          confirmClass: 'sa-btn-danger',
        }
      : {
          title: `Reactivate "${confirmDialog.tenant.name}"?`,
          body:  effectiveStatus(confirmDialog.tenant) === 'expired'
            ? `This tenant's subscription has expired. Reactivating will extend it for another ${confirmDialog.tenant.plan_type === 'premium' ? '365' : '30'} days.`
            : `This will restore full access for the shop owner and all staff immediately.`,
          icon: '✅',
          confirmLabel: 'Yes, Reactivate',
          confirmClass: 'sa-btn-success',
        }
    : null;

  return (
    <div className="sa-root">
      {/* ── Top bar ── */}
      <div className="sa-topbar">
        <div className="sa-topbar-brand">
          <span className="sa-topbar-badge">🔐 Super Admin</span>
          <span className="sa-topbar-title">Platform Control Panel</span>
        </div>
        <div className="sa-topbar-actions">
          <span className="sa-topbar-email">{user.email}</span>
          <button id="btn-sa-signout" className="sa-signout-btn" onClick={handleSignOut}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="sa-content">
        <div className="sa-page-header">
          <div>
            <h1 className="sa-page-title">All Tenants</h1>
            <p className="sa-page-sub">
              Manage every shop on the Garments Wholesale SaaS platform.
            </p>
          </div>
          <button
            id="btn-sa-refresh"
            className="sa-btn-secondary"
            onClick={load}
            disabled={loading}
          >
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="sa-stats" role="list">
          <div className="sa-stat-card" role="listitem">
            <div className="sa-stat-icon sa-stat-icon--blue">🏢</div>
            <div className="sa-stat-body">
              <div className="sa-stat-label">Total Shops</div>
              <div className="sa-stat-value">{tenants.length}</div>
            </div>
          </div>
          <div className="sa-stat-card" role="listitem">
            <div className="sa-stat-icon sa-stat-icon--green">✓</div>
            <div className="sa-stat-body">
              <div className="sa-stat-label">Active</div>
              <div className="sa-stat-value">{activeCount}</div>
            </div>
          </div>
          <div className="sa-stat-card" role="listitem">
            <div className="sa-stat-icon sa-stat-icon--purple">★</div>
            <div className="sa-stat-body">
              <div className="sa-stat-label">Premium</div>
              <div className="sa-stat-value">{premiumCount}</div>
            </div>
          </div>
          <div className="sa-stat-card" role="listitem">
            <div className="sa-stat-icon sa-stat-icon--amber">⚠</div>
            <div className="sa-stat-body">
              <div className="sa-stat-label">Suspended / Expired</div>
              <div className="sa-stat-value">{suspendedCount + expiredCount}</div>
            </div>
          </div>
        </div>

        {/* ── Feedback banners ── */}
        {successMsg && (
          <div className="sa-success">
            {successMsg}
          </div>
        )}
        {loadError && !loading && (
          <div className="sa-error">
            ⚠ {loadError}
          </div>
        )}

        {/* ── Create Tenant form ── */}
        <CreateTenantForm
          onSuccess={msg => { setSuccessMsg(msg); load(); }}
        />

        {/* ── Tenant list ── */}
        <div className="sa-card">
          <div className="sa-card-header">
            <h2 className="sa-card-title">
              <span>🏢</span> Tenant Directory
              {!loading && (
                <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 400 }}>
                  ({tenants.length} {tenants.length === 1 ? 'shop' : 'shops'})
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="sa-spinner-wrap">
              <div className="sa-spinner" aria-hidden="true" />
              Loading tenants…
            </div>
          ) : (
            <TenantTable
              tenants={tenants}
              onAction={requestAction}
              pendingId={pendingId}
            />
          )}
        </div>
      </div>

      {/* ── Confirm dialog ── */}
      {confirmDialog && confirmInfo && (
        <ConfirmDialog
          title={confirmInfo.title}
          body={confirmInfo.body}
          icon={confirmInfo.icon}
          confirmLabel={confirmInfo.confirmLabel}
          confirmClass={confirmInfo.confirmClass}
          onConfirm={executeAction}
          onCancel={() => setConfirmDialog(null)}
          loading={pendingId === confirmDialog.tenant.id}
        />
      )}
    </div>
  );
}

export default SuperAdminPage;
