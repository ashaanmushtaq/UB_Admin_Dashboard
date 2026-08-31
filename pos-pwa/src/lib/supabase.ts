import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder_key'
);

export const checkSupabaseConnection = async (): Promise<{ connected: boolean; message: string }> => {
  try {
    if (!supabaseUrl || supabaseUrl.includes('your-project-ref')) {
      return {
        connected: false,
        message: 'Supabase URL not configured in .env (Using template placeholder)'
      };
    }

    const { error } = await supabase.auth.getSession();
    if (error) {
      return { connected: false, message: `POS Auth Ping Error: ${error.message}` };
    }

    return {
      connected: true,
      message: `POS connected to Supabase endpoint: ${supabaseUrl}`
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `POS Connection error: ${err?.message || 'Offline / unreachable'}`
    };
  }
};
