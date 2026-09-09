import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
  tenant_id: string;
  role: string;
  is_super_admin?: boolean;
}

export interface TenantBranding {
  id: string;
  name: string;
  display_name: string | null;
  company_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  if (!tenantId) return null;
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, display_name, company_name, address, phone, email, logo_url')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      console.warn('[Auth] Could not fetch tenant branding:', error.message);
      return null;
    }
    return data as TenantBranding | null;
  } catch (err) {
    console.warn('[Auth] getTenantBranding caught exception:', err);
    return null;
  }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile(user: User): Promise<UserProfile | null> {
  if (!user?.id) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, tenant_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[Auth] Could not fetch profile:', error.message);
      return null;
    }
    if (!data) return null;

    return {
      id: data.id,
      full_name: data.full_name,
      tenant_id: data.tenant_id,
      role: data.role ?? 'unknown',
    };
  } catch (err) {
    console.warn('[Auth] getProfile caught exception:', err);
    return null;
  }
}

/**
 * Check whether the currently-authenticated user is a platform super admin.
 * Calls the is_super_admin() SECURITY DEFINER RPC.
 */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_super_admin');
    if (error) {
      console.warn('[Auth] is_super_admin RPC error:', error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[Auth] isSuperAdmin caught exception:', err);
    return false;
  }
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return subscription;
}
