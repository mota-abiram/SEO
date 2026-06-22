/**
 * Data access via Supabase (PostgREST).
 *
 * Replaces the old axios-to-Express client. Every call goes through supabase-js
 * with the logged-in user's token, so Row Level Security automatically scopes
 * results: admins see all clients, client users see only their own.
 *
 * Response shapes are kept identical to the previous API so the dashboard is a
 * drop-in (e.g. clientsAPI.getAll() -> { clients }, metricsAPI.getRange() -> { data }).
 */

import { supabase } from './supabaseClient';

// ============================================
// Clients
// ============================================

export const clientsAPI = {
    getAll: async () => {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('name', { ascending: true });
        if (error) throw new Error(error.message);
        return { clients: data ?? [] };
    },

    getById: async (id) => {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw new Error(error.message);
        return { client: data };
    },

    // Calls the create-client Edge Function: validates GA4 access, inserts the
    // client, and backfills the last 30 days immediately.
    create: async ({ name, gaPropertyId, timezone = 'UTC' }) => {
        const { data, error } = await supabase.functions.invoke('create-client', {
            body: { name, gaPropertyId, timezone },
        });
        if (error) {
            // Surface the function's JSON error/hint (e.g. missing GA4 access).
            let message = error.message;
            try {
                const body = await error.context?.json?.();
                if (body?.error) message = body.hint ? `${body.error} — ${body.hint}` : body.error;
            } catch { /* fall back to error.message */ }
            throw new Error(message);
        }
        return { client: data.client, backfill: data.backfill };
    },

    update: async (id, fields) => {
        const { data, error } = await supabase
            .from('clients')
            .update(fields)
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { client: data };
    },

    delete: async (id, hard = false) => {
        const { error } = hard
            ? await supabase.from('clients').delete().eq('id', id)
            : await supabase.from('clients').update({ is_active: false }).eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
    },
};

// ============================================
// Metrics
// ============================================

async function fetchRows(clientId, from, to) {
    const { data, error } = await supabase
        .from('daily_metrics')
        .select('date, sessions, users, new_users, pageviews, avg_session_duration, bounce_rate, organic_sessions')
        .eq('client_id', clientId)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
}

const CSV_COLUMNS = [
    'date', 'sessions', 'users', 'new_users', 'pageviews',
    'avg_session_duration', 'bounce_rate', 'organic_sessions',
];

export const metricsAPI = {
    getRange: async (clientId, from, to) => {
        return { data: await fetchRows(clientId, from, to) };
    },

    getDaily: async (clientId, days = 30) => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - days);
        const iso = (d) => d.toISOString().slice(0, 10);
        return { data: await fetchRows(clientId, iso(from), iso(to)) };
    },

    getSummary: async (clientId, from, to) => {
        const rows = await fetchRows(clientId, from, to);
        const sum = (key) => rows.reduce((acc, r) => acc + Number(r[key] || 0), 0);
        const totalSessions = sum('sessions');
        const totalOrganicSessions = sum('organic_sessions');
        const avgBounceRate = rows.length
            ? rows.reduce((acc, r) => acc + Number(r.bounce_rate || 0), 0) / rows.length
            : 0;
        return {
            summary: {
                totalSessions,
                totalUsers: sum('users'),
                totalOrganicSessions,
                organicPercentage: totalSessions ? (totalOrganicSessions / totalSessions) * 100 : 0,
                avgBounceRate,
            },
        };
    },

    // Returns a Blob so the existing downloadCSV(blob, filename) helper works unchanged.
    export: async (clientId, from, to) => {
        const rows = await fetchRows(clientId, from, to);
        const lines = [CSV_COLUMNS.join(',')];
        for (const r of rows) {
            lines.push(CSV_COLUMNS.map((c) => r[c]).join(','));
        }
        return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    },
};

export default supabase;
