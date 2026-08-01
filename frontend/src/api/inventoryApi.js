import api from './authApi'

export const inventoryApi = {
  /** GET /api/inventory/stats */
  getStats: () => api.get('/api/inventory/stats').then(r => r.data),

  /** GET /api/inventory/categories */
  getCategories: () => api.get('/api/inventory/categories').then(r => r.data),

  /** POST /api/inventory/categories */
  createCategory: (data) => api.post('/api/inventory/categories', data).then(r => r.data),

  /**
   * GET /api/inventory/
   * @param {Object} params - page, perPage, search, categoryId, status, includeInactive
   */
  getProducts: (params = {}) => api.get('/api/inventory/', { params }).then(r => r.data),

  /** GET /api/inventory/:id */
  getProduct: (id) => api.get(`/api/inventory/${id}`).then(r => r.data),

  /** POST /api/inventory/ */
  createProduct: (data) => api.post('/api/inventory/', data).then(r => r.data),

  /** PUT /api/inventory/:id */
  updateProduct: (id, data) => api.put(`/api/inventory/${id}`, data).then(r => r.data),

  /** PATCH /api/inventory/:id/stock */
  adjustStock: (id, data) => api.patch(`/api/inventory/${id}/stock`, data).then(r => r.data),

  /** PATCH /api/inventory/:id/deactivate */
  deactivateProduct: (id) => api.patch(`/api/inventory/${id}/deactivate`).then(r => r.data),

  /** PATCH /api/inventory/:id/activate */
  activateProduct: (id) => api.patch(`/api/inventory/${id}/activate`).then(r => r.data),
}
