/**
 * pushSender.ts
 *
 * Dispatches push notification events to the Supabase Edge Function `notify-worker`.
 * All calls are non-blocking: failure to send a push notification must NEVER
 * abort the primary business transaction (advancing stages or recording payments).
 */

import { supabase } from './supabase';

export interface WorkAssignmentNotificationPayload {
  order_id: string;
  next_stage: string;
  assigned_employee_id?: string;
  quantity_in?: number;
}

export interface PaymentNotificationPayload {
  payment_id: string;
  employee_id?: string;
  amount?: number;
}

/**
 * Notify the assigned worker that new work has entered their stage.
 * Fires asynchronously and silently skips if no employee is assigned
 * or if push sending fails.
 */
export async function notifyWorkAssignment(
  payload: WorkAssignmentNotificationPayload,
): Promise<void> {
  if (!payload.assigned_employee_id) return;

  try {
    const { data, error } = await supabase.functions.invoke('notify-worker', {
      body: {
        type: 'work_assignment',
        order_id: payload.order_id,
        stage: payload.next_stage,
        assigned_employee_id: payload.assigned_employee_id,
        quantity_in: payload.quantity_in,
      },
    });

    if (error) {
      console.warn('[pushSender] notifyWorkAssignment function error:', error.message);
    } else {
      console.info('[pushSender] notifyWorkAssignment response:', data);
    }
  } catch (err) {
    console.warn('[pushSender] Unexpected error dispatching assignment push:', err);
  }
}

/**
 * Notify the employee that a payment/advance has been recorded.
 * Fires asynchronously and silently skips if push sending fails.
 */
export async function notifyEmployeePayment(
  payload: PaymentNotificationPayload,
): Promise<void> {
  if (!payload.payment_id) return;

  try {
    const { data, error } = await supabase.functions.invoke('notify-worker', {
      body: {
        type: 'employee_payment',
        payment_id: payload.payment_id,
        employee_id: payload.employee_id,
        amount: payload.amount,
      },
    });

    if (error) {
      console.warn('[pushSender] notifyEmployeePayment function error:', error.message);
    } else {
      console.info('[pushSender] notifyEmployeePayment response:', data);
    }
  } catch (err) {
    console.warn('[pushSender] Unexpected error dispatching payment push:', err);
  }
}

/**
 * Notify the owner that work has transitioned between workers.
 */
export async function notifyStageHandoff(payload: {
  order_id: string;
  stage: string;
  handed_off_by_name?: string;
  handed_off_to_name?: string;
  order_number?: string;
  tenant_id?: string;
}): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('notify-worker', {
      body: {
        type: 'stage_handoff',
        order_id: payload.order_id,
        stage: payload.stage,
        handed_off_by_name: payload.handed_off_by_name,
        handed_off_to_name: payload.handed_off_to_name,
        order_number: payload.order_number,
        tenant_id: payload.tenant_id,
      },
    });

    if (error) {
      console.warn('[pushSender] notifyStageHandoff function error:', error.message);
    } else {
      console.info('[pushSender] notifyStageHandoff response:', data);
    }
  } catch (err) {
    console.warn('[pushSender] Unexpected error dispatching handoff push:', err);
  }
}

/**
 * Notify the owner and drivers that an order is ready for dispatch.
 */
export async function notifyDispatchReady(payload: {
  order_id: string;
  order_number?: string;
  quantity?: number;
  suit_type?: string;
  tenant_id?: string;
}): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('notify-worker', {
      body: {
        type: 'dispatch_ready',
        order_id: payload.order_id,
        order_number: payload.order_number,
        quantity: payload.quantity,
        suit_type: payload.suit_type,
        tenant_id: payload.tenant_id,
      },
    });

    if (error) {
      console.warn('[pushSender] notifyDispatchReady function error:', error.message);
    } else {
      console.info('[pushSender] notifyDispatchReady response:', data);
    }
  } catch (err) {
    console.warn('[pushSender] Unexpected error dispatching dispatch ready push:', err);
  }
}
