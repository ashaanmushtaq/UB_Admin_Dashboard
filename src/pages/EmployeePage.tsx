import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  fetchEmployeeBalances, fetchEmployees, addEmployee, createStaffUserAccount,
  fetchEmployeeLedger, recordEmployeeEarning, recordEmployeePayment,
  fetchPendingEarnings, approveEmployeeEarning, rejectEmployeeEarning,
  fetchNotifications, markNotificationRead, resetWorkerPassword, fetchSecurityAuditLogs,
  ROLE_LABELS, ROLE_COLORS, EMPLOYMENT_TYPE_LABELS, EARNING_TYPE_LABELS, PAYMENT_TYPE_LABELS,
  type EmployeeBalance, type Employee, type EmployeeLedgerEntry, type PendingEarning,
  type Notification, type EmployeeRole, type EmploymentType, type EarningType, type PaymentType,
  type SecurityAuditLog,
} from '../lib/employees';
import { PAYMENT_METHOD_LABELS, formatCurrency, formatDate, type PaymentMethod } from '../lib/fabric';
import { exportDataset } from '../lib/exportUtils';
import { QuickExportCluster } from '../components/QuickExportCluster';
import './EmployeePage.css';

type Modal = 'none' | 'add-employee' | 'add-earning' | 'add-payment' | 'notifications' | 'create-user' | 'pending-approvals' | 'reset-password';

