import { supabase } from './supabase';
import type { PaymentMethod } from './fabric';

export interface MoneyFlowSummary {
  total_money_in: number;
  total_money_out: number;
  net_cash_flow: number;
  by_method: Record<PaymentMethod, { in: number; out: number }>;
  fabric_payouts: number;
  employee_payouts: number;
}

export interface ReportsData {
  sales_today: number;
  sales_this_week: number;
  production_stage_counts: Record<string, number>;
  total_pieces_in_pipeline: number;
  total_customer_dues: number;
  total_supplier_dues: number;
  total_employee_dues: number;
}

export interface SystemNotification {
  id: string;
  tenant_id: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ─── Finance Overview ─────────────────────────────────────────────────── */

export async function fetchFinanceOverview(): Promise<MoneyFlowSummary> {
  const [custPayRes, supPayRes, empPayRes] = await Promise.all([
    supabase.from('customer_payments').select('amount, method'),
    supabase.from('supplier_payments').select('amount, method'),
    supabase.from('employee_payments').select('amount, method'),
  ]);

  if (custPayRes.error) throw custPayRes.error;
  if (supPayRes.error) throw supPayRes.error;
  if (empPayRes.error) throw empPayRes.error;

  const custPayments = custPayRes.data || [];
  const supPayments = supPayRes.data || [];
  const empPayments = empPayRes.data || [];

  let total_money_in = 0;
  let fabric_payouts = 0;
  let employee_payouts = 0;

  const by_method: Record<PaymentMethod, { in: number; out: number }> = {
    cash: { in: 0, out: 0 },
    cheque: { in: 0, out: 0 },
    bank_transfer: { in: 0, out: 0 },
    jazzcash: { in: 0, out: 0 },
    easypaisa: { in: 0, out: 0 },
  };

  custPayments.forEach(p => {
    const amt = Number(p.amount) || 0;
    total_money_in += amt;
    const m = (p.method as PaymentMethod) || 'cash';
    if (by_method[m]) by_method[m].in += amt;
  });

  supPayments.forEach(p => {
    const amt = Number(p.amount) || 0;
    fabric_payouts += amt;
    const m = (p.method as PaymentMethod) || 'cash';
    if (by_method[m]) by_method[m].out += amt;
  });

  empPayments.forEach(p => {
    const amt = Number(p.amount) || 0;
    employee_payouts += amt;
    const m = (p.method as PaymentMethod) || 'cash';
    if (by_method[m]) by_method[m].out += amt;
  });

  const total_money_out = fabric_payouts + employee_payouts;
  const net_cash_flow = total_money_in - total_money_out;

  return {
    total_money_in,
    total_money_out,
    net_cash_flow,
    by_method,
    fabric_payouts,
    employee_payouts,
  };
}

/* ─── Reports Summary ──────────────────────────────────────────────────── */

export async function fetchReportsSummary(): Promise<ReportsData> {
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Start of week (7 days ago)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  const [salesTodayRes, salesWeekRes, prodRes, custBalRes, supBalRes, empBalRes] = await Promise.all([
    supabase.from('customer_sales').select('total_amount').gte('sale_date', todayStr),
    supabase.from('customer_sales').select('total_amount').gte('sale_date', weekAgoStr),
    supabase.from('v_production_order_summaries').select('current_stage, total_quantity'),
    supabase.from('v_customer_balances').select('current_balance_due'),
    supabase.from('v_supplier_balances').select('current_balance_due'),
    supabase.from('v_employee_balances').select('remaining_balance'),
  ]);

  if (salesTodayRes.error) console.error('Error fetching today sales:', salesTodayRes.error);
  if (salesWeekRes.error) console.error('Error fetching weekly sales:', salesWeekRes.error);
  if (prodRes.error) console.error('Error fetching production summaries:', prodRes.error);
  if (custBalRes.error) console.error('Error fetching customer balances:', custBalRes.error);
  if (supBalRes.error) console.error('Error fetching supplier balances:', supBalRes.error);
  if (empBalRes.error) console.error('Error fetching employee balances:', empBalRes.error);

  const sales_today = (salesTodayRes.data || []).reduce((s, x) => s + (Number(x.total_amount) || 0), 0);
  const sales_this_week = (salesWeekRes.data || []).reduce((s, x) => s + (Number(x.total_amount) || 0), 0);

  const production_stage_counts: Record<string, number> = {};
  let total_pieces_in_pipeline = 0;
  (prodRes.data || []).forEach(o => {
    const stage = o.current_stage;
    const qty = Number(o.total_quantity) || 0;
    if (stage) {
      production_stage_counts[stage] = (production_stage_counts[stage] || 0) + qty;
    }
    total_pieces_in_pipeline += qty;
  });

  const total_customer_dues = (custBalRes.data || []).reduce((s, x) => s + Math.max(0, Number(x.current_balance_due) || 0), 0);
  const total_supplier_dues = (supBalRes.data || []).reduce((s, x) => s + Math.max(0, Number(x.current_balance_due) || 0), 0);
  const total_employee_dues = (empBalRes.data || []).reduce((s, x) => s + Math.max(0, Number(x.remaining_balance) || 0), 0);

  return {
    sales_today,
    sales_this_week,
    production_stage_counts,
    total_pieces_in_pipeline,
    total_customer_dues,
    total_supplier_dues,
    total_employee_dues,
  };
}

/* ─── Notifications Inbox ───────────────────────────────────────────────── */

export async function fetchSystemNotifications(): Promise<SystemNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SystemNotification[];
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);
  if (error) throw error;
}
