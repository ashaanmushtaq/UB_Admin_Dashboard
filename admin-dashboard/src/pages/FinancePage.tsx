import { useState, useEffect } from 'react';
import { fetchFinanceOverview, type MoneyFlowSummary } from '../lib/finance';
import { PAYMENT_METHOD_LABELS, formatCurrency, type PaymentMethod } from '../lib/fabric';
import './FinancePage.css';

export function FinancePage() {
  const [summary, setSummary] = useState<MoneyFlowSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFinance();
  }, []);

  async function loadFinance() {
    setLoading(true);
    setError('');
    try {
      const res = await fetchFinanceOverview();
      setSummary(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load finance overview');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="fin-loading"><span className="fin-spinner" /> Loading financial data…</div>;
  }

  if (error || !summary) {
    return <div className="fin-error" role="alert">⚠️ {error || 'Financial data unavailable'}</div>;
  }

  const isProfitable = summary.net_cash_flow >= 0;

  return (
    <div className="fin-root">
      {/* ── Header ── */}
      <div className="fin-header">
        <div>
          <h1 className="fin-title">💰 Financial Overview & P&L Summary</h1>
          <p className="fin-subtitle">Money In vs Money Out, Payment Method Breakdown & Net Cash Flow</p>
        </div>
        <button className="fin-btn fin-btn--secondary" onClick={loadFinance}>
          🔄 Refresh Data
        </button>
      </div>

      {/* ── Top Summary Cards ── */}
      <div className="fin-summary-cards">
        <div className="fin-card fin-card--in">
          <div className="fin-card-label">Total Money Received (In)</div>
          <div className="fin-card-value fin-val--green">{formatCurrency(summary.total_money_in)}</div>
          <div className="fin-card-sub">Customer Wholesale Payments</div>
        </div>

        <div className="fin-card fin-card--out">
          <div className="fin-card-label">Total Money Paid (Out)</div>
          <div className="fin-card-value fin-val--red">{formatCurrency(summary.total_money_out)}</div>
          <div className="fin-card-sub">Fabric Purchases + Employee Payouts</div>
        </div>

        <div className={`fin-card ${isProfitable ? 'fin-card--profit' : 'fin-card--loss'}`}>
          <div className="fin-card-label">Net Cash Flow (P&L)</div>
          <div className={`fin-card-value ${isProfitable ? 'fin-val--green' : 'fin-val--red'}`}>
            {isProfitable ? '+' : ''}{formatCurrency(summary.net_cash_flow)}
          </div>
          <div className="fin-card-sub">
            {isProfitable ? '📈 Positive Net Profit Position' : '📉 Net Deficit Position'}
          </div>
        </div>
      </div>

      {/* ── Payout Expenses Breakdown ── */}
      <div className="fin-section">
        <h2 className="fin-section-title">💸 Payout Expenses Breakdown</h2>
        <div className="fin-breakdown-grid">
          <div className="fin-breakdown-card">
            <div className="fin-breakdown-icon">🧵</div>
            <div className="fin-breakdown-body">
              <div className="fin-breakdown-label">Fabric Procurement Payments</div>
              <div className="fin-breakdown-val">{formatCurrency(summary.fabric_payouts)}</div>
            </div>
          </div>
          <div className="fin-breakdown-card">
            <div className="fin-breakdown-icon">👷</div>
            <div className="fin-breakdown-body">
              <div className="fin-breakdown-label">Employee Payroll & Advances</div>
              <div className="fin-breakdown-val">{formatCurrency(summary.employee_payouts)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment Method Matrix Table ── */}
      <div className="fin-section">
        <h2 className="fin-section-title">💳 Cash Flow by Payment Method</h2>
        <div className="fin-table-wrap">
          <table className="fin-table" aria-label="Payment method breakdown">
            <thead>
              <tr>
                <th>Payment Method</th>
                <th className="fin-num">Money In (PKR)</th>
                <th className="fin-num">Money Out (PKR)</th>
                <th className="fin-num">Net Position (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(summary.by_method) as PaymentMethod[]).map(method => {
                const data = summary.by_method[method];
                const net = data.in - data.out;
                return (
                  <tr key={method}>
                    <td>
                      <strong>{PAYMENT_METHOD_LABELS[method]}</strong>
                    </td>
                    <td className="fin-num fin-val--green">
                      {data.in > 0 ? formatCurrency(data.in) : '—'}
                    </td>
                    <td className="fin-num fin-val--red">
                      {data.out > 0 ? formatCurrency(data.out) : '—'}
                    </td>
                    <td className={`fin-num ${net >= 0 ? 'fin-val--green' : 'fin-val--red'}`}>
                      <strong>{net >= 0 ? '+' : ''}{formatCurrency(net)}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
