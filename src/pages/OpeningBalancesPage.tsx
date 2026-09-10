import { useState, useEffect, type FormEvent } from 'react';
import {
  postSupplierOpeningBalance, postEmployeeOpeningBalance,
  postCustomerOpeningBalance, postOpeningFabricStock,
} from '../lib/openingBalances';
import { fetchSuppliers, type Supplier } from '../lib/fabric';
import { fetchEmployees, ROLE_LABELS, type Employee } from '../lib/employees';
import { fetchCustomers, type Customer } from '../lib/customers';
import './OpeningBalancesPage.css';

type Tab = 'customers' | 'suppliers' | 'employees' | 'fabric';

export function OpeningBalancesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('customers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Form states
  const [custForm, setCustForm] = useState({ customer_id: '', amount: '', notes: '' });
  const [supForm, setSupForm] = useState({ supplier_id: '', amount: '', notes: '' });
  const [empForm, setEmpForm] = useState({ employee_id: '', amount: '', type: 'due_to_employee' as const, notes: '' });
  const [fabForm, setFabForm] = useState({ supplier_id: '', fabric_name: '', fabric_type: 'washing_wear' as const, quantity_meters: '', unit_cost: '', notes: '' });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [s, e, c] = await Promise.all([
        fetchSuppliers(),
        fetchEmployees(),
        fetchCustomers(),
      ]);
      setSuppliers(s);
      setEmployees(e);
      setCustomers(c);
    } catch (err) {
      console.warn('Load error:', err);
    }
  }

  async function handleCustSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setMessage(null);
    try {
      await postCustomerOpeningBalance({
        customer_id: custForm.customer_id,
        opening_dues_amount: parseFloat(custForm.amount),
        notes: custForm.notes || undefined,
      });
      setMessage({ type: 'success', text: '✅ Customer Opening Dues recorded successfully!' });
      setCustForm({ customer_id: '', amount: '', notes: '' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to post' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSupSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setMessage(null);
    try {
      await postSupplierOpeningBalance({
        supplier_id: supForm.supplier_id,
        opening_balance_due: parseFloat(supForm.amount),
        notes: supForm.notes || undefined,
      });
      setMessage({ type: 'success', text: '✅ Supplier Opening Balance recorded successfully!' });
      setSupForm({ supplier_id: '', amount: '', notes: '' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to post' });
    } finally {
      setLoading(false);
    }
  }

  async function handleEmpSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setMessage(null);
    try {
      await postEmployeeOpeningBalance({
        employee_id: empForm.employee_id,
        opening_amount: parseFloat(empForm.amount),
        type: empForm.type,
        notes: empForm.notes || undefined,
      });
      setMessage({ type: 'success', text: '✅ Employee Opening Balance recorded successfully!' });
      setEmpForm({ employee_id: '', amount: '', type: 'due_to_employee', notes: '' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to post' });
    } finally {
      setLoading(false);
    }
  }

  async function handleFabSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setMessage(null);
    try {
      await postOpeningFabricStock({
        supplier_id: fabForm.supplier_id,
        fabric_name: fabForm.fabric_name.trim(),
        fabric_type: fabForm.fabric_type,
        quantity_meters: parseFloat(fabForm.quantity_meters),
        unit_cost: parseFloat(fabForm.unit_cost),
        notes: fabForm.notes || undefined,
      });
      setMessage({ type: 'success', text: '✅ Opening Fabric Inventory recorded successfully!' });
      setFabForm({ supplier_id: '', fabric_name: '', fabric_type: 'washing_wear', quantity_meters: '', unit_cost: '', notes: '' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to post' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ob-root">
      {/* ── Header ── */}
      <div className="ob-header">
        <div>
          <h1 className="ob-title">📥 Opening Balances & Data Migration</h1>
          <p className="ob-subtitle">One-time posting screen for existing starting balances as of Go-Live date</p>
        </div>
      </div>

      {message && (
        <div className={`ob-alert ob-alert--${message.type}`} role="alert">
          {message.text}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="ob-tabs">
        <button className={`ob-tab${activeTab === 'customers' ? ' ob-tab--active' : ''}`} onClick={() => { setActiveTab('customers'); setMessage(null); }}>
          📒 Customer Opening Dues
        </button>
        <button className={`ob-tab${activeTab === 'suppliers' ? ' ob-tab--active' : ''}`} onClick={() => { setActiveTab('suppliers'); setMessage(null); }}>
          🧵 Supplier Opening Balances
        </button>
        <button className={`ob-tab${activeTab === 'employees' ? ' ob-tab--active' : ''}`} onClick={() => { setActiveTab('employees'); setMessage(null); }}>
          👷 Employee Opening Balances
        </button>
        <button className={`ob-tab${activeTab === 'fabric' ? ' ob-tab--active' : ''}`} onClick={() => { setActiveTab('fabric'); setMessage(null); }}>
          📦 Fabric Stock on Hand
        </button>
      </div>

      {/* ── Tab Forms ── */}
      <div className="ob-card">
        {activeTab === 'customers' && (
          <form id="form-ob-customer" onSubmit={handleCustSubmit}>
            <h2 className="ob-form-title">Post Existing Customer Pending Dues</h2>
            <p className="ob-form-sub">Post the starting balance owed by an existing customer without recreating historical invoices.</p>
            
            <div className="ob-field-grid">
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-c-select" className="ob-label">Customer *</label>
                <select id="ob-c-select" className="ob-input" required value={custForm.customer_id} onChange={e => setCustForm(f => ({ ...f, customer_id: e.target.value }))}>
                  <option value="">— Select Customer —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.company_name || c.city || 'Wholesale'})</option>)}
                </select>
              </div>
              <div className="ob-field">
                <label htmlFor="ob-c-amount" className="ob-label">Starting Pending Dues (PKR) *</label>
                <input id="ob-c-amount" className="ob-input" type="number" min="1" step="1" required value={custForm.amount} onChange={e => setCustForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 125000" />
              </div>
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-c-notes" className="ob-label">Notes (optional)</label>
                <input id="ob-c-notes" className="ob-input" value={custForm.notes} onChange={e => setCustForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Opening balance from previous manual paper ledger" />
              </div>
            </div>
            <button id="submit-ob-customer" type="submit" className="ob-btn ob-btn--primary" disabled={loading || !custForm.customer_id || !custForm.amount}>
              {loading ? 'Posting…' : '✓ Post Customer Opening Dues'}
            </button>
          </form>
        )}

        {activeTab === 'suppliers' && (
          <form id="form-ob-supplier" onSubmit={handleSupSubmit}>
            <h2 className="ob-form-title">Post Existing Supplier Pending Payments</h2>
            <p className="ob-form-sub">Post starting balance owed to a fabric supplier as of today.</p>

            <div className="ob-field-grid">
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-s-select" className="ob-label">Supplier *</label>
                <select id="ob-s-select" className="ob-input" required value={supForm.supplier_id} onChange={e => setSupForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">— Select Supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.company_name || 'Supplier'})</option>)}
                </select>
              </div>
              <div className="ob-field">
                <label htmlFor="ob-s-amount" className="ob-label">Starting Balance Owed (PKR) *</label>
                <input id="ob-s-amount" className="ob-input" type="number" min="1" step="1" required value={supForm.amount} onChange={e => setSupForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 85000" />
              </div>
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-s-notes" className="ob-label">Notes (optional)</label>
                <input id="ob-s-notes" className="ob-input" value={supForm.notes} onChange={e => setSupForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Opening balance from August ledger" />
              </div>
            </div>
            <button id="submit-ob-supplier" type="submit" className="ob-btn ob-btn--primary" disabled={loading || !supForm.supplier_id || !supForm.amount}>
              {loading ? 'Posting…' : '✓ Post Supplier Opening Balance'}
            </button>
          </form>
        )}

        {activeTab === 'employees' && (
          <form id="form-ob-employee" onSubmit={handleEmpSubmit}>
            <h2 className="ob-form-title">Post Existing Employee Starting Wages / Advances</h2>
            <p className="ob-form-sub">Post starting wage balance owed to worker OR starting salary advance given.</p>

            <div className="ob-field-grid">
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-e-select" className="ob-label">Employee *</label>
                <select id="ob-e-select" className="ob-input" required value={empForm.employee_id} onChange={e => setEmpForm(f => ({ ...f, employee_id: e.target.value }))}>
                  <option value="">— Select Employee —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({ROLE_LABELS[e.role]})</option>)}
                </select>
              </div>
              <div className="ob-field">
                <label htmlFor="ob-e-type" className="ob-label">Balance Type *</label>
                <select id="ob-e-type" className="ob-input" value={empForm.type} onChange={e => setEmpForm(f => ({ ...f, type: e.target.value as any }))}>
                  <option value="due_to_employee">Wages Owed to Employee (Earned)</option>
                  <option value="advance_given">Advance Paid to Employee</option>
                </select>
              </div>
              <div className="ob-field">
                <label htmlFor="ob-e-amount" className="ob-label">Amount (PKR) *</label>
                <input id="ob-e-amount" className="ob-input" type="number" min="1" step="1" required value={empForm.amount} onChange={e => setEmpForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 15000" />
              </div>
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-e-notes" className="ob-label">Notes (optional)</label>
                <input id="ob-e-notes" className="ob-input" value={empForm.notes} onChange={e => setEmpForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Pre-existing salary advance" />
              </div>
            </div>
            <button id="submit-ob-employee" type="submit" className="ob-btn ob-btn--primary" disabled={loading || !empForm.employee_id || !empForm.amount}>
              {loading ? 'Posting…' : '✓ Post Employee Opening Balance'}
            </button>
          </form>
        )}

        {activeTab === 'fabric' && (
          <form id="form-ob-fabric" onSubmit={handleFabSubmit}>
            <h2 className="ob-form-title">Post Opening Fabric Inventory Stock on Hand</h2>
            <p className="ob-form-sub">Record existing fabric suit rolls currently in store warehouse.</p>

            <div className="ob-field-grid">
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-f-sup" className="ob-label">Supplier Batch Origin *</label>
                <select id="ob-f-sup" className="ob-input" required value={fabForm.supplier_id} onChange={e => setFabForm(f => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">— Select Supplier Origin —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="ob-field">
                <label htmlFor="ob-f-name" className="ob-label">Fabric Name *</label>
                <input id="ob-f-name" className="ob-input" required value={fabForm.fabric_name} onChange={e => setFabForm(f => ({ ...f, fabric_name: e.target.value }))} placeholder="e.g. Wash & Wear Navy Suit Fabric" />
              </div>
              <div className="ob-field">
                <label htmlFor="ob-f-type" className="ob-label">Fabric Type *</label>
                <select id="ob-f-type" className="ob-input" value={fabForm.fabric_type} onChange={e => setFabForm(f => ({ ...f, fabric_type: e.target.value as any }))}>
                  <option value="washing_wear">Washing Wear</option>
                  <option value="silk">Silk</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="ob-field">
                <label htmlFor="ob-f-qty" className="ob-label">Quantity (meters) *</label>
                <input id="ob-f-qty" className="ob-input" type="number" step="0.1" min="0.1" required value={fabForm.quantity_meters} onChange={e => setFabForm(f => ({ ...f, quantity_meters: e.target.value }))} placeholder="e.g. 150" />
              </div>
              <div className="ob-field">
                <label htmlFor="ob-f-cost" className="ob-label">Unit Cost (PKR/m) *</label>
                <input id="ob-f-cost" className="ob-input" type="number" min="0" step="1" required value={fabForm.unit_cost} onChange={e => setFabForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="e.g. 450" />
              </div>
              <div className="ob-field ob-field--full">
                <label htmlFor="ob-f-notes" className="ob-label">Notes (optional)</label>
                <input id="ob-f-notes" className="ob-input" value={fabForm.notes} onChange={e => setFabForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Existing warehouse stock as of Go-Live" />
              </div>
            </div>
            <button id="submit-ob-fabric" type="submit" className="ob-btn ob-btn--primary" disabled={loading || !fabForm.supplier_id || !fabForm.fabric_name || !fabForm.quantity_meters || !fabForm.unit_cost}>
              {loading ? 'Posting…' : '✓ Record Opening Fabric Inventory'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
