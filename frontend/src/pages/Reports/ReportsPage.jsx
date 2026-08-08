import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Grid,
  Stack, TextField, Typography, alpha, Paper,
  Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, Chip, Autocomplete
} from '@mui/material'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import PrintRoundedIcon from '@mui/icons-material/PrintRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded'
import { reportsApi } from '../../api/reportsApi'
import { tokens } from '../../theme/theme'
import StatCard from '../../components/common/StatCard'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function ReportsPage() {
  const [workingDate] = useState(() => {
    return sessionStorage.getItem('working_date') || ''
  })

  const getLocalDateString = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - (offset * 60 * 1000))
    return localDate.toISOString().split('T')[0]
  }

  const defaultDate = workingDate || getLocalDateString()

  const [dateFrom, setDateFrom] = useState(workingDate)
  const [dateTo, setDateTo] = useState(workingDate)
  const [targetDate, setTargetDate] = useState(defaultDate)
  const [partnerFilter, setPartnerFilter] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [reportType, setReportType] = useState('daily') // daily, monthly, yearly, expense, credit, purchase, purchase_payment

  // Optional customer filter
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // Tabs state: 0 = Custom Reports, 1 = UPI/Bank Accounts
  const [activeTab, setActiveTab] = useState(0)

  // ── Queries ────────────────────────────────────────────────────────────────
  const customersQuery = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => import('../../api/authApi').then(m =>
      m.default.get('/api/customers/').then(r => r.data.data || [])
    ),
  })
  const customers = customersQuery.data || []

  const reportsQuery = useQuery({
    queryKey: ['custom-reports', reportType, targetDate, dateFrom, dateTo, partnerFilter],
    queryFn: () => reportsApi.getCustomReport({
      type: reportType,
      date: targetDate || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      partner: partnerFilter || undefined,
    }),
    enabled: activeTab === 0,
  })

  const upiReportQuery = useQuery({
    queryKey: ['upi-accounts-report', dateFrom, dateTo],
    queryFn: () => reportsApi.getUpiReports({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    enabled: activeTab === 1,
  })

  const bankReportQuery = useQuery({
    queryKey: ['bank-accounts-report', dateFrom, dateTo],
    queryFn: () => reportsApi.getBankReports({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    enabled: activeTab === 1,
  })

  const reportDataRaw = reportsQuery.data?.data || []
  const summary = reportsQuery.data?.summary || {}

  // Filter report rows based on selected customer client-side if applicable
  const filteredReportData = useMemo(() => {
    if (!selectedCustomer) return reportDataRaw
    const nameLower = selectedCustomer.name.toLowerCase()
    return reportDataRaw.filter(row => {
      if (row.customerName) {
        return row.customerName.toLowerCase().includes(nameLower)
      }
      if (row.supplierName) {
        return row.supplierName.toLowerCase().includes(nameLower)
      }
      if (row.particulars) {
        return row.particulars.toLowerCase().includes(nameLower)
      }
      return false
    })
  }, [reportDataRaw, selectedCustomer])

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      await reportsApi.downloadExcelReport({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      })
    } catch (err) {
      alert('Failed to download Excel report')
    } finally {
      setExporting(false)
    }
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await reportsApi.downloadPdfReport({
        type: reportType,
        date: targetDate || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        partner: partnerFilter || undefined
      })
    } catch (err) {
      alert('Failed to download PDF report')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }} className="no-print">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TrendingUpIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Reports & Statements</Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<PrintRoundedIcon />}
            onClick={() => window.print()}
            sx={{ borderRadius: '12px' }}
          >
            Print
          </Button>
          {activeTab === 0 && (
            <>
              <Button
                id="btn-export-pdf-reports"
                variant="contained"
                color="primary"
                startIcon={exportingPdf ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfRoundedIcon />}
                onClick={handleExportPdf}
                disabled={exportingPdf}
                sx={{ borderRadius: '12px' }}
              >
                Download PDF Report
              </Button>
              <Button
                id="btn-export-reports"
                variant="outlined"
                startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadRoundedIcon />}
                onClick={handleExportExcel}
                disabled={exporting}
                sx={{ borderRadius: '12px' }}
              >
                Export Excel
              </Button>
            </>
          )}
        </Stack>
      </Box>

      {/* Tabs Selector */}
      <Box sx={{ borderBottom: 1, borderColor: tokens.border, mb: 3 }} className="no-print">
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} textColor="primary" indicatorColor="primary">
          <Tab label="Financial Reports Directory" sx={{ fontWeight: 600 }} />
          <Tab label="Payment Accounts Report" sx={{ fontWeight: 600 }} />
        </Tabs>
      </Box>

      {/* Filters Area */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3.5, flexWrap: 'wrap', alignItems: 'center' }} className="no-print">
        {activeTab === 0 && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Select Report Type</InputLabel>
            <Select
              id="select-report-type"
              label="Select Report Type"
              value={reportType}
              onChange={e => setReportType(e.target.value)}
            >
              <MenuItem value="daily">Daily Transaction Report</MenuItem>
              <MenuItem value="monthly">Monthly Transaction Report</MenuItem>
              <MenuItem value="yearly">Financial Year Report</MenuItem>
              <MenuItem value="expense">Expense & Purchase Report</MenuItem>
              <MenuItem value="credit">Customer Credit (Outstanding) Report</MenuItem>
              <MenuItem value="purchase">Supplier Purchase Orders Report</MenuItem>
              <MenuItem value="purchase_payment">Supplier Purchase Payments Report</MenuItem>
            </Select>
          </FormControl>
        )}

        {activeTab === 0 && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Partner</InputLabel>
            <Select
              id="select-partner"
              label="Partner"
              value={partnerFilter}
              onChange={e => setPartnerFilter(e.target.value)}
            >
              <MenuItem value="">All Partners</MenuItem>
              <MenuItem value="am">AM</MenuItem>
              <MenuItem value="khk">KHK</MenuItem>
              <MenuItem value="neutral">Neutral</MenuItem>
            </Select>
          </FormControl>
        )}

        {activeTab === 0 && ['daily', 'monthly', 'yearly'].includes(reportType) && (
          <TextField
            id="target-date"
            label="Target Date"
            type="date"
            size="small"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        )}

        {activeTab === 0 && !['daily', 'monthly', 'yearly'].includes(reportType) && (
          <>
            <TextField
              id="report-date-from"
              label="From Date"
              type="date"
              size="small"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              id="report-date-to"
              label="To Date"
              type="date"
              size="small"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}

        {activeTab === 1 && (
          <>
            <TextField
              id="accounts-date-from"
              label="From Date"
              type="date"
              size="small"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              id="accounts-date-to"
              label="To Date"
              type="date"
              size="small"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}

        {activeTab === 0 && (
          <Autocomplete
            id="report-customer-filter"
            options={customers}
            getOptionLabel={(c) => c.name || ''}
            value={selectedCustomer}
            onChange={(_, v) => setSelectedCustomer(v)}
            renderInput={(params) => <TextField {...params} label="Filter by Name (optional)" size="small" sx={{ width: 220 }} />}
          />
        )}
      </Box>

      {/* Printable Heading (Only visible in Print) */}
      <Box className="print-only" sx={{ display: 'none', mb: 3 }}>
        <Typography variant="h4" align="center" sx={{ fontWeight: 800, color: tokens.forest800 }}>
          AM & KHK VEGETABLE MERCHANTS
        </Typography>
        <Typography variant="subtitle1" align="center" sx={{ color: tokens.textSecondary, mb: 1 }}>
          Financial Statement & Transaction Report
        </Typography>
        <Typography variant="body2" align="center" sx={{ fontWeight: 600 }}>
          Report Type: {reportType.toUpperCase().replace('_', ' ')} | Date: {new Date().toLocaleDateString('en-IN')}
        </Typography>
        {selectedCustomer && (
          <Typography variant="body2" align="center" sx={{ fontWeight: 600 }}>
            Filtered Customer/Supplier: {selectedCustomer.name}
          </Typography>
        )}
        {partnerFilter && (
          <Typography variant="body2" align="center" sx={{ fontWeight: 600 }}>
            Partner: {partnerFilter.toUpperCase()}
          </Typography>
        )}
        <Divider sx={{ my: 2 }} />
      </Box>

      {/* ── TAB 0: Custom Reports Directory ─────────────────────────────────── */}
      {activeTab === 0 && (
        reportsQuery.isError ? (
          <Alert severity="error">Failed to load custom report details</Alert>
        ) : reportsQuery.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : (
          <Stack spacing={3.5}>
            {/* Report Totals Summary Card */}
            <Grid container spacing={2.5}>
              {['daily', 'monthly', 'yearly'].includes(reportType) && (
                <>
                  <Grid item xs={12} sm={4}>
                    <StatCard title="Total Income" value={fmtRupees(summary.income || 0)} subtitle="POS Sales" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <StatCard title="Total Expenses" value={fmtRupees(summary.expense || 0)} subtitle="Approved Expenses + POs" />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <StatCard
                      title="Net Profit"
                      value={fmtRupees(summary.net || 0)}
                      subtitle="Income minus Expenses"
                      valueColor={(summary.net || 0) >= 0 ? tokens.emerald600 : tokens.red500}
                    />
                  </Grid>
                </>
              )}

              {reportType === 'expense' && (
                <Grid item xs={12} sm={4}>
                  <StatCard title="Total Outflow" value={fmtRupees(summary.total || 0)} subtitle="Expenses & Purchase Orders" />
                </Grid>
              )}

              {reportType === 'credit' && (
                <>
                  <Grid item xs={12} sm={6}>
                    <StatCard title="Outstanding Dues" value={fmtRupees(summary.totalOutstanding || 0)} subtitle="All customer balances" valueColor={tokens.amber500} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <StatCard title="Dues Customers" value={summary.count || 0} subtitle="Registered credit buyers" />
                  </Grid>
                </>
              )}

              {reportType === 'purchase' && (
                <>
                  <Grid item xs={12} sm={6}>
                    <StatCard title="Total Purchases" value={fmtRupees(summary.total || 0)} subtitle="Total PO transactions" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <StatCard title="PO Count" value={summary.count || 0} subtitle="Purchase order list" />
                  </Grid>
                </>
              )}

              {reportType === 'purchase_payment' && (
                <>
                  <Grid item xs={12} sm={6}>
                    <StatCard title="Total Paid Out" value={fmtRupees(summary.total || 0)} subtitle="Supplier payment records" />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <StatCard title="PO Paid Count" value={summary.count || 0} subtitle="Supplier PO transactions log" />
                  </Grid>
                </>
              )}
            </Grid>

            {/* Custom Report Table */}
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
              <TableContainer component={Paper} elevation={0}>
                <Table size="small">
                  {/* Daily/Monthly/Yearly Headers */}
                  {['daily', 'monthly', 'yearly'].includes(reportType) && (
                    <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Particulars</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Boxes</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Income (₹)</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Expense (₹)</TableCell>
                      </TableRow>
                    </TableHead>
                  )}

                  {/* Expense Headers */}
                  {reportType === 'expense' && (
                    <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Notes / Details</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Amount (₹)</TableCell>
                      </TableRow>
                    </TableHead>
                  )}

                  {/* Credit Headers */}
                  {reportType === 'credit' && (
                    <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Customer Name</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Phone</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Partner</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Outstanding Balance (₹)</TableCell>
                      </TableRow>
                    </TableHead>
                  )}

                  {/* Purchase Headers */}
                  {reportType === 'purchase' && (
                    <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Supplier</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Payment Status</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Total Amount (₹)</TableCell>
                      </TableRow>
                    </TableHead>
                  )}

                  {/* Purchase Payment Headers */}
                  {reportType === 'purchase_payment' && (
                    <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Reference</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Supplier</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Payment Status</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Payment Notes</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Amount Paid (₹)</TableCell>
                      </TableRow>
                    </TableHead>
                  )}

                  <TableBody>
                    {!filteredReportData.length ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                          <Typography sx={{ color: tokens.textSecondary, fontWeight: 500 }}>
                            No report transactions found matching filter parameters.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredReportData.map((row, index) => (
                        <TableRow key={index} hover>
                          {/* Daily/Monthly/Yearly Rows */}
                          {['daily', 'monthly', 'yearly'].includes(reportType) && (
                            <>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{new Date(row.date).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{row.reference}</TableCell>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{row.particulars}</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                {row.boxes > 0 ? `${row.boxes} Bx` : '—'}
                              </TableCell>
                              <TableCell align="right" sx={{ color: tokens.emerald600, fontWeight: 700 }}>
                                {row.income > 0 ? fmtRupees(row.income) : '—'}
                              </TableCell>
                              <TableCell align="right" sx={{ color: tokens.red500, fontWeight: 600 }}>
                                {row.expense > 0 ? fmtRupees(row.expense) : '—'}
                              </TableCell>
                            </>
                          )}

                          {/* Expense Rows */}
                          {reportType === 'expense' && (
                            <>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{new Date(row.date).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{row.reference}</TableCell>
                              <TableCell>
                                <Chip label={row.category.toUpperCase()} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, backgroundColor: row.type === 'purchase_po' ? alpha(tokens.blue500, 0.1) : alpha(tokens.amber500, 0.1), color: row.type === 'purchase_po' ? tokens.blue500 : tokens.amber500 }} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{row.notes}</TableCell>
                              <TableCell align="right" sx={{ color: tokens.red500, fontWeight: 700 }}>{fmtRupees(row.amount)}</TableCell>
                            </>
                          )}

                          {/* Credit Rows */}
                          {reportType === 'credit' && (
                            <>
                              <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{row.phone}</TableCell>
                              <TableCell sx={{ textTransform: 'capitalize', fontSize: '0.82rem' }}>{row.type}</TableCell>
                              <TableCell>
                                <Chip label={row.partner?.toUpperCase() || 'NEUTRAL'} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ color: tokens.amber500, fontWeight: 700 }}>{fmtRupees(row.outstandingBalance)}</TableCell>
                            </>
                          )}

                          {/* Purchase Rows */}
                          {reportType === 'purchase' && (
                            <>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{new Date(row.date).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>PO-{row.id}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{row.supplierName}</TableCell>
                              <TableCell>
                                <Chip label={row.status.toUpperCase()} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} color={row.status === 'completed' ? 'success' : 'warning'} />
                              </TableCell>
                              <TableCell>
                                <Chip label={row.paymentStatus.toUpperCase()} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} color={row.paymentStatus === 'paid' ? 'success' : 'warning'} />
                              </TableCell>
                              <TableCell align="right" sx={{ color: tokens.red500, fontWeight: 700 }}>{fmtRupees(row.totalAmount)}</TableCell>
                            </>
                          )}

                          {/* Purchase Payment Rows */}
                          {reportType === 'purchase_payment' && (
                            <>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{new Date(row.date).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>PO-{row.id}</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{row.supplierName}</TableCell>
                              <TableCell>
                                <Chip label={row.paymentStatus.toUpperCase()} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} color={row.paymentStatus === 'paid' ? 'success' : 'warning'} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.82rem' }}>{row.notes}</TableCell>
                              <TableCell align="right" sx={{ color: tokens.red500, fontWeight: 700 }}>{fmtRupees(row.amount)}</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Stack>
        )
      )}

      {/* ── TAB 1: Payment Accounts Report ─────────────────────────────────── */}
      {activeTab === 1 && (
        <Grid container spacing={3.5}>
          {/* UPI Accounts */}
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>UPI Collections Summary</Typography>
                {upiReportQuery.isError ? (
                  <Alert severity="error">Failed to load UPI account summaries</Alert>
                ) : upiReportQuery.isLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>UPI ID / Account Name</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>Total Collected (₹)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {!(upiReportQuery.data?.data || []).length ? (
                          <TableRow>
                            <TableCell colSpan={2} align="center" sx={{ py: 3, color: tokens.textSecondary }}>No UPI collections</TableCell>
                          </TableRow>
                        ) : (
                          upiReportQuery.data.data.map((acc, idx) => (
                            <TableRow key={idx}>
                              <TableCell sx={{ fontWeight: 600 }}>{acc.upiId}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>{fmtRupees(acc.totalAmount)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Bank Accounts */}
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Bank Transfer Summary</Typography>
                {bankReportQuery.isError ? (
                  <Alert severity="error">Failed to load Bank summaries</Alert>
                ) : bankReportQuery.isLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Bank Name / Account</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>Total Collected (₹)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {!(bankReportQuery.data?.data || []).length ? (
                          <TableRow>
                            <TableCell colSpan={2} align="center" sx={{ py: 3, color: tokens.textSecondary }}>No Bank transfers</TableCell>
                          </TableRow>
                        ) : (
                          bankReportQuery.data.data.map((acc, idx) => (
                            <TableRow key={idx}>
                              <TableCell sx={{ fontWeight: 600 }}>{acc.bankName}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>{fmtRupees(acc.totalAmount)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
