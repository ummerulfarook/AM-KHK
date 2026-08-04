import api from './authApi'

export const customersApi = {
  /** GET /api/customers/ — List customers */
  listCustomers: (params = {}) => api.get('/api/customers/', { params }).then(r => r.data),

  /** POST /api/customers/ — Create customer */
  createCustomer: (data) => api.post('/api/customers/', data).then(r => r.data),

  /** GET /api/customers/:id — Get details */
  getCustomer: (id) => api.get(`/api/customers/${id}`).then(r => r.data),

  /** PUT /api/customers/:id — Update customer */
  updateCustomer: (id, data) => api.put(`/api/customers/${id}`, data).then(r => r.data),

  /** POST /api/customers/:id/toggle-active — Toggle active/inactive */
  toggleCustomerActive: (id) => api.post(`/api/customers/${id}/toggle-active`).then(r => r.data),

  /** DELETE /api/customers/:id — Delete customer */
  deleteCustomer: (id) => api.delete(`/api/customers/${id}`).then(r => r.data),

  /** GET /api/customers/:id/history — Purchase history */
  getCustomerHistory: (id, params = {}) => api.get(`/api/customers/${id}/history`, { params }).then(r => r.data),

  /** GET /api/customers/:id/credit — Credit profile summary */
  getCustomerCredit: (id, params = {}) => api.get(`/api/customers/${id}/credit`, { params }).then(r => r.data),

  /** POST /api/customers/:id/pay — Record general payment for dues */
  recordCustomerPayment: (id, data) => api.post(`/api/customers/${id}/pay`, data).then(r => r.data),

  /** GET /api/customers/:id/ledger-pdf — Download PDF statement ledger */
  downloadCustomerLedgerPdf: async (id, params = {}, customerName) => {
    const response = await api.get(`/api/customers/${id}/ledger-pdf`, { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `statement_${customerName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}
