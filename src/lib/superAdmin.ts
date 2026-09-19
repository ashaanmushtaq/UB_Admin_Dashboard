import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'cheque' | 'other';

export interface TenantPayment {
  id: string;
  tenant_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
}

export interface TenantRow {
  id: string;
  name: string;
  display_name: string;
  slug: string;
  company_name: string;
  plan_type: 'trial' | 'premium';
  subscription_status: 'active' | 'suspended' | 'expired';
  subscription_start_date: string;
  subscription_end_date: string;
  is_effective_active: boolean;
  created_at: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  total_paid: number;
  latest_payment_date: string | null;
}

export interface UpdateTenantPayload {
  tenant_id: string;
  name?: string;
  display_name?: string;
  company_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
  plan_type?: 'trial' | 'premium';
  subscription_status?: 'active' | 'suspended' | 'expired';
  subscription_start_date?: string;
  subscription_end_date?: string;
  is_active?: boolean;
  owner_id?: string;
  owner_full_name?: string;
  owner_phone?: string;
  owner_email?: string;
  owner_password?: string;
}

export interface UpdateTenantResult {
  success: boolean;
  tenant: {
    id: string;
    name: string;
    display_name: string;
    slug: string;
    company_name: string;
    plan_type: string;
    subscription_status: string;
    subscription_start_date: string;
    subscription_end_date: string;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    notes?: string | null;
    is_active: boolean;
  };
  owner?: {
    id: string;
    email?: string;
    full_name?: string;
    phone?: string | null;
    role?: string;
  } | null;
}

export interface CreateTenantPayload {
  name: string;
  owner_email: string;
  owner_password: string;
  owner_full_name: string;
  owner_phone: string;
  address: string;
  city?: string;
  notes?: string;
  plan_type: 'trial' | 'premium';
  payment_amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  payment_reference?: string;
  payment_notes?: string;
}

export interface CreateTenantResult {
  success: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan_type: string;
    subscription_status: string;
    subscription_end_date: string;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    notes?: string | null;
  };
  owner: {
    id: string;
    email: string;
    full_name: string;
    phone?: string | null;
    role: string;
  };
  payment?: TenantPayment;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch all tenants on the platform. Requires super_admin session.
 */
export async function listAllTenants(): Promise<TenantRow[]> {
  const { data, error } = await supabase.rpc('admin_list_tenants');
  if (error) throw new Error(error.message);
  return (data ?? []) as TenantRow[];
}

/**
 * Fetch payment history for a tenant. Requires super_admin session.
 */
