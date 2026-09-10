import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  fetchSalesTrend,
  fetchTopCustomers,
  fetchDuesPortfolio,
  presetToRange,
  type DatePreset,
  type DateRange,
  type SalesTrendPoint,
  type TopCustomerPoint,
  type DuesPortfolio,
} from '../lib/analytics';
import './AnalyticsPage.css';

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatRs(n: number) {
  if (n >= 1_000_000) return `Rs. ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `Rs. ${(n / 1_000).toFixed(0)}K`;
  return `Rs. ${n.toLocaleString('en-PK')}`;
}

function fmtLabel(date: string) {
  // Shorten: "2026-09-01" → "Sep 1"
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleString('default', { month: 'short', day: 'numeric' });
}

const PRESET_LABELS: Record<DatePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom range',
};

const TOP_CUSTOMER_COLORS = [
  '#4f8ef7', '#a78bfa', '#34d399', '#fbbf24',
  '#f472b6', '#38bdf8', '#fb923c', '#6ee7b7',
];

// ─── Date Range Filter Controls ────────────────────────────────────────────

interface DateRangeFilterProps {
  preset: DatePreset;
  customRange: DateRange;
  onPresetChange: (p: DatePreset) => void;
  onCustomChange: (r: DateRange) => void;
}

function DateRangeFilter({ preset, customRange, onPresetChange, onCustomChange }: DateRangeFilterProps) {
  return (
    <div className="an-filter-row">
      <div className="an-preset-tabs" role="group" aria-label="Date range preset">
        {(['7d', '30d', '90d', 'custom'] as DatePreset[]).map(p => (
          <button
            key={p}
            id={`filter-preset-${p}`}
            className={`an-preset-btn${preset === p ? ' an-preset-btn--active' : ''}`}
            onClick={() => onPresetChange(p)}
            type="button"
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="an-custom-range">
          <input
            id="filter-custom-from"
            className="an-date-input"
            type="date"
            value={customRange.from}
            max={customRange.to}
            onChange={e => onCustomChange({ ...customRange, from: e.target.value })}
            aria-label="Start date"
          />
          <span className="an-range-sep">→</span>
          <input
            id="filter-custom-to"
            className="an-date-input"
            type="date"
            value={customRange.to}
            min={customRange.from}
            onChange={e => onCustomChange({ ...customRange, to: e.target.value })}
            aria-label="End date"
          />
        </div>
      )}
    </div>
  );
}

// ─── Custom Recharts Tooltip ───────────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="an-tooltip">
      <div className="an-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="an-tooltip-row">
          <span className="an-tooltip-dot" style={{ background: p.color }} />
          <span className="an-tooltip-name">{p.name}:</span>
          <span className="an-tooltip-val">{formatRs(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Sales Trend Chart ─────────────────────────────────────────────────────

function SalesTrendChart() {
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [customRange, setCustomRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [data, setData] = useState<SalesTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = presetToRange(preset, customRange);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSalesTrend(range);
      setData(res);
    } catch (e: any) {
      setError(e.message || 'Failed to load sales trend');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const totalSales = data.reduce((s, d) => s + d.sales, 0);
  const totalReceived = data.reduce((s, d) => s + d.payments, 0);

  // Trim label density for 90d to avoid crowding
  const displayData = preset === '90d'
    ? data.filter((_, i) => i % 5 === 0 || i === data.length - 1)
    : data;

  return (
    <div className="an-chart-card">
      <div className="an-chart-header">
        <div>
          <h2 className="an-chart-title">📈 Sales Trend</h2>
          <p className="an-chart-sub">Daily invoiced sales vs. customer payments received</p>
        </div>
        <div className="an-chart-summary">
          <span className="an-sum-item an-sum--sales">
            <span className="an-sum-dot" style={{ background: '#4f8ef7' }} />
            Sales: <strong>{formatRs(totalSales)}</strong>
          </span>
          <span className="an-sum-item an-sum--payments">
            <span className="an-sum-dot" style={{ background: '#34d399' }} />
            Received: <strong>{formatRs(totalReceived)}</strong>
          </span>
        </div>
      </div>

      <DateRangeFilter
        preset={preset}
        customRange={customRange}
        onPresetChange={p => setPreset(p)}
        onCustomChange={r => { setCustomRange(r); }}
      />

      <div className="an-chart-area">
        {loading ? (
          <div className="an-chart-loading"><span className="an-spinner" /> Loading chart data…</div>
        ) : error ? (
          <div className="an-chart-error">⚠ {error}</div>
        ) : data.length === 0 ? (
          <div className="an-chart-empty">No sales data in this date range.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={displayData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f8ef7" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPayments" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtLabel}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => formatRs(v)}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip content={<CurrencyTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8', paddingTop: 8 }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                name="Sales"
                stroke="#4f8ef7"
                strokeWidth={2}
                fill="url(#gradSales)"
                dot={false}
                activeDot={{ r: 4, fill: '#4f8ef7' }}
              />
              <Area
                type="monotone"
                dataKey="payments"
                name="Payments Received"
                stroke="#34d399"
                strokeWidth={2}
                fill="url(#gradPayments)"
                dot={false}
                activeDot={{ r: 4, fill: '#34d399' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Top Customers Chart ───────────────────────────────────────────────────

function TopCustomersChart() {
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [customRange, setCustomRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
  const [data, setData] = useState<TopCustomerPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = presetToRange(preset, customRange);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTopCustomers(range, 8);
      setData(res);
    } catch (e: any) {
      setError(e.message || 'Failed to load top customers');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  // Truncate long names for X-axis
  const displayData = data.map(d => ({
    ...d,
    shortName: d.name.length > 12 ? d.name.slice(0, 11) + '…' : d.name,
  }));

  return (
    <div className="an-chart-card">
      <div className="an-chart-header">
        <div>
          <h2 className="an-chart-title">🏆 Top Customers</h2>
          <p className="an-chart-sub">Highest-grossing customers by sales in the period</p>
        </div>
      </div>

      <DateRangeFilter
        preset={preset}
        customRange={customRange}
        onPresetChange={p => setPreset(p)}
        onCustomChange={r => setCustomRange(r)}
      />

      <div className="an-chart-area">
        {loading ? (
          <div className="an-chart-loading"><span className="an-spinner" /> Loading…</div>
        ) : error ? (
          <div className="an-chart-error">⚠ {error}</div>
        ) : data.length === 0 ? (
          <div className="an-chart-empty">No sales recorded in this date range.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={displayData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => formatRs(v)}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as TopCustomerPoint & { shortName: string };
                  return (
                    <div className="an-tooltip">
                      <div className="an-tooltip-label">{d.name}</div>
                      <div className="an-tooltip-row">
                        <span className="an-tooltip-dot" style={{ background: '#4f8ef7' }} />
                        <span className="an-tooltip-name">Sales:</span>
                        <span className="an-tooltip-val">{formatRs(d.total_sales)}</span>
                      </div>
                      <div className="an-tooltip-row">
                        <span className="an-tooltip-dot" style={{ background: '#34d399' }} />
                        <span className="an-tooltip-name">Paid:</span>
                        <span className="an-tooltip-val">{formatRs(d.total_paid)}</span>
                      </div>
                      <div className="an-tooltip-row">
                        <span className="an-tooltip-dot" style={{ background: '#f87171' }} />
                        <span className="an-tooltip-name">Balance due:</span>
                        <span className="an-tooltip-val">{formatRs(d.balance_due)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#94a3b8', paddingTop: 8 }} />
              <Bar dataKey="total_sales" name="Sales" radius={[4, 4, 0, 0]}>
                {displayData.map((_, i) => (
                  <Cell key={i} fill={TOP_CUSTOMER_COLORS[i % TOP_CUSTOMER_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table below chart for exact figures */}
      {!loading && !error && data.length > 0 && (
        <div className="an-top-table-wrap">
          <table className="an-top-table" aria-label="Top customers breakdown">
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th className="an-num">Sales</th>
                <th className="an-num">Received</th>
                <th className="an-num">Balance Due</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => (
                <tr key={c.customer_id}>
                  <td className="an-rank">{i + 1}</td>
                  <td>{c.name}</td>
                  <td className="an-num" style={{ color: '#93c5fd' }}>{formatRs(c.total_sales)}</td>
                  <td className="an-num" style={{ color: '#6ee7b7' }}>{formatRs(c.total_paid)}</td>
                  <td className="an-num" style={{ color: c.balance_due > 0 ? '#fca5a5' : '#6ee7b7' }}>
                    {formatRs(c.balance_due)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Dues Portfolio Cards ──────────────────────────────────────────────────

function DuesPortfolioCard() {
  const [data, setData] = useState<DuesPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDuesPortfolio()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="an-chart-card">
      <div className="an-chart-header">
        <div>
          <h2 className="an-chart-title">💼 Outstanding Dues Portfolio</h2>
          <p className="an-chart-sub">All-time running balances — money owed to and from the shop</p>
        </div>
      </div>

      {loading ? (
        <div className="an-chart-loading"><span className="an-spinner" /> Loading dues…</div>
      ) : error ? (
        <div className="an-chart-error">⚠ {error}</div>
      ) : data ? (
        <div className="an-dues-grid">
          <div className="an-dues-card an-dues--receivable">
            <div className="an-dues-icon">📥</div>
            <div className="an-dues-body">
              <div className="an-dues-label">Customer Dues (Receivables)</div>
              <div className="an-dues-sub">Money owed to shop by buyers</div>
              <div className="an-dues-val an-val--green">{formatRs(data.customer_dues)}</div>
            </div>
          </div>
          <div className="an-dues-card an-dues--payable">
            <div className="an-dues-icon">🧵</div>
            <div className="an-dues-body">
              <div className="an-dues-label">Supplier Dues (Payables)</div>
              <div className="an-dues-sub">Fabric procurement debt</div>
              <div className="an-dues-val an-val--red">{formatRs(data.supplier_dues)}</div>
            </div>
          </div>
          <div className="an-dues-card an-dues--payable">
            <div className="an-dues-icon">👷</div>
            <div className="an-dues-body">
              <div className="an-dues-label">Employee Wages Due</div>
              <div className="an-dues-sub">Earned wages pending payout</div>
              <div className="an-dues-val an-val--amber">{formatRs(data.employee_dues)}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Main Analytics Page ───────────────────────────────────────────────────

export function AnalyticsPage() {
  return (
    <div className="an-root">
      <div className="an-page-header">
        <div>
          <h1 className="an-page-title">📊 Analytics &amp; Insights</h1>
          <p className="an-page-sub">Sales trends, top customers, and financial overview — filterable by date range</p>
        </div>
      </div>

      <SalesTrendChart />
      <TopCustomersChart />
      <DuesPortfolioCard />
    </div>
  );
}

export default AnalyticsPage;
