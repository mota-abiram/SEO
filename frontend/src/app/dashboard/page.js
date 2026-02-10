'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { metricsAPI, clientsAPI } from '../../lib/api';
import {
    isAuthenticated,
    getCurrentUser,
    isAdmin,
    clearAuth
} from '../../lib/auth';
import {
    formatNumber,
    formatDateForDisplay,
    formatPercentage,
    formatDuration,
    formatChartData,
    downloadCSV,
    getDateRangePresets
} from '../../utils/helpers';
import '../globals.css';

export default function DashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // User & Client State
    const [user, setUser] = useState(null);
    const [clients, setClients] = useState([]);
    const [selectedClientId, setSelectedClientId] = useState(null);

    // Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', gaPropertyId: '', timezone: 'UTC' });
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Date Range State
    const [dateRange, setDateRange] = useState('last30Days');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    // Data State
    const [summary, setSummary] = useState(null);
    const [dailyData, setDailyData] = useState([]);
    const [loadingData, setLoadingData] = useState(false);

    // Simplified effect for bypass auth
    useEffect(() => {
        const currentUser = getCurrentUser();
        setUser(currentUser);
        loadClients();
    }, []);

    // Load clients (admin only)
    const loadClients = async () => {
        try {
            if (isAdmin()) {
                const response = await clientsAPI.getAll();
                setClients(response.clients);

                // Auto-select first client if none selected
                if (response.clients.length > 0 && !selectedClientId) {
                    setSelectedClientId(response.clients[0].id);
                }
            }
            setLoading(false);
        } catch (err) {
            setError(err.message || 'Failed to load clients');
            setLoading(false);
        }
    };

    // Load metrics when client or date range changes
    useEffect(() => {
        if (selectedClientId) {
            loadMetrics();
        } else {
            setSummary(null);
            setDailyData([]);
        }
    }, [selectedClientId, dateRange, customFrom, customTo]);

    const loadMetrics = async () => {
        setLoadingData(true);
        setError('');

        try {
            const range = getDateRange();

            // Fetch summary and daily data in parallel
            const [summaryResponse, dailyResponse] = await Promise.all([
                metricsAPI.getSummary(selectedClientId, range.from, range.to),
                metricsAPI.getRange(selectedClientId, range.from, range.to)
            ]);

            setSummary(summaryResponse.summary);
            setDailyData(dailyResponse.data);
        } catch (err) {
            setError(err.message || 'Failed to load metrics');
        } finally {
            setLoadingData(false);
        }
    };

    const getDateRange = () => {
        if (dateRange === 'custom') {
            return { from: customFrom, to: customTo };
        }
        const presets = getDateRangePresets();
        return presets[dateRange] || presets.last30Days;
    };

    const handleExport = async () => {
        try {
            const { from, to } = getDateRange();
            const blob = await metricsAPI.export(selectedClientId, from, to);
            downloadCSV(blob, `analytics_${from}_to_${to}.csv`);
        } catch (err) {
            setError(err.message || 'Export failed');
        }
    };

    const handleAddClient = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError('');

        try {
            await clientsAPI.create(newClient);
            setShowAddModal(false);
            setNewClient({ name: '', gaPropertyId: '', timezone: 'UTC' });
            await loadClients();
        } catch (err) {
            setError(err.message || 'Failed to add client');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClient = async () => {
        if (!selectedClientId) return;

        const clientToDelete = clients.find(c => c.id === selectedClientId);
        if (!clientToDelete) return;

        if (!confirm(`Are you sure you want to delete ${clientToDelete.name}? This will permanently remove all its historical data from the dashboard.`)) {
            return;
        }

        setIsDeleting(true);
        setError('');

        try {
            await clientsAPI.delete(selectedClientId, true); // Hard delete
            setSelectedClientId(null);
            await loadClients();
        } catch (err) {
            setError(err.message || 'Failed to delete client');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleLogout = () => {
        clearAuth();
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }}></div>
                    <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            {/* Header */}
            <header style={{
                background: 'white',
                borderBottom: '1px solid var(--border-color)',
                padding: '16px 0',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                boxShadow: 'var(--shadow-sm)'
            }}>
                <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h1 style={{
                        fontSize: '24px',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0
                    }}>
                        GA4 Analytics Dashboard
                    </h1>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {isAdmin() && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="btn btn-primary btn-sm"
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                ➕ Add Client
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="container content">
                {/* Controls */}
                <div className="card" style={{ marginBottom: '24px' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isAdmin() ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr',
                        gap: '16px'
                    }}>
                        {/* Client Selector (Admin only) */}
                        {isAdmin() && (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="label">Client</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select
                                        className="select"
                                        style={{ flex: 1 }}
                                        value={selectedClientId || ''}
                                        onChange={(e) => setSelectedClientId(e.target.value ? parseInt(e.target.value) : null)}
                                    >
                                        <option value="">Select a client</option>
                                        {clients.map(client => (
                                            <option key={client.id} value={client.id}>
                                                {client.name}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedClientId && isAdmin() && (
                                        <button
                                            onClick={handleDeleteClient}
                                            className="btn btn-secondary"
                                            style={{ padding: '0 12px', borderColor: '#fee2e2', color: '#dc2626' }}
                                            title="Delete Client"
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? '...' : '🗑️'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Date Range Selector */}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="label">Date Range</label>
                            <select
                                className="select"
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value)}
                            >
                                <option value="last7Days">Last 7 Days</option>
                                <option value="last30Days">Last 30 Days</option>
                                <option value="last90Days">Last 90 Days</option>
                                <option value="thisMonth">This Month</option>
                                <option value="lastMonth">Last Month</option>
                                <option value="custom">Custom Range</option>
                            </select>
                        </div>

                        {/* Custom Date Range */}
                        {dateRange === 'custom' && (
                            <>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="label">From</label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={customFrom}
                                        onChange={(e) => setCustomFrom(e.target.value)}
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="label">To</label>
                                    <input
                                        type="date"
                                        className="input"
                                        value={customTo}
                                        onChange={(e) => setCustomTo(e.target.value)}
                                    />
                                </div>
                            </>
                        )}

                        {/* Export Button */}
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button
                                onClick={handleExport}
                                className="btn btn-secondary w-full"
                                disabled={!selectedClientId || loadingData}
                            >
                                📥 Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="alert alert-error">
                        {error}
                        <button
                            className="close-btn"
                            onClick={() => setError('')}
                            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}
                        >
                            &times;
                        </button>
                    </div>
                )}

                {/* KPI Cards */}
                {summary && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '20px',
                        marginBottom: '32px'
                    }}>
                        <KPICard
                            title="Total Sessions"
                            value={formatNumber(summary.totalSessions)}
                            icon="📊"
                            color="#3b82f6"
                        />
                        <KPICard
                            title="Total Users"
                            value={formatNumber(summary.totalUsers)}
                            icon="👥"
                            color="#8b5cf6"
                        />
                        <KPICard
                            title="Organic Sessions"
                            value={formatNumber(summary.totalOrganicSessions)}
                            subtitle={`${formatPercentage(summary.organicPercentage)} of total`}
                            icon="🔍"
                            color="#10b981"
                        />
                        <KPICard
                            title="Avg. Bounce Rate"
                            value={formatPercentage(summary.avgBounceRate)}
                            icon="↩️"
                            color="#f59e0b"
                        />
                    </div>
                )}

                {/* Chart */}
                {dailyData.length > 0 && (
                    <div className="card" style={{ marginBottom: '32px' }}>
                        <div className="card-header">
                            <h3 className="card-title">Daily Sessions Trend</h3>
                        </div>
                        <div style={{ height: '400px', width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={dailyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(date) => formatDateForDisplay(date).split(',')[0]}
                                        stroke="#6b7280"
                                    />
                                    <YAxis stroke="#6b7280" />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'white',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            boxShadow: 'var(--shadow-lg)'
                                        }}
                                        labelFormatter={(date) => formatDateForDisplay(date)}
                                    />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="sessions"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        dot={{ fill: '#3b82f6', r: 4 }}
                                        activeDot={{ r: 6 }}
                                        name="Total Sessions"
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="organic_sessions"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        dot={{ fill: '#10b981', r: 4 }}
                                        activeDot={{ r: 6 }}
                                        name="Organic Sessions"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Data Table */}
                {dailyData.length > 0 && (
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Daily Breakdown</h3>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={tableHeaderStyle}>Date</th>
                                        <th style={tableHeaderStyle}>Sessions</th>
                                        <th style={tableHeaderStyle}>Users</th>
                                        <th style={tableHeaderStyle}>New Users</th>
                                        <th style={tableHeaderStyle}>Pageviews</th>
                                        <th style={tableHeaderStyle}>Avg. Duration</th>
                                        <th style={tableHeaderStyle}>Bounce Rate</th>
                                        <th style={tableHeaderStyle}>Organic</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyData.map((row, index) => (
                                        <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={tableCellStyle}>{formatDateForDisplay(row.date)}</td>
                                            <td style={tableCellStyle}>{formatNumber(row.sessions)}</td>
                                            <td style={tableCellStyle}>{formatNumber(row.users)}</td>
                                            <td style={tableCellStyle}>{formatNumber(row.new_users)}</td>
                                            <td style={tableCellStyle}>{formatNumber(row.pageviews)}</td>
                                            <td style={tableCellStyle}>{formatDuration(row.avg_session_duration)}</td>
                                            <td style={tableCellStyle}>{formatPercentage(row.bounce_rate)}</td>
                                            <td style={tableCellStyle}>{formatNumber(row.organic_sessions)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* No Data State */}
                {!loadingData && dailyData.length === 0 && selectedClientId && (
                    <div className="card" style={{ textAlign: 'center', padding: '64px 24px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                        <h3 style={{ marginBottom: '8px' }}>No Data Available</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            No metrics found for the selected date range. Data sync may still be in progress.
                        </p>
                        <button
                            className="btn btn-primary"
                            style={{ marginTop: '24px' }}
                            onClick={loadMetrics}
                        >
                            🔄 Refresh Data
                        </button>
                    </div>
                )}

                {/* Empty State (No clients) */}
                {!loading && clients.length === 0 && isAdmin() && (
                    <div className="card" style={{ textAlign: 'center', padding: '64px 24px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
                        <h3 style={{ marginBottom: '8px' }}>Welcome! Add your first client</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                            You haven't added any GA4 properties yet. Let's get started.
                        </p>
                        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                            ➕ Add Client
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loadingData && (
                    <div className="card" style={{ textAlign: 'center', padding: '64px 24px' }}>
                        <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '4px', margin: '0 auto' }}></div>
                        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading metrics...</p>
                    </div>
                )}
            </div>

            {/* Add Client Modal */}
            {showAddModal && (
                <div className="modal-backdrop" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '0', overflow: 'hidden' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 className="card-title">Add New GA4 Property</h3>
                            <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px' }}>&times;</button>
                        </div>
                        <form onSubmit={handleAddClient} style={{ padding: '24px' }}>
                            <div className="form-group">
                                <label className="label">Client Name</label>
                                <input
                                    type="text"
                                    className="input"
                                    required
                                    placeholder="e.g. Acme Corp"
                                    value={newClient.name}
                                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">GA4 Property ID</label>
                                <input
                                    type="text"
                                    className="input"
                                    required
                                    placeholder="e.g. 123456789"
                                    value={newClient.gaPropertyId}
                                    onChange={(e) => setNewClient({ ...newClient, gaPropertyId: e.target.value })}
                                />
                                <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-tertiary)' }}>
                                    Found in Google Analytics → Admin → Property Settings
                                </small>
                            </div>
                            <div className="form-group">
                                <label className="label">Timezone</label>
                                <select
                                    className="select"
                                    value={newClient.timezone}
                                    onChange={(e) => setNewClient({ ...newClient, timezone: e.target.value })}
                                >
                                    <option value="UTC">UTC</option>
                                    <option value="America/New_York">EST (New York)</option>
                                    <option value="Europe/London">GMT (London)</option>
                                    <option value="Asia/Kolkata">IST (India)</option>
                                    <option value="Asia/Dubai">GST (Dubai)</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary flex-1">
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary flex-1" disabled={isSaving}>
                                    {isSaving ? 'Saving...' : 'Save Client'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// KPI Card Component
function KPICard({ title, value, subtitle, icon, color }) {
    return (
        <div className="card" style={{
            borderLeft: `4px solid ${color}`,
            transition: 'transform 0.2s ease',
            cursor: 'default'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <p style={{
                        fontSize: '14px',
                        color: 'var(--text-secondary)',
                        marginBottom: '8px',
                        fontWeight: '500'
                    }}>
                        {title}
                    </p>
                    <h2 style={{
                        fontSize: '32px',
                        fontWeight: '700',
                        margin: '0 0 4px 0',
                        color: color
                    }}>
                        {value}
                    </h2>
                    {subtitle && (
                        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                            {subtitle}
                        </p>
                    )}
                </div>
                <div style={{
                    fontSize: '32px',
                    opacity: 0.8
                }}>
                    {icon}
                </div>
            </div>
        </div>
    );
}

// Table Styles
const tableHeaderStyle = {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
};

const tableCellStyle = {
    padding: '12px 16px',
    fontSize: '14px',
    color: 'var(--text-primary)'
};
