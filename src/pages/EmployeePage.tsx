import { useState, useEffect, type FormEvent } from 'react';
import {
  fetchEmployeeBalances, fetchEmployees, addEmployee, createStaffUserAccount,
  fetchEmployeeLedger, recordEmployeeEarning, recordEmployeePayment,
  fetchNotifications, markNotificationRead,
  ROLE_LABELS, ROLE_COLORS, EMPLOYMENT_TYPE_LABELS, EARNING_TYPE_LABELS, PAYMENT_TYPE_LABELS,
  type EmployeeBalance, type Employee, type EmployeeLedgerEntry,
  type Notification, type EmployeeRole, type EmploymentType, type EarningType, type PaymentType,
} from '../lib/employees';
import { PAYMENT_METHOD_LABELS, formatCurrency, formatDate, type PaymentMethod } from '../lib/fabric';
import './EmployeePage.css';

type Modal = 'none' | 'add-employee' | 'add-earning' | 'add-payment' | 'notifications' | 'create-user';

export function EmployeePage() {
  const [balances, setBalances] = useState<EmployeeBalance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<EmployeeBalance | null>(null);
  const [ledger, setLedger] = useState<EmployeeLedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [modal, setModal] = useState<Modal>('none');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [b, e, n] = await Promise.all([
        fetchEmployeeBalances(),
        fetchEmployees(),
        fetchNotifications(),
      ]);
      setBalances(b);
      setEmployees(e);
      setNotifications(n);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }

  async function selectEmployee(b: EmployeeBalance) {
    setSelected(b);
    setDetailLoading(true);
    try {
      const l = await fetchEmployeeLedger(b.employee_id);
      setLedger(l);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
    } finally {
      setDetailLoading(false);
    }
  }

  async function afterAction() {
    setModal('none');
    await loadAll();
    if (selected) {
      // re-fetch the ledger for the currently selected employee
      const l = await fetchEmployeeLedger(selected.employee_id);
      setLedger(l);
    }
  }

  const filtered = balances.filter(b =>
    b.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ROLE_LABELS[b.role].toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalOwed = balances.reduce((s, b) => s + Math.max(0, b.remaining_balance), 0);
  const totalEarned = balances.reduce((s, b) => s + b.total_earned, 0);

  return (
    <div className="emp-root">
      {/* ── Header ── */}
      <div className="emp-header">
        <div>
          <h1 className="emp-title">👷 Employee Management</h1>
          <p className="emp-subtitle">Staff records, wages, payments & balance tracking</p>
        </div>
        <div className="emp-header-actions">
          <button id="btn-notifications" className="emp-notif-btn" onClick={() => setModal('notifications')} aria-label={`Notifications (${unreadCount} unread)`}>
            🔔
            {unreadCount > 0 && <span className="emp-notif-badge" aria-hidden="true">{unreadCount}</span>}
          </button>
          <button id="btn-add-earning" className="emp-btn emp-btn--secondary" onClick={() => setModal('add-earning')}>
            + Record Earning
          </button>
          <button id="btn-add-payment" className="emp-btn emp-btn--secondary" onClick={() => setModal('add-payment')}>
            + Record Payment
          </button>
          <button id="btn-add-employee" className="emp-btn emp-btn--secondary" onClick={() => setModal('add-employee')}>
            + Add Employee
          </button>
          <button id="btn-create-user" className="emp-btn emp-btn--primary" onClick={() => setModal('create-user')}>
            🔑 Create Staff Login
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="emp-stats">
        <div className="emp-stat">
          <span className="emp-stat-label">Total Staff</span>
          <span className="emp-stat-value">{balances.length}</span>
        </div>
        <div className="emp-stat">
          <span className="emp-stat-label">Total Earned (Logged)</span>
          <span className="emp-stat-value emp-stat-value--blue">{formatCurrency(totalEarned)}</span>
        </div>
        <div className="emp-stat emp-stat--warning">
          <span className="emp-stat-label">Total Wages Due</span>
          <span className="emp-stat-value emp-stat-value--amber">{formatCurrency(totalOwed)}</span>
        </div>
        <div className="emp-stat">
          <span className="emp-stat-label">Notifications</span>
          <span className="emp-stat-value">{notifications.length}
            {unreadCount > 0 && <span className="emp-unread-chip"> {unreadCount} new</span>}
          </span>
        </div>
      </div>

      {error && <div className="emp-error" role="alert">⚠️ {error}</div>}

      <div className="emp-body">
        {/* ── Left: Staff List ── */}
        <div className="emp-list-panel">
          <div className="emp-search-wrap">
            <input
              id="employee-search"
              type="search"
              className="emp-search"
              placeholder="Search staff…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="emp-loading"><span className="emp-spinner" />Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="emp-empty">
              {searchQuery ? 'No staff match your search.' : 'No employees yet. Add one to get started.'}
            </div>
          ) : (
            <div className="emp-list" role="list">
              {filtered.map(b => (
                <button
                  key={b.employee_id}
                  id={`emp-row-${b.employee_id}`}
                  className={`emp-row${selected?.employee_id === b.employee_id ? ' emp-row--active' : ''}`}
                  onClick={() => selectEmployee(b)}
                  role="listitem"
                >
                  <div className="emp-avatar" style={{ background: `linear-gradient(135deg, ${ROLE_COLORS[b.role]}, ${ROLE_COLORS[b.role]}88)` }} aria-hidden="true">
                    {b.full_name[0].toUpperCase()}
                  </div>
                  <div className="emp-row-info">
                    <div className="emp-row-name">{b.full_name}</div>
                    <div className="emp-row-role" style={{ color: ROLE_COLORS[b.role] }}>
                      {ROLE_LABELS[b.role]}
                    </div>
                  </div>
                  <div className="emp-row-balance">
                    <div className={`emp-balance ${b.remaining_balance > 0 ? 'emp-balance--amber' : b.remaining_balance < 0 ? 'emp-balance--red' : 'emp-balance--green'}`}>
                      {formatCurrency(Math.abs(b.remaining_balance))}
                    </div>
                    <div className="emp-balance-label">
                      {b.remaining_balance > 0 ? 'due' : b.remaining_balance < 0 ? 'overpaid' : 'settled'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Detail Panel ── */}
        <div className="emp-detail-panel">
          {!selected ? (
            <div className="emp-detail-empty">
              <div className="emp-detail-empty-icon" aria-hidden="true">👤</div>
              <p>Select an employee to view their ledger</p>
            </div>
          ) : (
            <>
              <div className="emp-detail-header">
                <div className="emp-detail-meta">
                  <div className="emp-detail-avatar" style={{ background: `linear-gradient(135deg, ${ROLE_COLORS[selected.role]}, ${ROLE_COLORS[selected.role]}88)` }} aria-hidden="true">
                    {selected.full_name[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 className="emp-detail-name">{selected.full_name}</h2>
                    <div className="emp-detail-role" style={{ color: ROLE_COLORS[selected.role] }}>
                      {ROLE_LABELS[selected.role]} · {EMPLOYMENT_TYPE_LABELS[selected.employment_type]}
                    </div>
                    {selected.base_rate > 0 && (
                      <div className="emp-detail-rate">Base Rate: {formatCurrency(selected.base_rate)}</div>
                    )}
                  </div>
                </div>

                <div className="emp-detail-chips">
                  <div className="emp-chip">
                    <span className="emp-chip-label">Total Earned</span>
                    <span className="emp-chip-val">{formatCurrency(selected.total_earned)}</span>
                  </div>
                  <div className="emp-chip">
                    <span className="emp-chip-label">Total Paid</span>
                    <span className="emp-chip-val emp-chip-val--green">{formatCurrency(selected.total_paid)}</span>
                  </div>
                  <div className={`emp-chip ${selected.remaining_balance !== 0 ? 'emp-chip--accent' : ''}`}>
                    <span className="emp-chip-label">Balance Due</span>
                    <span className={`emp-chip-val ${selected.remaining_balance > 0 ? 'emp-chip-val--amber' : selected.remaining_balance < 0 ? 'emp-chip-val--red' : 'emp-chip-val--green'}`}>
                      {selected.remaining_balance < 0 ? '-' : ''}{formatCurrency(Math.abs(selected.remaining_balance))}
                    </span>
                  </div>
                </div>

                <button className="emp-close-btn" onClick={() => { setSelected(null); setLedger([]); }} aria-label="Close">✕</button>
              </div>

              {detailLoading ? (
                <div className="emp-loading"><span className="emp-spinner" />Loading ledger…</div>
              ) : (
                <div className="emp-ledger-content">
                  <div className="emp-ledger-toolbar">
                    <h3 className="emp-section-label">Transaction History</h3>
                    <div className="emp-ledger-actions">
                      <button id={`btn-earn-${selected.employee_id}`} className="emp-btn emp-btn--sm emp-btn--secondary" onClick={() => setModal('add-earning')}>
                        + Earning
                      </button>
                      <button id={`btn-pay-${selected.employee_id}`} className="emp-btn emp-btn--sm emp-btn--primary" onClick={() => setModal('add-payment')}>
                        + Payment
                      </button>
                    </div>
                  </div>

                  {ledger.length === 0 ? (
                    <div className="emp-empty">No transactions recorded yet.</div>
                  ) : (
                    <div className="emp-table-wrap">
                      <table className="emp-table" aria-label="Employee ledger">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Ref #</th>
                            <th className="emp-th-num">Earned</th>
                            <th className="emp-th-num">Paid Out</th>
                            <th className="emp-th-num">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.map((entry, i) => (
                            <tr key={`${entry.transaction_id}-${i}`} className={entry.entry_type === 'earning' ? 'emp-tr--earning' : 'emp-tr--payment'}>
                              <td className="emp-td-date">{formatDate(entry.transaction_date)}</td>
                              <td>
                                <span className={`emp-badge ${entry.entry_type === 'earning' ? 'emp-badge--earning' : 'emp-badge--payment'}`}>
                                  {entry.entry_type === 'earning' ? 'Earned' : 'Paid'}
                                </span>
                                <span className="emp-desc">{entry.description}</span>
                              </td>
                              <td className="emp-td-ref">{entry.reference_no ?? '—'}</td>
                              <td className="emp-td-num emp-td-earn">
                                {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '—'}
                              </td>
                              <td className="emp-td-num emp-td-paid">
                                {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '—'}
                              </td>
                              <td className={`emp-td-num emp-td-bal ${entry.running_balance > 0 ? 'emp-td-bal--amber' : entry.running_balance < 0 ? 'emp-td-bal--red' : 'emp-td-bal--green'}`}>
                                {formatCurrency(entry.running_balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === 'add-employee' && (
        <AddEmployeeModal onClose={() => setModal('none')} onSuccess={afterAction} />
      )}
      {modal === 'add-earning' && (
        <AddEarningModal employees={employees} onClose={() => setModal('none')} onSuccess={afterAction} defaultEmployeeId={selected?.employee_id} />
      )}
      {modal === 'add-payment' && (
        <AddPaymentModal employees={employees} onClose={() => setModal('none')} onSuccess={afterAction} defaultEmployeeId={selected?.employee_id} />
      )}
      {modal === 'notifications' && (
        <NotificationsModal notifications={notifications} onClose={() => setModal('none')} onMarkRead={async (id) => {
          await markNotificationRead(id);
          setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        }} />
      )}
      {modal === 'create-user' && (
        <CreateUserModal onClose={() => setModal('none')} onSuccess={afterAction} />
      )}
    </div>
  );
}

/* ─── Add Employee Modal ─────────────────────────────────────────────────── */
function AddEmployeeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    full_name: '', role: 'helper' as EmployeeRole,
    employment_type: 'monthly' as EmploymentType,
    base_rate: '', phone: '', cnic_id: '', joining_date: today,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await addEmployee({
        full_name: form.full_name.trim(), role: form.role,
        employment_type: form.employment_type,
        base_rate: parseFloat(form.base_rate) || 0,
        phone: form.phone || undefined, cnic_id: form.cnic_id || undefined,
        joining_date: form.joining_date,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Add Employee" onClose={onClose}>
      <form id="form-add-employee" onSubmit={handleSubmit}>
        {error && <div className="emp-modal-error">⚠️ {error}</div>}
        <div className="emp-field-grid">
          <div className="emp-field emp-field--full">
            <label htmlFor="emp-name" className="emp-label">Full Name *</label>
            <input id="emp-name" className="emp-input" required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Ali Hassan" />
          </div>
          <div className="emp-field">
            <label htmlFor="emp-role" className="emp-label">Role *</label>
            <select id="emp-role" className="emp-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as EmployeeRole }))}>
              {(Object.entries(ROLE_LABELS) as [EmployeeRole, string][]).filter(([r]) => r !== 'owner').map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="emp-type" className="emp-label">Employment Type *</label>
            <select id="emp-type" className="emp-input" value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value as EmploymentType }))}>
              {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="emp-rate" className="emp-label">Base Rate (PKR)</label>
            <input id="emp-rate" className="emp-input" type="number" min="0" step="1" value={form.base_rate} onChange={e => setForm(f => ({ ...f, base_rate: e.target.value }))} placeholder="e.g. 25000" />
          </div>
          <div className="emp-field">
            <label htmlFor="emp-phone" className="emp-label">Phone</label>
            <input id="emp-phone" className="emp-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="03xx-xxxxxxx" />
          </div>
          <div className="emp-field">
            <label htmlFor="emp-cnic" className="emp-label">CNIC</label>
            <input id="emp-cnic" className="emp-input" value={form.cnic_id} onChange={e => setForm(f => ({ ...f, cnic_id: e.target.value }))} placeholder="xxxxx-xxxxxxx-x" />
          </div>
          <div className="emp-field">
            <label htmlFor="emp-joining" className="emp-label">Joining Date</label>
            <input id="emp-joining" className="emp-input" type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} />
          </div>
        </div>
        <div className="emp-modal-footer">
          <button type="button" className="emp-btn emp-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-add-employee" type="submit" className="emp-btn emp-btn--primary" disabled={loading || !form.full_name}>
            {loading ? <><span className="emp-spinner emp-spinner--sm" />Saving…</> : 'Add Employee'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Add Earning Modal ──────────────────────────────────────────────────── */
function AddEarningModal({ employees, onClose, onSuccess, defaultEmployeeId }: {
  employees: Employee[]; onClose: () => void; onSuccess: () => void; defaultEmployeeId?: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    employee_id: defaultEmployeeId ?? '', earning_type: 'salary' as EarningType,
    amount: '', quantity_completed: '', rate_per_unit: '', earning_date: today, description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isPiece = form.earning_type === 'piece_rate';
  const pieceTotal = isPiece ? (parseFloat(form.quantity_completed) || 0) * (parseFloat(form.rate_per_unit) || 0) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await recordEmployeeEarning({
        employee_id: form.employee_id,
        amount: isPiece && pieceTotal > 0 ? pieceTotal : parseFloat(form.amount),
        earning_type: form.earning_type,
        quantity_completed: isPiece ? parseFloat(form.quantity_completed) : undefined,
        rate_per_unit: isPiece ? parseFloat(form.rate_per_unit) : undefined,
        earning_date: form.earning_date,
        description: form.description || undefined,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Record Earning" onClose={onClose}>
      <form id="form-add-earning" onSubmit={handleSubmit}>
        {error && <div className="emp-modal-error">⚠️ {error}</div>}
        <div className="emp-field-grid">
          <div className="emp-field emp-field--full">
            <label htmlFor="earn-emp" className="emp-label">Employee *</label>
            <select id="earn-emp" className="emp-input" required value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">— Select Employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({ROLE_LABELS[e.role]})</option>)}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="earn-type" className="emp-label">Earning Type *</label>
            <select id="earn-type" className="emp-input" value={form.earning_type} onChange={e => setForm(f => ({ ...f, earning_type: e.target.value as EarningType }))}>
              {Object.entries(EARNING_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="earn-date" className="emp-label">Date *</label>
            <input id="earn-date" className="emp-input" type="date" required value={form.earning_date} onChange={e => setForm(f => ({ ...f, earning_date: e.target.value }))} />
          </div>
          {isPiece ? (
            <>
              <div className="emp-field">
                <label htmlFor="earn-qty" className="emp-label">Pieces Completed *</label>
                <input id="earn-qty" className="emp-input" type="number" min="1" step="1" required value={form.quantity_completed} onChange={e => setForm(f => ({ ...f, quantity_completed: e.target.value }))} placeholder="e.g. 10" />
              </div>
              <div className="emp-field">
                <label htmlFor="earn-rate" className="emp-label">Rate per Piece (PKR) *</label>
                <input id="earn-rate" className="emp-input" type="number" min="0" step="0.01" required value={form.rate_per_unit} onChange={e => setForm(f => ({ ...f, rate_per_unit: e.target.value }))} placeholder="e.g. 150" />
              </div>
              {pieceTotal > 0 && (
                <div className="emp-field emp-field--full">
                  <div className="emp-total-preview">Total: <strong>{formatCurrency(pieceTotal)}</strong></div>
                </div>
              )}
            </>
          ) : (
            <div className="emp-field">
              <label htmlFor="earn-amount" className="emp-label">Amount (PKR) *</label>
              <input id="earn-amount" className="emp-input" type="number" min="1" step="1" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 25000" />
            </div>
          )}
          <div className="emp-field emp-field--full">
            <label htmlFor="earn-desc" className="emp-label">Description (optional)</label>
            <input id="earn-desc" className="emp-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. August 2024 salary" />
          </div>
        </div>
        <div className="emp-modal-footer">
          <button type="button" className="emp-btn emp-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-add-earning" type="submit" className="emp-btn emp-btn--primary"
            disabled={loading || !form.employee_id || (!form.amount && !pieceTotal)}>
            {loading ? <><span className="emp-spinner emp-spinner--sm" />Saving…</> : 'Record Earning'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Add Payment Modal ──────────────────────────────────────────────────── */
function AddPaymentModal({ employees, onClose, onSuccess, defaultEmployeeId }: {
  employees: Employee[]; onClose: () => void; onSuccess: () => void; defaultEmployeeId?: string;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    employee_id: defaultEmployeeId ?? '', amount: '',
    payment_type: 'salary_payout' as PaymentType,
    method: 'cash' as PaymentMethod,
    reference_no: '', payment_date: today, notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await recordEmployeePayment({
        employee_id: form.employee_id, amount: parseFloat(form.amount),
        payment_type: form.payment_type, method: form.method,
        reference_no: form.reference_no || undefined,
        payment_date: form.payment_date, notes: form.notes || undefined,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="Record Payment to Employee" onClose={onClose}>
      <form id="form-add-payment" onSubmit={handleSubmit}>
        {error && <div className="emp-modal-error">⚠️ {error}</div>}
        <div className="emp-field-grid">
          <div className="emp-field emp-field--full">
            <label htmlFor="pay-emp" className="emp-label">Employee *</label>
            <select id="pay-emp" className="emp-input" required value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">— Select Employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({ROLE_LABELS[e.role]})</option>)}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="pay-type" className="emp-label">Payment Type *</label>
            <select id="pay-type" className="emp-input" value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value as PaymentType }))}>
              {Object.entries(PAYMENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="pay-amount" className="emp-label">Amount (PKR) *</label>
            <input id="pay-amount" className="emp-input" type="number" min="1" step="1" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 15000" />
          </div>
          <div className="emp-field">
            <label htmlFor="pay-method" className="emp-label">Payment Method *</label>
            <select id="pay-method" className="emp-input" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="pay-ref" className="emp-label">Reference # (optional)</label>
            <input id="pay-ref" className="emp-input" value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))} placeholder="TRX/Cheque ID" />
          </div>
          <div className="emp-field">
            <label htmlFor="pay-date" className="emp-label">Payment Date *</label>
            <input id="pay-date" className="emp-input" type="date" required value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
          </div>
          <div className="emp-field emp-field--full">
            <label htmlFor="pay-notes" className="emp-label">Notes (optional)</label>
            <textarea id="pay-notes" className="emp-input emp-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. August salary advance" />
          </div>
        </div>
        <div className="emp-modal-footer">
          <button type="button" className="emp-btn emp-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-add-payment" type="submit" className="emp-btn emp-btn--primary"
            disabled={loading || !form.employee_id || !form.amount}>
            {loading ? <><span className="emp-spinner emp-spinner--sm" />Saving…</> : 'Record Payment'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Notifications Modal ────────────────────────────────────────────────── */
function NotificationsModal({ notifications, onClose, onMarkRead }: {
  notifications: Notification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
}) {
  return (
    <ModalShell title={`🔔 Notifications (${notifications.filter(n => !n.is_read).length} unread)`} onClose={onClose}>
      <div className="emp-notif-list" id="notifications-list">
        {notifications.length === 0 ? (
          <div className="emp-empty" style={{ padding: '2rem' }}>No notifications yet.</div>
        ) : notifications.map(n => (
          <div key={n.id} id={`notif-${n.id}`} className={`emp-notif-item${n.is_read ? ' emp-notif-item--read' : ''}`}>
            <div className="emp-notif-top">
              <span className="emp-notif-title">{n.title}</span>
              <span className="emp-notif-time">{formatDate(n.created_at)}</span>
            </div>
            <p className="emp-notif-msg">{n.message}</p>
            {n.metadata?.whatsapp_integration_note && (
              <p className="emp-notif-hook">📱 Future: WhatsApp/SMS dispatch enabled</p>
            )}
            {!n.is_read && (
              <button id={`mark-read-${n.id}`} className="emp-notif-read-btn" onClick={() => onMarkRead(n.id)}>
                Mark as read
              </button>
            )}
          </div>
        ))}
      </div>
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
    <div className="emp-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="emp-modal-box">
        <div className="emp-modal-header">
          <h2 className="emp-modal-title">{title}</h2>
          <button className="emp-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Create User Account Modal ─────────────────────────────────────────── */
function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'shop_staff' as EmployeeRole,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      await createStaffUserAccount({
        email: form.email.trim(),
        password: form.password || 'Garments123!',
        full_name: form.full_name.trim(),
        role: form.role,
      });
      onSuccess();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to create user account'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell title="🔑 Create Staff Login Account" onClose={onClose}>
      <form id="form-create-user" onSubmit={handleSubmit}>
        {error && <div className="emp-modal-error">⚠️ {error}</div>}
        <div className="emp-field-grid">
          <div className="emp-field emp-field--full">
            <label htmlFor="user-name" className="emp-label">Full Name *</label>
            <input id="user-name" className="emp-input" required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Tariq Mehmood" />
          </div>
          <div className="emp-field emp-field--full">
            <label htmlFor="user-email" className="emp-label">Staff Email Address *</label>
            <input id="user-email" className="emp-input" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@shop.com" />
          </div>
          <div className="emp-field">
            <label htmlFor="user-role" className="emp-label">Assigned Role *</label>
            <select id="user-role" className="emp-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as EmployeeRole }))}>
              {(Object.entries(ROLE_LABELS) as [EmployeeRole, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="user-pass" className="emp-label">Initial Password</label>
            <input id="user-pass" className="emp-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Default: Garments123!" />
          </div>
        </div>
        <div className="emp-modal-footer">
          <button type="button" className="emp-btn emp-btn--ghost" onClick={onClose}>Cancel</button>
          <button id="submit-create-user" type="submit" className="emp-btn emp-btn--primary" disabled={loading || !form.email || !form.full_name}>
            {loading ? <><span className="emp-spinner emp-spinner--sm" />Creating Account…</> : 'Create Login Account'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
