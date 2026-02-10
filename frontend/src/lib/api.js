/**
 * API Client
 * Axios instance configured with JWT authentication
 */

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// ============================================
// Auth API
// ============================================

export const authAPI = {
    login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        return response.data;
    },

    logout: async () => {
        const response = await api.post('/auth/logout');
        return response.data;
    },

    getMe: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },

    changePassword: async (currentPassword, newPassword) => {
        const response = await api.post('/auth/change-password', {
            currentPassword,
            newPassword,
        });
        return response.data;
    },
};

// ============================================
// Clients API
// ============================================

export const clientsAPI = {
    getAll: async () => {
        const response = await api.get('/clients');
        return response.data;
    },

    getById: async (id) => {
        const response = await api.get(`/clients/${id}`);
        return response.data;
    },

    create: async (clientData) => {
        const response = await api.post('/clients', clientData);
        return response.data;
    },

    update: async (id, clientData) => {
        const response = await api.put(`/clients/${id}`, clientData);
        return response.data;
    },

    delete: async (id, hard = false) => {
        const response = await api.delete(`/clients/${id}?hard=${hard}`);
        return response.data;
    },
};

// ============================================
// Metrics API
// ============================================

export const metricsAPI = {
    getRange: async (clientId, from, to) => {
        const response = await api.get('/metrics', {
            params: { clientId, from, to },
        });
        return response.data;
    },

    getDaily: async (clientId, days = 30) => {
        const response = await api.get('/metrics/daily', {
            params: { clientId, days },
        });
        return response.data;
    },

    getSummary: async (clientId, from, to) => {
        const response = await api.get('/metrics/summary', {
            params: { clientId, from, to },
        });
        return response.data;
    },

    export: async (clientId, from, to) => {
        const response = await api.get('/metrics/export', {
            params: { clientId, from, to },
            responseType: 'blob',
        });
        return response.data;
    },

    compare: async (clientId, from1, to1, from2, to2) => {
        const response = await api.get('/metrics/compare', {
            params: { clientId, from1, to1, from2, to2 },
        });
        return response.data;
    },
};

export default api;
