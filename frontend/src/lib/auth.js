/**
 * Authentication via Supabase Auth.
 *
 * Login/session/token are handled by Supabase. Each user's role + client_id
 * live in the `profiles` table; we hydrate them into a small in-memory cache so
 * the dashboard's synchronous isAdmin()/getClientId() calls keep working.
 *
 * Call loadSession() once on each protected page (it's async) before relying on
 * the synchronous getters.
 */

import { supabase } from './supabaseClient';

// Cached, profile-enriched user for the current session: {id,email,role,clientId}
let _user = null;

/**
 * Hydrate _user from the current Supabase session + profile row.
 * Returns the user object or null if not signed in.
 */
export async function loadSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        _user = null;
        return null;
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, client_id, email')
        .eq('id', session.user.id)
        .single();

    if (error || !profile) {
        // Authenticated but no profile row — treat as not provisioned.
        _user = null;
        return null;
    }

    _user = {
        id: session.user.id,
        email: profile.email || session.user.email,
        role: profile.role,
        clientId: profile.client_id ?? null,
    };
    return _user;
}

/**
 * Sign in with email/password, then hydrate the profile.
 */
export async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return await loadSession();
}

/**
 * Sign out and clear the cache.
 */
export async function signOut() {
    await supabase.auth.signOut();
    _user = null;
}

// ---- synchronous getters (valid after loadSession/signIn) ----

export function getCurrentUser() {
    return _user;
}

export function isAuthenticated() {
    return _user !== null;
}

export function isAdmin() {
    return _user?.role === 'admin';
}

export function getClientId() {
    return _user?.clientId ?? null;
}
