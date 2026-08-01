import api from './authApi'

export const suppliersApi = {
  /** GET /api/suppliers/ — List suppliers */
  listSuppliers: (params = {}) => api.get('/api/suppliers/', { params }).then(r => r.data),

  /** POST /api/suppliers/ — Create supplier */
  createSupplier: (data) => api.post('/api/suppliers/', data).then(r => r.data),

  /** PUT /api/suppliers/:id — Update supplier details */
  updateSupplier: (id, data) => api.put(`/api/suppliers/${id}`, data).then(r => r.data),

  /** POST /api/suppliers/:id/toggle-active — Toggle active/inactive */
  toggleSupplierActive: (id) => api.post(`/api/suppliers/${id}/toggle-active`).then(r => r.data),

  /** DELETE /api/suppliers/:id — Delete supplier */
  deleteSupplier: (id) => api.delete(`/api/suppliers/${id}`).then(r => r.data),

  /** GET /api/suppliers/po/ — List Purchase Orders */
  listPurchaseOrders: (params = {}) => api.get('/api/suppliers/po/', { params }).then(r => r.data),

  /** POST /api/suppliers/po/ — Create Purchase Order */
  createPurchaseOrder: (data) => api.post('/api/suppliers/po/', data).then(r => r.data),

  /** GET /api/suppliers/po/:id — Retrieve Purchase Order details */
  getPurchaseOrder: (id) => api.get(`/api/suppliers/po/${id}`).then(r => r.data),

  /** PUT /api/suppliers/po/:id — Update draft PO details */
  updatePurchaseOrder: (id, data) => api.put(`/api/suppliers/po/${id}`, data).then(r => r.data),

  /** PATCH /api/suppliers/po/:id/status — Transition PO status */
  transitionPOStatus: (id, status) => api.patch(`/api/suppliers/po/${id}/status`, { status }).then(r => r.data),

  /** POST /api/suppliers/po/:id/pay — Log payment to supplier */
  recordSupplierPayment: (id, data) => api.post(`/api/suppliers/po/${id}/pay`, data).then(r => r.data),
}
