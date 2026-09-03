import { supabase } from './supabase';

/* ─── Opening Balances Service ───────────────────────────────────────────── */

// 1. Post Supplier Opening Balance
export async function postSupplierOpeningBalance(payload: {
  supplier_id: string;
  opening_balance_due: number;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.from('fabric_purchases').insert({
    supplier_id: payload.supplier_id,
    invoice_no: 'OPENING-BAL',
    fabric_type: 'washing_wear',
    fabric_name: 'Opening Fabric Stock / Starting Balance',
    quantity_meters: 1,
    unit_cost: payload.opening_balance_due,
    received_date: new Date().toISOString().split('T')[0],
    notes: payload.notes || 'One-time Opening Balance Posting',
  });
  if (error) throw error;
}

// 2. Post Employee Opening Balance / Advance
export async function postEmployeeOpeningBalance(payload: {
  employee_id: string;
  opening_amount: number;
  type: 'due_to_employee' | 'advance_given';
  notes?: string;
}): Promise<void> {
  if (payload.type === 'due_to_employee') {
    // Post as opening earning so remaining balance shows positive (due to employee)
    const { error } = await supabase.rpc('record_employee_earning', {
      p_employee_id: payload.employee_id,
      p_amount: payload.opening_amount,
      p_earning_type: 'salary',
      p_description: payload.notes || 'Opening Wages Balance as of Go-Live',
    });
    if (error) throw error;
  } else {
    // Post as advance payment so remaining balance reflects advance
    const { error } = await supabase.rpc('record_employee_payment', {
      p_employee_id: payload.employee_id,
      p_amount: payload.opening_amount,
      p_payment_type: 'advance',
      p_method: 'cash',
      p_notes: payload.notes || 'Opening Advance Given as of Go-Live',
    });
    if (error) throw error;
  }
}

// 3. Post Customer Opening Balance (Pending Dues)
export async function postCustomerOpeningBalance(payload: {
  customer_id: string;
  opening_dues_amount: number;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('record_customer_sale', {
    p_customer_id: payload.customer_id,
    p_invoice_no: `OPENING-CUST-${Math.floor(1000 + Math.random() * 9000)}`,
    p_total_amount: payload.opening_dues_amount,
    p_notes: payload.notes || 'Opening Dues Balance as of Go-Live',
  });
  if (error) throw error;
}

// 4. Post Opening Fabric Stock on Hand
export async function postOpeningFabricStock(payload: {
  supplier_id: string;
  fabric_name: string;
  fabric_type: 'silk' | 'washing_wear' | 'custom';
  quantity_meters: number;
  unit_cost: number;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('record_fabric_purchase', {
    p_supplier_id: payload.supplier_id,
    p_fabric_name: payload.fabric_name,
    p_fabric_type: payload.fabric_type,
    p_quantity_meters: payload.quantity_meters,
    p_unit_cost: payload.unit_cost,
    p_invoice_no: 'OPENING-STOCK',
    p_notes: payload.notes || 'Opening Fabric Inventory on Hand',
  });
  if (error) throw error;
}
