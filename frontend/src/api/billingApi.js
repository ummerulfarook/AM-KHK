import api from './authApi'

export const billingApi = {
  /** POST /api/billing/ — create a new sale */
  createSale: (data) => api.post('/api/billing/', data).then(r => r.data),

  /**
   * GET /api/billing/ — paginated sales list
   * @param {Object} params - page, perPage, dateFrom, dateTo, customerId, paymentMethod
   */
  listSales: (params = {}) => api.get('/api/billing/', { params }).then(r => r.data),

  /** GET /api/billing/:id — single sale with items */
  getSale: (id) => api.get(`/api/billing/${id}`).then(r => r.data),

  /** GET /api/billing/:id/preview — rendered HTML invoice */
  getInvoicePreview: (id) => api.get(`/api/billing/${id}/preview`, { responseType: 'text' }).then(r => r.data),

  /**
   * GET /api/billing/:id/pdf — download PDF (or HTML fallback)
   * Returns a Blob URL string for download
   */
  downloadInvoice: async (id, invoiceNumber) => {
    const response = await api.get(`/api/billing/${id}/pdf`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    const ext = response.headers['content-type']?.includes('html') ? 'html' : 'pdf'
    link.setAttribute('download', `${invoiceNumber || id}.${ext}`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  /** POST /api/billing/:id/print — thermal print */
  printReceipt: (id) => api.post(`/api/billing/${id}/print`).then(r => r.data),

  /** PUT /api/billing/:id — edit sale details */
  updateSale: (id, data) => api.put(`/api/billing/${id}`, data).then(r => r.data),

  /** POST /api/billing/return — record return */
  recordReturn: (data) => api.post('/api/billing/return', data).then(r => r.data),
}
