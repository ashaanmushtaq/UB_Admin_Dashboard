import { useState, useEffect, type FormEvent } from 'react';
import {
  fetchCustomerBalances, fetchCustomers, addCustomer,
  fetchCustomerLedger, recordCustomerSale, recordCustomerPayment,
  fetchCustomerPaymentPlans, markPaymentPlanReceived, cancelPaymentPlan,
  type CustomerBalance, type Customer, type CustomerLedgerEntry,
  type CustomerPaymentPlan, type PaymentPlanStatus,
} from '../lib/customers';
import { PAYMENT_METHOD_LABELS, formatCurrency, formatDate, type PaymentMethod } from '../lib/fabric';
import { exportDataset } from '../lib/exportUtils';
import { QuickExportCluster } from '../components/QuickExportCluster';
import './CustomerLedgerPage.css';

type Modal = 'none' | 'add-customer' | 'record-sale' | 'record-payment' | 'mark-received';

export function CustomerLedgerPage() {
  const [balances, setBalances] = useState<CustomerBalance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerBalance | null>(null);
  const [ledger, setLedger] = useState<CustomerLedgerEntry[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<CustomerPaymentPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<CustomerPaymentPlan | null>(null);
  const [modal, setModal] = useState<Modal>('none');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [b, c] = await Promise.all([
        fetchCustomerBalances(),
        fetchCustomers(),
      ]);
      setBalances(b);
      setCustomers(c);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  async function selectCustomer(b: CustomerBalance) {
    setSelected(b);
    setDetailLoading(true);
    try {
      const [l, plans] = await Promise.all([
        fetchCustomerLedger(b.customer_id),
        fetchCustomerPaymentPlans(b.customer_id),
      ]);
      setLedger(l);
      setPaymentPlans(plans);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load customer ledger');
    } finally {
      setDetailLoading(false);
    }
  }

  async function afterAction() {
    setModal('none');
    await loadData();
    if (selected) {
      const updated = balances.find(b => b.customer_id === selected.customer_id);
      if (updated) await selectCustomer(updated);
    }
  }

  const filtered = balances.filter(b =>
    b.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.company_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.city ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSales = balances.reduce((s, b) => s + b.total_sales_amount, 0);
  const totalReceived = balances.reduce((s, b) => s + b.total_paid_amount, 0);
  const totalDues = balances.reduce((s, b) => s + Math.max(0, b.current_balance_due), 0);

  function handleExportList(format: 'excel' | 'word' | 'pdf') {
    const today = new Date().toISOString().split('T')[0];
    const dateRange = searchQuery ? ` (filtered: "${searchQuery}")` : '';
    exportDataset(format, {
      filename: `Customers_Ledger_${today}`,
      title: 'Customer Sales & Ledger Report',
      subtitle: `Active customer accounts, sales volume, payments & outstanding dues${dateRange}`,
      headers: ['Customer Name', 'Shop / Company', 'Phone', 'City', 'Total Sales (₨)', 'Total Paid (₨)', 'Balance Due (₨)'],
      rows: filtered.map(b => [
        b.customer_name,
        b.shop_name || b.company_name || '—',
        b.phone || '—',
        b.city || '—',
        Number(b.total_sales_amount || 0).toLocaleString(),
        Number(b.total_paid_amount || 0).toLocaleString(),
        Number(b.current_balance_due || 0).toLocaleString(),
      ]),
      summaryStats: {
        'Total Customer Accounts': filtered.length,
        'Total Cumulative Sales': `₨ ${totalSales.toLocaleString()}`,
        'Total Payments Collected': `₨ ${totalReceived.toLocaleString()}`,
        'Total Outstanding Receivables': `₨ ${totalDues.toLocaleString()}`,
        'Report Date': today,
      },
    });
  }

  function handleExportAccount(format: 'excel' | 'word' | 'pdf') {
    if (!selected) return;
    const today = new Date().toISOString().split('T')[0];
    exportDataset(format, {
      filename: `Customer_Account_${selected.customer_name.replace(/\s+/g, '_')}_${today}`,
      title: `Account Statement: ${selected.customer_name}`,
      subtitle: `${selected.shop_name || selected.company_name || ''} · ${selected.city || ''} · ${selected.phone || ''}`.replace(/^\s*·\s*|\s*·\s*$/g, ''),
      headers: ['Date', 'Type', 'Description', 'Debit (Sales ₨)', 'Credit (Paid ₨)', 'Reference'],
      rows: ledger.map(e => [
        e.transaction_date || '—',
        e.entry_type === 'sale' ? 'SALE' : 'PAYMENT',
        e.description || '—',
        e.entry_type === 'sale' ? Number(e.amount || 0).toLocaleString() : '—',
        e.entry_type === 'payment' ? Number(e.amount || 0).toLocaleString() : '—',
        e.reference_no || '—',
      ]),
      summaryStats: {
        'Customer': selected.customer_name,
        'Total Sales': `₨ ${Number(selected.total_sales_amount).toLocaleString()}`,
        'Total Paid': `₨ ${Number(selected.total_paid_amount).toLocaleString()}`,
        'Balance Due': `₨ ${Math.max(0, selected.current_balance_due).toLocaleString()}`,
        'Statement Date': today,
      },
    });
  }

  return (
    <div className="cust-root">
      {/* ── Header ── */}
      <div className="cust-header">
        <div>
          <h1 className="cust-title">📒 Customer & Sales Ledger</h1>
          <p className="cust-subtitle">Bulk order sales, payments received & customer running dues</p>
        </div>
        <div className="cust-header-actions">
          <QuickExportCluster onExport={handleExportList} />
          <button id="btn-record-sale" className="cust-btn cust-btn--secondary" onClick={() => setModal('record-sale')}>
            + Record Bulk Sale
          </button>
          <button id="btn-record-payment" className="cust-btn cust-btn--secondary" onClick={() => setModal('record-payment')}>
            + Record Payment Received
          </button>
          <button id="btn-add-customer" className="cust-btn cust-btn--primary" onClick={() => setModal('add-customer')}>
            + Add Customer
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="cust-stats">
        <div className="cust-stat">
          <span className="cust-stat-label">Total Wholesale Customers</span>
          <span className="cust-stat-value">{balances.length}</span>
        </div>
        <div className="cust-stat">
          <span className="cust-stat-label">Total Sales Volume</span>
          <span className="cust-stat-value cust-stat-value--blue">{formatCurrency(totalSales)}</span>
        </div>
        <div className="cust-stat">
          <span className="cust-stat-label">Total Payments Received</span>
          <span className="cust-stat-value cust-stat-value--green">{formatCurrency(totalReceived)}</span>
        </div>
        <div className="cust-stat cust-stat--warning">
          <span className="cust-stat-label">Total Outstanding Dues</span>
          <span className="cust-stat-value cust-stat-value--amber">{formatCurrency(totalDues)}</span>
        </div>
      </div>

      {error && <div className="cust-error" role="alert">⚠️ {error}</div>}

      <div className="cust-body">
        {/* ── Left: Customer List Panel ── */}
        <div className="cust-list-panel">
          <div className="cust-search-wrap">
            <input
              id="customer-search"
              type="search"
              className="cust-search"
              placeholder="Search customer, shop, city…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="cust-loading"><span className="cust-spinner" />Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="cust-empty">
              {searchQuery ? 'No customers match your search.' : 'No customers recorded yet. Add one to get started.'}
            </div>
          ) : (
            <div className="cust-list" role="list">
              {filtered.map(b => (
                <button
                  key={b.customer_id}
                  id={`cust-row-${b.customer_id}`}
                  className={`cust-row${selected?.customer_id === b.customer_id ? ' cust-row--active' : ''}`}
                  onClick={() => selectCustomer(b)}
                  role="listitem"
                >
                  <div className="cust-avatar" aria-hidden="true">
                    {b.customer_name[0].toUpperCase()}
                  </div>
                  <div className="cust-row-info">
                    <div className="cust-row-name">{b.customer_name}</div>
                    <div className="cust-row-sub">
                      {b.company_name || b.city || 'Wholesale Buyer'}
                    </div>
                  </div>
                  <div className="cust-row-balance">
                    <div className={`cust-balance ${b.current_balance_due > 0 ? 'cust-balance--amber' : 'cust-balance--green'}`}>
                      {formatCurrency(b.current_balance_due)}
                    </div>
                    <div className="cust-balance-label">due</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Detail Panel ── */}
        <div className="cust-detail-panel">
          {!selected ? (
            <div className="cust-detail-empty">
              <div className="cust-detail-empty-icon" aria-hidden="true">📒</div>
              <p>Select a customer to view their sales ledger & transaction history</p>
            </div>
          ) : (
            <>
              <div className="cust-detail-header">
                <div>
                  <h2 className="cust-detail-name">{selected.customer_name}</h2>
                  <div className="cust-detail-sub">
                    {selected.shop_name && <>{selected.shop_name} · </>}
                    {selected.company_name && <>{selected.company_name} · </>}
                    {selected.phone || 'No phone'} · {selected.city || 'City N/A'}
                    {selected.address && (
                      <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{selected.address}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {ledger.length > 0 && (
                    <QuickExportCluster onExport={handleExportAccount} />
                  )}
                </div>
                <div className="cust-detail-chips">
                  <div className="cust-chip">
                    <span className="cust-chip-label">Total Sales</span>
                    <span className="cust-chip-val">{formatCurrency(selected.total_sales_amount)}</span>
                  </div>
                  <div className="cust-chip">
                    <span className="cust-chip-label">Total Paid</span>
                    <span className="cust-chip-val cust-chip-val--green">{formatCurrency(selected.total_paid_amount)}</span>
                  </div>
                  <div className={`cust-chip ${selected.current_balance_due > 0 ? 'cust-chip--accent' : ''}`}>
                    <span className="cust-chip-label">Balance Due</span>
                    <span className={`cust-chip-val ${selected.current_balance_due > 0 ? 'cust-chip-val--amber' : 'cust-chip-val--green'}`}>
                      {formatCurrency(selected.current_balance_due)}
                    </span>
                  </div>
                </div>

                <button className="cust-close-btn" onClick={() => { setSelected(null); setLedger([]); }} aria-label="Close">✕</button>
              </div>

              {detailLoading ? (
                <div className="cust-loading"><span className="cust-spinner" />Loading customer ledger…</div>
              ) : (
                <div className="cust-ledger-content">
                  <div className="cust-ledger-toolbar">
                    <h3 className="cust-section-label">Transaction History</h3>
                    <div className="cust-ledger-actions">
                      <button id={`btn-sale-${selected.customer_id}`} className="cust-btn cust-btn--sm cust-btn--secondary" onClick={() => setModal('record-sale')}>
                        + Sale Invoice
                      </button>
                      <button id={`btn-pay-${selected.customer_id}`} className="cust-btn cust-btn--sm cust-btn--primary" onClick={() => setModal('record-payment')}>
                        + Payment
                      </button>
                    </div>
                  </div>

                  {ledger.length === 0 ? (
                    <div className="cust-empty">No transactions recorded for this customer yet.</div>
                  ) : (
                    <div className="cust-table-wrap">
                      <table className="cust-table" aria-label="Customer ledger">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Invoice / Ref #</th>
                            <th className="cust-th-num">Sale (Debit)</th>
                            <th className="cust-th-num">Paid (Credit)</th>
                            <th className="cust-th-num">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((entry, i) => (
                            <tr key={`${entry.transaction_id}-${i}`} className={entry.entry_type === 'sale' ? 'cust-tr--sale' : 'cust-tr--payment'}>
                              <td className="cust-td-date">{formatDate(entry.transaction_date)}</td>
                              <td>
                                <span className={`cust-badge ${entry.entry_type === 'sale' ? 'cust-badge--sale' : 'cust-badge--payment'}`}>
                                  {entry.entry_type === 'sale' ? 'Sale' : 'Payment'}
                                </span>
                                <span className="cust-desc">{entry.description}</span>
                              </td>
                              <td className="cust-td-ref">{entry.reference_no ?? '—'}</td>
                              <td className="cust-td-num cust-td-sale">
                                {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '—'}
                              </td>
                              <td className="cust-td-num cust-td-paid">
                                {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '—'}
                              </td>
                              <td className={`cust-td-num cust-td-bal ${entry.running_balance > 0 ? 'cust-td-bal--amber' : 'cust-td-bal--green'}`}>
                                {formatCurrency(entry.running_balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* ── Settlement Plans & Installment Ledger ── */}
                  {paymentPlans.length > 0 && (
                    <div className="cust-plans-section">
                      <div className="cust-ledger-toolbar">
                        <h3 className="cust-section-label">📋 Settlement Plan & Installment Schedule</h3>
                      </div>
                      <div className="cust-table-wrap">
                        <table className="cust-table" aria-label="Settlement plans">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Invoice</th>
                              <th>Due Date</th>
                              <th>Cheque / Clearing</th>
                              <th>Method</th>
                              <th className="cust-th-num">Amount Due</th>
                              <th className="cust-th-num">Paid</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paymentPlans.map(plan => {
                              const statusColors: Record<PaymentPlanStatus, string> = {
                                planned: 'cust-badge--sale',
                                received: 'cust-badge--payment',
                                overdue: 'cust-badge--overdue',
                                cancelled: 'cust-badge--cancelled',
                              };
                              const isOverdue = plan.status === 'planned' && new Date(plan.due_date) < new Date();
                              const displayStatus: PaymentPlanStatus = isOverdue ? 'overdue' : plan.status;

                              return (
                                <tr key={plan.id} className={`cust-tr--plan ${plan.status === 'received' ? 'cust-tr--received' : isOverdue ? 'cust-tr--overdue' : ''}`}>
                                  <td style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                                    {plan.installment_no}/{plan.total_installments}
                                  </td>
                                  <td className="cust-td-ref">#{plan.invoice_no}</td>
                                  <td className="cust-td-date">{formatDate(plan.due_date)}</td>
                                  <td style={{ fontSize: '0.78rem' }}>
                                    {plan.cheque_no ? (
                                      <span>
                                        Cheque #{plan.cheque_no}
                                        {plan.cheque_clearing_date && (
                                          <><br /><span style={{ color: '#94a3b8' }}>Clears: {formatDate(plan.cheque_clearing_date)}</span></>
                                        )}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td>{PAYMENT_METHOD_LABELS[plan.payment_method] ?? plan.payment_method}</td>
                                  <td className="cust-td-num cust-td-sale">{formatCurrency(plan.amount_due)}</td>
                                  <td className={`cust-td-num ${plan.amount_paid > 0 ? 'cust-td-paid' : ''}`}>
                                    {plan.amount_paid > 0 ? formatCurrency(plan.amount_paid) : '—'}
                                  </td>
                                  <td>
                                    <span className={`cust-badge ${statusColors[displayStatus]}`}>
                                      {displayStatus === 'received' ? '✓ Received' : displayStatus === 'overdue' ? '⚠ Overdue' : displayStatus === 'cancelled' ? 'Cancelled' : '⏳ Planned'}
                                    </span>
                                  </td>
                                  <td>
                                    {plan.status === 'planned' && (
                                      <button
                                        id={`btn-mark-received-${plan.id}`}
                                        className="cust-btn cust-btn--sm cust-btn--primary"
                                        onClick={() => { setSelectedPlan(plan); setModal('mark-received'); }}
                                      >
                                        ✓ Mark Received
                                      </button>
                                    )}
                                    {plan.status === 'planned' && (
                                      <button
                                        className="cust-btn cust-btn--sm cust-btn--ghost"
                                        style={{ marginLeft: '0.35rem' }}
                                        title="Cancel this installment"
                                        onClick={async () => {
                                          if (!confirm(`Cancel Installment #${plan.installment_no} of PKR ${plan.amount_due.toLocaleString()}?`)) return;
                                          await cancelPaymentPlan(plan.id);
                                          setPaymentPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: 'cancelled' as PaymentPlanStatus } : p));
                                        }}
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === 'add-customer' && (
        <AddCustomerModal onClose={() => setModal('none')} onSuccess={afterAction} />
      )}
      {modal === 'record-sale' && (
        <RecordSaleModal customers={customers} onClose={() => setModal('none')} onSuccess={afterAction} defaultCustomerId={selected?.customer_id} />
      )}
      {modal === 'record-payment' && (
        <RecordPaymentModal customers={customers} onClose={() => setModal('none')} onSuccess={afterAction} defaultCustomerId={selected?.customer_id} />
      )}
      {modal === 'mark-received' && selectedPlan && selected && (
        <MarkReceivedModal
          plan={selectedPlan}
          onClose={() => { setModal('none'); setSelectedPlan(null); }}
          onSuccess={async () => {
            setModal('none');
            setSelectedPlan(null);
            await loadData();
            if (selected) {
              const updatedBalance = balances.find(b => b.customer_id === selected.customer_id);
              if (updatedBalance) await selectCustomer(updatedBalance);
            }
          }}
        />
      )}
    </div>
  );
}

/* ─── Add Customer Modal ─────────────────────────────────────────────────── */
function AddCustomerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', company_name: '', shop_name: '', phone: '', email: '', city: '', address: '', credit_limit: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await addCustomer({
        name: form.name.trim(),
          company_name: form.company_name || undefined,
          shop_name: form.shop_name || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        city: form.city || undefined,
        address: form.address || undefined,
        credit_limit: parseFloat(form.credit_limit) || 0,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to add customer'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Add Wholesale Customer" onClose={onClose}>
      <form id="form-add-customer" onSubmit={handleSubmit}>
        {error && <div className="cust-modal-error">⚠️ {error}</div>}
        <div className="cust-field-grid">
          <div className="cust-field cust-field--full">
            <label htmlFor="c-name" className="cust-label">Customer Name *</label>
            <input id="c-name" className="cust-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Haji Usman Traders" />
          </div>
          <div className="cust-field">
            <label htmlFor="c-shop" className="cust-label">Shop Name</label>
            <input id="c-shop" className="cust-input" value={form.shop_name} onChange={e => setForm(f => ({ ...f, shop_name: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="cust-field">
            <label htmlFor="c-company" className="cust-label">Company / Business Name</label>
            <input id="c-company" className="cust-input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="cust-field">
            <label htmlFor="c-phone" className="cust-label">Phone Number</label>
            <input id="c-phone" className="cust-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="03xx-xxxxxxx" />
          </div>
          <div className="cust-field cust-field--full">
            <label htmlFor="c-address" className="cust-label">Address / Location</label>
            <input id="c-address" className="cust-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Optional — shop address or location" />
          </div>
          <div className="cust-field">
            <label htmlFor="c-city" className="cust-label">City</label>
            <input id="c-city" className="cust-input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Faisalabad" />
          </div>
          <div className="cust-field">
            <label htmlFor="c-credit" className="cust-label">Credit Limit (PKR)</label>
            <input id="c-credit" className="cust-input" type="number" min="0" step="1000" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="e.g. 500000" />
          </div>
        </div>
        <div className="cust-modal-footer">
          <button type="button" className="cust-btn cust-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-add-customer" type="submit" className="cust-btn cust-btn--primary" disabled={loading || !form.name}>
            {loading ? <><span className="cust-spinner cust-spinner--sm" /> Saving…</> : 'Add Customer'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Record Sale Modal ──────────────────────────────────────────────────── */
function RecordSaleModal({ customers, onClose, onSuccess, defaultCustomerId }: {
  customers: Customer[]; onClose: () => void; onSuccess: () => void; defaultCustomerId?: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    customer_id: defaultCustomerId ?? '',
    invoice_no: `INV-S-${Math.floor(10000 + Math.random() * 90000)}`,
    total_amount: '',
    due_date: '',
    sale_date: today,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await recordCustomerSale({
        customer_id: form.customer_id,
        invoice_no: form.invoice_no.trim(),
        total_amount: parseFloat(form.total_amount),
        due_date: form.due_date || undefined,
        sale_date: form.sale_date,
        notes: form.notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to record sale'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Record Bulk Sale / Invoice" onClose={onClose}>
      <form id="form-record-sale" onSubmit={handleSubmit}>
        {error && <div className="cust-modal-error">⚠️ {error}</div>}
        <div className="cust-field-grid">
          <div className="cust-field cust-field--full">
            <label htmlFor="s-cust" className="cust-label">Customer *</label>
            <select id="s-cust" className="cust-input" required value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
              <option value="">— Select Customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.company_name || c.city || 'Wholesale'})</option>)}
            </select>
          </div>
          <div className="cust-field">
            <label htmlFor="s-inv" className="cust-label">Invoice # *</label>
            <input id="s-inv" className="cust-input" required value={form.invoice_no} onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))} />
          </div>
          <div className="cust-field">
            <label htmlFor="s-amount" className="cust-label">Total Sale Amount (PKR) *</label>
            <input id="s-amount" className="cust-input" type="number" min="1" step="1" required value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="e.g. 150000" />
          </div>
          <div className="cust-field">
            <label htmlFor="s-date" className="cust-label">Sale Date *</label>
            <input id="s-date" className="cust-input" type="date" required value={form.sale_date} onChange={e => setForm(f => ({ ...f, sale_date: e.target.value }))} />
          </div>
          <div className="cust-field">
            <label htmlFor="s-due" className="cust-label">Payment Due Date (Credit)</label>
            <input id="s-due" className="cust-input" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
          <div className="cust-field cust-field--full">
            <label htmlFor="s-notes" className="cust-label">Notes (optional)</label>
            <textarea id="s-notes" className="cust-input cust-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. 50 Suits delivered, 30 days credit" />
          </div>
        </div>
        <div className="cust-modal-footer">
          <button type="button" className="cust-btn cust-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-record-sale" type="submit" className="cust-btn cust-btn--primary" disabled={loading || !form.customer_id || !form.total_amount}>
            {loading ? <><span className="cust-spinner cust-spinner--sm" /> Saving…</> : 'Record Sale'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Record Payment Modal ───────────────────────────────────────────────── */
function RecordPaymentModal({ customers, onClose, onSuccess, defaultCustomerId }: {
  customers: Customer[]; onClose: () => void; onSuccess: () => void; defaultCustomerId?: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    customer_id: defaultCustomerId ?? '',
    amount: '',
    method: 'cash' as PaymentMethod,
    reference_no: '',
    payment_date: today,
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await recordCustomerPayment({
        customer_id: form.customer_id,
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
    <ModalShell title="Record Customer Payment Received" onClose={onClose}>
      <form id="form-record-payment" onSubmit={handleSubmit}>
        {error && <div className="cust-modal-error">⚠️ {error}</div>}
        <div className="cust-field-grid">
          <div className="cust-field cust-field--full">
            <label htmlFor="p-cust" className="cust-label">Customer *</label>
            <select id="p-cust" className="cust-input" required value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}>
              <option value="">— Select Customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.company_name || c.city || 'Wholesale'})</option>)}
            </select>
          </div>
          <div className="cust-field">
            <label htmlFor="p-amount" className="cust-label">Amount (PKR) *</label>
            <input id="p-amount" className="cust-input" type="number" min="1" step="1" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 50000" />
          </div>
          <div className="cust-field">
            <label htmlFor="p-method" className="cust-label">Payment Method *</label>
            <select id="p-method" className="cust-input" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="cust-field">
            <label htmlFor="p-ref" className="cust-label">Reference # (optional)</label>
            <input id="p-ref" className="cust-input" value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))} placeholder="TRX ID / Cheque # / Bank Ref" />
          </div>
          <div className="cust-field">
            <label htmlFor="p-date" className="cust-label">Payment Date *</label>
            <input id="p-date" className="cust-input" type="date" required value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
          </div>
          <div className="cust-field cust-field--full">
            <label htmlFor="p-notes" className="cust-label">Notes (optional)</label>
            <textarea id="p-notes" className="cust-input cust-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Partial payment for INV-S-1004" />
          </div>
        </div>
        <div className="cust-modal-footer">
          <button type="button" className="cust-btn cust-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-record-payment" type="submit" className="cust-btn cust-btn--primary" disabled={loading || !form.customer_id || !form.amount}>
            {loading ? <><span className="cust-spinner cust-spinner--sm" /> Saving…</> : 'Record Payment'}
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
    <div className="cust-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="cust-modal-box">
        <div className="cust-modal-header">
          <h2 className="cust-modal-title">{title}</h2>
          <button className="cust-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Mark Received Modal ────────────────────────────────────────────────── */
function MarkReceivedModal({
  plan,
  onClose,
  onSuccess,
}: {
  plan: CustomerPaymentPlan;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amountReceived, setAmountReceived] = useState(String(plan.amount_due - plan.amount_paid));
  const [method, setMethod] = useState<PaymentMethod>(plan.payment_method);
  const [referenceNo, setReferenceNo] = useState(plan.cheque_no ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const amount = parseFloat(amountReceived);
    if (!amount || amount <= 0) {
      setError('Enter a valid received amount.');
      setLoading(false);
      return;
    }
    try {
      await markPaymentPlanReceived(plan.id, amount, method, referenceNo || undefined);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to mark as received');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title={`✓ Mark Installment #${plan.installment_no} as Received`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="cust-modal-form">
        <div className="cust-modal-summary">
          <div><strong>Invoice:</strong> #{plan.invoice_no}</div>
          <div><strong>Installment:</strong> {plan.installment_no} of {plan.total_installments}</div>
          <div><strong>Due Date:</strong> {formatDate(plan.due_date)}</div>
          <div><strong>Amount Due:</strong> {formatCurrency(plan.amount_due)}</div>
          {plan.cheque_no && <div><strong>Cheque #:</strong> {plan.cheque_no}</div>}
          {plan.cheque_clearing_date && <div><strong>Cheque Clearing:</strong> {formatDate(plan.cheque_clearing_date)}</div>}
        </div>

        {error && <div className="cust-error">{error}</div>}

        <div className="cust-form-grid">
          <div className="cust-field">
            <label className="cust-label">Amount Actually Received (PKR)</label>
            <input
              type="number"
              className="cust-input"
              min="1"
              step="1"
              value={amountReceived}
              onChange={e => setAmountReceived(e.target.value)}
              required
            />
          </div>
          <div className="cust-field">
            <label className="cust-label">Received Via</label>
            <select
              className="cust-select"
              value={method}
              onChange={e => setMethod(e.target.value as PaymentMethod)}
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="cust-field cust-field--full">
            <label className="cust-label">Reference / Cheque No. (Optional)</label>
            <input
              type="text"
              className="cust-input"
              placeholder="e.g. Cheque #001234 or TXN-9876"
              value={referenceNo}
              onChange={e => setReferenceNo(e.target.value)}
            />
          </div>
        </div>

        <div className="cust-modal-footer">
          <button type="button" className="cust-btn cust-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="cust-btn cust-btn--primary" disabled={loading}>
            {loading ? 'Recording Payment…' : '✓ Confirm Payment Received'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
