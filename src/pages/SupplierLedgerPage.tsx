import { useState, useEffect, type FormEvent } from 'react';
import {
  fetchSupplierBalances, fetchSuppliers, addSupplier,
  fetchSupplierLedger, fetchFabricPurchaseSummaries,
  recordFabricPurchase, recordSupplierPayment,
  formatCurrency, formatDate,
  PAYMENT_METHOD_LABELS, FABRIC_TYPE_LABELS,
  type SupplierBalance, type Supplier, type LedgerEntry,
  type FabricPurchaseSummary, type PaymentMethod, type FabricType,
} from '../lib/fabric';
import { exportDataset } from '../lib/exportUtils';
import { QuickExportCluster } from '../components/QuickExportCluster';
import './SupplierLedgerPage.css';

type Modal = 'none' | 'add-supplier' | 'add-purchase' | 'add-payment';

export function SupplierLedgerPage() {
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<SupplierBalance | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [purchases, setPurchases] = useState<FabricPurchaseSummary[]>([]);
  const [modal, setModal] = useState<Modal>('none');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadBalances(); }, []);

  async function loadBalances() {
    setLoading(true);
    setError('');
    try {
      const [b, s] = await Promise.all([fetchSupplierBalances(), fetchSuppliers()]);
      setBalances(b);
      setSuppliers(s);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }

  async function selectSupplier(b: SupplierBalance) {
    setSelected(b);
    setDetailLoading(true);
    try {
      const [l, p] = await Promise.all([
        fetchSupplierLedger(b.supplier_id),
        fetchFabricPurchaseSummaries(b.supplier_id),
      ]);
      setLedger(l);
      setPurchases(p);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setLedger([]);
    setPurchases([]);
  }

  function openModal(m: Modal) { setModal(m); }
  function closeModal() { setModal('none'); }

  async function afterAction() {
    closeModal();
    await loadBalances();
    if (selected) {
      const updated = balances.find(b => b.supplier_id === selected.supplier_id);
      if (updated) await selectSupplier(updated);
    }
  }

  const filtered = balances.filter(b =>
    b.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.company_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalOwed = balances.reduce((s, b) => s + b.current_balance_due, 0);
  const totalPurchased = balances.reduce((s, b) => s + b.total_purchased_amount, 0);

  function handleExportList(format: 'excel' | 'word' | 'pdf') {
    const today = new Date().toISOString().split('T')[0];
    const filterNote = searchQuery ? ` (filtered: "${searchQuery}")` : '';
    exportDataset(format, {
      filename: `Suppliers_Ledger_${today}`,
      title: 'Fabric Suppliers Ledger Report',
      subtitle: `Raw material procurement, supplier payments, and running credit liabilities${filterNote}`,
      headers: ['Supplier Name', 'Company Name', 'Phone', 'Total Purchased (₨)', 'Total Paid (₨)', 'Payable Due (₨)'],
      rows: filtered.map(b => [
        b.supplier_name,
        b.company_name || '—',
        b.phone || '—',
        Number(b.total_purchased_amount || 0).toLocaleString(),
        Number(b.total_paid_amount || 0).toLocaleString(),
        Number(b.current_balance_due || 0).toLocaleString(),
      ]),
      summaryStats: {
        'Total Suppliers': filtered.length,
        'Total Fabric Purchases': `₨ ${totalPurchased.toLocaleString()}`,
        'Total Outstanding Payables': `₨ ${totalOwed.toLocaleString()}`,
        'Report Date': today,
      },
    });
  }

  function handleExportAccount(format: 'excel' | 'word' | 'pdf') {
    if (!selected) return;
    const today = new Date().toISOString().split('T')[0];
    exportDataset(format, {
      filename: `Supplier_Account_${selected.supplier_name.replace(/\s+/g, '_')}_${today}`,
      title: `Supplier Account Statement: ${selected.supplier_name}`,
      subtitle: `${selected.company_name || ''} · ${selected.phone || ''}`.replace(/^\s*·\s*|\s*·\s*$/g, ''),
      headers: ['Date', 'Type', 'Description', 'Amount (₨)', 'Reference'],
      rows: ledger.map(e => [
        e.transaction_date || '—',
        e.entry_type === 'purchase' ? 'PURCHASE' : 'PAYMENT',
        e.description || '—',
        Number(e.amount || 0).toLocaleString(),
        e.reference_no || '—',
      ]),
      summaryStats: {
        'Supplier': selected.supplier_name,
        'Total Purchased': `₨ ${Number(selected.total_purchased_amount).toLocaleString()}`,
        'Total Paid': `₨ ${Number(selected.total_paid_amount).toLocaleString()}`,
        'Balance Payable': `₨ ${Number(selected.current_balance_due).toLocaleString()}`,
        'Statement Date': today,
      },
    });
  }

  return (
    <div className="slp-root">
      {/* ── Header ── */}
      <div className="slp-header">
        <div>
          <h1 className="slp-title">🧵 Supplier Ledger</h1>
          <p className="slp-subtitle">Fabric procurement records, payments & running balances</p>
        </div>
        <div className="slp-header-actions">
          <QuickExportCluster onExport={handleExportList} formats={['excel', 'pdf']} />
          <button id="btn-add-purchase" className="slp-btn slp-btn--secondary" onClick={() => openModal('add-purchase')}>
            + Record Fabric Receipt
          </button>
          <button id="btn-add-payment" className="slp-btn slp-btn--secondary" onClick={() => openModal('add-payment')}>
            + Record Payment
          </button>
          <button id="btn-add-supplier" className="slp-btn slp-btn--primary" onClick={() => openModal('add-supplier')}>
            + Add Supplier
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="slp-stats">
        <div className="slp-stat">
          <span className="slp-stat-label">Total Suppliers</span>
          <span className="slp-stat-value">{balances.length}</span>
        </div>
        <div className="slp-stat">
          <span className="slp-stat-label">Total Fabric Purchased</span>
          <span className="slp-stat-value slp-stat-value--blue">{formatCurrency(totalPurchased)}</span>
        </div>
        <div className="slp-stat slp-stat--danger">
          <span className="slp-stat-label">Outstanding Dues</span>
          <span className="slp-stat-value slp-stat-value--red">{formatCurrency(totalOwed)}</span>
        </div>
      </div>

      {error && (
        <div className="slp-error" role="alert">⚠️ {error}</div>
      )}

      <div className="slp-body">
        {/* ── Left: Supplier List ── */}
        <div className="slp-list-panel">
          <div className="slp-search-wrap">
            <input
              id="supplier-search"
              type="search"
              className="slp-search"
              placeholder="Search suppliers…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="slp-loading"><span className="slp-spinner" />Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="slp-empty">
              {searchQuery ? 'No suppliers match your search.' : 'No suppliers yet. Add one to get started.'}
            </div>
          ) : (
            <div className="slp-supplier-list" role="list">
              {filtered.map(b => (
                <button
                  key={b.supplier_id}
                  id={`supplier-${b.supplier_id}`}
                  className={`slp-supplier-row${selected?.supplier_id === b.supplier_id ? ' slp-supplier-row--active' : ''}`}
                  onClick={() => selectSupplier(b)}
                  role="listitem"
                >
                  <div className="slp-supplier-avatar" aria-hidden="true">
                    {b.supplier_name[0].toUpperCase()}
                  </div>
                  <div className="slp-supplier-info">
                    <div className="slp-supplier-name">{b.supplier_name}</div>
                    {b.company_name && (
                      <div className="slp-supplier-company">{b.company_name}</div>
                    )}
                  </div>
                  <div className="slp-supplier-balance">
                    <div className={`slp-balance-due${b.current_balance_due > 0 ? ' slp-balance-due--red' : ' slp-balance-due--green'}`}>
                      {formatCurrency(b.current_balance_due)}
                    </div>
                    <div className="slp-balance-label">due</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Detail Panel ── */}
        <div className="slp-detail-panel">
          {!selected ? (
            <div className="slp-detail-empty">
              <div className="slp-detail-empty-icon" aria-hidden="true">📒</div>
              <p>Select a supplier to view their ledger</p>
            </div>
          ) : (
            <>
              <div className="slp-detail-header">
                <div>
                  <h2 className="slp-detail-title">{selected.supplier_name}</h2>
                  {selected.company_name && (
                    <p className="slp-detail-company">{selected.company_name}</p>
                  )}
                </div>
                <div className="slp-detail-summary">
                  <div className="slp-summary-chip">
                    <span className="slp-summary-label">Purchased</span>
                    <span className="slp-summary-val">{formatCurrency(selected.total_purchased_amount)}</span>
                  </div>
                  <div className="slp-summary-chip">
                    <span className="slp-summary-label">Paid</span>
                    <span className="slp-summary-val slp-summary-val--green">{formatCurrency(selected.total_paid_amount)}</span>
                  </div>
                  <div className="slp-summary-chip slp-summary-chip--accent">
                    <span className="slp-summary-label">Balance Due</span>
                    <span className={`slp-summary-val ${selected.current_balance_due > 0 ? 'slp-summary-val--red' : 'slp-summary-val--green'}`}>
                      {formatCurrency(selected.current_balance_due)}
                    </span>
                  </div>
                </div>
                {ledger.length > 0 && (
                  <QuickExportCluster onExport={handleExportAccount} formats={['excel', 'pdf']} />
                )}
                <button className="slp-close-btn" onClick={closeDetail} aria-label="Close detail">✕</button>
              </div>

              {detailLoading ? (
                <div className="slp-loading"><span className="slp-spinner" />Loading ledger…</div>
              ) : (
                <div className="slp-tabs-content">
                  {/* Ledger table */}
                  <h3 className="slp-section-label">Transaction Ledger</h3>
                  {ledger.length === 0 ? (
                    <div className="slp-empty">No transactions recorded yet.</div>
                  ) : (
                    <div className="slp-table-wrap">
                      <table className="slp-table" aria-label="Supplier ledger">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Ref #</th>
                            <th className="slp-th-num">Debit (PKR)</th>
                            <th className="slp-th-num">Credit (PKR)</th>
                            <th className="slp-th-num">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((entry, i) => (
                            <tr key={`${entry.transaction_id}-${i}`}
                              className={entry.entry_type === 'fabric_purchase' ? 'slp-tr--debit' : 'slp-tr--credit'}>
                              <td>{formatDate(entry.transaction_date)}</td>
                              <td>
                                <span className={`slp-badge ${entry.entry_type === 'fabric_purchase' ? 'slp-badge--purchase' : 'slp-badge--payment'}`}>
                                  {entry.entry_type === 'fabric_purchase' ? 'Receipt' : 'Payment'}
                                </span>
                                <span className="slp-desc">{entry.description}</span>
                              </td>
                              <td className="slp-td-ref">{entry.reference_no ?? '—'}</td>
                              <td className="slp-td-num slp-td-debit">
                                {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '—'}
                              </td>
                              <td className="slp-td-num slp-td-credit">
                                {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '—'}
                              </td>
                              <td className={`slp-td-num slp-td-balance ${entry.running_balance > 0 ? 'slp-td-balance--red' : 'slp-td-balance--green'}`}>
                                {formatCurrency(entry.running_balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Fabric Purchases breakdown */}
                  {purchases.length > 0 && (
                    <>
                      <h3 className="slp-section-label" style={{ marginTop: '1.75rem' }}>Fabric Receipts Breakdown</h3>
                      <div className="slp-table-wrap">
                        <table className="slp-table" aria-label="Fabric receipts">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Fabric</th>
                              <th>Type</th>
                              <th className="slp-th-num">Qty (m)</th>
                              <th className="slp-th-num">Unit Cost</th>
                              <th className="slp-th-num">Total Cost</th>
                              <th className="slp-th-num">Paid</th>
                              <th className="slp-th-num">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {purchases.map(p => (
                              <tr key={p.purchase_id}>
                                <td>{formatDate(p.received_date)}</td>
                                <td>
                                  <strong>{p.fabric_name}</strong>
                                  {p.invoice_no && <div className="slp-invoice">INV: {p.invoice_no}</div>}
                                </td>
                                <td>{FABRIC_TYPE_LABELS[p.fabric_type]}</td>
                                <td className="slp-td-num">{p.quantity_meters.toFixed(1)}</td>
                                <td className="slp-td-num">₨{p.unit_cost.toFixed(0)}</td>
                                <td className="slp-td-num">{formatCurrency(p.total_cost)}</td>
                                <td className="slp-td-num slp-td-credit">{formatCurrency(p.total_paid)}</td>
                                <td className={`slp-td-num ${p.remaining_balance > 0 ? 'slp-td-balance--red' : 'slp-td-balance--green'}`}>
                                  {formatCurrency(p.remaining_balance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === 'add-supplier' && (
        <AddSupplierModal onClose={closeModal} onSuccess={afterAction} />
      )}
      {modal === 'add-purchase' && (
        <AddPurchaseModal suppliers={suppliers} onClose={closeModal} onSuccess={afterAction} defaultSupplierId={selected?.supplier_id} />
      )}
      {modal === 'add-payment' && (
        <AddPaymentModal suppliers={suppliers} onClose={closeModal} onSuccess={afterAction} defaultSupplierId={selected?.supplier_id} />
      )}
    </div>
  );
}

/* ─── Add Supplier Modal ──────────────────────────────────────────────────── */
function AddSupplierModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', company_name: '', contact_person: '', phone: '', city: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await addSupplier({ ...form, name: form.name.trim() });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to add supplier'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Add Supplier" onClose={onClose}>
      <form id="form-add-supplier" onSubmit={handleSubmit}>
        {error && <div className="slp-modal-error">⚠️ {error}</div>}
        <div className="slp-field-grid">
          <div className="slp-field slp-field--full">
            <label htmlFor="sup-name" className="slp-label">Supplier Name *</label>
            <input id="sup-name" className="slp-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ahmed Fabrics" />
          </div>
          <div className="slp-field">
            <label htmlFor="sup-company" className="slp-label">Company Name</label>
            <input id="sup-company" className="slp-input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="slp-field">
            <label htmlFor="sup-person" className="slp-label">Contact Person</label>
            <input id="sup-person" className="slp-input" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
          </div>
          <div className="slp-field">
            <label htmlFor="sup-phone" className="slp-label">Phone</label>
            <input id="sup-phone" className="slp-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="03xx-xxxxxxx" />
          </div>
          <div className="slp-field">
            <label htmlFor="sup-city" className="slp-label">City</label>
            <input id="sup-city" className="slp-input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Lahore" />
          </div>
        </div>
        <div className="slp-modal-footer">
          <button type="button" className="slp-btn slp-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-add-supplier" type="submit" className="slp-btn slp-btn--primary" disabled={loading || !form.name}>
            {loading ? <><span className="slp-spinner slp-spinner--sm" /> Saving…</> : 'Add Supplier'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Add Fabric Purchase Modal ──────────────────────────────────────────── */
function AddPurchaseModal({ suppliers, onClose, onSuccess, defaultSupplierId }: {
  suppliers: Supplier[];
  onClose: () => void;
  onSuccess: () => void;
  defaultSupplierId?: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    supplier_id: defaultSupplierId ?? '',
    fabric_name: '',
    fabric_type: 'washing_wear' as FabricType,
    quantity_meters: '',
    unit_cost: '',
    invoice_no: '',
    received_date: today,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const total = (parseFloat(form.quantity_meters) || 0) * (parseFloat(form.unit_cost) || 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await recordFabricPurchase({
        supplier_id: form.supplier_id,
        fabric_name: form.fabric_name.trim(),
        fabric_type: form.fabric_type,
        quantity_meters: parseFloat(form.quantity_meters),
        unit_cost: parseFloat(form.unit_cost),
        invoice_no: form.invoice_no || undefined,
        received_date: form.received_date,
        notes: form.notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to record purchase'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Record Fabric Receipt" onClose={onClose}>
      <form id="form-add-purchase" onSubmit={handleSubmit}>
        {error && <div className="slp-modal-error">⚠️ {error}</div>}
        <div className="slp-field-grid">
          <div className="slp-field slp-field--full">
            <label htmlFor="pur-supplier" className="slp-label">Supplier *</label>
            <select id="pur-supplier" className="slp-input" required value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">— Select Supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="slp-field">
            <label htmlFor="pur-name" className="slp-label">Fabric Name *</label>
            <input id="pur-name" className="slp-input" required value={form.fabric_name} onChange={e => setForm(f => ({ ...f, fabric_name: e.target.value }))} placeholder="e.g. Blue Silk Suit Fabric" />
          </div>
          <div className="slp-field">
            <label htmlFor="pur-type" className="slp-label">Fabric Type *</label>
            <select id="pur-type" className="slp-input" value={form.fabric_type} onChange={e => setForm(f => ({ ...f, fabric_type: e.target.value as FabricType }))}>
              {Object.entries(FABRIC_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="slp-field">
            <label htmlFor="pur-qty" className="slp-label">Quantity (meters) *</label>
            <input id="pur-qty" className="slp-input" type="number" min="0.01" step="0.01" required value={form.quantity_meters} onChange={e => setForm(f => ({ ...f, quantity_meters: e.target.value }))} placeholder="e.g. 50" />
          </div>
          <div className="slp-field">
            <label htmlFor="pur-cost" className="slp-label">Unit Cost (PKR/m) *</label>
            <input id="pur-cost" className="slp-input" type="number" min="0" step="0.01" required value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="e.g. 450" />
          </div>
          <div className="slp-field">
            <label htmlFor="pur-invoice" className="slp-label">Invoice # (optional)</label>
            <input id="pur-invoice" className="slp-input" value={form.invoice_no} onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))} placeholder="e.g. INV-2024-001" />
          </div>
          <div className="slp-field">
            <label htmlFor="pur-date" className="slp-label">Received Date *</label>
            <input id="pur-date" className="slp-input" type="date" required value={form.received_date} onChange={e => setForm(f => ({ ...f, received_date: e.target.value }))} />
          </div>
          {total > 0 && (
            <div className="slp-field slp-field--full">
              <div className="slp-total-preview">
                Total Cost: <strong>{formatCurrency(total)}</strong>
              </div>
            </div>
          )}
          <div className="slp-field slp-field--full">
            <label htmlFor="pur-notes" className="slp-label">Notes (optional)</label>
            <textarea id="pur-notes" className="slp-input slp-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes…" />
          </div>
        </div>
        <div className="slp-modal-footer">
          <button type="button" className="slp-btn slp-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-add-purchase" type="submit" className="slp-btn slp-btn--primary"
            disabled={loading || !form.supplier_id || !form.fabric_name || !form.quantity_meters || !form.unit_cost}>
            {loading ? <><span className="slp-spinner slp-spinner--sm" /> Saving…</> : 'Record Receipt'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Add Payment Modal ──────────────────────────────────────────────────── */
function AddPaymentModal({ suppliers, onClose, onSuccess, defaultSupplierId }: {
  suppliers: Supplier[];
  onClose: () => void;
  onSuccess: () => void;
  defaultSupplierId?: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    supplier_id: defaultSupplierId ?? '',
    amount: '',
    method: 'cash' as PaymentMethod,
    reference_no: '',
    payment_date: today,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await recordSupplierPayment({
        supplier_id: form.supplier_id,
        amount: parseFloat(form.amount),
        method: form.method,
        reference_no: form.reference_no || undefined,
        payment_date: form.payment_date,
        notes: form.notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to record payment'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Record Supplier Payment" onClose={onClose}>
      <form id="form-add-payment" onSubmit={handleSubmit}>
        {error && <div className="slp-modal-error">⚠️ {error}</div>}
        <div className="slp-field-grid">
          <div className="slp-field slp-field--full">
            <label htmlFor="pay-supplier" className="slp-label">Supplier *</label>
            <select id="pay-supplier" className="slp-input" required value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">— Select Supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="slp-field">
            <label htmlFor="pay-amount" className="slp-label">Amount (PKR) *</label>
            <input id="pay-amount" className="slp-input" type="number" min="1" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 25000" />
          </div>
          <div className="slp-field">
            <label htmlFor="pay-method" className="slp-label">Payment Method *</label>
            <select id="pay-method" className="slp-input" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="slp-field">
            <label htmlFor="pay-ref" className="slp-label">Reference # (optional)</label>
            <input id="pay-ref" className="slp-input" value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))} placeholder="Cheque/TRX ID" />
          </div>
          <div className="slp-field">
            <label htmlFor="pay-date" className="slp-label">Payment Date *</label>
            <input id="pay-date" className="slp-input" type="date" required value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
          </div>
          <div className="slp-field slp-field--full">
            <label htmlFor="pay-notes" className="slp-label">Notes (optional)</label>
            <textarea id="pay-notes" className="slp-input slp-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Partial payment for invoice INV-001" />
          </div>
        </div>
        <div className="slp-modal-footer">
          <button type="button" className="slp-btn slp-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-add-payment" type="submit" className="slp-btn slp-btn--primary"
            disabled={loading || !form.supplier_id || !form.amount}>
            {loading ? <><span className="slp-spinner slp-spinner--sm" /> Saving…</> : 'Record Payment'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Modal Shell ────────────────────────────────────────────────────────── */
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="slp-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="slp-modal-box">
        <div className="slp-modal-header">
          <h2 className="slp-modal-title">{title}</h2>
          <button className="slp-close-btn" onClick={onClose} aria-label="Close modal">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
