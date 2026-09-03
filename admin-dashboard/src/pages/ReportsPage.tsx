import { useState, useEffect } from 'react';
import { fetchReportsSummary, type ReportsData } from '../lib/finance';
import { formatCurrency } from '../lib/fabric';
import { STAGE_LABELS, STAGE_ICONS, STAGE_COLORS } from '../lib/production';
import './ReportsPage.css';

export function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    setError('');
    try {
      const res = await fetchReportsSummary();
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load reports summary');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="rep-loading"><span className="rep-spinner" /> Loading reports dashboard…</div>;
  }

  if (error || !data) {
    return <div className="rep-error" role="alert">⚠️ {error || 'Reports data unavailable'}</div>;
  }

  return (
    <div className="rep-root">
      {/* ── Header ── */}
      <div className="rep-header">
        <div>
          <h1 className="rep-title">📊 Executive Reports & Analytics</h1>
          <p className="rep-subtitle">Sales Volume, Production Pipeline Throughput & Dues Portfolio</p>
        </div>
        <button className="rep-btn rep-btn--secondary" onClick={loadReports}>
          🔄 Refresh Metrics
        </button>
      </div>

      {/* ── Sales Performance Row ── */}
      <div className="rep-section">
        <h2 className="rep-section-title">📈 Sales Performance & Revenue</h2>
        <div className="rep-stats-grid">
          <div className="rep-stat-card rep-stat-card--sales">
            <div className="rep-stat-label">Sales Volume Today</div>
            <div className="rep-stat-val rep-val--blue">{formatCurrency(data.sales_today)}</div>
            <div className="rep-stat-sub">Real-time daily sales total</div>
          </div>

          <div className="rep-stat-card rep-stat-card--sales">
            <div className="rep-stat-label">Sales Volume (Last 7 Days)</div>
            <div className="rep-stat-val rep-val--purple">{formatCurrency(data.sales_this_week)}</div>
            <div className="rep-stat-sub">Weekly wholesale revenue total</div>
          </div>
        </div>
      </div>

      {/* ── Production Stage Throughput ── */}
      <div className="rep-section">
        <h2 className="rep-section-title">⚙️ Production Stage Throughput (Pieces in Pipeline)</h2>
        <div className="rep-stage-grid">
          {Object.entries(STAGE_LABELS).map(([stageKey, label]) => {
            const count = data.production_stage_counts[stageKey] || 0;
            const icon = STAGE_ICONS[stageKey as keyof typeof STAGE_ICONS] || '⚙️';
            const color = STAGE_COLORS[stageKey as keyof typeof STAGE_COLORS] || '#38bdf8';
            return (
              <div key={stageKey} className="rep-stage-card" style={{ borderTopColor: color }}>
                <div className="rep-stage-top">
                  <span className="rep-stage-icon">{icon}</span>
                  <span className="rep-stage-count" style={{ color }}>{count} pcs</span>
                </div>
                <div className="rep-stage-name">{label.replace(/^\d+\.\s*/, '')}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Outstanding Balances Portfolio ── */}
      <div className="rep-section">
        <h2 className="rep-section-title">💼 Outstanding Balances & Liabilities Portfolio</h2>
        <div className="rep-dues-grid">
          <div className="rep-dues-card rep-dues-card--rec">
            <div className="rep-dues-header">
              <span className="rep-dues-icon">📥</span>
              <div>
                <div className="rep-dues-title">Customer Dues (Receivables)</div>
                <div className="rep-dues-sub">Money owed to shop by buyers</div>
              </div>
            </div>
            <div className="rep-dues-val rep-val--green">{formatCurrency(data.total_customer_dues)}</div>
          </div>

          <div className="rep-dues-card rep-dues-card--pay">
            <div className="rep-dues-header">
              <span className="rep-dues-icon">🧵</span>
              <div>
                <div className="rep-dues-title">Supplier Dues (Payables)</div>
                <div className="rep-dues-sub">Money owed to fabric suppliers</div>
              </div>
            </div>
            <div className="rep-dues-val rep-val--red">{formatCurrency(data.total_supplier_dues)}</div>
          </div>

          <div className="rep-dues-card rep-dues-card--pay">
            <div className="rep-dues-header">
              <span className="rep-dues-icon">👷</span>
              <div>
                <div className="rep-dues-title">Employee Wages Due</div>
                <div className="rep-dues-sub">Earned wages pending payout</div>
              </div>
            </div>
            <div className="rep-dues-val rep-val--amber">{formatCurrency(data.total_employee_dues)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
