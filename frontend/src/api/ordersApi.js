import api from './authApi'

export const ordersApi = {
  /** GET /api/orders/ — List wholesale orders */
  listOrders: (params = {}) => api.get('/api/orders/', { params }).then(r => r.data),

  /** POST /api/orders/ — Create wholesale order */
  createOrder: (data) => api.post('/api/orders/', data).then(r => r.data),

  /** GET /api/orders/:id — Get details */
  getOrder: (id) => api.get(`/api/orders/${id}`).then(r => r.data),

  /** PUT /api/orders/:id — Update order (allowed if pending) */
  updateOrder: (id, data) => api.put(`/api/orders/${id}`, data).then(r => r.data),

  /** PATCH /api/orders/:id/status — Transition status */
  transitionStatus: (id, status, notes = '') => api.patch(`/api/orders/${id}/status`, { status, notes }).then(r => r.data),

  /** GET /api/orders/:id/pdf — Download PDF invoice */
  downloadInvoice: async (id) => {
    const response = await api.get(`/api/orders/${id}/pdf`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    const ext = response.headers['content-type']?.includes('html') ? 'html' : 'pdf'
    link.setAttribute('download', `Invoice_WO-${id}.${ext}`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}
