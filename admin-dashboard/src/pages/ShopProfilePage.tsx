import React, { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UserProfile, TenantBranding } from '../lib/auth';
import './ShopProfilePage.css';

interface ShopProfilePageProps {
  user: User;
  profile: UserProfile | null;
  branding?: TenantBranding | null;
  onProfileUpdated?: () => Promise<void> | void;
}

interface SubscriptionInfo {
  plan_type: 'trial' | 'premium';
  subscription_status: 'active' | 'suspended' | 'expired';
  subscription_end_date: string;
  is_effective_active: boolean;
}

export function ShopProfilePage({
  user,
  profile,
  branding,
  onProfileUpdated,
}: ShopProfilePageProps) {
  const isOwner = profile?.role === 'owner';

  // ── Shop Details Form State ──
  const [displayName, setDisplayName] = useState(branding?.display_name || branding?.name || '');
  const [companyName, setCompanyName] = useState(branding?.company_name || '');
  const [phone, setPhone] = useState(branding?.phone || '');
  const [address, setAddress] = useState(branding?.address || '');
  const [city, setCity] = useState('');
  const [ownerFullName, setOwnerFullName] = useState(profile?.full_name || '');

  // ── Password Change State ──
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── Subscription info (read-only) ──
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);

  // ── Status states ──
  const [savingShop, setSavingShop] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [shopSuccess, setShopSuccess] = useState<string | null>(null);
  const [shopError, setShopError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  // Load tenant extra fields (city) and subscription info on mount
  useEffect(() => {
    if (!profile?.tenant_id) return;

    // Fetch tenant city & details
    supabase
      .from('tenants')
      .select('city, address, phone, company_name, display_name, name')
      .eq('id', profile.tenant_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          if (data.city) setCity(data.city);
          if (data.address && !address) setAddress(data.address);
          if (data.phone && !phone) setPhone(data.phone);
          if (data.company_name && !companyName) setCompanyName(data.company_name);
          if (data.display_name && !displayName) setDisplayName(data.display_name);
        }
      });

    // Fetch subscription info
    supabase
      .rpc('get_tenant_subscription', { p_tenant_id: profile.tenant_id })
      .then(({ data }) => {
        if (data && data.found) {
          setSubInfo({
            plan_type: data.plan_type,
            subscription_status: data.subscription_status,
            subscription_end_date: data.subscription_end_date,
            is_effective_active: data.is_effective_active,
          });
        }
      });
  }, [profile?.tenant_id]);

  // Keep local state in sync when branding or profile props change
  useEffect(() => {
    if (branding?.display_name) setDisplayName(branding.display_name);
    else if (branding?.name) setDisplayName(branding.name);
    if (branding?.company_name) setCompanyName(branding.company_name);
    if (branding?.phone) setPhone(branding.phone);
    if (branding?.address) setAddress(branding.address);
  }, [branding]);

  useEffect(() => {
    if (profile?.full_name) setOwnerFullName(profile.full_name);
  }, [profile?.full_name]);

  // Save Shop & Profile Information
  async function handleSaveShop(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;

    setShopError(null);
    setShopSuccess(null);

    if (!displayName.trim()) {
      setShopError('Shop display name cannot be empty');
      return;
    }
    if (!ownerFullName.trim()) {
      setShopError('Owner full name cannot be empty');
      return;
    }

    setSavingShop(true);
    try {
      if (profile?.tenant_id) {
        const { error: tenantErr } = await supabase
          .from('tenants')
          .update({
            display_name: displayName.trim(),
            company_name: companyName.trim() || displayName.trim(),
            phone: phone.trim() || null,
            city: city.trim() || null,
            address: address.trim() || null,
          })
          .eq('id', profile.tenant_id);

        if (tenantErr) throw tenantErr;
      }

      // Update owner's profile row
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          full_name: ownerFullName.trim(),
          phone: phone.trim() || null,
        })
        .eq('id', user.id);

      if (profErr) throw profErr;

      setShopSuccess('Shop profile and branding updated successfully.');
      if (onProfileUpdated) {
        await onProfileUpdated();
      }
    } catch (err: unknown) {
      setShopError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingShop(false);
    }
  }

  // Change Password
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!newPassword || newPassword.length < 6) {
      setPassError('New password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match');
      return;
    }

    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      setPassSuccess('Password updated successfully. Use your new password on next login.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPassError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingPass(false);
    }
  }

  function daysUntil(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-PK', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  return (
    <div className="sp-page">
      <div className="sp-header">
        <div>
          <h1 className="sp-title">🏪 Shop Profile & Settings</h1>
          <p className="sp-subtitle">
            Manage your wholesale shop branding, contact details, owner account, and subscription
          </p>
        </div>
      </div>

      {!isOwner && (
        <div className="sp-readonly-banner">
          <span>ℹ️</span>
          <div>
            <strong>Staff Read-Only View:</strong> As a staff member (<code>{profile?.role}</code>), you can view your shop's official details and settings. Only the shop <strong>Owner</strong> can modify shop branding and settings.
          </div>
        </div>
      )}

      {/* ── Section 1: Shop Branding & Information ── */}
      <div className="sp-card">
        <div className="sp-card-header">
          <div>
            <h2 className="sp-card-title">
              <span>🏢</span> Shop Branding & Information
            </h2>
            <div className="sp-card-desc">
              Your shop name and contact details shown across invoices, receipts, and POS
            </div>
          </div>
        </div>

        {shopSuccess && (
          <div className="sp-alert sp-alert--success">
            <span>✓</span> {shopSuccess}
          </div>
        )}
        {shopError && (
          <div className="sp-alert sp-alert--error">
            <span>⚠</span> {shopError}
          </div>
        )}

        <form onSubmit={handleSaveShop}>
          <div className="sp-grid">
            <div className="sp-form-group">
              <label className="sp-label sp-label-required" htmlFor="sp-display-name">
                Shop Display Name (Branding)
              </label>
              <input
                id="sp-display-name"
                className="sp-input"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                disabled={!isOwner}
                required
              />
              <div className="sp-hint">
                This name appears on printed customer invoices, POS counter, and dashboard
              </div>
            </div>

            <div className="sp-form-group">
              <label className="sp-label" htmlFor="sp-company-name">
                Company / Legal Name
              </label>
              <input
                id="sp-company-name"
                className="sp-input"
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                disabled={!isOwner}
              />
            </div>

            <div className="sp-form-group">
              <label className="sp-label" htmlFor="sp-owner-name">
                Owner Full Name
              </label>
              <input
                id="sp-owner-name"
                className="sp-input"
                type="text"
                value={ownerFullName}
                onChange={e => setOwnerFullName(e.target.value)}
                disabled={!isOwner}
                required
              />
            </div>

            <div className="sp-form-group">
              <label className="sp-label" htmlFor="sp-phone">
                Contact Phone / WhatsApp
              </label>
              <input
                id="sp-phone"
                className="sp-input"
                type="text"
                placeholder="03001234567"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={!isOwner}
              />
            </div>

            <div className="sp-form-group">
              <label className="sp-label" htmlFor="sp-city">
                City
              </label>
              <input
                id="sp-city"
                className="sp-input"
                type="text"
                placeholder="e.g. Karachi"
                value={city}
                onChange={e => setCity(e.target.value)}
                disabled={!isOwner}
              />
            </div>

            <div className="sp-form-group sp-grid-full">
              <label className="sp-label" htmlFor="sp-address">
                Shop / Warehouse Address
              </label>
              <input
                id="sp-address"
                className="sp-input"
                type="text"
                placeholder="Shop #, Market, Road"
                value={address}
                onChange={e => setAddress(e.target.value)}
                disabled={!isOwner}
              />
              <div className="sp-hint">Printed on customer receipts and billing slips</div>
            </div>
          </div>

          {isOwner && (
            <div className="sp-actions">
              <button
                id="btn-save-shop-profile"
                type="submit"
                className="sp-btn-primary"
                disabled={savingShop}
              >
                {savingShop ? 'Saving Changes…' : '💾 Save Shop Details'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* ── Section 2: Security & Password ── */}
      <div className="sp-card">
        <div className="sp-card-header">
          <div>
            <h2 className="sp-card-title">
              <span>🔐</span> Account & Security
            </h2>
            <div className="sp-card-desc">
              Your login credentials and password management
            </div>
          </div>
        </div>

        {passSuccess && (
          <div className="sp-alert sp-alert--success">
            <span>✓</span> {passSuccess}
          </div>
        )}
        {passError && (
          <div className="sp-alert sp-alert--error">
            <span>⚠</span> {passError}
          </div>
        )}

        <form onSubmit={handleChangePassword}>
          <div className="sp-grid">
            <div className="sp-form-group">
              <label className="sp-label">Login Email</label>
              <input
                className="sp-input"
                type="text"
                value={user.email ?? ''}
                disabled
              />
              <div className="sp-hint">Login email can only be changed by platform super administrator</div>
            </div>

            <div className="sp-form-group">
              <label className="sp-label">Account Role</label>
              <input
                className="sp-input"
                type="text"
                value={profile?.role ? profile.role.replace('_', ' ').toUpperCase() : 'USER'}
                disabled
              />
            </div>

            <div className="sp-form-group">
              <label className="sp-label" htmlFor="sp-new-pass">
                New Password
              </label>
              <input
                id="sp-new-pass"
                className="sp-input"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="sp-form-group">
              <label className="sp-label" htmlFor="sp-confirm-pass">
                Confirm New Password
              </label>
              <input
                id="sp-confirm-pass"
                className="sp-input"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="sp-actions">
            <button
              id="btn-update-password"
              type="submit"
              className="sp-btn-primary"
              disabled={savingPass || !newPassword}
            >
              {savingPass ? 'Updating…' : '🔑 Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Section 3: Subscription & Licensing (Strictly Read-Only) ── */}
      <div className="sp-card">
        <div className="sp-card-header">
          <div>
            <h2 className="sp-card-title">
              <span>💳</span> Subscription & Licensing
            </h2>
            <div className="sp-card-desc">
              Your current platform tier and active validity dates (managed by platform administrator)
            </div>
          </div>
        </div>

        {subInfo ? (
          <div className="sp-sub-box">
            <div className="sp-sub-item">
              <span className="sp-sub-label">Plan Tier</span>
              <span className="sp-sub-value">
                <span className={`sp-badge sp-badge--${subInfo.plan_type}`}>
                  {subInfo.plan_type === 'premium' ? '★ Premium Plan' : '◌ 30-Day Trial'}
                </span>
              </span>
            </div>

            <div className="sp-sub-item">
              <span className="sp-sub-label">Account Status</span>
              <span className="sp-sub-value">
                <span className={`sp-badge sp-badge--${subInfo.subscription_status}`}>
                  ● {subInfo.subscription_status.toUpperCase()}
                </span>
              </span>
            </div>

            <div className="sp-sub-item">
              <span className="sp-sub-label">Valid Until</span>
              <span className="sp-sub-value">
                {formatDate(subInfo.subscription_end_date)}{' '}
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  ({daysUntil(subInfo.subscription_end_date)} days remaining)
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
            Loading subscription details…
          </div>
        )}

        <div className="sp-support-note">
          <span>🛡️</span>
          <span>
            Subscription terms and license extensions are managed exclusively by platform super administration. To renew or upgrade your license, please contact UB Collection support.
          </span>
        </div>
      </div>
    </div>
  );
}
