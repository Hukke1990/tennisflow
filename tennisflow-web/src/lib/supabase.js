import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
	throw new Error('Faltan variables de entorno de Supabase: VITE_SUPABASE_URL y/o VITE_SUPABASE_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
