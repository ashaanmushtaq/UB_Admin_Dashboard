import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { signOut } from '../lib/auth';
import {
  listAllTenants,
  updateTenantSubscription,
  createTenant,
  listTenantPayments,
} from '../lib/superAdmin';
import type {
  TenantRow,
  CreateTenantPayload,
  TenantPayment,
  PaymentMethod,
} from '../lib/superAdmin';
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

function formatPKR(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return 'Rs. ' + num.toLocaleString('en-PK');
}

function getWhatsAppUrl(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  const standard = cleaned.startsWith('0') ? '92' + cleaned.slice(1) : cleaned;
  return `https://wa.me/${standard}`;
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

// ─── Create Tenant Form ───────────────────────────────────────────────────────

const getTodayDate = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM: CreateTenantPayload = {
  name: '',
  owner_email: '',
  owner_password: '',
  owner_full_name: '',
  owner_phone: '',
  address: '',
  city: 'Karachi',
  notes: '',
  plan_type: 'trial',
  payment_amount: 5000,
  payment_method: 'cash',
  payment_date: getTodayDate(),
  payment_reference: '',
  payment_notes: '',
};

function CreateTenantForm({ onSuccess }: { onSuccess: (msg: string) => void }) {
  const [form, setForm] = useState<CreateTenantPayload>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function field(key: keyof CreateTenantPayload) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm(f => ({ ...f, [key]: e.target.value }));
      setError(null);
    };
  }

  function handlePlanChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newPlan = e.target.value as 'trial' | 'premium';
    setForm(f => {
      const defaultPrev = f.plan_type === 'trial' ? 5000 : 50000;
      const defaultNew = newPlan === 'trial' ? 5000 : 50000;
      const newAmount = f.payment_amount === defaultPrev ? defaultNew : f.payment_amount;
      return {
        ...f,
        plan_type: newPlan,
        payment_amount: newAmount,
      };
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.name.trim() ||
      !form.owner_email.trim() ||
      !form.owner_password.trim() ||
      !form.owner_phone.trim() ||
      !form.address.trim()
    ) {
      setError('Shop name, owner phone, address, owner email, and password are required.');
      return;
    }
    if (form.owner_password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    const amountNum = Number(form.payment_amount);
    if (isNaN(amountNum) || amountNum < 0) {
      setError('Please provide a valid, non-negative payment amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createTenant({
        ...form,
        payment_amount: amountNum,
      });
      setForm({ ...EMPTY_FORM, payment_date: getTodayDate() });
      setShowForm(false);
      onSuccess(
        `✅ Created "${result.tenant.name}" (${result.owner.email}) — ${result.tenant.plan_type} plan, payment of ${formatPKR(amountNum)} recorded via ${form.payment_method}.`
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
          {/* ── Section 1: Shop Information ── */}
          <div className="sa-form-section-title">
            <span>🏪</span> Shop Information
          </div>

          <div className="sa-form-group">
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

          <div className="sa-form-group">
            <label className="sa-label" htmlFor="input-shop-city">
              City
            </label>
            <input
              id="input-shop-city"
              className="sa-input"
              type="text"
              placeholder="e.g. Karachi, Lahore, Faisalabad"
              value={form.city ?? ''}
              onChange={field('city')}
              autoComplete="off"
            />
          </div>

          <div className="sa-form-group sa-form-full">
            <label className="sa-label sa-label-required" htmlFor="input-shop-address">
              Shop Address
            </label>
            <input
              id="input-shop-address"
              className="sa-input"
              type="text"
              placeholder="e.g. Shop # 42, Bolton Market, M.A. Jinnah Road"
              value={form.address}
              onChange={field('address')}
              required
              autoComplete="off"
            />
          </div>

          {/* ── Section 2: Owner & Login Credentials ── */}
          <div className="sa-form-section-title">
            <span>👤</span> Owner & Credentials
          </div>

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

          <div className="sa-form-group">
            <label className="sa-label sa-label-required" htmlFor="input-owner-phone">
              Owner Phone / WhatsApp
            </label>
            <input
              id="input-owner-phone"
              className="sa-input"
              type="tel"
              placeholder="e.g. 03001234567"
              value={form.owner_phone}
              onChange={field('owner_phone')}
              required
              autoComplete="off"
            />
          </div>

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

          {/* ── Section 3: Subscription & Initial Payment ── */}
          <div className="sa-form-section-title">
            <span>💳</span> Subscription & Payment Confirmation
          </div>

          <div className="sa-form-group">
            <label className="sa-label" htmlFor="select-plan-type">
              Subscription Plan
            </label>
            <select
              id="select-plan-type"
              className="sa-select"
              value={form.plan_type}
              onChange={handlePlanChange}
            >
              <option value="trial">Trial — Rs. 5,000 / 30 days</option>
              <option value="premium">Premium — Rs. 50,000 / 12 months</option>
            </select>
            <div className="sa-plan-info">{planInfo[form.plan_type]}</div>
          </div>

          <div className="sa-form-group">
            <label className="sa-label sa-label-required" htmlFor="input-payment-amount">
              Amount Received (PKR)
            </label>
            <input
              id="input-payment-amount"
              className="sa-input"
              type="number"
              min="0"
              step="500"
              placeholder="5000"
              value={form.payment_amount}
              onChange={field('payment_amount')}
              required
            />
          </div>

          <div className="sa-form-group">
            <label className="sa-label sa-label-required" htmlFor="select-payment-method">
              Payment Method
            </label>
            <select
              id="select-payment-method"
              className="sa-select"
              value={form.payment_method}
              onChange={field('payment_method')}
              required
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer / Raast</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">EasyPaisa</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="sa-form-group">
            <label className="sa-label sa-label-required" htmlFor="input-payment-date">
              Payment Date
            </label>
            <input
              id="input-payment-date"
              className="sa-input"
              type="date"
              value={form.payment_date}
              onChange={field('payment_date')}
              required
            />
          </div>

          <div className="sa-form-group">
            <label className="sa-label" htmlFor="input-payment-reference">
              Reference / Transaction ID / Slip #
            </label>
            <input
              id="input-payment-reference"
              className="sa-input"
              type="text"
              placeholder="e.g. TRX-987654 or Cheque # 12345"
              value={form.payment_reference ?? ''}
              onChange={field('payment_reference')}
            />
          </div>

          <div className="sa-form-group">
            <label className="sa-label" htmlFor="input-payment-notes">
              Payment Remarks
            </label>
            <input
              id="input-payment-notes"
              className="sa-input"
              type="text"
              placeholder="e.g. Paid in full at onboarding"
              value={form.payment_notes ?? ''}
              onChange={field('payment_notes')}
            />
          </div>

          {/* ── Section 4: Remarks / Notes ── */}
          <div className="sa-form-section-title">
            <span>📝</span> Notes & Remarks (Optional)
          </div>

          <div className="sa-form-group sa-form-full">
            <label className="sa-label" htmlFor="textarea-tenant-notes">
              General Remarks / Referral / Setup Notes
            </label>
            <textarea
              id="textarea-tenant-notes"
              className="sa-textarea"
              placeholder="e.g. Referred by Tariq Road association, onboarding scheduled for Saturday."
              value={form.notes ?? ''}
              onChange={field('notes')}
              rows={2}
            />
          </div>

          <div className="sa-form-actions">
            <button
              id="btn-submit-create-tenant"
              type="submit"
              className="sa-btn-primary"
              disabled={submitting}
            >
              {submitting ? '⏳ Creating…' : '🚀 Create Tenant & Record Payment'}
            </button>
            <button
              type="button"
              className="sa-btn-secondary"
              onClick={() => { setForm({ ...EMPTY_FORM, payment_date: getTodayDate() }); setShowForm(false); setError(null); }}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tenant Detail Modal ──────────────────────────────────────────────────────

interface TenantDetailModalProps {
  tenant: TenantRow;
  onClose: () => void;
}

function TenantDetailModal({ tenant, onClose }: TenantDetailModalProps) {
  const [payments, setPayments] = useState<TenantPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const status = effectiveStatus(tenant);
  const days = daysUntil(tenant.subscription_end_date);

  useEffect(() => {
    let cancelled = false;
    async function fetchPayments() {
      setLoading(true);
      setError(null);
      try {
        const data = await listTenantPayments(tenant.id);
        if (!cancelled) setPayments(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchPayments();
    return () => { cancelled = true; };
  }, [tenant.id]);

  return (
    <div className="sa-dialog-overlay" onClick={onClose}>
      <div className="sa-detail-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sa-detail-header">
          <div className="sa-detail-title-group">
            <h2 className="sa-detail-shop-name">{tenant.name}</h2>
            <div className="sa-detail-badges">
              <PlanBadge plan={tenant.plan_type} />
              <StatusBadge status={status} />
              <span className="sa-paid-badge">
                💰 Total Paid: {formatPKR(tenant.total_paid || 0)}
              </span>
            </div>
          </div>
          <button className="sa-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Tenant Information Grid */}
        <div className="sa-detail-grid">
          <div className="sa-detail-item">
            <span className="sa-detail-label">Slug / Identifier</span>
            <span className="sa-detail-value"><code>{tenant.slug}</code></span>
          </div>

          <div className="sa-detail-item">
            <span className="sa-detail-label">Location / City</span>
            <span className="sa-detail-value">
              {tenant.city || 'Not specified'}
            </span>
          </div>

          <div className="sa-detail-item" style={{ gridColumn: '1 / -1' }}>
            <span className="sa-detail-label">Shop Address</span>
            <span className="sa-detail-value">{tenant.address || '—'}</span>
          </div>

          <div className="sa-detail-item">
            <span className="sa-detail-label">Owner Name</span>
            <span className="sa-detail-value">{tenant.owner_name || '—'}</span>
          </div>

          <div className="sa-detail-item">
            <span className="sa-detail-label">Owner Email</span>
            <span className="sa-detail-value">
              {tenant.owner_email ? (
                <a href={`mailto:${tenant.owner_email}`} style={{ color: '#93c5fd', textDecoration: 'none' }}>
                  {tenant.owner_email}
                </a>
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="sa-detail-item">
            <span className="sa-detail-label">Owner Phone / WhatsApp</span>
            <span className="sa-detail-value">
              {tenant.owner_phone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span>{tenant.owner_phone}</span>
                  <a
                    href={getWhatsAppUrl(tenant.owner_phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sa-whatsapp-link"
                    title="Open WhatsApp chat"
                  >
                    💬 WhatsApp
                  </a>
                </div>
              ) : (
                '—'
              )}
            </span>
          </div>

          <div className="sa-detail-item">
            <span className="sa-detail-label">Subscription Window</span>
            <span className="sa-detail-value">
              {tenant.subscription_start_date ? formatDate(tenant.subscription_start_date) : '—'} →{' '}
              <span className={days < 0 ? 'sa-date--expired' : days < 10 ? 'sa-date--expiring' : ''}>
                {formatDate(tenant.subscription_end_date)} ({days < 0 ? 'Expired' : `${days}d left`})
              </span>
            </span>
          </div>
        </div>

        {/* General Notes */}
        {tenant.notes && (
          <div className="sa-detail-notes-box">
            <div className="sa-detail-label">📝 Remarks / Setup Notes</div>
            <div style={{ fontSize: '0.85rem', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
              {tenant.notes}
            </div>
          </div>
        )}

        {/* Payment History Section */}
        <div className="sa-payments-card">
          <div className="sa-payments-card-header">
            <h3 className="sa-payments-card-title">
              <span>🧾</span> Payment & Subscription History
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {payments.length} {payments.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          {loading ? (
            <div className="sa-spinner-wrap" style={{ padding: '1.5rem 0' }}>
              <div className="sa-spinner" aria-hidden="true" />
              Loading payment history…
            </div>
          ) : error ? (
            <div className="sa-error" style={{ margin: '0.5rem 0' }}>⚠ {error}</div>
          ) : payments.length === 0 ? (
            <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>
              No payments recorded yet for this tenant.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="sa-pmt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td>{formatDate(p.payment_date)}</td>
                      <td style={{ fontWeight: 600, color: '#6ee7b7' }}>{formatPKR(p.amount)}</td>
                      <td>
                        <span className={`sa-pmt-badge sa-pmt-badge--${p.payment_method}`}>
                          {p.payment_method.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {p.reference_no ? <code>{p.reference_no}</code> : <span style={{ color: '#475569' }}>—</span>}
                      </td>
                      <td>{p.notes || <span style={{ color: '#475569' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button className="sa-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tenant Table ─────────────────────────────────────────────────────────────

interface TenantTableProps {
  tenants: TenantRow[];
  onAction: (tenant: TenantRow, action: 'suspend' | 'reactivate') => void;
  pendingId: string | null;
  onViewDetails: (tenant: TenantRow) => void;
}

function TenantTable({ tenants, onAction, pendingId, onViewDetails }: TenantTableProps) {
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
            <th>Owner & Contact</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Total Paid</th>
            <th>Subscription End</th>
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
                  <div className="sa-tenant-slug">
                    {t.slug}
                    {t.city && <span style={{ marginLeft: '0.4rem', color: '#94a3b8' }}>• 📍 {t.city}</span>}
                  </div>
                </td>
                <td>
                  <div className="sa-owner-name">{t.owner_name ?? '—'}</div>
                  <div className="sa-owner-email">{t.owner_email ?? '—'}</div>
                  {t.owner_phone && (
                    <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ color: '#94a3b8' }}>📞 {t.owner_phone}</span>
                      <a
                        href={getWhatsAppUrl(t.owner_phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sa-whatsapp-link"
                        title="Chat on WhatsApp"
                      >
                        💬
                      </a>
                    </div>
                  )}
                </td>
                <td>
                  <PlanBadge plan={t.plan_type} />
                </td>
                <td>
                  <StatusBadge status={status} />
                </td>
                <td>
                  <span className="sa-paid-badge">
                    {formatPKR(t.total_paid || 0)}
                  </span>
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
                  <div className="sa-actions-cell">
                    <button
                      id={`btn-view-${t.id}`}
                      className="sa-btn-view"
                      onClick={() => onViewDetails(t)}
                      aria-label={`View details for ${t.name}`}
                    >
                      👁 Details
                    </button>
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
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null);

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
  const totalRevenue   = tenants.reduce((sum, t) => sum + (Number(t.total_paid) || 0), 0);

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
          <div className="sa-stat-card" role="listitem">
            <div className="sa-stat-icon" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>💰</div>
            <div className="sa-stat-body">
              <div className="sa-stat-label">Total Revenue</div>
              <div className="sa-stat-value" style={{ fontSize: '1.15rem' }}>{formatPKR(totalRevenue)}</div>
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
              onViewDetails={setSelectedTenant}
            />
          )}
        </div>
      </div>

      {/* ── Tenant Detail Modal ── */}
      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
        />
      )}

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
