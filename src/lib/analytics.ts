import { supabase } from './supabase';

// ─── Helpers ───────────────────────────────────────────────────────────────

export type DatePreset = '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export function presetToRange(preset: DatePreset, customRange?: DateRange): DateRange {
  const today = new Date();
  const toStr = today.toISOString().split('T')[0];
  if (preset === 'custom' && customRange) return customRange;
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const from = new Date(today);
  from.setDate(from.getDate() - days + 1);
  return { from: from.toISOString().split('T')[0], to: toStr };
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

// ─── Per-Tenant Analytics ─────────────────────────────────────────────────

export interface SalesTrendPoint {
  date: string;    // YYYY-MM-DD
  sales: number;   // Rs total sales amount
  payments: number; // Rs customer payments received
}

/**
 * Daily sales (invoices) and customer payment amounts in a date range.
 * Returns every day in [from..to] — days with no activity get 0s.
 */
export async function fetchSalesTrend(range: DateRange): Promise<SalesTrendPoint[]> {
  const [salesRes, paymentsRes] = await Promise.all([
    supabase
      .from('customer_sales')
      .select('sale_date, total_amount')
      .gte('sale_date', range.from)
      .lte('sale_date', range.to),
    supabase
      .from('customer_payments')
      .select('payment_date, amount')
      .gte('payment_date', range.from)
      .lte('payment_date', range.to),
  ]);

  if (salesRes.error) throw salesRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  // Build day map from `from` to `to`
  const dayMap: Record<string, SalesTrendPoint> = {};
  const cur = new Date(range.from);
  const end = new Date(range.to);
  while (cur <= end) {
    const d = isoDate(cur);
    dayMap[d] = { date: d, sales: 0, payments: 0 };
    cur.setDate(cur.getDate() + 1);
  }

  (salesRes.data ?? []).forEach(r => {
    const d = r.sale_date.slice(0, 10);
    if (dayMap[d]) dayMap[d].sales += Number(r.total_amount) || 0;
  });

  (paymentsRes.data ?? []).forEach(r => {
    const d = r.payment_date.slice(0, 10);
    if (dayMap[d]) dayMap[d].payments += Number(r.amount) || 0;
  });

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Top Customers by Sales ────────────────────────────────────────────────

export interface TopCustomerPoint {
  customer_id: string;
  name: string;
  total_sales: number;
  total_paid: number;
  balance_due: number;
}

/**
 * Top N customers by gross sales in the date range.
 */
export async function fetchTopCustomers(range: DateRange, limit = 8): Promise<TopCustomerPoint[]> {
  // Fetch sales in range grouped by customer
  const { data: salesData, error: salesErr } = await supabase
    .from('customer_sales')
    .select('customer_id, total_amount')
    .gte('sale_date', range.from)
    .lte('sale_date', range.to);

  if (salesErr) throw salesErr;

  // Aggregate by customer
  const byCustomer: Record<string, number> = {};
  (salesData ?? []).forEach(r => {
    const id = r.customer_id;
    byCustomer[id] = (byCustomer[id] || 0) + (Number(r.total_amount) || 0);
  });

  // Get top N customer IDs
  const topIds = Object.entries(byCustomer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topIds.length === 0) return [];

  // Fetch payments in range for these customers
  const { data: payData, error: payErr } = await supabase
    .from('customer_payments')
    .select('customer_id, amount')
    .in('customer_id', topIds)
    .gte('payment_date', range.from)
    .lte('payment_date', range.to);

  if (payErr) throw payErr;

  const payByCustomer: Record<string, number> = {};
  (payData ?? []).forEach(r => {
    payByCustomer[r.customer_id] = (payByCustomer[r.customer_id] || 0) + (Number(r.amount) || 0);
  });

  // Fetch customer names
  const { data: custData, error: custErr } = await supabase
    .from('customers')
    .select('id, name, shop_name')
    .in('id', topIds);

  if (custErr) throw custErr;

  const nameMap: Record<string, string> = {};
  (custData ?? []).forEach(c => {
    nameMap[c.id] = c.shop_name || c.name;
  });

  return topIds.map(id => {
    const total_sales = byCustomer[id] || 0;
    const total_paid = payByCustomer[id] || 0;
    return {
      customer_id: id,
      name: nameMap[id] || 'Unknown',
      total_sales,
      total_paid,
      balance_due: Math.max(0, total_sales - total_paid),
    };
  });
}

// ─── Dues Portfolio ────────────────────────────────────────────────────────

export interface DuesPortfolio {
  customer_dues: number;
  supplier_dues: number;
  employee_dues: number;
}

export async function fetchDuesPortfolio(range: DateRange): Promise<DuesPortfolio> {
  const [salesRes, customerPaymentsRes, purchasesRes, supplierPaymentsRes, earningsRes, employeePaymentsRes] = await Promise.all([
    supabase.from('customer_sales').select('total_amount').gte('sale_date', range.from).lte('sale_date', range.to),
    supabase.from('customer_payments').select('amount').gte('payment_date', range.from).lte('payment_date', range.to),
    supabase.from('fabric_purchases').select('total_cost').gte('received_date', range.from).lte('received_date', range.to),
    supabase.from('supplier_payments').select('amount').gte('payment_date', range.from).lte('payment_date', range.to),
    supabase.from('employee_earnings').select('amount').gte('earning_date', range.from).lte('earning_date', range.to),
    supabase.from('employee_payments').select('amount').gte('payment_date', range.from).lte('payment_date', range.to),
  ]);

  const responses = [salesRes, customerPaymentsRes, purchasesRes, supplierPaymentsRes, earningsRes, employeePaymentsRes];
  const failed = responses.find(response => response.error);
  if (failed?.error) throw failed.error;

  const sum = (rows: Array<{ amount?: number | string; total_amount?: number | string; total_cost?: number | string }> | null) =>
    (rows ?? []).reduce((total, row) => total + Number(row.amount ?? row.total_amount ?? row.total_cost ?? 0), 0);

  return {
    customer_dues: Math.max(0, sum(salesRes.data) - sum(customerPaymentsRes.data)),
    supplier_dues: Math.max(0, sum(purchasesRes.data) - sum(supplierPaymentsRes.data)),
    employee_dues: Math.max(0, sum(earningsRes.data) - sum(employeePaymentsRes.data)),
  };
}

// ─── Super Admin Analytics ────────────────────────────────────────────────

export interface TenantGrowthPoint {
  month: string;  // e.g. "Sep 2026"
  monthKey: string; // YYYY-MM for sort
  total: number;
  premium: number;
  trial: number;
}

export type TenantStatusFilter = 'all' | 'active' | 'suspended' | 'expired';

export interface TenantStatusBreakdown {
  active: number;
  suspended: number;
  expired: number;
  total: number;
}

/**
 * Monthly tenant signup counts in a date range (for super admin growth chart).
 * Uses tenant created_at date.
 */
export async function fetchTenantGrowth(range: DateRange): Promise<TenantGrowthPoint[]> {
  const { data, error } = await supabase
    .from('tenants')
    .select('created_at, plan_type')
    .gte('created_at', range.from + 'T00:00:00Z')
    .lte('created_at', range.to + 'T23:59:59Z')
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Group by month
  const monthMap: Record<string, TenantGrowthPoint> = {};
  (data ?? []).forEach(t => {
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'short', year: 'numeric' });
    if (!monthMap[key]) monthMap[key] = { month: label, monthKey: key, total: 0, premium: 0, trial: 0 };
    monthMap[key].total++;
    if (t.plan_type === 'premium') monthMap[key].premium++;
    else monthMap[key].trial++;
  });

  return Object.values(monthMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/**
 * Current tenant status breakdown — counts per status.
 * filter: 'all' | 'active' | 'suspended' | 'expired'
 */
export async function fetchTenantStatusBreakdown(filter: TenantStatusFilter = 'all'): Promise<TenantStatusBreakdown> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('tenants')
    .select('subscription_status, subscription_end_date');

  if (error) throw error;

  let active = 0, suspended = 0, expired = 0;
  (data ?? []).forEach(t => {
    if (t.subscription_status === 'suspended') { suspended++; return; }
    if (new Date(t.subscription_end_date) <= new Date(now)) { expired++; return; }
    active++;
  });

  if (filter === 'all') return { active, suspended, expired, total: active + suspended + expired };

  const selectedCount = filter === 'active' ? active : filter === 'suspended' ? suspended : expired;
  return {
    active: filter === 'active' ? active : 0,
    suspended: filter === 'suspended' ? suspended : 0,
    expired: filter === 'expired' ? expired : 0,
    total: selectedCount,
  };
}
