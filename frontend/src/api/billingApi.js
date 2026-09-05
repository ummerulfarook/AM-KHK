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

  /** POST /api/billing/return — record standalone return */
  recordReturn: (data) => api.post('/api/billing/return', data).then(r => r.data),

  /** DELETE /api/billing/sale/:id — delete a sale */
  deleteSale: (id) => api.delete(`/api/billing/sale/${id}`).then(r => r.data),

  /**
   * GET /api/billing/invoice-lookup — search invoices by partial number or customer
   * @param {Object} params - q (search string), customerId, page, perPage
   */
  invoiceLookup: (params = {}) => api.get('/api/billing/invoice-lookup', { params }).then(r => r.data),

  /**
   * GET /api/billing/:id/items-for-return — list items with remaining returnable quantities
   */
  getSaleItemsForReturn: (saleId) => api.get(`/api/billing/${saleId}/items-for-return`).then(r => r.data),

  /**
   * GET /api/billing/:id/returns — list all return transactions on a sale
   */
  getSaleReturns: (saleId) => api.get(`/api/billing/${saleId}/returns`).then(r => r.data),

  /**
   * GET /api/billing/returns/:returnId — single return transaction
   */
  getReturnTransaction: (returnId) => api.get(`/api/billing/returns/${returnId}`).then(r => r.data),

  /**
   * GET /api/billing/returns/:returnId/preview — return bill HTML preview
   */
  getReturnBillPreview: (returnId, print = false) =>
    api.get(`/api/billing/returns/${returnId}/preview${print ? '?print=true' : ''}`, { responseType: 'text' }).then(r => r.data),

  /**
   * GET /api/billing/returns/:returnId/pdf — download return bill PDF
   */
  downloadReturnBill: async (returnId, returnNumber) => {
    const response = await api.get(`/api/billing/returns/${returnId}/pdf`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    const ext = response.headers['content-type']?.includes('html') ? 'html' : 'pdf'
    link.setAttribute('download', `${returnNumber || returnId}.${ext}`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}
