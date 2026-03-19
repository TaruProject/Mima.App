/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables - fail fast if missing
if (!supabaseUrl || !supabaseAnonKey) {
  const errorMessage = 'CRITICAL: Missing Supabase environment variables. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.';
  console.error('❌', errorMessage);
  throw new Error(errorMessage);
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch {
  const errorMessage = `CRITICAL: Invalid Supabase URL format: ${supabaseUrl}. Please provide a valid URL.`;
  console.error('❌', errorMessage);
  throw new Error(errorMessage);
}

const customStorage = {
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn('LocalStorage getItem failed:', e);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage setItem failed:', e);
      // Ignore - storage failure shouldn't crash the app
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn('LocalStorage removeItem failed:', e);
      // Ignore
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  // Add timeout configuration
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});
