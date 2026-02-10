/**
 * Authentication Utilities
 * Client-side auth state management
 */

// Save auth data to localStorage (BYPASSED)
export function saveAuth(token, user) { }

// Get auth data from localStorage (BYPASSED - returns default admin)
export function getAuth() {
    return {
        token: 'disabled-token',
        user: { id: 1, email: 'admin@example.com', role: 'admin' }
    };
}

// Clear auth data (BYPASSED)
export function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

// Check if user is authenticated (ALWAYS TRUE)
export function isAuthenticated() {
    return true;
}

// Check if user is admin (ALWAYS TRUE)
export function isAdmin() {
    return true;
}

// Get current user (ALWAYS ADMIN)
export function getCurrentUser() {
    return { id: 1, email: 'admin@example.com', role: 'admin' };
}

// Get client ID for current user
export function getClientId() {
    return null;
}
