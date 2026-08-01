import api from './authApi'

export const settingsApi = {
  /** GET /api/settings/ — Fetch all shop settings */
  getSettings: () => api.get('/api/settings/').then(r => r.data),

  /** POST /api/settings/ — Save settings */
  saveSettings: (data) => api.post('/api/settings/', data).then(r => r.data),

  /** GET /api/settings/users — List system users */
  listUsers: () => api.get('/api/settings/users').then(r => r.data),

  /** POST /api/settings/users — Create a new system user */
  createUser: (data) => api.post('/api/settings/users', data).then(r => r.data),

  /** PUT /api/settings/users/:id — Update system user */
  updateUser: (id, data) => api.put(`/api/settings/users/${id}`, data).then(r => r.data),

  /** GET /api/settings/backup — Download database backup blob */
  downloadBackup: async () => {
    const response = await api.get('/api/settings/backup', { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'amkhk_backup.db')
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  /** POST /api/settings/restore — Upload database backup file */
  restoreDatabase: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/settings/restore', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  }
}
