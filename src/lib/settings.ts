import { supabase } from './supabase';

export interface BusinessSettings {
  id?: string;
  tenant_id?: string;
  ntn: string | null;
  strn: string | null;
  business_name: string | null;
  address: string | null;
  currency: string;
  tax_rate_pct: number;
  updated_at?: string;
}

export async function fetchBusinessSettings(): Promise<BusinessSettings | null> {
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('[Settings] fetchBusinessSettings error:', error.message);
    return null;
  }
  return data as BusinessSettings | null;
}

export async function saveBusinessSettings(
  tenantId: string,
  settings: Partial<BusinessSettings>
): Promise<BusinessSettings> {
  const payload = {
    tenant_id: tenantId,
    ntn: settings.ntn ?? null,
    strn: settings.strn ?? null,
    business_name: settings.business_name ?? null,
    address: settings.address ?? null,
    currency: settings.currency || 'PKR',
    tax_rate_pct: settings.tax_rate_pct ?? 17.0,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('business_settings')
    .upsert(payload, { onConflict: 'tenant_id' })
    .select()
    .single();

  if (error) throw error;
  return data as BusinessSettings;
}
