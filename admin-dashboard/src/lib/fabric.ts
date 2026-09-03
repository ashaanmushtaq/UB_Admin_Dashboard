import { supabase } from './supabase';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type PaymentMethod = 'cash' | 'cheque' | 'bank_transfer' | 'jazzcash' | 'easypaisa';
export type FabricType = 'silk' | 'washing_wear' | 'custom';

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  ntn_tax_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SupplierBalance {
  supplier_id: string;
  tenant_id: string;
  supplier_name: string;
  company_name: string | null;
  phone: string | null;
  total_purchased_amount: number;
  total_paid_amount: number;
  current_balance_due: number;
}

export interface FabricPurchase {
  id: string;
  tenant_id: string;
  supplier_id: string;
  invoice_no: string | null;
  fabric_type: FabricType;
  fabric_name: string;
  quantity_meters: number;
  unit_cost: number;
  total_cost: number;
  received_date: string;
  notes: string | null;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  tenant_id: string;
  supplier_id: string;
  purchase_id: string | null;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
}

export interface LedgerEntry {
  transaction_id: string;
  tenant_id: string;
  supplier_id: string;
  transaction_date: string;
  entry_type: 'fabric_purchase' | 'supplier_payment';
  description: string;
  reference_no: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  created_at: string;
}

export interface FabricPurchaseSummary {
  purchase_id: string;
  tenant_id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_no: string | null;
  fabric_type: FabricType;
  fabric_name: string;
  quantity_meters: number;
  unit_cost: number;
  total_cost: number;
  total_paid: number;
  remaining_balance: number;
  received_date: string;
  created_at: string;
}

/* ─── Supplier CRUD ──────────────────────────────────────────────────────── */

export async function fetchSupplierBalances(): Promise<SupplierBalance[]> {
  const { data, error } = await supabase
    .from('v_supplier_balances')
    .select('*')
    .order('supplier_name');
  if (error) throw error;
  return (data ?? []) as SupplierBalance[];
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function addSupplier(payload: {
  name: string;
  company_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  ntn_tax_id?: string;
}): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Supplier;
}

/* ─── Fabric Purchases ───────────────────────────────────────────────────── */

export async function fetchFabricPurchaseSummaries(
  supplierId: string
): Promise<FabricPurchaseSummary[]> {
  const { data, error } = await supabase
    .from('v_fabric_purchase_summaries')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('received_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FabricPurchaseSummary[];
}

export async function recordFabricPurchase(payload: {
  supplier_id: string;
  fabric_name: string;
  fabric_type: FabricType;
  quantity_meters: number;
  unit_cost: number;
  invoice_no?: string;
  received_date?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_fabric_purchase', {
    p_supplier_id: payload.supplier_id,
    p_fabric_name: payload.fabric_name,
    p_fabric_type: payload.fabric_type,
    p_quantity_meters: payload.quantity_meters,
    p_unit_cost: payload.unit_cost,
    p_invoice_no: payload.invoice_no ?? null,
    p_received_date: payload.received_date ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

/* ─── Supplier Payments ──────────────────────────────────────────────────── */

export async function recordSupplierPayment(payload: {
  supplier_id: string;
  amount: number;
  method: PaymentMethod;
  purchase_id?: string;
  reference_no?: string;
  payment_date?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_supplier_payment', {
    p_supplier_id: payload.supplier_id,
    p_amount: payload.amount,
    p_method: payload.method,
    p_purchase_id: payload.purchase_id ?? null,
    p_reference_no: payload.reference_no ?? null,
    p_payment_date: payload.payment_date ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

/* ─── Ledger ─────────────────────────────────────────────────────────────── */

export async function fetchSupplierLedger(supplierId: string): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('v_supplier_ledger')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LedgerEntry[];
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  bank_transfer: 'Bank Transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
};

export const FABRIC_TYPE_LABELS: Record<FabricType, string> = {
  silk: 'Silk',
  washing_wear: 'Washing Wear',
  custom: 'Custom',
};
