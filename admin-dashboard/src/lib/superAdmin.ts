import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantRow {
  id: string;
  name: string;
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
}

export interface CreateTenantPayload {
  name: string;
  owner_email: string;
  owner_password: string;
  owner_full_name: string;
  plan_type: 'trial' | 'premium';
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
  };
  owner: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };
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
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
  const functionUrl = `${supabaseUrl}/functions/v1/provision-tenant`;

  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json as CreateTenantResult;
}
