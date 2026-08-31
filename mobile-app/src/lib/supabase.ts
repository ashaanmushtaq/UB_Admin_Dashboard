import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder_key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

export const checkSupabaseConnection = async (): Promise<{ connected: boolean; message: string }> => {
  try {
    if (!supabaseUrl || supabaseUrl.includes('your-project-ref')) {
      return {
        connected: false,
        message: 'Supabase URL not configured in mobile .env'
      };
    }

    const { error } = await supabase.auth.getSession();
    if (error) {
      return { connected: false, message: `Mobile Auth Ping Error: ${error.message}` };
    }

    return {
      connected: true,
      message: `Mobile connected to Supabase endpoint: ${supabaseUrl}`
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Mobile Connection error: ${err?.message || 'Unknown error'}`
    };
  }
};
