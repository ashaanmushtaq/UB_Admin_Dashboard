import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { signOut } from '../lib/auth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import {
  listAllTenants,
  updateTenantSubscription,
  createTenant,
  updateTenant,
  listTenantPayments,
} from '../lib/superAdmin';
import {
  fetchTenantGrowth,
  fetchTenantStatusBreakdown,
  presetToRange,
} from '../lib/analytics';
import type {
  DatePreset,
  DateRange,
  TenantGrowthPoint,
  TenantStatusBreakdown,
  TenantStatusFilter,
} from '../lib/analytics';
import type {
  TenantRow,
  CreateTenantPayload,
  UpdateTenantPayload,
  TenantPayment,
  PaymentMethod,
} from '../lib/superAdmin';
import './SuperAdminPage.css';
import { ThemeToggle } from '../lib/theme';
import karobitMark from '../assets/karobit-mark.png';

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

const SA_PRESET_LABELS: Record<DatePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom range',
};

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);

  useLayoutEffect(() => {
    const update = () => setWidth(Math.max(300, ref.current?.clientWidth ?? 300));
    update();
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function SuperAdminDateFilter({
  preset,
  customRange,
  onPresetChange,
  onCustomChange,
}: {
  preset: DatePreset;
  customRange: DateRange;
  onPresetChange: (preset: DatePreset) => void;
  onCustomChange: (range: DateRange) => void;
}) {
  return (
    <div className="sa-analytics-filter">
      <select
        className="sa-select sa-analytics-preset"
        value={preset}
        onChange={event => onPresetChange(event.target.value as DatePreset)}
        aria-label="Tenant growth date range"
      >
        {(Object.keys(SA_PRESET_LABELS) as DatePreset[]).map(value => (
          <option key={value} value={value}>{SA_PRESET_LABELS[value]}</option>
        ))}
      </select>
      {preset === 'custom' && (
        <div className="sa-analytics-custom-range">
          <input
            className="sa-input sa-analytics-date"
            type="date"
            value={customRange.from}
            max={customRange.to}
            onChange={event => onCustomChange({ ...customRange, from: event.target.value })}
            aria-label="Tenant growth start date"
          />
          <span>to</span>
          <input
            className="sa-input sa-analytics-date"
            type="date"
            value={customRange.to}
            min={customRange.from}
            onChange={event => onCustomChange({ ...customRange, to: event.target.value })}
            aria-label="Tenant growth end date"
          />
        </div>
      )}
    </div>
  );
}

function SuperAdminAnalytics() {
  const [growthPreset, setGrowthPreset] = useState<DatePreset>('90d');
  const [growthCustomRange, setGrowthCustomRange] = useState<DateRange>({
    from: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [growth, setGrowth] = useState<TenantGrowthPoint[]>([]);
  const [growthLoading, setGrowthLoading] = useState(true);
  const [growthError, setGrowthError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>('all');
  const [status, setStatus] = useState<TenantStatusBreakdown | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const growthChart = useChartWidth();
  const statusChart = useChartWidth();

  const growthRange = presetToRange(growthPreset, growthCustomRange);

  const loadGrowth = useCallback(async () => {
    setGrowthLoading(true);
    setGrowthError(null);
    try {
      setGrowth(await fetchTenantGrowth(growthRange));
    } catch (error: unknown) {
      setGrowthError(error instanceof Error ? error.message : String(error));
    } finally {
      setGrowthLoading(false);
    }
  }, [growthRange.from, growthRange.to]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      setStatus(await fetchTenantStatusBreakdown(statusFilter));
    } catch (error: unknown) {
      setStatusError(error instanceof Error ? error.message : String(error));
    } finally {
      setStatusLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadGrowth(); }, [loadGrowth]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const statusBars = statusFilter === 'all'
    ? [
        { name: 'Active', value: status?.active ?? 0, color: '#34d399' },
        { name: 'Suspended', value: status?.suspended ?? 0, color: '#f87171' },
        { name: 'Expired', value: status?.expired ?? 0, color: '#94a3b8' },
      ]
    : [{
        name: statusFilter[0].toUpperCase() + statusFilter.slice(1),
        value: status?.total ?? 0,
        color: statusFilter === 'active' ? '#34d399' : statusFilter === 'suspended' ? '#f87171' : '#94a3b8',
      }];

  return (
    <section className="sa-analytics-section" aria-label="Platform analytics">
      <div className="sa-analytics-row">
        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <div>
              <h2 className="sa-analytics-title">📈 Tenant Growth</h2>
              <p className="sa-analytics-sub">New tenant signups grouped by month</p>
            </div>
            <SuperAdminDateFilter
              preset={growthPreset}
              customRange={growthCustomRange}
              onPresetChange={setGrowthPreset}
              onCustomChange={setGrowthCustomRange}
            />
          </div>
          <div className="sa-analytics-chart" ref={growthChart.ref}>
            {growthLoading ? <div className="sa-analytics-message">Loading growth data…</div> : growthError ? <div className="sa-analytics-message sa-analytics-message--error">⚠ {growthError}</div> : growth.length === 0 ? <div className="sa-analytics-message">No data available for this period.</div> : (
              <BarChart width={growthChart.width} height={250} data={growth} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ background: '#1a2540', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#f1f5f9' }} />
                  <Bar dataKey="total" name="New tenants" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </div>
        </div>

        <div className="sa-analytics-card">
          <div className="sa-analytics-card-header">
            <div>
              <h2 className="sa-analytics-title">◉ Tenant Status</h2>
              <p className="sa-analytics-sub">Current subscription status breakdown</p>
            </div>
            <select
              className="sa-select sa-analytics-status-filter"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as TenantStatusFilter)}
              aria-label="Tenant status filter"
            >
              <option value="all">All tenants</option>
              <option value="active">Active only</option>
              <option value="suspended">Suspended only</option>
              <option value="expired">Expired only</option>
            </select>
          </div>
          <div className="sa-analytics-chart" ref={statusChart.ref}>
            {statusLoading ? <div className="sa-analytics-message">Loading status data…</div> : statusError ? <div className="sa-analytics-message sa-analytics-message--error">⚠ {statusError}</div> : statusBars.every(bar => bar.value === 0) ? <div className="sa-analytics-message">No data available for this period.</div> : (
              <BarChart width={statusChart.width} height={250} data={statusBars} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ background: '#1a2540', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#f1f5f9' }} />
                  <Bar dataKey="value" name="Tenants" radius={[4, 4, 0, 0]}>
                    {statusBars.map(bar => <Cell key={bar.name} fill={bar.color} />)}
                  </Bar>
              </BarChart>
            )}
          </div>
          <div className="sa-analytics-total">Showing <strong>{status?.total ?? 0}</strong> tenant{status?.total === 1 ? '' : 's'}</div>
        </div>
      </div>
    </section>
  );
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
  onEdit: (tenant: TenantRow) => void;
}

function TenantDetailModal({ tenant, onClose, onEdit }: TenantDetailModalProps) {
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

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem' }}>
          <button
            type="button"
            className="sa-btn-edit"
            onClick={() => {
              onClose();
              onEdit(tenant);
            }}
          >
            ✏️ Edit Tenant
          </button>
          <button className="sa-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Tenant Modal ────────────────────────────────────────────────────────

interface EditTenantModalProps {
  tenant: TenantRow;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

function EditTenantModal({ tenant, onClose, onSaved }: EditTenantModalProps) {
  const [name, setName] = useState(tenant.name);
  const [displayName, setDisplayName] = useState(tenant.display_name || tenant.name);
  const [companyName, setCompanyName] = useState(tenant.company_name || '');
  const [city, setCity] = useState(tenant.city || '');
  const [address, setAddress] = useState(tenant.address || '');
  const [phone, setPhone] = useState(tenant.owner_phone || '');

  const [ownerFullName, setOwnerFullName] = useState(tenant.owner_name || '');
  const [ownerPhone, setOwnerPhone] = useState(tenant.owner_phone || '');
  const [ownerEmail, setOwnerEmail] = useState(tenant.owner_email || '');
  const [ownerPassword, setOwnerPassword] = useState('');

  const [planType, setPlanType] = useState<'trial' | 'premium'>(tenant.plan_type);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'suspended' | 'expired'>(tenant.subscription_status);
  const [startDate, setStartDate] = useState(
    tenant.subscription_start_date ? tenant.subscription_start_date.split('T')[0] : ''
  );
  const [endDate, setEndDate] = useState(
    tenant.subscription_end_date ? tenant.subscription_end_date.split('T')[0] : ''
  );
  const [isActive, setIsActive] = useState(tenant.is_effective_active);
  const [notes, setNotes] = useState(tenant.notes || '');

  const [activeTab, setActiveTab] = useState<'shop' | 'owner' | 'subscription' | 'notes'>('shop');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Shop registered name is required'); setActiveTab('shop'); return; }
    if (!displayName.trim()) { setError('Shop display name is required'); setActiveTab('shop'); return; }
    if (!address.trim()) { setError('Shop address is required'); setActiveTab('shop'); return; }
    if (!ownerFullName.trim()) { setError('Owner full name is required'); setActiveTab('owner'); return; }
    if (!ownerEmail.trim()) { setError('Owner email is required'); setActiveTab('owner'); return; }
    if (!endDate) { setError('Subscription end date is required'); setActiveTab('subscription'); return; }
    if (ownerPassword && ownerPassword.trim().length > 0 && ownerPassword.trim().length < 6) {
      setError('Owner new password must be at least 6 characters');
      setActiveTab('owner');
      return;
    }

    setLoading(true);
    try {
      const payload: UpdateTenantPayload = {
        tenant_id: tenant.id,
        name: name.trim(),
        display_name: displayName.trim(),
        company_name: companyName.trim() || name.trim(),
        city: city.trim(),
        address: address.trim(),
        phone: phone.trim() || ownerPhone.trim(),
        owner_id: tenant.owner_id || undefined,
        owner_full_name: ownerFullName.trim(),
        owner_phone: ownerPhone.trim(),
        owner_email: ownerEmail.trim(),
        plan_type: planType,
        subscription_status: subscriptionStatus,
        subscription_start_date: startDate ? new Date(startDate).toISOString() : undefined,
        subscription_end_date: new Date(endDate + 'T23:59:59Z').toISOString(),
        is_active: isActive,
        notes: notes.trim(),
      };
      if (ownerPassword.trim().length > 0) {
        payload.owner_password = ownerPassword.trim();
      }

      await updateTenant(payload);
      onSaved(`Tenant "${name}" successfully updated.`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sa-dialog-overlay" onClick={onClose}>
      <div className="sa-edit-dialog" onClick={e => e.stopPropagation()}>
        <div className="sa-detail-header">
          <div className="sa-detail-title-group">
            <h2 className="sa-detail-shop-name">✏️ Edit Tenant: {tenant.name}</h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Slug: <code>{tenant.slug}</code> • ID: <code>{tenant.id.slice(0, 8)}…</code>
            </div>
          </div>
          <button className="sa-close-btn" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        {error && (
          <div className="sa-error" style={{ marginBottom: '1rem' }}>
            <span>⚠</span> {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="sa-edit-tabs" role="tablist">
          <button
            type="button"
            className={`sa-edit-tab${activeTab === 'shop' ? ' sa-edit-tab--active' : ''}`}
            onClick={() => setActiveTab('shop')}
          >
            🏢 Shop & Branding
          </button>
          <button
            type="button"
            className={`sa-edit-tab${activeTab === 'owner' ? ' sa-edit-tab--active' : ''}`}
            onClick={() => setActiveTab('owner')}
          >
            👤 Owner & Credentials
          </button>
          <button
            type="button"
            className={`sa-edit-tab${activeTab === 'subscription' ? ' sa-edit-tab--active' : ''}`}
            onClick={() => setActiveTab('subscription')}
          >
            💳 Subscription & Status
          </button>
          <button
            type="button"
            className={`sa-edit-tab${activeTab === 'notes' ? ' sa-edit-tab--active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            📝 Remarks & Notes
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* TAB 1: Shop & Branding */}
          {activeTab === 'shop' && (
            <div className="sa-form" style={{ padding: 0 }}>
              <div className="sa-form-group">
                <label className="sa-label sa-label-required" htmlFor="edit-name">
                  Shop Legal / Registered Name
                </label>
                <input
                  id="edit-name"
                  className="sa-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              <div className="sa-form-group">
                <label className="sa-label sa-label-required" htmlFor="edit-display-name">
                  Shop Display Name (Branding)
                </label>
                <input
                  id="edit-display-name"
                  className="sa-input"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  required
                />
                <div className="sa-input-hint">
                  Appears on invoices, POS counter, and dashboard header
                </div>
              </div>

              <div className="sa-form-group">
                <label className="sa-label" htmlFor="edit-company-name">
                  Company / Organization Name
                </label>
                <input
                  id="edit-company-name"
                  className="sa-input"
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                />
              </div>

              <div className="sa-form-group">
                <label className="sa-label" htmlFor="edit-city">
                  City
                </label>
                <input
                  id="edit-city"
                  className="sa-input"
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                />
              </div>

              <div className="sa-form-group sa-form-full">
                <label className="sa-label sa-label-required" htmlFor="edit-address">
                  Shop Address
                </label>
                <input
                  id="edit-address"
                  className="sa-input"
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  required
                />
              </div>

              <div className="sa-form-group">
                <label className="sa-label" htmlFor="edit-shop-phone">
                  Shop / Landline Phone
                </label>
                <input
                  id="edit-shop-phone"
                  className="sa-input"
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* TAB 2: Owner & Credentials */}
          {activeTab === 'owner' && (
            <div className="sa-form" style={{ padding: 0 }}>
              <div className="sa-form-group">
                <label className="sa-label sa-label-required" htmlFor="edit-owner-name">
                  Owner Full Name
                </label>
                <input
                  id="edit-owner-name"
                  className="sa-input"
                  type="text"
                  value={ownerFullName}
                  onChange={e => setOwnerFullName(e.target.value)}
                  required
                />
              </div>

              <div className="sa-form-group">
                <label className="sa-label sa-label-required" htmlFor="edit-owner-phone">
                  Owner Phone / WhatsApp
                </label>
                <input
                  id="edit-owner-phone"
                  className="sa-input"
                  type="text"
                  value={ownerPhone}
                  onChange={e => setOwnerPhone(e.target.value)}
                  required
                />
              </div>

              <div className="sa-form-group">
                <label className="sa-label sa-label-required" htmlFor="edit-owner-email">
                  Owner Login Email
                </label>
                <input
                  id="edit-owner-email"
                  className="sa-input"
                  type="email"
                  value={ownerEmail}
                  onChange={e => setOwnerEmail(e.target.value)}
                  required
                />
                <div className="sa-input-hint sa-input-hint--warning">
                  ⚠️ Updating this modifies the owner's actual Supabase Auth login email.
                </div>
              </div>

              <div className="sa-form-group">
                <label className="sa-label" htmlFor="edit-owner-password">
                  Reset Owner Password
                </label>
                <input
                  id="edit-owner-password"
                  className="sa-input"
                  type="password"
                  placeholder="Leave blank to keep unchanged"
                  value={ownerPassword}
                  onChange={e => setOwnerPassword(e.target.value)}
                />
                <div className="sa-input-hint">
                  Only fill this if you want to reset the owner's password (min 6 characters).
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Subscription & Status */}
          {activeTab === 'subscription' && (
            <div className="sa-form" style={{ padding: 0 }}>
              <div className="sa-form-group">
                <label className="sa-label" htmlFor="edit-plan-type">
                  Subscription Plan
                </label>
                <select
                  id="edit-plan-type"
                  className="sa-select"
                  value={planType}
                  onChange={e => setPlanType(e.target.value as 'trial' | 'premium')}
                >
                  <option value="trial">Trial — Rs. 5,000 / 30 days</option>
                  <option value="premium">Premium — Rs. 50,000 / 12 months</option>
                </select>
              </div>

              <div className="sa-form-group">
                <label className="sa-label" htmlFor="edit-sub-status">
                  Subscription Status
                </label>
                <select
                  id="edit-sub-status"
                  className="sa-select"
                  value={subscriptionStatus}
                  onChange={e => setSubscriptionStatus(e.target.value as 'active' | 'suspended' | 'expired')}
                >
                  <option value="active">Active (Normal Access)</option>
                  <option value="suspended">Suspended (Access Blocked)</option>
                  <option value="expired">Expired (Requires Renewal)</option>
                </select>
              </div>

              <div className="sa-form-group">
                <label className="sa-label" htmlFor="edit-start-date">
                  Subscription Start Date
                </label>
                <input
                  id="edit-start-date"
                  className="sa-input"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>

              <div className="sa-form-group">
                <label className="sa-label sa-label-required" htmlFor="edit-end-date">
                  Subscription End Date
                </label>
                <input
                  id="edit-end-date"
                  className="sa-input"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  required
                />
                <div className="sa-input-hint">
                  Current validity: {endDate ? `${daysUntil(endDate)} days remaining` : '—'}
                </div>
              </div>

              <div className="sa-form-group sa-form-full" style={{ marginTop: '0.5rem' }}>
                <label className="sa-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                  />
                  <span>Account Enabled (is_active)</span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: Remarks & Notes */}
          {activeTab === 'notes' && (
            <div className="sa-form" style={{ padding: 0 }}>
              <div className="sa-form-group sa-form-full">
                <label className="sa-label" htmlFor="edit-notes">
                  Operator Setup & Agreement Notes
                </label>
                <textarea
                  id="edit-notes"
                  className="sa-textarea"
                  rows={5}
                  placeholder="e.g. Onboarded via WhatsApp. Paid cash advance. Special discount on renewals."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button type="button" className="sa-btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="sa-btn-primary" disabled={loading}>
              {loading ? 'Saving Changes…' : '💾 Save Changes'}
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
  onViewDetails: (tenant: TenantRow) => void;
  onEdit: (tenant: TenantRow) => void;
}

function TenantTable({ tenants, onAction, pendingId, onViewDetails, onEdit }: TenantTableProps) {
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
                    <button
                      id={`btn-edit-${t.id}`}
                      className="sa-btn-edit"
                      onClick={() => onEdit(t)}
                      aria-label={`Edit ${t.name}`}
                    >
                      ✏️ Edit
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
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);

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
        <div className="sa-topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src={karobitMark}
            alt="Karobit"
            style={{ width: '28px', height: '28px', objectFit: 'contain' }}
          />
          <span className="sa-topbar-title" style={{ fontWeight: 700 }}>Karobit Super Admin</span>
          <span className="sa-topbar-badge">Platform Control Panel</span>
        </div>
        <div className="sa-topbar-actions">
          <ThemeToggle />
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

        <SuperAdminAnalytics />

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
              onEdit={setEditingTenant}
            />
          )}
        </div>
      </div>

      {/* ── Tenant Detail Modal ── */}
      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onEdit={setEditingTenant}
        />
      )}

      {/* ── Edit Tenant Modal ── */}
      {editingTenant && (
        <EditTenantModal
          tenant={editingTenant}
          onClose={() => setEditingTenant(null)}
          onSaved={msg => {
            setSuccessMsg(msg);
            load();
          }}
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