export async function listTenantPayments(tenantId: string): Promise<TenantPayment[]> {
  const { data, error } = await supabase.rpc('admin_get_tenant_payments', {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TenantPayment[];
}

/**
 * Record a subscription or renewal payment for a tenant.
 */
export async function recordTenantPayment(payload: {
  tenant_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_no?: string;
  notes?: string;
}): Promise<TenantPayment> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('tenant_payments')
    .insert({
      tenant_id: payload.tenant_id,
      amount: payload.amount,
      payment_method: payload.payment_method,
      payment_date: payload.payment_date,
      reference_no: payload.reference_no || null,
      notes: payload.notes || null,
      recorded_by: userData.user?.id || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as TenantPayment;
}

/**
 * Suspend or reactivate a tenant.
 * @param tenantId - target tenant UUID
 * @param status   - 'suspended' | 'active'
 * @param extendDays - optional: extend subscription by N days (for renewals)
 */
export async function updateTenantSubscription(
  tenantId: string,
  status: 'active' | 'suspended' | 'expired',
  extendDays?: number,
): Promise<{ success: boolean; name: string; status: string; end_date: string }> {
  const { data, error } = await supabase.rpc('admin_update_tenant_subscription', {
    p_tenant_id: tenantId,
    p_status: status,
    p_extend_days: extendDays ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { success: boolean; name: string; status: string; end_date: string };
}

/**
 * Create a new tenant by calling the provision-tenant Edge Function.
 * The Edge Function verifies the super_admin JWT, creates tenant + auth user +
 * profile atomically with rollback on failure.
 */
export async function createTenant(payload: CreateTenantPayload): Promise<CreateTenantResult> {
  const { data, error } = await supabase.functions.invoke('provision-tenant', {
    body: payload,
  });

  if (error) {
    let errorMsg = error.message;
    if ('context' in error && (error as any).context) {
      try {
        const body = await (error as any).context.json();
        if (body?.error) errorMsg = body.error;
      } catch (_) {}
    }
    throw new Error(errorMsg);
  }

  return data as CreateTenantResult;
}

/**
 * Update an existing tenant's fields and/or owner credentials.
 * Calls the admin-update-tenant Edge Function with super_admin JWT verification.
 */
export async function updateTenant(payload: UpdateTenantPayload): Promise<UpdateTenantResult> {
  const { data, error } = await supabase.functions.invoke('admin-update-tenant', {
    body: payload,
  });

  if (error) {
    let errorMsg = error.message;
    if ('context' in error && (error as any).context) {
      try {
        const body = await (error as any).context.json();
        if (body?.error) errorMsg = body.error;
      } catch (_) {}
    }
    throw new Error(errorMsg);
  }

  return data as UpdateTenantResult;
}

export interface TenantUser {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  is_active: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  created_at: string;
}

export interface SecurityAuditLogRow {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  actor_id: string;
  actor_email: string;
  actor_role: string;
  target_user_id: string;
  target_user_email: string | null;
  target_user_name: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * List users under a tenant or across the entire platform.
 */
export async function adminListTenantUsers(tenantId?: string): Promise<TenantUser[]> {
  const { data, error } = await supabase.rpc('admin_list_tenant_users', {
    p_tenant_id: tenantId || null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TenantUser[];
}

/**
 * Reset any user's password across any tenant. Privileged super_admin call.
 */
export async function adminResetUserPassword(payload: {
  targetUserId: string;
  newPassword: string;
}): Promise<{ success: boolean; message: string; target_user: { id: string; email: string; full_name: string; role: string } }> {
  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: {
      target_user_id: payload.targetUserId,
      new_password: payload.newPassword,
    },
  });

  if (error) {
    let errorMsg = error.message;
    if ('context' in error && (error as any).context) {
      try {
        const body = await (error as any).context.json();
        if (body?.error) errorMsg = body.error;
      } catch (_) {}
    }
    throw new Error(errorMsg || 'Failed to reset user password');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * Fetch platform-wide or tenant-scoped security audit logs.
 */
export async function fetchSuperAdminAuditLogs(limit: number = 50): Promise<SecurityAuditLogRow[]> {
  const { data, error } = await supabase.rpc('get_security_audit_logs', {
    p_limit: limit,
  });
  if (error) {
    console.warn('Failed to load audit logs:', error.message);
    return [];
  }
  return (data ?? []) as SecurityAuditLogRow[];
}

// ─── Workforce & Earnings Analytics (Super Admin) ─────────────────────────────

export interface TenantWorkerStat {
  role: string;
  count: number;
  total_count: number;
}

export interface TenantEarningsTrendPoint {
  period: string;   // 'YYYY-MM-DD' | 'Mon YYYY' | 'YYYY'
  total_amount: number;
}

export type EarningsGranularity = 'day' | 'month' | 'year';

/**
 * Per-role active worker count for a tenant. Super Admin only.
 */
export async function fetchTenantWorkerStats(tenantId: string): Promise<TenantWorkerStat[]> {
  const { data, error } = await supabase.rpc('admin_get_tenant_worker_stats', {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TenantWorkerStat[];
}

/**
 * Approved earnings trend (by day/month/year) for a tenant. Super Admin only.
 */
export async function fetchTenantEarningsTrend(
  tenantId: string,
  from: string,
  to: string,
  granularity: EarningsGranularity = 'month',
): Promise<TenantEarningsTrendPoint[]> {
  const { data, error } = await supabase.rpc('admin_get_tenant_earnings_trend', {
    p_tenant_id:   tenantId,
    p_from:        from,
    p_to:          to,
    p_granularity: granularity,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ period: string; total_amount: string | number }>).map(r => ({
    period:       r.period,
    total_amount: Number(r.total_amount) || 0,
  }));
}
