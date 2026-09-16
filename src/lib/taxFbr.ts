import { supabase } from './supabase';

export interface TaxInvoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  customer_name: string;
  customer_ntn: string | null;
  sale_id: string | null;
  taxable_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  issued_at: string;
  status: 'draft' | 'issued' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export interface TaxReturn {
  id: string;
  tenant_id: string;
  period_label: string;
  total_sales: number;
  total_tax_collected: number;
  total_tax_paid: number;
  net_payable: number;
  filed_at: string | null;
  notes: string | null;
  created_at: string;
}

export async function fetchTaxInvoices(): Promise<TaxInvoice[]> {
  const { data, error } = await supabase
    .from('tax_invoices')
    .select('*')
    .order('issued_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TaxInvoice[];
}

export async function createTaxInvoice(payload: {
  customer_name: string;
  customer_ntn?: string;
  taxable_amount: number;
  tax_rate?: number;
  notes?: string;
}): Promise<TaxInvoice> {
  const rate = payload.tax_rate ?? 17.0;
  const taxable = Number(payload.taxable_amount) || 0;
  const tax = Math.round((taxable * (rate / 100)) * 100) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

  const { data, error } = await supabase
    .from('tax_invoices')
    .insert({
      invoice_number: invoiceNumber,
      customer_name: payload.customer_name,
      customer_ntn: payload.customer_ntn || null,
      taxable_amount: taxable,
      tax_rate: rate,
      tax_amount: tax,
      total_amount: total,
      status: 'issued',
      notes: payload.notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TaxInvoice;
}

export async function fetchTaxReturns(): Promise<TaxReturn[]> {
  const { data, error } = await supabase
    .from('tax_returns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TaxReturn[];
}

export async function createTaxReturn(payload: {
  period_label: string;
  total_sales: number;
  total_tax_collected: number;
  total_tax_paid: number;
  filed_at?: string;
  notes?: string;
}): Promise<TaxReturn> {
  const sales = Number(payload.total_sales) || 0;
  const collected = Number(payload.total_tax_collected) || 0;
  const paid = Number(payload.total_tax_paid) || 0;
  const net = Math.round((collected - paid) * 100) / 100;

  const { data, error } = await supabase
    .from('tax_returns')
    .insert({
      period_label: payload.period_label,
      total_sales: sales,
      total_tax_collected: collected,
      total_tax_paid: paid,
      net_payable: net,
      filed_at: payload.filed_at || new Date().toISOString().split('T')[0],
      notes: payload.notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TaxReturn;
}
