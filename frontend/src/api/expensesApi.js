import api from './authApi'

export const expensesApi = {
  /** GET /api/expenses/ — List expenses */
  listExpenses: (params = {}) => api.get('/api/expenses/', { params }).then(r => r.data),

  /** POST /api/expenses/ — Log a new expense */
  createExpense: (data) => api.post('/api/expenses/', data).then(r => r.data),

  /** PUT /api/expenses/:id — Update expense (only if pending) */
  updateExpense: (id, data) => api.put(`/api/expenses/${id}`, data).then(r => r.data),

  /** PATCH /api/expenses/:id/status — Approve or reject expense */
  updateExpenseStatus: (id, status) => api.patch(`/api/expenses/${id}/status`, { status }).then(r => r.data),

  /** DELETE /api/expenses/:id — Delete pending expense */
  deleteExpense: (id) => api.delete(`/api/expenses/${id}`).then(r => r.data),
}
