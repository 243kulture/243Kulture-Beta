import { createClient } from "@supabase/supabase-js";

// Ces deux valeurs viennent de ton projet Supabase :
// Dashboard Supabase → Project Settings → API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// isSupabaseConfigured permet à l'app de savoir si le backend est branché.
// Tant que .env n'est pas rempli, l'app continue de fonctionner en mode
// "maquette" (données en mémoire) — voir App.jsx / connectWith().
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