export function EmployeePage() {
  const [balances, setBalances] = useState<EmployeeBalance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<EmployeeBalance | null>(null);
  const [ledger, setLedger] = useState<EmployeeLedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingEarnings, setPendingEarnings] = useState<PendingEarning[]>([]);
  const [modal, setModal] = useState<Modal>('none');
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string; role: EmployeeRole } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 6000);
    return () => clearTimeout(t);
  }, [successMsg]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [b, e, n, p] = await Promise.all([
        fetchEmployeeBalances(),
        fetchEmployees(),
        fetchNotifications(),
        fetchPendingEarnings(),
      ]);
      setBalances(b);
      setEmployees(e);
      setNotifications(n);
      setPendingEarnings(p);
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
  const totalPending = balances.reduce((s, b) => s + (b.pending_earned ?? 0), 0);

  function handleExportPayroll(format: 'excel' | 'word' | 'pdf') {
    const today = new Date().toISOString().split('T')[0];
    const filterNote = searchQuery ? ` (filtered: "${searchQuery}")` : '';
    const filteredEarned = filtered.reduce((s, b) => s + b.total_earned, 0);
    const filteredPending = filtered.reduce((s, b) => s + (b.pending_earned ?? 0), 0);
    const filteredOwed = filtered.reduce((s, b) => s + Math.max(0, b.remaining_balance), 0);
    exportDataset(format, {
      filename: `Payroll_Summary_${today}`,
      title: 'Staff Payroll Summary Report',
      subtitle: `All employee wage balances: earnings approved, wages paid, and outstanding dues${filterNote}`,
      headers: ['Employee Name', 'Role', 'Employment Type', 'Total Earned (₨)', 'Pending (₨)', 'Total Paid (₨)', 'Balance Due (₨)'],
      rows: filtered.map(b => [
        b.full_name || '—',
        ROLE_LABELS[b.role] || b.role,
        EMPLOYMENT_TYPE_LABELS[b.employment_type as keyof typeof EMPLOYMENT_TYPE_LABELS] || b.employment_type || '—',
        Number(b.total_earned || 0).toLocaleString(),
        Number(b.pending_earned || 0).toLocaleString(),
        Number(b.total_paid || 0).toLocaleString(),
        Math.max(0, b.remaining_balance).toLocaleString(),
      ]),
      summaryStats: {
        'Total Staff Members': filtered.length,
        'Total Approved Earnings': `₨ ${filteredEarned.toLocaleString()}`,
        'Pending Approval': `₨ ${filteredPending.toLocaleString()}`,
        'Total Wages Outstanding': `₨ ${filteredOwed.toLocaleString()}`,
        'Report Date': today,
      },
    });
  }

  function handleExportLedger(format: 'excel' | 'word' | 'pdf') {
    if (!selected) return;
    const today = new Date().toISOString().split('T')[0];
    exportDataset(format, {
      filename: `Employee_Ledger_${selected.full_name.replace(/\s+/g, '_')}_${today}`,
      title: `Employee Account Statement: ${selected.full_name}`,
      subtitle: `${ROLE_LABELS[selected.role] || selected.role} · ${EMPLOYMENT_TYPE_LABELS[selected.employment_type as keyof typeof EMPLOYMENT_TYPE_LABELS] || selected.employment_type || ''}`,
      headers: ['Date', 'Type', 'Description', 'Earning (₨)', 'Payment (₨)', 'Status'],
      rows: ledger.map(e => [
        e.transaction_date || '—',
        e.entry_type === 'earning' ? 'EARNING' : 'PAYMENT',
        e.description || '—',
        e.entry_type === 'earning' ? Number(e.debit_amount || 0).toLocaleString() : '—',
        e.entry_type === 'payment' ? Number(e.credit_amount || 0).toLocaleString() : '—',
        e.status ? e.status.toUpperCase() : '—',
      ]),
      summaryStats: {
        'Employee': selected.full_name,
        'Role': ROLE_LABELS[selected.role] || selected.role,
        'Total Earned (Approved)': `₨ ${Number(selected.total_earned || 0).toLocaleString()}`,
        'Total Paid': `₨ ${Number(selected.total_paid || 0).toLocaleString()}`,
        'Balance Due': `₨ ${Math.max(0, selected.remaining_balance).toLocaleString()}`,
        'Statement Date': today,
      },
    });
  }

  return (
    <div className="emp-root">
      {/* ── Header ── */}
      <div className="emp-header">
        <div>
          <h1 className="emp-title">👷 Employee Management</h1>
          <p className="emp-subtitle">Staff records, wages, payments & balance tracking</p>
        </div>
        <div className="emp-header-actions">
          <QuickExportCluster onExport={handleExportPayroll} />
          <button id="btn-notifications" className="emp-notif-btn" onClick={() => setModal('notifications')} aria-label={`Notifications (${unreadCount} unread)`}>
            🔔
            {unreadCount > 0 && <span className="emp-notif-badge" aria-hidden="true">{unreadCount}</span>}
          </button>
          {pendingEarnings.length > 0 && (
            <button id="btn-pending-approvals" className="emp-btn emp-btn--warning" onClick={() => setModal('pending-approvals')}>
              ⏳ Approve Earnings ({pendingEarnings.length})
            </button>
          )}
          <button id="btn-add-earning" className="emp-btn emp-btn--secondary" onClick={() => setModal('add-earning')}>
            + Record Earning
          </button>
          <button id="btn-add-payment" className="emp-btn emp-btn--secondary" onClick={() => setModal('add-payment')}>
            + Record Payment
          </button>
          <button id="btn-add-employee" className="emp-btn emp-btn--secondary" onClick={() => setModal('add-employee')}>
            + Add Employee
          </button>
          <button id="btn-open-reset-pw" className="emp-btn emp-btn--secondary" onClick={() => { setResetTarget(null); setModal('reset-password'); }} title="Set a new login password for any staff member">
            🔑 Reset Password
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
          <span className="emp-stat-label">Total Earned (Approved)</span>
          <span className="emp-stat-value emp-stat-value--blue">{formatCurrency(totalEarned)}</span>
        </div>
        {totalPending > 0 && (
          <div className="emp-stat emp-stat--pending" style={{ cursor: 'pointer' }} onClick={() => setModal('pending-approvals')} title="Click to review pending earnings">
            <span className="emp-stat-label">⏳ Pending Approval</span>
            <span className="emp-stat-value emp-stat-value--amber">{formatCurrency(totalPending)}</span>
          </div>
        )}
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

      {successMsg && (
        <div className="emp-success-banner" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
          {successMsg}
        </div>
      )}

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

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {ledger.length > 0 && (
                    <QuickExportCluster onExport={handleExportLedger} />
                  )}
                  <button className="emp-close-btn" onClick={() => { setSelected(null); setLedger([]); }} aria-label="Close">✕</button>
                </div>
              </div>

              {detailLoading ? (
                <div className="emp-loading"><span className="emp-spinner" />Loading ledger…</div>
              ) : (
                <div className="emp-ledger-content">
                  <div className="emp-ledger-toolbar">
                    <h3 className="emp-section-label">Transaction History</h3>
                    <div className="emp-ledger-actions">
                      {selected.user_id && (
                        <button
                          id={`btn-reset-pw-${selected.employee_id}`}
                          className="emp-btn emp-btn--sm emp-btn--secondary"
                          onClick={() => {
                            setResetTarget({
                              userId: selected.user_id!,
                              name: selected.full_name,
                              role: selected.role,
                            });
                            setModal('reset-password');
                          }}
                          title="Reset worker password"
                        >
                          🔑 Reset Password
                        </button>
                      )}
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
                                <span className={`emp-badge ${
                                  entry.entry_type === 'earning'
                                    ? (entry.status === 'pending' ? 'emp-badge--pending' : entry.status === 'rejected' ? 'emp-badge--rejected' : 'emp-badge--earning')
                                    : 'emp-badge--payment'
                                }`}>
                                  {entry.entry_type === 'earning'
                                    ? (entry.status === 'pending' ? '⏳ Pending' : entry.status === 'rejected' ? '✕ Rejected' : 'Earned')
                                    : 'Paid'}
                                </span>
                                <span className="emp-desc">{entry.description}</span>
                                {entry.entry_type === 'earning' && entry.status === 'approved' && entry.approved_by_name && (
                                  <span className="emp-approver-tag" title={`Approved by ${entry.approved_by_name}`}>
                                    ✓ Approved by {entry.approved_by_name}
                                  </span>
                                )}
                                {entry.original_amount != null && entry.original_amount !== entry.debit_amount && (
                                  <span className="emp-adj-detail" title={entry.adjustment_notes ? `Notes: ${entry.adjustment_notes}` : undefined}>
                                    ✏️ Adj. from {formatCurrency(entry.original_amount)}{entry.adjustment_notes ? ` (${entry.adjustment_notes})` : ''}
                                  </span>
                                )}
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
        <CreateUserModal employees={employees} onClose={() => setModal('none')} onSuccess={afterAction} />
      )}
      {modal === 'reset-password' && (
        <ResetPasswordModal
          employees={employees}
          initialTarget={resetTarget}
          onClose={() => setModal('none')}
          onSuccess={(msg) => {
            setSuccessMsg(msg);
            afterAction();
          }}
        />
      )}
      {modal === 'pending-approvals' && (
        <PendingApprovalsModal
          earnings={pendingEarnings}
          onClose={() => setModal('none')}
          onSuccess={afterAction}
        />
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

/* ─── Pending Earnings Approval Modal ───────────────────────────────────── */
function PendingApprovalsModal({ earnings, onClose, onSuccess }: {
  earnings: PendingEarning[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [actionMap, setActionMap] = useState<Record<string, { adjustedAmount: string; notes: string }>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState<'worker' | 'all'>('worker');

  function getAction(id: string) {
    return actionMap[id] ?? { adjustedAmount: '', notes: '' };
  }

  function setField(id: string, field: 'adjustedAmount' | 'notes', value: string) {
    setActionMap(prev => ({ ...prev, [id]: { ...getAction(id), [field]: value } }));
  }

  async function handleApprove(earning: PendingEarning) {
    setProcessingId(earning.id);
    setErrors(prev => { const c = { ...prev }; delete c[earning.id]; return c; });
    try {
      const { adjustedAmount, notes } = getAction(earning.id);
      const adj = adjustedAmount ? parseFloat(adjustedAmount) : undefined;
      await approveEmployeeEarning(earning.id, adj && adj !== earning.amount ? adj : undefined, notes || undefined);
      setDoneIds(prev => new Set([...prev, earning.id]));
    } catch (err: unknown) {
      setErrors(prev => ({ ...prev, [earning.id]: err instanceof Error ? err.message : 'Failed to approve' }));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(earning: PendingEarning) {
    setProcessingId(earning.id);
    setErrors(prev => { const c = { ...prev }; delete c[earning.id]; return c; });
    try {
      const { notes } = getAction(earning.id);
      await rejectEmployeeEarning(earning.id, notes || undefined);
      setDoneIds(prev => new Set([...prev, earning.id]));
    } catch (err: unknown) {
      setErrors(prev => ({ ...prev, [earning.id]: err instanceof Error ? err.message : 'Failed to reject' }));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleApproveAll() {
    setBatchProcessing(true);
    const remaining = earnings.filter(e => !doneIds.has(e.id));
    for (const earning of remaining) {
      try {
        await approveEmployeeEarning(earning.id);
        setDoneIds(prev => new Set([...prev, earning.id]));
      } catch {
        // Skip failed, continue
      }
    }
    setBatchProcessing(false);
    onSuccess();
  }

  async function handleApproveWorkerBatch(workerItems: PendingEarning[]) {
    setBatchProcessing(true);
    const remaining = workerItems.filter(e => !doneIds.has(e.id));
    for (const item of remaining) {
      try {
        await approveEmployeeEarning(item.id);
        setDoneIds(prev => new Set([...prev, item.id]));
      } catch {
        // Skip failed
      }
    }
    setBatchProcessing(false);
  }

  const pending = earnings.filter(e => !doneIds.has(e.id));

  // Group pending entries by employee
  const groupedWorkers = useMemo(() => {
    const map = new Map<string, { employeeName: string; employeeRole: string; items: PendingEarning[] }>();
    for (const item of earnings) {
      if (!map.has(item.employee_id)) {
        map.set(item.employee_id, {
          employeeName: item.employee_name,
          employeeRole: item.employee_role,
          items: [],
        });
      }
      map.get(item.employee_id)!.items.push(item);
    }
    return Array.from(map.entries()).map(([employeeId, data]) => {
      const activeItems = data.items.filter(e => !doneIds.has(e.id));
      const totalAmount = activeItems.reduce((sum, e) => sum + e.amount, 0);
      return {
        employeeId,
        ...data,
        activeItems,
        totalAmount,
      };
    });
  }, [earnings, doneIds]);

  function renderEarningCard(earning: PendingEarning) {
    const isDone = doneIds.has(earning.id);
    const isProcessing = processingId === earning.id;
    const { adjustedAmount, notes } = getAction(earning.id);
    const previewAmount = adjustedAmount ? parseFloat(adjustedAmount) : earning.amount;

    return (
      <div
        key={earning.id}
        id={`pending-earning-${earning.id}`}
        className={`emp-pending-card${isDone ? ' emp-pending-card--done' : ''}`}
      >
        {isDone && (
          <div className="emp-pending-done-overlay">✅ Processed</div>
        )}

        <div className="emp-pending-header">
          <div className="emp-pending-worker">
            <div className="emp-avatar" style={{ background: `linear-gradient(135deg, ${ROLE_COLORS[earning.employee_role as keyof typeof ROLE_COLORS] ?? '#666'}, #33333388)`, width: 36, height: 36, fontSize: '0.9rem' }} aria-hidden="true">
              {earning.employee_name[0]?.toUpperCase()}
            </div>
            <div>
              <div className="emp-pending-worker-name">{earning.employee_name}</div>
              <div className="emp-pending-worker-role" style={{ color: ROLE_COLORS[earning.employee_role as keyof typeof ROLE_COLORS] ?? '#888' }}>
                {ROLE_LABELS[earning.employee_role as keyof typeof ROLE_LABELS] ?? earning.employee_role}
              </div>
            </div>
          </div>
          <div className="emp-pending-amount-block">
            <div className="emp-pending-orig-amount">{formatCurrency(earning.amount)}</div>
            {earning.quantity_completed != null && earning.rate_per_unit != null && (
              <div className="emp-pending-rate-detail">
                {earning.quantity_completed} pcs × {formatCurrency(earning.rate_per_unit)}
              </div>
            )}
          </div>
        </div>

        {earning.description && (
          <div className="emp-pending-desc">{earning.description}</div>
        )}

        <div className="emp-pending-meta">
          <span>📅 {formatDate(earning.earning_date)}</span>
          <span className="emp-badge emp-badge--earning">{EARNING_TYPE_LABELS[earning.earning_type as EarningType] ?? earning.earning_type}</span>
          {earning.order_number && (
            <span className="emp-badge" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
              📦 Order #{earning.order_number}
            </span>
          )}
        </div>

        {errors[earning.id] && (
          <div className="emp-modal-error" style={{ marginTop: '0.5rem' }}>⚠️ {errors[earning.id]}</div>
        )}

        {!isDone && (
          <div className="emp-pending-actions">
            <div className="emp-pending-fields">
              <div className="emp-field">
                <label htmlFor={`adj-amount-${earning.id}`} className="emp-label">
                  Adjusted Amount (PKR) — leave blank to approve as-is
                </label>
                <input
                  id={`adj-amount-${earning.id}`}
                  className="emp-input emp-input--sm"
                  type="number"
                  min="0"
                  step="1"
                  placeholder={String(earning.amount)}
                  value={adjustedAmount}
                  onChange={e => setField(earning.id, 'adjustedAmount', e.target.value)}
                  disabled={isProcessing}
                />
                {adjustedAmount && !isNaN(previewAmount) && previewAmount !== earning.amount && (
                  <div className="emp-pending-preview">
                    Will approve as: <strong>{formatCurrency(previewAmount)}</strong>
                    {' '}(was {formatCurrency(earning.amount)})
                  </div>
                )}
              </div>
              <div className="emp-field">
                <label htmlFor={`adj-notes-${earning.id}`} className="emp-label">
                  Notes (optional — required for rejection)
                </label>
                <input
                  id={`adj-notes-${earning.id}`}
                  className="emp-input emp-input--sm"
                  placeholder="e.g. Adjusted for rework, or reason for rejection"
                  value={notes}
                  onChange={e => setField(earning.id, 'notes', e.target.value)}
                  disabled={isProcessing}
                />
              </div>
            </div>
            <div className="emp-pending-btns">
              <button
                id={`btn-approve-${earning.id}`}
                className="emp-btn emp-btn--success"
                onClick={() => handleApprove(earning)}
                disabled={isProcessing || batchProcessing}
              >
                {isProcessing ? <><span className="emp-spinner emp-spinner--sm" />…</> : '✓ Approve'}
              </button>
              <button
                id={`btn-reject-${earning.id}`}
                className="emp-btn emp-btn--danger"
                onClick={() => handleReject(earning)}
                disabled={isProcessing || batchProcessing}
              >
                ✕ Reject
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <ModalShell title={`⏳ Pending Earnings Approval (${pending.length})`} onClose={() => { if (doneIds.size > 0) onSuccess(); else onClose(); }}>
      <div className="emp-pending-intro">
        These piece-rate earnings were auto-calculated when workers updated completed quantity. Review, adjust, or approve entries below.
        {pending.length > 1 && (
          <button
            id="btn-approve-all-earnings"
            className="emp-btn emp-btn--success emp-btn--sm"
            style={{ marginLeft: '1rem' }}
            onClick={handleApproveAll}
            disabled={batchProcessing}
          >
            {batchProcessing ? <><span className="emp-spinner emp-spinner--sm" />Approving…</> : `✓ Approve All (${pending.length})`}
          </button>
        )}
      </div>

      {earnings.length > 0 && (
        <div className="emp-pending-view-toggle">
          <button
            type="button"
            className={`emp-pending-tab-btn${groupBy === 'worker' ? ' emp-pending-tab-btn--active' : ''}`}
            onClick={() => setGroupBy('worker')}
          >
            👥 Group by Worker ({groupedWorkers.filter(g => g.activeItems.length > 0).length})
          </button>
          <button
            type="button"
            className={`emp-pending-tab-btn${groupBy === 'all' ? ' emp-pending-tab-btn--active' : ''}`}
            onClick={() => setGroupBy('all')}
          >
            📋 All Pending Items ({pending.length})
          </button>
        </div>
      )}

      {earnings.length === 0 ? (
        <div className="emp-empty" style={{ padding: '2rem', textAlign: 'center' }}>
          ✅ No pending earnings to review.
        </div>
      ) : groupBy === 'worker' ? (
        <div className="emp-pending-groups" id="pending-earnings-groups">
          {groupedWorkers.map(group => {
            const isGroupDone = group.activeItems.length === 0;
            return (
              <div key={group.employeeId} className={`emp-pending-group${isGroupDone ? ' emp-pending-group--done' : ''}`}>
                <div className="emp-pending-group-header">
                  <div className="emp-pending-group-info">
                    <span className="emp-pending-group-name">{group.employeeName}</span>
                    <span className="emp-pending-worker-role" style={{ color: ROLE_COLORS[group.employeeRole as keyof typeof ROLE_COLORS] ?? '#888' }}>
                      {ROLE_LABELS[group.employeeRole as keyof typeof ROLE_LABELS] ?? group.employeeRole}
                    </span>
                    <span className="emp-badge emp-badge--pending">
                      {group.activeItems.length} awaiting approval
                    </span>
                  </div>
                  <div className="emp-pending-group-actions">
                    <span className="emp-pending-group-total">
                      Total: <strong>{formatCurrency(group.totalAmount)}</strong>
                    </span>
                    {!isGroupDone && group.activeItems.length > 1 && (
                      <button
                        type="button"
                        className="emp-btn emp-btn--success emp-btn--xs"
                        onClick={() => handleApproveWorkerBatch(group.items)}
                        disabled={batchProcessing}
                      >
                        ✓ Approve {group.activeItems.length} for {group.employeeName}
                      </button>
                    )}
                  </div>
                </div>
                <div className="emp-pending-group-items">
                  {group.items.map(earning => renderEarningCard(earning))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="emp-pending-list" id="pending-earnings-list">
          {earnings.map((earning) => renderEarningCard(earning))}
        </div>
      )}

      <div className="emp-modal-footer">
        <button
          id="btn-close-pending-approvals"
          className="emp-btn emp-btn--primary"
          onClick={() => { if (doneIds.size > 0) onSuccess(); else onClose(); }}
        >
          {doneIds.size > 0 ? `Done — ${doneIds.size} processed` : 'Close'}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Create User Account Modal ─────────────────────────────────────────── */
function CreateUserModal({
  employees,
  onClose,
  onSuccess,
}: {
  employees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'shop_staff' as EmployeeRole,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleSelectEmployee(empId: string) {
    setSelectedEmpId(empId);
    if (!empId) return;
    const emp = employees.find(e => e.id === empId);
    if (emp) {
      setForm(prev => ({
        ...prev,
        full_name: emp.full_name,
        role: emp.role,
        email: emp.email || prev.email,
      }));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await createStaffUserAccount({
        email: form.email.trim(),
        password: form.password || 'Garments123!',
        full_name: form.full_name.trim(),
        role: form.role,
        employee_id: selectedEmpId || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="🔑 Create Staff Login Account" onClose={onClose}>
      <form id="form-create-user" onSubmit={handleSubmit}>
        {error && <div className="emp-modal-error">⚠️ {error}</div>}
        <div className="emp-field-grid">
          <div className="emp-field emp-field--full">
            <label htmlFor="user-emp-select" className="emp-label">Link to Existing Employee (Optional)</label>
            <select
              id="user-emp-select"
              className="emp-input"
              value={selectedEmpId}
              onChange={e => handleSelectEmployee(e.target.value)}
            >
              <option value="">— ➕ Create Brand New Staff Account —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({ROLE_LABELS[e.role] || e.role}) {e.user_id ? '✓ (Login Linked)' : '⚠️ (No Login)'}
                </option>
              ))}
            </select>
          </div>
          <div className="emp-field emp-field--full">
            <label htmlFor="user-name" className="emp-label">Full Name *</label>
            <input
              id="user-name"
              className="emp-input"
              required
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="e.g. Tariq Mehmood"
            />
          </div>
          <div className="emp-field emp-field--full">
            <label htmlFor="user-email" className="emp-label">Staff Email Address *</label>
            <input
              id="user-email"
              className="emp-input"
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="staff@shop.com"
            />
          </div>
          <div className="emp-field">
            <label htmlFor="user-role" className="emp-label">Assigned Role *</label>
            <select
              id="user-role"
              className="emp-input"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as EmployeeRole }))}
            >
              {(Object.entries(ROLE_LABELS) as [EmployeeRole, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="emp-field">
            <label htmlFor="user-pass" className="emp-label">Initial Password</label>
            <input
              id="user-pass"
              className="emp-input"
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Default: Garments123!"
            />
          </div>
        </div>
        <div className="emp-modal-footer">
          <button type="button" className="emp-btn emp-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            id="submit-create-user"
            type="submit"
            className="emp-btn emp-btn--primary"
            disabled={loading || !form.email || !form.full_name}
          >
            {loading ? <><span className="emp-spinner emp-spinner--sm" />Creating Account…</> : 'Create Login Account'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── Reset Worker Password Modal ───────────────────────────────────────── */
function ResetPasswordModal({
  employees,
  initialTarget,
  onClose,
  onSuccess,
}: {
  employees: Employee[];
  initialTarget: { userId: string; name: string; role: EmployeeRole } | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const staffWithAccounts = employees.filter(e => e.user_id);
  const [selectedUserId, setSelectedUserId] = useState<string>(
    initialTarget?.userId || staffWithAccounts[0]?.user_id || ''
  );
  const [newPassword, setNewPassword] = useState<string>('Garments123!');
  const [showPassword, setShowPassword] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'reset' | 'audit'>('reset');
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  const selectedStaff = employees.find(e => e.user_id === selectedUserId);

  useEffect(() => {
    if (activeTab === 'audit') {
      setLoadingAudit(true);
      fetchSecurityAuditLogs(20)
        .then(logs => setAuditLogs(logs))
        .catch(err => console.warn('Failed to load audit logs:', err))
        .finally(() => setLoadingAudit(false));
    }
  }, [activeTab]);

  function handleGeneratePassword() {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    setNewPassword(`Karobit${randomDigits}!`);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a staff member.');
      return;
    }
    if (!newPassword || newPassword.trim().length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await resetWorkerPassword({
        targetUserId: selectedUserId,
        newPassword: newPassword.trim(),
      });
      const workerName = selectedStaff?.full_name || initialTarget?.name || 'Worker';
      onSuccess(`✅ Password reset successfully for ${workerName}. New password: "${newPassword.trim()}"`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="🔑 Reset Worker Password" onClose={onClose}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0.5rem 1.5rem 0', gap: '1rem' }}>
        <button
          type="button"
          className={`emp-tab-btn ${activeTab === 'reset' ? 'emp-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('reset')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.5rem 0.25rem',
            borderBottom: activeTab === 'reset' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'reset' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset Password
        </button>
        <button
          type="button"
          className={`emp-tab-btn ${activeTab === 'audit' ? 'emp-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('audit')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.5rem 0.25rem',
            borderBottom: activeTab === 'audit' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'audit' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          📋 Audit Trail
        </button>
      </div>

      {activeTab === 'reset' ? (
        <form id="form-reset-password" onSubmit={handleSubmit}>
          {error && <div className="emp-modal-error">⚠️ {error}</div>}

          <div className="emp-field-grid">
            <div className="emp-field emp-field--full">
              <label htmlFor="reset-worker-select" className="emp-label">Worker Account *</label>
              {initialTarget ? (
                <div style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{initialTarget.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Role: {ROLE_LABELS[initialTarget.role] || initialTarget.role}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                    Active Login
                  </span>
                </div>
              ) : (
                <select
                  id="reset-worker-select"
                  className="emp-input"
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  required
                >
                  {staffWithAccounts.length === 0 ? (
                    <option value="">No staff with active logins found</option>
                  ) : (
                    staffWithAccounts.map(e => (
                      <option key={e.id} value={e.user_id!}>
                        {e.full_name} ({ROLE_LABELS[e.role] || e.role}) — {e.email || 'linked'}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            <div className="emp-field emp-field--full">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="reset-new-pw" className="emp-label">New Password *</label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  🎲 Auto-Generate
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="reset-new-pw"
                  className="emp-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters (e.g. Garments123!)"
                  style={{ paddingRight: '4.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                ℹ️ The worker will use this password to log into the Karobit mobile app immediately.
              </div>
            </div>
          </div>

          <div className="emp-modal-footer">
            <button type="button" className="emp-btn emp-btn--ghost" onClick={onClose}>Cancel</button>
            <button
              id="submit-reset-password"
              type="submit"
              className="emp-btn emp-btn--primary"
              disabled={loading || !selectedUserId || !newPassword || newPassword.length < 6}
            >
              {loading ? <><span className="emp-spinner emp-spinner--sm" />Updating Password…</> : '🔑 Set New Password'}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ padding: '1rem 1.5rem', maxHeight: '350px', overflowY: 'auto' }}>
          {loadingAudit ? (
            <div className="emp-loading"><span className="emp-spinner" />Loading audit records…</div>
          ) : auditLogs.length === 0 ? (
            <div className="emp-empty" style={{ padding: '2rem 0' }}>No password resets recorded yet for this shop.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {auditLogs.map(log => (
                <div
                  key={log.id}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      🔑 Reset for {log.target_user_name || log.target_user_email || 'Worker'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Reset by: <span style={{ color: 'var(--text-primary)' }}>{log.actor_email}</span> ({log.actor_role})
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="emp-modal-footer" style={{ marginTop: '1.5rem', padding: 0 }}>
            <button type="button" className="emp-btn emp-btn--primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

