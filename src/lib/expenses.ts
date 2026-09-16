import { supabase } from './supabase';

export type ExpenseCategory = 'rent' | 'electricity' | 'transport' | 'salaries' | 'miscellaneous';

export interface BusinessExpense {
  id: string;
  tenant_id: string;
  category: ExpenseCategory;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateExpensePayload {
  category: ExpenseCategory;
  amount: number;
  expense_date?: string;
  notes?: string;
}

export async function fetchBusinessExpenses(filters?: {
  category?: ExpenseCategory | 'all';
  startDate?: string;
  endDate?: string;
}): Promise<BusinessExpense[]> {
  let query = supabase
    .from('business_expenses')
    .select('*')
    .order('expense_date', { ascending: false });

  if (filters?.category && filters.category !== 'all') {
    query = query.eq('category', filters.category);
  }
  if (filters?.startDate) {
    query = query.gte('expense_date', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('expense_date', filters.endDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BusinessExpense[];
}

export async function createBusinessExpense(payload: CreateExpensePayload): Promise<BusinessExpense> {
  const { data, error } = await supabase
    .from('business_expenses')
    .insert({
      category: payload.category,
      amount: payload.amount,
      expense_date: payload.expense_date || new Date().toISOString().split('T')[0],
      notes: payload.notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as BusinessExpense;
}

export async function deleteBusinessExpense(id: string): Promise<void> {
  const { error } = await supabase.from('business_expenses').delete().eq('id', id);
  if (error) throw error;
}
