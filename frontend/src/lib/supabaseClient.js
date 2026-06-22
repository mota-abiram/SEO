/**
 * Supabase browser client (singleton).
 * Uses the anon key — Row Level Security enforces what each logged-in user
 * can read/write, so the anon key is safe to ship to the browser.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
    // Surfaces a clear error in dev if env vars are missing.
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, anonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
});
