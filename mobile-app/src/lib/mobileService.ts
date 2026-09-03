import { supabase } from './supabase';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type StaffRole =
  | 'cutting_master'
  | 'tailor'
  | 'iron_presser'
  | 'packing_staff'
  | 'kaj_overlock_staff'
  | 'driver'
  | 'shop_staff'
  | 'owner';

export type ProductionStage =
  | 'order_received'
  | 'cutting'
  | 'tailoring'
  | 'ironing'
  | 'kaj_overlock'
  | 'packing'
  | 'ready_for_dispatch'
  | 'delivered';

export interface MobileOrderTask {
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  suit_type: string;
  total_quantity: number;
  current_stage: ProductionStage;
  is_urgent: boolean;
  target_delivery_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface StaffAttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
}

export interface EmployeeBalanceStatement {
  employee_id: string;
  full_name: string;
  role: string;
  employment_type: string;
  total_earned: number;
  total_paid: number;
  remaining_balance: number;
}

/* ─── Role to Stage Mapping ────────────────────────────────────────────── */

export const ROLE_STAGE_MAP: Partial<Record<StaffRole, ProductionStage>> = {
  cutting_master:    'cutting',
  tailor:            'tailoring',
  iron_presser:      'ironing',
  kaj_overlock_staff:'kaj_overlock',
  packing_staff:     'packing',
  driver:            'ready_for_dispatch',
};

/* ─── Service Functions ────────────────────────────────────────────────── */

// Fetch orders filtered by the staff member's role stage
export async function fetchStageOrdersForRole(role: StaffRole): Promise<MobileOrderTask[]> {
  const targetStage = ROLE_STAGE_MAP[role] || 'cutting';
  
  const { data, error } = await supabase
    .from('v_production_order_summaries')
    .select('*')
    .eq('current_stage', targetStage)
    .order('is_urgent', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MobileOrderTask[];
}

// Fetch orders for Driver (ready_for_dispatch + delivered)
export async function fetchDriverOrders(): Promise<MobileOrderTask[]> {
  const { data, error } = await supabase
    .from('v_production_order_summaries')
    .select('*')
    .in('current_stage', ['ready_for_dispatch', 'delivered'])
    .order('is_urgent', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as MobileOrderTask[];
}

// Advance Order Stage from Mobile
export async function advanceMobileOrderStage(
  orderId: string,
  nextStage: ProductionStage,
  employeeId?: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc('advance_order_stage', {
    p_order_id: orderId,
    p_next_stage: nextStage,
    p_assigned_employee_id: employeeId ?? null,
    p_notes: notes ? `${notes} (via Staff Mobile App)` : 'Via Staff Mobile App',
  });
  if (error) throw error;
}

// Clock In RPC
export async function clockInStaff(employeeId: string, notes?: string): Promise<string> {
  const { data, error } = await supabase.rpc('clock_in_staff', {
    p_employee_id: employeeId,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

// Clock Out RPC
export async function clockOutStaff(attendanceId: string): Promise<void> {
  const { error } = await supabase.rpc('clock_out_staff', {
    p_attendance_id: attendanceId,
  });
  if (error) throw error;
}

// Fetch Attendance Status for Today
export async function fetchTodayAttendance(employeeId: string): Promise<StaffAttendanceRecord | null> {
  const todayStr = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('staff_attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('attendance_date', todayStr)
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as StaffAttendanceRecord | null;
}

// Fetch Read-Only Employee Balance Statement
export async function fetchMyEmployeeBalance(employeeId?: string): Promise<EmployeeBalanceStatement | null> {
  let query = supabase.from('v_employee_balances').select('*');
  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return null;
  return data as EmployeeBalanceStatement | null;
}
