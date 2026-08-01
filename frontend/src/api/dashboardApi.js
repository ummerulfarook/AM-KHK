import api from './authApi'

export const dashboardApi = {
  /** GET /api/dashboard/ */
  getDashboard: () => api.get('/api/dashboard/').then(r => r.data),
}
