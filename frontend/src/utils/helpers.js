/**
 * Utility Functions
 * Helper functions for formatting, calculations, and data manipulation
 */

import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

// ============================================
// Date Utilities
// ============================================

/**
 * Format date for API (YYYY-MM-DD)
 */
export function formatDateForAPI(date) {
    return format(date, 'yyyy-MM-dd');
}

/**
 * Format date for display
 */
export function formatDateForDisplay(date) {
    return format(new Date(date), 'MMM dd, yyyy');
}

/**
 * Get date range presets
 */
export function getDateRangePresets() {
    const today = new Date();

    return {
        last7Days: {
            from: formatDateForAPI(subDays(today, 7)),
            to: formatDateForAPI(today),
            label: 'Last 7 Days',
        },
        last30Days: {
            from: formatDateForAPI(subDays(today, 30)),
            to: formatDateForAPI(today),
            label: 'Last 30 Days',
        },
        last90Days: {
            from: formatDateForAPI(subDays(today, 90)),
            to: formatDateForAPI(today),
            label: 'Last 90 Days',
        },
        thisMonth: {
            from: formatDateForAPI(startOfMonth(today)),
            to: formatDateForAPI(endOfMonth(today)),
            label: 'This Month',
        },
        lastMonth: {
            from: formatDateForAPI(startOfMonth(subDays(today, 30))),
            to: formatDateForAPI(endOfMonth(subDays(today, 30))),
            label: 'Last Month',
        },
    };
}

// ============================================
// Number Formatting
// ============================================

/**
 * Format number with commas
 */
export function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Format percentage
 */
export function formatPercentage(num, decimals = 2) {
    if (num === null || num === undefined) return '0%';
    return `${parseFloat(num).toFixed(decimals)}%`;
}

/**
 * Format duration (seconds to readable format)
 */
export function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0s';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (minutes === 0) {
        return `${remainingSeconds}s`;
    }

    return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format large numbers with K, M suffixes
 */
export function formatCompactNumber(num) {
    if (num === null || num === undefined) return '0';

    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
}

// ============================================
// Data Export
// ============================================

/**
 * Download CSV file
 */
export function downloadCSV(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

/**
 * Convert data to CSV
 */
export function convertToCSV(data, headers) {
    if (!data || data.length === 0) {
        return 'No data available';
    }

    const headerRow = headers.join(',');
    const rows = data.map(row =>
        headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value}"` : value;
        }).join(',')
    );

    return [headerRow, ...rows].join('\n');
}

// ============================================
// Chart Utilities
// ============================================

/**
 * Get chart color palette
 */
export function getChartColors() {
    return {
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#06b6d4',
        gray: '#6b7280',
    };
}

/**
 * Format chart data for Recharts
 */
export function formatChartData(data, dateKey = 'date', valueKeys = []) {
    return data.map(item => {
        const formatted = {
            date: formatDateForDisplay(item[dateKey]),
            rawDate: item[dateKey],
        };

        valueKeys.forEach(key => {
            formatted[key] = parseFloat(item[key]) || 0;
        });

        return formatted;
    });
}

// ============================================
// Validation
// ============================================

/**
 * Validate email
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate date range
 */
export function isValidDateRange(from, to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return fromDate <= toDate;
}

// ============================================
// Error Handling
// ============================================

/**
 * Extract error message from API error
 */
export function getErrorMessage(error) {
    if (error.response?.data?.error) {
        return error.response.data.error;
    }
    if (error.message) {
        return error.message;
    }
    return 'An unexpected error occurred';
}

// ============================================
// Calculations
// ============================================

/**
 * Calculate percentage change
 */
export function calculateChange(current, previous) {
    if (!previous || previous === 0) {
        return 0;
    }
    return ((current - previous) / previous) * 100;
}

/**
 * Calculate growth trend
 */
export function getTrend(current, previous) {
    const change = calculateChange(current, previous);

    if (change > 0) return 'up';
    if (change < 0) return 'down';
    return 'neutral';
}
