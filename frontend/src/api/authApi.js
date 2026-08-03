import axios from 'axios'

/**
 * Axios instance shared across all API modules.
 * During development the Vite proxy forwards /api → http://localhost:5000
 * In production everything is served from the same origin.
 */
const api = axios.create({
  baseURL: '/',
  withCredentials: true,       // send session cookies cross-origin in dev
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add X-Working-Date header
api.interceptors.request.use(
  (config) => {
    const workingDate = localStorage.getItem('working_date')
    if (workingDate) {
      config.headers['X-Working-Date'] = workingDate
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: redirect to login on 401 ───────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Avoid redirect loop on the login page itself
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

// ── Auth API ──────────────────────────────────────────────────────────────────
export const authApi = {
  /** POST /api/auth/login */
  login: (username, password) =>
    api.post('/api/auth/login', { username, password }),

  /** POST /api/auth/logout */
  logout: () => api.post('/api/auth/logout'),

  /** GET /api/auth/me */
  me: () => api.get('/api/auth/me'),
}
