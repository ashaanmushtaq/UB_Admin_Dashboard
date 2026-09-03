import { supabase } from './supabase';
import type { PaymentMethod } from './fabric';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  company_name: string | null;
  shop_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  ntn_tax_id: string | null;
  credit_limit: number;
  is_active: boolean;
  created_at: string;
}

export interface CustomerBalance {
  customer_id: string;
  tenant_id: string;
  customer_name: string;
  company_name: string | null;
  shop_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  credit_limit: number;
  total_sales_amount: number;
  total_paid_amount: number;
  current_balance_due: number;
}

export interface CustomerSale {
  id: string;
  tenant_id: string;
  customer_id: string;
  production_order_id: string | null;
  invoice_no: string;
  sale_date: string;
  due_date: string | null;
  total_amount: number;
  notes: string | null;
  created_at: string;
}

export interface CustomerPayment {
  id: string;
  tenant_id: string;
  customer_id: string;
  sale_id: string | null;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerLedgerEntry {
  transaction_id: string;
  tenant_id: string;
  customer_id: string;
  transaction_date: string;
  entry_type: 'sale' | 'payment';
  description: string;
  reference_no: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  created_at: string;
}

/* ─── Service API Functions ─────────────────────────────────────────────── */

export async function fetchCustomerBalances(): Promise<CustomerBalance[]> {
  const { data, error } = await supabase
    .from('v_customer_balances')
    .select('*')
    .order('customer_name');
  if (error) throw error;
  return (data ?? []) as CustomerBalance[];
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function addCustomer(payload: {
  name: string;
  company_name?: string;
  shop_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  credit_limit?: number;
}): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function fetchCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
  const { data, error } = await supabase
    .from('v_customer_ledger')
    .select('*')
    .eq('customer_id', customerId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerLedgerEntry[];
}

export async function recordCustomerSale(payload: {
  customer_id: string;
  invoice_no: string;
  total_amount: number;
  production_order_id?: string;
  due_date?: string;
  sale_date?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_customer_sale', {
    p_customer_id: payload.customer_id,
    p_invoice_no: payload.invoice_no,
    p_total_amount: payload.total_amount,
    p_production_order_id: payload.production_order_id ?? null,
    p_due_date: payload.due_date ?? null,
    p_sale_date: payload.sale_date ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

/* ─── Payment Plans / Settlement Schedules ──────────────────────────────── */

export type PaymentPlanStatus = 'planned' | 'received' | 'overdue' | 'cancelled';

export interface CustomerPaymentPlan {
  id: string;
  tenant_id: string;
  customer_id: string;
  sale_id: string | null;
  invoice_no: string;
  installment_no: number;
  total_installments: number;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  payment_method: PaymentMethod;
  cheque_no: string | null;
  cheque_clearing_date: string | null;
  status: PaymentPlanStatus;
  received_at: string | null;
  payment_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchCustomerPaymentPlans(customerId: string): Promise<CustomerPaymentPlan[]> {
  const { data, error } = await supabase
    .from('customer_payment_plans')
    .select('*')
    .eq('customer_id', customerId)
    .order('due_date', { ascending: true })
    .order('installment_no', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomerPaymentPlan[];
}

export async function fetchAllPendingPaymentPlans(): Promise<CustomerPaymentPlan[]> {
  const { data, error } = await supabase
    .from('customer_payment_plans')
    .select('*')
    .in('status', ['planned', 'overdue'])
    .order('due_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomerPaymentPlan[];
}

export async function markPaymentPlanReceived(
  planId: string,
  amountReceived: number,
  method: PaymentMethod,
  referenceNo?: string,
): Promise<void> {
  const { data: plan, error: planErr } = await supabase
    .from('customer_payment_plans')
    .select('*')
    .eq('id', planId)
    .single();
  if (planErr || !plan) throw planErr ?? new Error('Plan not found');

  const { data: paymentId, error: payErr } = await supabase.rpc('record_customer_payment', {
    p_customer_id: plan.customer_id,
    p_amount: amountReceived,
    p_method: method,
    p_sale_id: plan.sale_id ?? null,
    p_reference_no: referenceNo ?? plan.cheque_no ?? null,
    p_notes: `Installment #${plan.installment_no} received (Invoice #${plan.invoice_no})`,
  });
  if (payErr) throw payErr;

  const newAmountPaid = Number(plan.amount_paid ?? 0) + amountReceived;
  const isFullyPaid = newAmountPaid >= Number(plan.amount_due);

  const { error: updateErr } = await supabase
    .from('customer_payment_plans')
    .update({
      amount_paid: newAmountPaid,
      status: isFullyPaid ? 'received' : 'planned',
      received_at: new Date().toISOString(),
      payment_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);
  if (updateErr) throw updateErr;
}

export async function cancelPaymentPlan(planId: string): Promise<void> {
  const { error } = await supabase
    .from('customer_payment_plans')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) throw error;
}

export async function recordCustomerPayment(payload: {
  customer_id: string;
  amount: number;
  method: PaymentMethod;
  sale_id?: string;
  reference_no?: string;
  payment_date?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_customer_payment', {
    p_customer_id: payload.customer_id,
    p_amount: payload.amount,
    p_method: payload.method,
    p_sale_id: payload.sale_id ?? null,
    p_reference_no: payload.reference_no ?? null,
    p_payment_date: payload.payment_date ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}
