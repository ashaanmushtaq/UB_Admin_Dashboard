import { supabase } from './supabase';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type ProductionStage =
  | 'order_received'
  | 'cutting'
  | 'tailoring'
  | 'ironing'
  | 'kaj_overlock'
  | 'packing'
  | 'ready_for_dispatch'
  | 'delivered';

export interface ProductionOrderSummary {
  order_id: string;
  tenant_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string | null;
  suit_type: string;
  total_quantity: number;
  current_stage: ProductionStage;
  is_urgent: boolean;
  target_delivery_date: string | null;
  notes: string | null;
  total_meters_used: number;
  created_at: string;
  updated_at: string;
}

export interface OrderStageHistory {
  log_id: string;
  tenant_id: string;
  order_id: string;
  stage: ProductionStage;
  assigned_employee_id: string | null;
  assigned_employee_name: string | null;
  assigned_employee_role: string | null;
  started_at: string;
  completed_at: string | null;
  quantity_in: number;
  quantity_completed: number;
  quantity_pending: number;
  notes: string | null;
  created_at: string;
}

export interface OrderFabricUsage {
  link_id: string;
  tenant_id: string;
  order_id: string;
  fabric_purchase_id: string;
  fabric_name: string;
  fabric_type: string;
  supplier_name: string;
  invoice_no: string | null;
  meters_used: number;
  notes: string | null;
  created_at: string;
}

/* ─── Stage Helpers & Constants ────────────────────────────────────────── */

export const PRODUCTION_STAGES: ProductionStage[] = [
  'order_received',
  'cutting',
  'tailoring',
  'ironing',
  'kaj_overlock',
  'packing',
  'ready_for_dispatch',
  'delivered',
];

export const STAGE_LABELS: Record<ProductionStage, string> = {
  order_received:     '1. Order Received',
  cutting:            '2. Cutting Stage',
  tailoring:          '3. Tailoring Stage',
  ironing:            '4. Ironing & Press',
  kaj_overlock:       '5. Kaj & Overlock',
  packing:            '6. Packing Stage',
  ready_for_dispatch: '7. Ready for Dispatch',
  delivered:          '8. Delivered',
};

export const STAGE_ICONS: Record<ProductionStage, string> = {
  order_received:     '📋',
  cutting:            '✂️',
  tailoring:          '🪡',
  ironing:            '👔',
  kaj_overlock:       '🧵',
  packing:            '📦',
  ready_for_dispatch: '🚚',
  delivered:          '✅',
};

export const STAGE_COLORS: Record<ProductionStage, string> = {
  order_received:     '#38bdf8',
  cutting:            '#a78bfa',
  tailoring:          '#34d399',
  ironing:            '#fb923c',
  kaj_overlock:       '#60a5fa',
  packing:            '#f472b6',
  ready_for_dispatch: '#e8b84b',
  delivered:          '#10b981',
};

/* ─── API Service Functions ─────────────────────────────────────────────── */

export async function fetchProductionOrders(): Promise<ProductionOrderSummary[]> {
  const { data, error } = await supabase
    .from('v_production_order_summaries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProductionOrderSummary[];
}

export async function fetchOrderStageHistory(orderId: string): Promise<OrderStageHistory[]> {
  const { data, error } = await supabase
    .from('v_order_stage_history')
    .select('*')
    .eq('order_id', orderId)
    .order('started_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrderStageHistory[];
}

export async function fetchOrderFabricUsage(orderId: string): Promise<OrderFabricUsage[]> {
  const { data, error } = await supabase
    .from('v_order_fabric_usage')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderFabricUsage[];
}

export async function createProductionOrder(payload: {
  order_number: string;
  customer_name: string;
  customer_phone?: string;
  suit_type?: string;
  total_quantity: number;
  is_urgent?: boolean;
  target_delivery_date?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_production_order', {
    p_order_number: payload.order_number,
    p_customer_name: payload.customer_name,
    p_customer_phone: payload.customer_phone ?? null,
    p_suit_type: payload.suit_type ?? '2-Piece Suit',
    p_total_quantity: payload.total_quantity,
    p_is_urgent: payload.is_urgent ?? false,
    p_target_delivery_date: payload.target_delivery_date ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function advanceOrderStage(payload: {
  order_id: string;
  next_stage: ProductionStage;
  assigned_employee_id?: string;
  quantity_in?: number;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('advance_order_stage', {
    p_order_id: payload.order_id,
    p_next_stage: payload.next_stage,
    p_assigned_employee_id: payload.assigned_employee_id ?? null,
    p_quantity_in: payload.quantity_in ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function linkOrderFabric(payload: {
  order_id: string;
  fabric_purchase_id: string;
  meters_used: number;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('link_order_fabric', {
    p_order_id: payload.order_id,
    p_fabric_purchase_id: payload.fabric_purchase_id,
    p_meters_used: payload.meters_used,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}
