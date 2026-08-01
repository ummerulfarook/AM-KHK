import api from './authApi'

export const creditApi = {
  /** GET /api/credit/ — List outstanding credit entries */
  listCredit: (params = {}) => api.get('/api/credit/', { params }).then(r => r.data),

  /** POST /api/credit/:id/pay — Record payment on credit entry */
  recordPayment: (id, data) => api.post(`/api/credit/${id}/pay`, data).then(r => r.data),
}
