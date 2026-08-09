import api from './authApi'

export const reportsApi = {
  /** GET /api/reports/dashboard — Get Profit & Loss analytics aggregates */
  getDashboardReports: (params = {}) => api.get('/api/reports/dashboard', { params }).then(r => r.data),

  /** GET /api/reports/export — Download multi-sheet Excel spreadsheet report */
  downloadExcelReport: async (params = {}) => {
    const response = await api.get('/api/reports/export', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    
    const dateStr = new Date().toISOString().split('T')[0]
    link.setAttribute('download', `AM_KHK_Financial_Report_${dateStr}.xlsx`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  /** GET /api/reports/customers — Get customer purchases report */
  getCustomerReports: (params = {}) => api.get('/api/reports/customers', { params }).then(r => r.data),

  /** GET /api/reports/upi-summary — Get UPI accounts summary report */
  getUpiReports: (params = {}) => api.get('/api/reports/upi-summary', { params }).then(r => r.data),

  /** GET /api/reports/bank-summary — Get bank accounts summary report */
  getBankReports: (params = {}) => api.get('/api/reports/bank-summary', { params }).then(r => r.data),

  /** GET /api/reports/query — Get custom Daily, Monthly, Yearly, Expense, Credit, Purchase reports */
  getCustomReport: (params = {}) => api.get('/api/reports/query', { params }).then(r => r.data),

  /** GET /api/reports/pdf — Download PDF report */
  downloadPdfReport: async (params = {}) => {
    const response = await api.get('/api/reports/pdf', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    const reportType = params.type || 'daily'
    link.setAttribute('download', `${reportType}_report_${new Date().toISOString().split('T')[0]}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  /** GET /api/reports/product-sales — Get product-wise sales report */
  getProductSalesReport: (params = {}) => api.get('/api/reports/product-sales', { params }).then(r => r.data),

  /** GET /api/reports/product-sales-pdf — Download product sales report PDF */
  downloadProductSalesReportPdf: async (params = {}) => {
    const response = await api.get('/api/reports/product-sales-pdf', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `product_sales_report_${new Date().toISOString().split('T')[0]}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  /** GET /api/reports/product-sales-excel — Export product sales report Excel */
  exportProductSalesReportExcel: async (params = {}) => {
    const response = await api.get('/api/reports/product-sales-excel', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `product_sales_report_${new Date().toISOString().split('T')[0]}.xlsx`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}
