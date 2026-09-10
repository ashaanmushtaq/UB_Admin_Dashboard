import { supabase } from './supabase';
import type { PaymentMethod } from './fabric';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type EmploymentType = 'monthly' | 'piece_rate' | 'daily_wage';
export type EarningType = 'salary' | 'piece_rate' | 'overtime' | 'bonus' | 'allowance';
export type PaymentType = 'salary_payout' | 'advance' | 'piece_rate_payout' | 'bonus_payout' | 'reimbursement';

export type EmployeeRole =
  | 'helper' | 'cutting_master' | 'tailor' | 'iron_presser'
  | 'packing_staff' | 'kaj_overlock_staff' | 'driver' | 'shop_staff' | 'owner';

export interface Employee {
  id: string;
  tenant_id: string;
  user_id: string | null;
  full_name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string | null;
  cnic_id: string | null;
  address: string | null;
  employment_type: EmploymentType;
  base_rate: number;
  joining_date: string;
  is_active: boolean;
  created_at: string;
}

export interface EmployeeBalance {
  employee_id: string;
  tenant_id: string;
  user_id: string | null;
  full_name: string;
  role: EmployeeRole;
  phone: string | null;
  employment_type: EmploymentType;
  base_rate: number;
  total_earned: number;
  total_paid: number;
  remaining_balance: number;
}

export interface EmployeeLedgerEntry {
  transaction_id: string;
  tenant_id: string;
  employee_id: string;
  transaction_date: string;
  entry_type: 'earning' | 'payment';
  description: string;
  reference_no: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  created_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  recipient_profile_id: string | null;
  recipient_employee_id: string | null;
  title: string;
  message: string;
  type: string;
  channel: string;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ─── Employee CRUD ──────────────────────────────────────────────────────── */

export async function fetchEmployeeBalances(): Promise<EmployeeBalance[]> {
  const { data, error } = await supabase
    .from('v_employee_balances')
    .select('*')
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as EmployeeBalance[];
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as Employee[];
}

export async function addEmployee(payload: {
  full_name: string;
  role: EmployeeRole;
  employment_type: EmploymentType;
  base_rate: number;
  phone?: string;
  email?: string;
  cnic_id?: string;
  joining_date?: string;
}): Promise<Employee> {
  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Employee;
}

export async function createStaffUserAccount(payload: {
  email: string;
  password?: string;
  full_name: string;
  role: EmployeeRole;
}): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password || 'Garments123!',
    options: {
      data: {
        full_name: payload.full_name,
        role: payload.role,
      },
    },
  });
  if (error) throw error;
}

/* ─── Employee Earnings ──────────────────────────────────────────────────── */

export async function recordEmployeeEarning(payload: {
  employee_id: string;
  amount: number;
  earning_type: EarningType;
  quantity_completed?: number;
  rate_per_unit?: number;
  earning_date?: string;
  description?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_employee_earning', {
    p_employee_id: payload.employee_id,
    p_amount: payload.amount,
    p_earning_type: payload.earning_type,
    p_quantity_completed: payload.quantity_completed ?? 1,
    p_rate_per_unit: payload.rate_per_unit ?? null,
    p_earning_date: payload.earning_date ?? null,
    p_description: payload.description ?? null,
  });
  if (error) throw error;
  return data as string;
}

/* ─── Employee Payments ──────────────────────────────────────────────────── */

export async function recordEmployeePayment(payload: {
  employee_id: string;
  amount: number;
  payment_type: PaymentType;
  method: PaymentMethod;
  reference_no?: string;
  payment_date?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_employee_payment', {
    p_employee_id: payload.employee_id,
    p_amount: payload.amount,
    p_payment_type: payload.payment_type,
    p_method: payload.method,
    p_reference_no: payload.reference_no ?? null,
    p_payment_date: payload.payment_date ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

/* ─── Ledger ─────────────────────────────────────────────────────────────── */

export async function fetchEmployeeLedger(employeeId: string): Promise<EmployeeLedgerEntry[]> {
  const { data, error } = await supabase
    .from('v_employee_ledger')
    .select('*')
    .eq('employee_id', employeeId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmployeeLedgerEntry[];
}

/* ─── Notifications ──────────────────────────────────────────────────────── */

export async function fetchNotifications(limit = 20): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

/* ─── Label Maps ─────────────────────────────────────────────────────────── */

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  owner:             'Owner',
  shop_staff:        'Shop Staff',
  cutting_master:    'Cutting Master',
  tailor:            'Tailor',
  iron_presser:      'Iron Presser',
  packing_staff:     'Packing Staff',
  kaj_overlock_staff:'Kaj & Overlock Staff',
  driver:            'Driver',
  helper:            'Helper',
};

export const ROLE_COLORS: Record<EmployeeRole, string> = {
  owner:             '#e8b84b',
  shop_staff:        '#38bdf8',
  cutting_master:    '#a78bfa',
  tailor:            '#34d399',
  iron_presser:      '#fb923c',
  packing_staff:     '#f472b6',
  kaj_overlock_staff:'#60a5fa',
  driver:            '#94a3b8',
  helper:            '#6b7280',
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  monthly:    'Monthly Salary',
  piece_rate: 'Piece Rate',
  daily_wage: 'Daily Wage',
};

export const EARNING_TYPE_LABELS: Record<EarningType, string> = {
  salary:     'Monthly Salary',
  piece_rate: 'Piece Rate',
  overtime:   'Overtime',
  bonus:      'Bonus',
  allowance:  'Allowance',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  salary_payout:    'Salary Payout',
  advance:          'Advance',
  piece_rate_payout:'Piece Rate Payout',
  bonus_payout:     'Bonus Payout',
  reimbursement:    'Reimbursement',
};
