import { useState, useEffect } from 'react';
import { 
  fetchBusinessExpenses, 
  createBusinessExpense, 
  deleteBusinessExpense,
  type BusinessExpense,
  type ExpenseCategory
} from '../lib/expenses';
import { exportDataset } from '../lib/exportUtils';
import { QuickExportCluster } from '../components/QuickExportCluster';
import './BusinessExpensesPage.css';

const CATEGORY_LABELS: Record<ExpenseCategory, { label: string; icon: string }> = {
  rent: { label: 'Rent', icon: '🏢' },
  electricity: { label: 'Electricity / Utilities', icon: '⚡' },
  transport: { label: 'Transport / Fuel', icon: '🚚' },
  salaries: { label: 'Salaries & Wages', icon: '👥' },
  miscellaneous: { label: 'Miscellaneous', icon: '📦' },
};

export function BusinessExpensesPage() {
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('rent');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadExpenses();
  }, [selectedCategory, startDate, endDate]);

  async function loadExpenses() {
    setLoading(true);
    try {
      const data = await fetchBusinessExpenses({
        category: selectedCategory,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setExpenses(data);
    } catch (err) {
      console.error('Failed to load expenses', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!formAmount || parseFloat(formAmount) <= 0) return;
    setSubmitting(true);
    try {
      await createBusinessExpense({
        category: formCategory,
        amount: parseFloat(formAmount),
        expense_date: formDate,
        notes: formNotes,
      });
      setShowModal(false);
      setFormAmount('');
      setFormNotes('');
      loadExpenses();
    } catch (err: any) {
      alert('Failed to save expense: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this expense record?')) return;
    try {
      await deleteBusinessExpense(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      alert('Failed to delete expense: ' + err.message);
    }
  }

  // Calculate category totals
  const totalAmount = expenses.reduce((acc, cur) => acc + Number(cur.amount), 0);
  const rentTotal = expenses.filter(e => e.category === 'rent').reduce((acc, cur) => acc + Number(cur.amount), 0);
  const elecTotal = expenses.filter(e => e.category === 'electricity').reduce((acc, cur) => acc + Number(cur.amount), 0);
  const transTotal = expenses.filter(e => e.category === 'transport').reduce((acc, cur) => acc + Number(cur.amount), 0);
  const salTotal = expenses.filter(e => e.category === 'salaries').reduce((acc, cur) => acc + Number(cur.amount), 0);
  const miscTotal = expenses.filter(e => e.category === 'miscellaneous').reduce((acc, cur) => acc + Number(cur.amount), 0);

  function handleExportExpenses(format: 'excel' | 'word' | 'pdf') {
    const today = new Date().toISOString().split('T')[0];
    const catNote = selectedCategory !== 'all' ? ` (Category: ${CATEGORY_LABELS[selectedCategory]?.label || selectedCategory})` : '';
    exportDataset(format, {
      filename: `Operational_Expenses_${today}`,
      title: 'Operational & Business Expenses Report',
      subtitle: `Factory overheads, utilities, logistics, and sundry expenditures${catNote}`,
      headers: ['Date', 'Category', 'Notes / Description', 'Amount (PKR)'],
      rows: expenses.map(e => [
        e.expense_date || '—',
        CATEGORY_LABELS[e.category]?.label || e.category,
        e.notes || '—',
        Number(e.amount || 0).toLocaleString(),
      ]),
      summaryStats: {
        'Total Expenses': `₨ ${totalAmount.toLocaleString()}`,
        'Rent Overheads': `₨ ${rentTotal.toLocaleString()}`,
        'Electricity & Utilities': `₨ ${elecTotal.toLocaleString()}`,
        'Transport & Logistics': `₨ ${transTotal.toLocaleString()}`,
        'Salaries & Sundries': `₨ ${(salTotal + miscTotal).toLocaleString()}`,
        'Report Date': today,
      },
    });
  }

  return (
    <div className="expenses-page">
      <header className="expenses-header">
        <div>
          <h1 className="expenses-title">📊 Operational Expenses</h1>
          <p className="expenses-sub">
            Track overhead costs: factory rent, electricity bills, transport, and factory floor sundries.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <QuickExportCluster onExport={handleExportExpenses} />
          <button className="tax-primary-btn" onClick={() => setShowModal(true)}>
            + Record Expense
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="expenses-stats-grid">
        <div className="expense-stat-card">
          <div className="expense-stat-icon">💵</div>
          <div className="expense-stat-title">Total Filtered</div>
          <div className="expense-stat-amount">₨ {totalAmount.toLocaleString()}</div>
        </div>
        <div className="expense-stat-card">
          <div className="expense-stat-icon">🏢</div>
          <div className="expense-stat-title">Rent</div>
          <div className="expense-stat-amount">₨ {rentTotal.toLocaleString()}</div>
        </div>
        <div className="expense-stat-card">
          <div className="expense-stat-icon">⚡</div>
          <div className="expense-stat-title">Electricity</div>
          <div className="expense-stat-amount">₨ {elecTotal.toLocaleString()}</div>
        </div>
        <div className="expense-stat-card">
          <div className="expense-stat-icon">🚚</div>
          <div className="expense-stat-title">Transport</div>
          <div className="expense-stat-amount">₨ {transTotal.toLocaleString()}</div>
        </div>
        <div className="expense-stat-card">
          <div className="expense-stat-icon">👥</div>
          <div className="expense-stat-title">Salaries</div>
          <div className="expense-stat-amount">₨ {salTotal.toLocaleString()}</div>
        </div>
        <div className="expense-stat-card">
          <div className="expense-stat-icon">📦</div>
          <div className="expense-stat-title">Misc</div>
          <div className="expense-stat-amount">₨ {miscTotal.toLocaleString()}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="expenses-filter-bar">
        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Category:</label>
        <select 
          className="expenses-filter-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as any)}
        >
          <option value="all">All Categories</option>
          <option value="rent">🏢 Rent</option>
          <option value="electricity">⚡ Electricity</option>
          <option value="transport">🚚 Transport</option>
          <option value="salaries">👥 Salaries</option>
          <option value="miscellaneous">📦 Miscellaneous</option>
        </select>

        <label style={{ fontSize: '0.85rem', fontWeight: 600, marginLeft: '0.5rem' }}>From:</label>
        <input 
          type="date"
          className="expenses-filter-input"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>To:</label>
        <input 
          type="date"
          className="expenses-filter-input"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        {(selectedCategory !== 'all' || startDate || endDate) && (
          <button 
            className="tax-action-btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              setSelectedCategory('all');
              setStartDate('');
              setEndDate('');
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Expenses Table */}
      <div className="tax-table-container">
        <table className="tax-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Amount (₨)</th>
              <th>Notes / Remarks</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Loading expenses...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No expenses found for this criteria.</td></tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id}>
                  <td>{exp.expense_date}</td>
                  <td>
                    <span className={`expense-category-pill category-${exp.category}`}>
                      {CATEGORY_LABELS[exp.category]?.icon} {CATEGORY_LABELS[exp.category]?.label}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>₨ {Number(exp.amount).toLocaleString()}</td>
                  <td>{exp.notes || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className="expenses-delete-btn"
                      onClick={() => handleDelete(exp.id)}
                      title="Delete expense"
                    >
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {showModal && (
        <div className="tax-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="tax-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Record Business Expense</h3>
            <form onSubmit={handleCreateExpense}>
              <div className="tax-form-group">
                <label className="tax-form-label">Category *</label>
                <select 
                  className="tax-input"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                >
                  <option value="rent">🏢 Rent</option>
                  <option value="electricity">⚡ Electricity</option>
                  <option value="transport">🚚 Transport</option>
                  <option value="salaries">👥 Salaries</option>
                  <option value="miscellaneous">📦 Miscellaneous</option>
                </select>
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Amount (PKR) *</label>
                <input 
                  type="number" 
                  step="any"
                  className="tax-input" 
                  required
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Date *</label>
                <input 
                  type="date"
                  className="tax-input"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div className="tax-form-group">
                <label className="tax-form-label">Notes / Description</label>
                <textarea 
                  className="tax-input"
                  rows={2}
                  placeholder="e.g. SEP electricity bill paid via jazzcash"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="tax-action-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="tax-primary-btn" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
