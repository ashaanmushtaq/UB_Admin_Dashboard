import { useState, useEffect } from 'react';
import { 
  fetchTaxInvoices, 
  createTaxInvoice, 
  fetchTaxReturns, 
  createTaxReturn,
  type TaxInvoice,
  type TaxReturn
} from '../lib/taxFbr';
import { fetchBusinessSettings, saveBusinessSettings, type BusinessSettings } from '../lib/settings';
import './TaxFbrPage.css';

interface TaxFbrPageProps {
  tenantId?: string;
}

export function TaxFbrPage({ tenantId = '' }: TaxFbrPageProps) {
  const [activeTab, setActiveTab] = useState<'invoices' | 'returns' | 'settings'>('invoices');
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [returns, setReturns] = useState<TaxReturn[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<TaxInvoice | null>(null);

  // Invoice Form
  const [customerName, setCustomerName] = useState('');
  const [customerNtn, setCustomerNtn] = useState('');
  const [taxableAmount, setTaxableAmount] = useState('');
  const [taxRate, setTaxRate] = useState('17');
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Return Form
  const [periodLabel, setPeriodLabel] = useState('');
  const [totalSales, setTotalSales] = useState('');
  const [taxCollected, setTaxCollected] = useState('');
  const [taxPaid, setTaxPaid] = useState('');
  const [returnNotes, setReturnNotes] = useState('');

  // Settings Form
  const [ntn, setNtn] = useState('');
  const [strn, setStrn] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [settingsTaxRate, setSettingsTaxRate] = useState('17');
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invData, retData, settData] = await Promise.all([
        fetchTaxInvoices().catch(() => []),
        fetchTaxReturns().catch(() => []),
        fetchBusinessSettings().catch(() => null),
      ]);
      setInvoices(invData);
      setReturns(retData);
      if (settData) {
        setSettings(settData);
        setNtn(settData.ntn || '');
        setStrn(settData.strn || '');
        setBusinessName(settData.business_name || '');
        setBusinessAddress(settData.address || '');
        setSettingsTaxRate(String(settData.tax_rate_pct || 17));
        setTaxRate(String(settData.tax_rate_pct || 17));
      }
    } catch (err) {
      console.error('Failed to load tax data', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName || !taxableAmount) return;
    try {
      await createTaxInvoice({
        customer_name: customerName,
        customer_ntn: customerNtn,
        taxable_amount: parseFloat(taxableAmount),
        tax_rate: parseFloat(taxRate) || 17,
        notes: invoiceNotes,
      });
      setShowInvoiceModal(false);
      setCustomerName('');
      setCustomerNtn('');
      setTaxableAmount('');
      setInvoiceNotes('');
      loadData();
    } catch (err: any) {
      alert('Error creating invoice: ' + err.message);
    }
  }

  async function handleCreateReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!periodLabel || !totalSales) return;
    try {
      await createTaxReturn({
        period_label: periodLabel,
        total_sales: parseFloat(totalSales),
        total_tax_collected: parseFloat(taxCollected) || 0,
        total_tax_paid: parseFloat(taxPaid) || 0,
        notes: returnNotes,
      });
      setShowReturnModal(false);
      setPeriodLabel('');
      setTotalSales('');
      setTaxCollected('');
      setTaxPaid('');
      setReturnNotes('');
      loadData();
    } catch (err: any) {
      alert('Error recording tax return: ' + err.message);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSaveSuccess(false);
    try {
      const saved = await saveBusinessSettings(tenantId || settings?.tenant_id || '', {
        ntn,
        strn,
        business_name: businessName,
        address: businessAddress,
        tax_rate_pct: parseFloat(settingsTaxRate) || 17,
      });
      setSettings(saved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Error saving settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  const totalTaxable = invoices.reduce((acc, curr) => acc + (Number(curr.taxable_amount) || 0), 0);
  const totalTaxCollected = invoices.reduce((acc, curr) => acc + (Number(curr.tax_amount) || 0), 0);

  return (
    <div className="tax-fbr-page">
      <header className="tax-fbr-header">
        <div>
          <h1 className="tax-fbr-title">🏛️ Tax & FBR Compliance</h1>
          <p className="tax-fbr-sub">
            Sales tax invoices, GST calculations (17%), NTN/STRN reporting & return filings.
          </p>
        </div>
        <div>
          {activeTab === 'invoices' && (
            <button className="tax-primary-btn" onClick={() => setShowInvoiceModal(true)}>
              + Generate Tax Invoice
            </button>
          )}
          {activeTab === 'returns' && (
            <button className="tax-primary-btn" onClick={() => setShowReturnModal(true)}>
              + Record Tax Return
            </button>
          )}
        </div>
      </header>

      <div className="tax-fbr-alert">
        <strong>FBR Integration Notice:</strong> Live electronic invoice verification requires FBR POS/E-Invoicing API credentials & Sandbox Token. All local sales tax invoices are calculated according to standard GST rules (17%) and ready for export and manual FBR portal submission.
      </div>

      <div className="tax-fbr-tabs">
        <button 
          className={`tax-fbr-tab-btn ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          🧾 Tax Invoices ({invoices.length})
        </button>
        <button 
          className={`tax-fbr-tab-btn ${activeTab === 'returns' ? 'active' : ''}`}
          onClick={() => setActiveTab('returns')}
        >
          📁 Tax Returns ({returns.length})
        </button>
        <button 
          className={`tax-fbr-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          🏢 NTN & STRN Settings
        </button>
      </div>

      {activeTab === 'invoices' && (
        <>
          <div className="tax-stats-row">
            <div className="tax-stat-card">
              <div className="tax-stat-label">Total Invoices</div>
              <div className="tax-stat-val">{invoices.length}</div>
            </div>
            <div className="tax-stat-card">
              <div className="tax-stat-label">Total Taxable Sales</div>
              <div className="tax-stat-val">₨ {totalTaxable.toLocaleString()}</div>
            </div>
            <div className="tax-stat-card">
              <div className="tax-stat-label">Total GST Collected (17%)</div>
              <div className="tax-stat-val">₨ {totalTaxCollected.toLocaleString()}</div>
            </div>
            <div className="tax-stat-card">
              <div className="tax-stat-label">Business STRN</div>
              <div className="tax-stat-val" style={{ fontSize: '1rem', color: '#3b82f6' }}>
                {settings?.strn || 'Not Configured'}
              </div>
            </div>
          </div>

          <div className="tax-table-container">
            <table className="tax-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Customer NTN</th>
                  <th>Taxable (₨)</th>
                  <th>Rate</th>
                  <th>Tax (₨)</th>
                  <th>Total (₨)</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>Loading invoices...</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>No tax invoices created yet. Click "+ Generate Tax Invoice" to issue one.</td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td>{inv.customer_name}</td>
                      <td>{inv.customer_ntn || '—'}</td>
                      <td>{Number(inv.taxable_amount).toLocaleString()}</td>
                      <td>{inv.tax_rate}%</td>
                      <td style={{ color: '#16a34a', fontWeight: 600 }}>{Number(inv.tax_amount).toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>₨ {Number(inv.total_amount).toLocaleString()}</td>
                      <td>{new Date(inv.issued_at).toLocaleDateString()}</td>
                      <td>
                        <span className={`tax-status-badge ${inv.status}`}>{inv.status}</span>
                      </td>
                      <td>
                        <button className="tax-action-btn" onClick={() => setSelectedInvoice(inv)}>
                          🖨️ Print
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'returns' && (
        <div className="tax-table-container">
          <table className="tax-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Total Sales (₨)</th>
                <th>Tax Collected (₨)</th>
                <th>Tax Paid / Input (₨)</th>
                <th>Net Payable (₨)</th>
                <th>Filing Date</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Loading tax returns...</td></tr>
              ) : returns.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No tax returns recorded yet.</td></tr>
              ) : (
                returns.map((ret) => (
                  <tr key={ret.id}>
                    <td style={{ fontWeight: 600 }}>{ret.period_label}</td>
                    <td>₨ {Number(ret.total_sales).toLocaleString()}</td>
                    <td style={{ color: '#16a34a' }}>₨ {Number(ret.total_tax_collected).toLocaleString()}</td>
                    <td style={{ color: '#dc2626' }}>₨ {Number(ret.total_tax_paid).toLocaleString()}</td>
                    <td style={{ fontWeight: 700, color: '#2563eb' }}>₨ {Number(ret.net_payable).toLocaleString()}</td>
                    <td>{ret.filed_at ? new Date(ret.filed_at).toLocaleDateString() : '—'}</td>
                    <td>{ret.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'settings' && (
        <div style={{ maxWidth: '600px', background: 'var(--card-bg, #fff)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>Federal Board of Revenue (FBR) & NTN Details</h3>
          {saveSuccess && (
            <div style={{ background: '#dcfce7', color: '#15803d', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              ✓ Business & Tax settings saved successfully!
            </div>
          )}
          <form onSubmit={handleSaveSettings}>
            <div className="tax-form-group">
              <label className="tax-form-label">Business Legal Name</label>
              <input className="tax-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Karobit Textiles & Garments" />
            </div>
            <div className="tax-form-group">
              <label className="tax-form-label">National Tax Number (NTN)</label>
              <input className="tax-input" value={ntn} onChange={(e) => setNtn(e.target.value)} placeholder="e.g. 1234567-8" />
            </div>
            <div className="tax-form-group">
              <label className="tax-form-label">Sales Tax Registration Number (STRN)</label>
              <input className="tax-input" value={strn} onChange={(e) => setStrn(e.target.value)} placeholder="e.g. 01-02-3456-789-01" />
            </div>
            <div className="tax-form-group">
              <label className="tax-form-label">Registered Office Address</label>
              <input className="tax-input" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Factory address or shop premises" />
            </div>
            <div className="tax-form-group">
              <label className="tax-form-label">Default GST Tax Rate (%)</label>
              <input className="tax-input" type="number" step="0.1" value={settingsTaxRate} onChange={(e) => setSettingsTaxRate(e.target.value)} />
            </div>
            <button type="submit" className="tax-primary-btn" disabled={savingSettings}>
              {savingSettings ? 'Saving...' : '💾 Save Tax Identification'}
            </button>
          </form>
        </div>
      )}

      {/* New Invoice Modal */}
      {showInvoiceModal && (
        <div className="tax-modal-backdrop" onClick={() => setShowInvoiceModal(false)}>
          <div className="tax-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Create Tax Invoice (GST 17%)</h3>
            <form onSubmit={handleCreateInvoice}>
              <div className="tax-form-group">
                <label className="tax-form-label">Customer Name *</label>
                <input className="tax-input" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Buyer or Business Name" />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Customer NTN (Optional)</label>
                <input className="tax-input" value={customerNtn} onChange={(e) => setCustomerNtn(e.target.value)} placeholder="e.g. 7654321-0" />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Taxable Amount (PKR) *</label>
                <input className="tax-input" type="number" step="any" required value={taxableAmount} onChange={(e) => setTaxableAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Tax Rate (%)</label>
                <input className="tax-input" type="number" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              {taxableAmount && (
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <div>Calculated GST ({taxRate}%): <strong>₨ {(parseFloat(taxableAmount || '0') * (parseFloat(taxRate || '0') / 100)).toFixed(2)}</strong></div>
                  <div style={{ marginTop: '0.25rem' }}>Total Invoice Amount: <strong>₨ {(parseFloat(taxableAmount || '0') * (1 + parseFloat(taxRate || '0') / 100)).toFixed(2)}</strong></div>
                </div>
              )}
              <div className="tax-form-group">
                <label className="tax-form-label">Notes / Items Description</label>
                <textarea className="tax-input" rows={2} value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="e.g. 500 pcs Cotton Kurta Wholesale" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="tax-action-btn" onClick={() => setShowInvoiceModal(false)}>Cancel</button>
                <button type="submit" className="tax-primary-btn">Generate & Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Tax Return Modal */}
      {showReturnModal && (
        <div className="tax-modal-backdrop" onClick={() => setShowReturnModal(false)}>
          <div className="tax-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Record Tax Return</h3>
            <form onSubmit={handleCreateReturn}>
              <div className="tax-form-group">
                <label className="tax-form-label">Tax Period Label *</label>
                <input className="tax-input" required value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. September 2026 Monthly Return" />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Total Sales for Period (₨) *</label>
                <input className="tax-input" type="number" step="any" required value={totalSales} onChange={(e) => setTotalSales(e.target.value)} />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Total Tax Collected (Output Tax ₨)</label>
                <input className="tax-input" type="number" step="any" value={taxCollected} onChange={(e) => setTaxCollected(e.target.value)} />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Total Tax Paid on Purchases (Input Tax ₨)</label>
                <input className="tax-input" type="number" step="any" value={taxPaid} onChange={(e) => setTaxPaid(e.target.value)} />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Notes / Filing Reference</label>
                <textarea className="tax-input" rows={2} value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="FBR Iris CPR reference or notes" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="tax-action-btn" onClick={() => setShowReturnModal(false)}>Cancel</button>
                <button type="submit" className="tax-primary-btn">Save Return</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Invoice View Modal */}
      {selectedInvoice && (
        <div className="tax-modal-backdrop" onClick={() => setSelectedInvoice(null)}>
          <div className="tax-modal printable-tax-invoice" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{settings?.business_name || 'Business Tax Invoice'}</h2>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{settings?.address || 'Pakistan'}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  <strong>NTN:</strong> {settings?.ntn || '—'} | <strong>STRN:</strong> {settings?.strn || '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>TAX INVOICE</div>
                <div style={{ fontSize: '0.85rem' }}>{selectedInvoice.invoice_number}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(selectedInvoice.issued_at).toLocaleDateString()}</div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              <strong>Billed To:</strong>
              <div>{selectedInvoice.customer_name}</div>
              {selectedInvoice.customer_ntn && <div>NTN: {selectedInvoice.customer_ntn}</div>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Taxable</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>GST ({selectedInvoice.tax_rate}%)</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.5rem' }}>{selectedInvoice.notes || 'Garment Production & Supply'}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem' }}>₨ {Number(selectedInvoice.taxable_amount).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem' }}>₨ {Number(selectedInvoice.tax_amount).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 700 }}>₨ {Number(selectedInvoice.total_amount).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="tax-action-btn" onClick={() => setSelectedInvoice(null)}>Close</button>
              <button className="tax-primary-btn" onClick={() => window.print()}>🖨️ Print Official Invoice</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
