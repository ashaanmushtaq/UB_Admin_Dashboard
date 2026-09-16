import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { fetchReportsSummary, type ReportsData } from '../lib/finance';
import { formatCurrency } from '../lib/fabric';
import { STAGE_LABELS, STAGE_ICONS, STAGE_COLORS } from '../lib/production';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import './ReportsPage.css';

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);

  useLayoutEffect(() => {
    const update = () => setWidth(Math.max(300, ref.current?.clientWidth ?? 300));
    update();
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

export function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pipelineChart = useChartWidth();

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

  const pipelineData = Object.entries(STAGE_LABELS).map(([stageKey, label]) => ({
    stage: label.replace(/^\d+\.\s*/, ''),
    pieces: data.production_stage_counts[stageKey] || 0,
    color: STAGE_COLORS[stageKey as keyof typeof STAGE_COLORS] || '#38bdf8',
  }));
  const hasPipelineData = pipelineData.some(stage => stage.pieces > 0);

  return (
    <div className="rep-root">
      {/* ── Header ── */}
      <div className="rep-header">
        <div>
          <h1 className="rep-title">📊 Executive Reports & Analytics</h1>
          <p className="rep-subtitle">Sales Volume, Production Pipeline Throughput & Dues Portfolio</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <QuickExportCluster
            onExport={(format) => {
              if (!data) return;
              const today = new Date().toISOString().split('T')[0];
              exportDataset(format, {
                filename: `Executive_Report_${today}`,
                title: 'Executive Operational & Financial Report',
                subtitle: 'Executive Summary of Sales, Pipeline Throughput & Financial Balances',
                headers: ['Metric / KPI Area', 'Current Value', 'Category'],
                rows: [
                  ['Today Sales Volume', formatCurrency(data.sales_today), 'Sales'],
                  ['Weekly Sales Volume', formatCurrency(data.sales_this_week), 'Sales'],
                  ['Customer Dues (Receivables)', formatCurrency(data.total_customer_dues), 'Receivables'],
                  ['Supplier Dues (Payables)', formatCurrency(data.total_supplier_dues), 'Payables'],
                  ['Total Garments in Pipeline', `${data.total_pieces_in_pipeline} pieces`, 'Production'],
                  ...Object.entries(STAGE_LABELS).map(([k, label]) => [
                    `Stage: ${label}`,
                    `${data.production_stage_counts[k] || 0} pcs`,
                    'Production Stage',
                  ]),
                ],
                summaryStats: {
                  'Today Sales': formatCurrency(data.sales_today),
                  'Weekly Sales': formatCurrency(data.sales_this_week),
                  'Total Outstanding Receivables': formatCurrency(data.total_customer_dues),
                  'Total Supplier Payables': formatCurrency(data.total_supplier_dues),
                  'Pipeline Total Output': `${data.total_pieces_in_pipeline} pcs`,
                },
              });
            }}
          />
          <button className="rep-btn rep-btn--secondary" onClick={loadReports}>
            🔄 Refresh Metrics
          </button>
        </div>
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
        <div className="rep-chart-wrap" ref={pipelineChart.ref} aria-label="Production pipeline chart">
          {hasPipelineData ? (
            <BarChart width={pipelineChart.width} height={280} data={pipelineData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="stage" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
                <Tooltip contentStyle={{ background: '#1a2540', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#f1f5f9' }} />
                <Bar dataKey="pieces" name="Pieces" radius={[4, 4, 0, 0]}>
                  {pipelineData.map(stage => <Cell key={stage.stage} fill={stage.color} />)}
                </Bar>
            </BarChart>
          ) : (
            <div className="rep-chart-empty">No data available for this period.</div>
          )}
        </div>
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
