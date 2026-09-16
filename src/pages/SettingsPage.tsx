import { useState, useEffect } from 'react';
import { fetchBusinessSettings, saveBusinessSettings, type BusinessSettings } from '../lib/settings';
import './SettingsPage.css';

interface SettingsPageProps {
  tenantId?: string;
}

export function SettingsPage({ tenantId = '' }: SettingsPageProps) {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form Fields
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [ntn, setNtn] = useState('');
  const [strn, setStrn] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [taxRate, setTaxRate] = useState('17');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await fetchBusinessSettings();
      if (data) {
        setSettings(data);
        setBusinessName(data.business_name || '');
        setAddress(data.address || '');
        setNtn(data.ntn || '');
        setStrn(data.strn || '');
        setCurrency(data.currency || 'PKR');
        setTaxRate(String(data.tax_rate_pct ?? 17));
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      const saved = await saveBusinessSettings(tenantId || settings?.tenant_id || '', {
        business_name: businessName,
        address,
        ntn,
        strn,
        currency,
        tax_rate_pct: parseFloat(taxRate) || 17,
      });
      setSettings(saved);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1 className="settings-title">⚙️ Business & System Settings</h1>
        <p className="settings-sub">
          Manage your enterprise profile, tax identifiers, and system parameters.
        </p>
      </header>

      <div className="settings-grid">
        {/* Business Settings Form */}
        <div className="settings-card">
          <h2 className="settings-card-title">Commercial & Fiscal Parameters</h2>
          {success && (
            <div style={{ background: '#dcfce7', color: '#15803d', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              ✓ Business settings saved successfully.
            </div>
          )}
          {loading ? (
            <div>Loading configuration...</div>
          ) : (
            <form onSubmit={handleSave}>
              <div className="tax-form-group">
                <label className="tax-form-label">Enterprise / Company Name</label>
                <input 
                  className="tax-input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Karobit Garments & Textiles"
                />
              </div>

              <div className="tax-form-group">
                <label className="tax-form-label">Physical / Registered Address</label>
                <input 
                  className="tax-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Factory premises, industrial area"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="tax-form-group">
                  <label className="tax-form-label">NTN Number</label>
                  <input 
                    className="tax-input"
                    value={ntn}
                    onChange={(e) => setNtn(e.target.value)}
                    placeholder="1234567-8"
                  />
                </div>
                <div className="tax-form-group">
                  <label className="tax-form-label">STRN Number</label>
                  <input 
                    className="tax-input"
                    value={strn}
                    onChange={(e) => setStrn(e.target.value)}
                    placeholder="01-02-3456-789-01"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="tax-form-group">
                  <label className="tax-form-label">Operating Currency</label>
                  <select 
                    className="tax-input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="PKR">PKR - Pakistani Rupee (₨)</option>
                    <option value="USD">USD - US Dollar ($)</option>
                    <option value="AED">AED - UAE Dirham</option>
                  </select>
                </div>
                <div className="tax-form-group">
                  <label className="tax-form-label">Default GST Rate (%)</label>
                  <input 
                    type="number"
                    step="0.1"
                    className="tax-input"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="tax-primary-btn"
                disabled={saving}
                style={{ marginTop: '0.5rem' }}
              >
                {saving ? 'Saving...' : '💾 Save Changes'}
              </button>
            </form>
          )}
        </div>

        {/* Engineered by Bellanix Tech Card */}
        <div>
          <div className="bellanix-card">
            <span className="bellanix-badge">Official Technology Partner</span>
            <h3 className="bellanix-title">Engineered by Bellanix Tech</h3>
            <p className="bellanix-desc">
              Custom-built cloud architecture powering Karobit's dual-surface manufacturing and retail operations. Engineered for real-time factory workflows, precision inventory, and enterprise compliance.
            </p>

            <div className="bellanix-info-item">
              <span className="bellanix-info-label">Platform Core</span>
              <span className="bellanix-info-val">Karobit Enterprise v0.3</span>
            </div>
            <div className="bellanix-info-item">
              <span className="bellanix-info-label">Cloud Backend</span>
              <span className="bellanix-info-val">Supabase PostgreSQL + RLS</span>
            </div>
            <div className="bellanix-info-item">
              <span className="bellanix-info-label">Client Applications</span>
              <span className="bellanix-info-val">Admin PWA & React Native Floor App</span>
            </div>
            <div className="bellanix-info-item">
              <span className="bellanix-info-label">POS Integration</span>
              <span className="bellanix-info-val">Offline-first PWA Counter</span>
            </div>
            <div className="bellanix-info-item">
              <span className="bellanix-info-label">Technical Support</span>
              <span className="bellanix-info-val">support@bellanix.tech</span>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
              © {new Date().getFullYear()} Bellanix Tech. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
