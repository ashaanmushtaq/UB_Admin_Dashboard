import { supabase } from './supabase';

export interface BarcodeLabel {
  id: string;
  tenant_id: string;
  label_type: 'order' | 'product' | 'bundle';
  reference_id: string | null;
  reference_label: string;
  barcode_value: string;
  label_data: Record<string, any>;
  created_at: string;
}

export async function fetchBarcodeLabels(): Promise<BarcodeLabel[]> {
  const { data, error } = await supabase
    .from('barcode_labels')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as BarcodeLabel[];
}

export async function saveBarcodeLabel(payload: {
  label_type: 'order' | 'product' | 'bundle';
  reference_id?: string | null;
  reference_label: string;
  barcode_value: string;
  label_data?: Record<string, any>;
}): Promise<BarcodeLabel> {
  const { data, error } = await supabase
    .from('barcode_labels')
    .insert({
      label_type: payload.label_type,
      reference_id: payload.reference_id || null,
      reference_label: payload.reference_label,
      barcode_value: payload.barcode_value,
      label_data: payload.label_data || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data as BarcodeLabel;
}

export async function deleteBarcodeLabel(id: string): Promise<void> {
  const { error } = await supabase
    .from('barcode_labels')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
