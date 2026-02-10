/**
 * Authentication Utilities
 * Client-side auth state management
 */

// Save auth data to localStorage
export function saveAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

// Get auth data from localStorage
export function getAuth() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
        return null;
    }

    try {
        const user = JSON.parse(userStr);
        return { token, user };
    } catch (error) {
        return null;
    }
}

// Clear auth data
export function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

// Check if user is authenticated
export function isAuthenticated() {
    return !!localStorage.getItem('token');
}

// Check if user is admin
export function isAdmin() {
    const auth = getAuth();
    return auth?.user?.role === 'admin';
}

// Get current user
export function getCurrentUser() {
    const auth = getAuth();
    return auth?.user || null;
}

// Get client ID for current user
export function getClientId() {
    const auth = getAuth();
    return auth?.user?.clientId || null;
}
