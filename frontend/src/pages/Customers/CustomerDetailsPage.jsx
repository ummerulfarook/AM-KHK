import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Card, CardContent, CircularProgress, Divider, Grid,
  IconButton, LinearProgress, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography, alpha, Chip, Button, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControl,
  InputLabel, Select, MenuItem, Paper, Snackbar, Tooltip
} from '@mui/material'
import { useAuth } from '../../contexts/AuthContext'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import PrintRoundedIcon from '@mui/icons-material/PrintRounded'
import { customersApi } from '../../api/customersApi'
import { settingsApi } from '../../api/settingsApi'
import { inventoryApi } from '../../api/inventoryApi'
import { billingApi } from '../../api/billingApi'
import { tokens } from '../../theme/theme'
import StatusBadge from '../../components/common/StatusBadge'
import StatCard from '../../components/common/StatCard'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function CustomerDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tabValue, setTabValue] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [selectedUpiAccount, setSelectedUpiAccount] = useState('')
  const [selectedBank, setSelectedBank] = useState('')
  const [payInvoiceRef, setPayInvoiceRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState('')

  // Toast / Feedback State
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' })
  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity })

  // Sub-store states & mutations
  const [newStoreName, setNewStoreName] = useState('')
  const [editingStoreId, setEditingStoreId] = useState(null)
  const [editingStoreName, setEditingStoreName] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState('')

  const createStoreMutation = useMutation({
    mutationFn: (data) => customersApi.createCustomerStore(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['customer', id])
      setNewStoreName('')
      showToast('Sub-store added successfully')
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to add sub-store', 'error')
    }
  })

  const updateStoreMutation = useMutation({
    mutationFn: ({ storeId, data }) => customersApi.updateCustomerStore(storeId, data),
    onSuccess: () => {
      qc.invalidateQueries(['customer', id])
      setEditingStoreId(null)
      showToast('Sub-store updated successfully')
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to update sub-store', 'error')
    }
  })

  // All products for sales report dropdown
  const productsQuery = useQuery({
    queryKey: ['all-products-list'],
    queryFn: () => inventoryApi.getProducts({ perPage: 5000 }),
  })
  const products = productsQuery.data?.data || []

  const canModify = user && ['owner', 'manager', 'accountant'].includes(user.role)

  const settingsQuery = useQuery({
    queryKey: ['shop-settings'],
    queryFn: settingsApi.getSettings,
  })

  const upiAccounts = useMemo(() => {
    try {
      return JSON.parse(settingsQuery.data?.data?.upi_accounts || '[]')
    } catch (e) {
      return []
    }
  }, [settingsQuery.data])

  const bankAccounts = useMemo(() => {
    try {
      return JSON.parse(settingsQuery.data?.data?.bank_accounts || '[]')
    } catch (e) {
      return []
    }
  }, [settingsQuery.data])

  // ── Queries ──────────────────────────────────────────────────────────────
  const customerQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.getCustomer(id),
  })

  const historyQuery = useQuery({
    queryKey: ['customer-history', id, historyPage, dateFrom, dateTo, selectedStoreId],
    queryFn: () => customersApi.getCustomerHistory(id, {
      page: historyPage,
      perPage: (dateFrom || dateTo) ? 1000 : 10,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      storeId: selectedStoreId || undefined
    }),
  })

  const creditQuery = useQuery({
    queryKey: ['customer-credit', id, dateFrom, dateTo],
    queryFn: () => customersApi.getCustomerCredit(id, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined
    }),
  })

  const customer = customerQuery.data?.data
  const history = historyQuery.data?.data || []
  const credit = creditQuery.data?.data
  const pagination = historyQuery.data?.pagination

  const isLoading = customerQuery.isLoading || creditQuery.isLoading
  const isError = customerQuery.isError || creditQuery.isError

  const recordPaymentMutation = useMutation({
    mutationFn: (data) => customersApi.recordCustomerPayment(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['customer', id])
      qc.invalidateQueries(['customer-credit', id])
      qc.invalidateQueries(['customer-history', id])
      setPayDialogOpen(false)
      setPayAmount('')
      setSelectedUpiAccount('')
      setSelectedBank('')
      setPayInvoiceRef('')
      setPayNotes('')
      setPayError('')
    },
    onError: (err) => {
      setPayError(err?.response?.data?.error || 'Failed to record payment')
    }
  })

  const handlePaymentSubmit = (e) => {
    e.preventDefault()
    setPayError('')
    if (!payAmount || parseFloat(payAmount) <= 0) {
      setPayError('Please enter a valid amount')
      return
    }
    recordPaymentMutation.mutate({
      amount: parseFloat(payAmount),
      method: payMethod,
      upiId: selectedUpiAccount || null,
      bankName: payMethod === 'bank' ? selectedBank : null,
      invoiceRef: payInvoiceRef || null,
      notes: payNotes.trim() || null
    })
  }

  const handleOpenPayForInvoice = (invoiceRef, balance) => {
    setPayAmount((balance / 100).toString())
    setPayInvoiceRef(invoiceRef)
    setPayDialogOpen(true)
  }

  const handleDownloadPDF = async (saleId, invoiceNumber) => {
    try {
      await billingApi.downloadInvoice(saleId, invoiceNumber)
      setToast({ open: true, msg: 'Invoice PDF downloaded successfully!', severity: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ open: true, msg: 'Failed to download invoice PDF', severity: 'error' })
    }
  }

  const handleThermalPrint = async (saleId) => {
    try {
      await billingApi.printReceipt(saleId)
      setToast({ open: true, msg: 'Receipt sent to printer', severity: 'success' })
    } catch (err) {
      console.error(err)
      const errMsg = err?.response?.data?.error || 'Thermal printer offline or not connected.'
      setToast({ open: true, msg: `Print Failed: ${errMsg}`, severity: 'error' })
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !customer) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load customer profile details</Alert>
      </Box>
    )
  }

  // Credit details
  const limit = credit?.creditLimit || 0
  const outstanding = credit?.totalOutstanding || 0
  const availableCredit = Math.max(0, limit - outstanding)
  const creditPercent = limit > 0 ? Math.min(100, (outstanding / limit) * 100) : 0

  return (
    <Box>
      <style>{`
        @media print {
          .no-print,
          .contact-info-card,
          .limit-card,
          .avail-card,
          header,
          footer,
          .MuiTabs-root {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .desktop-only {
            display: none !important;
          }
          .outstanding-card {
            width: 100% !important;
            max-width: 100% !important;
            flex-basis: 100% !important;
          }
          .print-full-width {
            width: 100% !important;
            max-width: 100% !important;
            flex-basis: 100% !important;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* Back button + Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/customers')} sx={{ border: `1px solid ${tokens.border}` }} className="no-print">
            <ArrowBackRoundedIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{customer.name}</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
              <Chip
                label={customer.type.toUpperCase()}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  backgroundColor: customer.type === 'wholesale' ? alpha(tokens.blue500, 0.12) : alpha(tokens.emerald500, 0.12),
                  color: customer.type === 'wholesale' ? tokens.blue500 : tokens.emerald600
                }}
              />
              <Chip
                label={(customer.partner || 'neutral').toUpperCase()}
                size="small"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  backgroundColor: customer.partner === 'am' 
                    ? alpha(tokens.amber500, 0.12) 
                    : customer.partner === 'khk' 
                      ? alpha(tokens.blue500, 0.12) 
                      : alpha(tokens.textSecondary, 0.12),
                  color: customer.partner === 'am' 
                    ? tokens.amber500 
                    : customer.partner === 'khk' 
                      ? tokens.blue500 
                      : tokens.textSecondary
                }}
              />
              <Chip
                label={customer.isActive ? 'Active' : 'Inactive'}
                size="small"
                color={customer.isActive ? 'success' : 'default'}
                sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
              />
            </Box>
          </Box>
        </Box>
        <Stack direction="row" spacing={2} className="no-print">
          <TextField
            id="statement-date-from"
            label="From Date"
            type="date"
            size="small"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setHistoryPage(1) }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 140, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.8 } }}
          />
          <TextField
            id="statement-date-to"
            label="To Date"
            type="date"
            size="small"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setHistoryPage(1) }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 140, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.8 } }}
          />
          {(dateFrom || dateTo) && (
            <Button
              size="small"
              color="error"
              onClick={() => { setDateFrom(''); setDateTo(''); setHistoryPage(1) }}
              sx={{ fontWeight: 600, minWidth: 'auto', px: 1 }}
            >
              Clear
            </Button>
          )}
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate(`/billing?customerId=${customer.id}`)}
            sx={{ borderRadius: '10px', fontWeight: 600, px: 3, py: 1 }}
          >
            New Sale
          </Button>
          <Button
            id="btn-download-customer-pdf"
            variant="outlined"
            color="primary"
            startIcon={downloadingPdf ? <CircularProgress size={16} /> : <PictureAsPdfRoundedIcon />}
            onClick={async () => {
              setDownloadingPdf(true)
              try {
                await customersApi.downloadCustomerLedgerPdf(id, { dateFrom, dateTo }, customer.name)
              } catch (e) {
                alert('Failed to download customer statement PDF')
              } finally {
                setDownloadingPdf(false)
              }
            }}
            disabled={downloadingPdf}
            sx={{ borderRadius: '10px', fontWeight: 600, px: 2, py: 1 }}
          >
            Download PDF
          </Button>
          <Button
            variant="outlined"
            onClick={() => window.print()}
            sx={{ borderRadius: '10px', fontWeight: 600, px: 2.5, py: 1 }}
          >
            Print Statement
          </Button>
          {canModify && customer.outstandingBalance > 0 && (
            <Button
              id="btn-record-payment"
              variant="contained"
              onClick={() => {
                setPayAmount((customer.outstandingBalance / 100).toString())
                setPayInvoiceRef('')
                setPayDialogOpen(true)
              }}
              sx={{
                borderRadius: '10px',
                backgroundColor: tokens.emerald500,
                color: '#fff',
                fontWeight: 600,
                px: 3,
                py: 1,
                '&:hover': { backgroundColor: tokens.emerald600 }
              }}
            >
              Record Payment / Clear Dues
            </Button>
          )}
        </Stack>
      </Box>

      {/* Metrics Row */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4} className="outstanding-card">
          <StatCard
            title="Total Outstanding Credit"
            value={fmtRupees(outstanding)}
            icon={<CreditCardRoundedIcon sx={{ color: tokens.red500 }} />}
            subtitle="Pending dues"
          />
        </Grid>
        <Grid item xs={12} sm={4} className="limit-card">
          <StatCard
            title="Credit Limit"
            value={customer.type === 'wholesale' ? fmtRupees(limit) : 'No Limit'}
            icon={<CreditCardRoundedIcon sx={{ color: tokens.blue500 }} />}
            subtitle="Wholesale credit cap"
          />
        </Grid>
        <Grid item xs={12} sm={4} className="avail-card">
          <StatCard
            title="Available Credit Balance"
            value={customer.type === 'wholesale' ? fmtRupees(availableCredit) : 'Unlimited'}
            icon={<CreditCardRoundedIcon sx={{ color: tokens.emerald500 }} />}
            subtitle="Remaining limit"
          />
        </Grid>
      </Grid>

      {/* Profile Details and Tabs */}
      <Grid container spacing={3} className="desktop-only">
        {/* Left column: Quick Info */}
        <Grid item xs={12} md={4} className="contact-info-card">
          <Stack spacing={3}>
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Contact & Info</Typography>
                <Stack spacing={2}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <PhoneRoundedIcon sx={{ color: tokens.textSecondary, fontSize: 20 }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>Phone</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{customer.phone || 'Not provided'}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <HomeRoundedIcon sx={{ color: tokens.textSecondary, fontSize: 20 }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>Address</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{customer.address || 'Not provided'}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 20, color: tokens.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>🪙</Typography>
                    <Box>
                      <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>Opening Balance (OB)</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{fmtRupees(customer.openingBalance || 0)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <CalendarMonthRoundedIcon sx={{ color: tokens.textSecondary, fontSize: 20 }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>Customer Since</Typography>
                      <Typography sx={{ fontWeight: 600 }}>
                        {new Date(customer.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'long', year: 'numeric'
                        })}
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* Sub-Stores Manager Card */}
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Sub-Stores / Branches</Typography>
                <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 2 }}>
                  Manage multiple store locations under this customer's account.
                </Typography>

                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  {(customer.stores || []).map((store) => (
                    <Box
                      key={store.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1.5,
                        borderRadius: '12px',
                        backgroundColor: tokens.background,
                        border: `1px solid ${tokens.border}`
                      }}
                    >
                      {editingStoreId === store.id ? (
                        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
                          <TextField
                            size="small"
                            value={editingStoreName}
                            onChange={(e) => setEditingStoreName(e.target.value)}
                            fullWidth
                            autoFocus
                          />
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            onClick={() => updateStoreMutation.mutate({ storeId: store.id, data: { name: editingStoreName } })}
                          >
                            Save
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setEditingStoreId(null)}
                          >
                            Cancel
                          </Button>
                        </Box>
                      ) : (
                        <>
                          <Box>
                            <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{store.name}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
                              Status: {store.isActive ? 'Active' : 'Inactive'}
                            </Typography>
                          </Box>
                          {canModify && (
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Button
                                size="small"
                                variant="text"
                                sx={{ minWidth: 0, textTransform: 'none', py: 0.25 }}
                                onClick={() => {
                                  setEditingStoreId(store.id)
                                  setEditingStoreName(store.name)
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="small"
                                variant="text"
                                color={store.isActive ? 'error' : 'success'}
                                sx={{ minWidth: 0, textTransform: 'none', py: 0.25 }}
                                onClick={() => updateStoreMutation.mutate({ storeId: store.id, data: { isActive: !store.isActive } })}
                              >
                                {store.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                  ))}
                  {(!customer.stores || customer.stores.length === 0) && (
                    <Typography sx={{ fontSize: '0.875rem', color: tokens.textSecondary, fontStyle: 'italic', py: 1, textAlign: 'center' }}>
                      No sub-stores configured.
                    </Typography>
                  )}
                </Stack>

                {canModify && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <TextField
                      placeholder="Add Store Name..."
                      size="small"
                      value={newStoreName}
                      onChange={(e) => setNewStoreName(e.target.value)}
                      fullWidth
                    />
                    <Button
                      variant="contained"
                      onClick={() => {
                        if (!newStoreName.trim()) return
                        createStoreMutation.mutate({ name: newStoreName })
                      }}
                      disabled={createStoreMutation.isPending}
                      sx={{
                        borderRadius: '10px',
                        textTransform: 'none',
                        backgroundColor: tokens.emerald500,
                        '&:hover': { backgroundColor: tokens.emerald600 }
                      }}
                    >
                      Add
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* Right column: Purchase History & Credit Ledger Tabs */}
        <Grid item xs={12} md={8} className="print-full-width">
          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ px: 2 }}>
                <Tab label="Purchase History" />
                <Tab label="Outstanding Dues" />
                <Tab label="Payment History" />
                <Tab label="Sales Report" />
              </Tabs>
            </Box>

            {/* Tab 1: Purchase History */}
            {tabValue === 0 && (
              <Box sx={{ p: 2 }}>
                {/* Store Filter */}
                {customer && customer.stores && customer.stores.length > 0 && (
                  <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-start' }}>
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                      <InputLabel id="history-store-filter-label">Filter by Store</InputLabel>
                      <Select
                        labelId="history-store-filter-label"
                        id="history-store-filter"
                        value={selectedStoreId}
                        label="Filter by Store"
                        onChange={(e) => {
                          setSelectedStoreId(e.target.value)
                          setHistoryPage(1)
                        }}
                      >
                        <MenuItem value="">
                          <em>All Stores / Direct Invoices</em>
                        </MenuItem>
                        {customer.stores.map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {s.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                )}

                {historyQuery.isLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
                ) : !history.length ? (
                  <Typography sx={{ textAlign: 'center', py: 4, color: tokens.textSecondary }}>
                    No purchase history found.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Invoice #</TableCell>
                          <TableCell>Store</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell align="right">Total Amt</TableCell>
                          <TableCell align="center">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id} hover>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {new Date(h.createdAt).toLocaleDateString('en-IN')}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{h.invoiceNumber}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                              {h.storeName || 'Direct / Main'}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={h.type.toUpperCase()}
                                size="small"
                                sx={{
                                  fontSize: '0.65rem',
                                  height: 18,
                                  backgroundColor: h.type === 'retail' ? alpha(tokens.emerald500, 0.1) : alpha(tokens.blue500, 0.1),
                                  color: h.type === 'retail' ? tokens.emerald600 : tokens.blue500
                                }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtRupees(h.total)}</TableCell>
                            <TableCell align="center" style={{ whiteSpace: 'nowrap' }}>
                              <Tooltip title="Download PDF">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => handleDownloadPDF(h.id, h.invoiceNumber)}
                                >
                                  <PictureAsPdfRoundedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Thermal Print">
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => handleThermalPrint(h.id)}
                                  sx={{ ml: 0.5 }}
                                >
                                  <PrintRoundedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* Tab 2: Outstanding Dues */}
            {tabValue === 1 && (
              <Box sx={{ p: 3 }}>
                {/* Credit Progress Limit */}
                {customer.type === 'wholesale' && (
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Credit Limit Usage</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {fmtRupees(outstanding)} / {fmtRupees(limit)} ({creditPercent.toFixed(0)}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={creditPercent}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: tokens.surfaceAlt,
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: creditPercent > 80 ? tokens.red500 : creditPercent > 50 ? tokens.amber500 : tokens.emerald600
                        }
                      }}
                    />
                  </Box>
                )}

                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Unpaid Credit Ledger Invoices</Typography>
                {!credit?.entries?.filter(e => e.status !== 'paid').length ? (
                  <Typography sx={{ color: tokens.textSecondary }}>No unpaid outstanding bills.</Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Due Date</TableCell>
                          <TableCell>Invoice Ref</TableCell>
                          <TableCell align="right">Invoice Amt</TableCell>
                          <TableCell align="right">Paid</TableCell>
                          <TableCell align="right">Balance</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="center">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {credit.entries.filter(e => e.status !== 'paid').map((e) => (
                          <TableRow key={e.id} hover>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-IN') : '—'}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{e.invoiceRef}</TableCell>
                            <TableCell align="right">{fmtRupees(e.amount)}</TableCell>
                            <TableCell align="right">{fmtRupees(e.amountPaid)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: tokens.red500 }}>
                              {fmtRupees(e.balance)}
                            </TableCell>
                            <TableCell><StatusBadge status={e.status} /></TableCell>
                            <TableCell align="center">
                              {canModify && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleOpenPayForInvoice(e.invoiceRef, e.balance)}
                                  sx={{ borderRadius: '6px', textTransform: 'none', py: 0.25 }}
                                >
                                  Pay
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}

            {/* Tab 3: Payment History */}
            {tabValue === 2 && (
              <Box sx={{ p: 2 }}>
                {!credit?.payments?.length ? (
                  <Typography sx={{ textAlign: 'center', py: 4, color: tokens.textSecondary }}>
                    No payment history found.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Invoice Ref</TableCell>
                          <TableCell>Payment Method</TableCell>
                          <TableCell align="right">Amount Paid</TableCell>
                          <TableCell>Recorded By</TableCell>
                          <TableCell>Notes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {credit.payments.map((p) => (
                          <TableRow key={p.id} hover>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {new Date(p.recordedAt).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{p.invoiceRef || 'General'}</TableCell>
                            <TableCell>
                              <Chip
                                label={p.method.toUpperCase()}
                                size="small"
                                sx={{
                                  fontSize: '0.65rem',
                                  height: 18,
                                  backgroundColor: p.method === 'cash' ? alpha(tokens.emerald500, 0.1) : alpha(tokens.blue500, 0.1),
                                  color: p.method === 'cash' ? tokens.emerald600 : tokens.blue500
                                }}
                              />
                              {p.method === 'upi' && p.upiId && ` (${p.upiId})`}
                              {p.method === 'bank' && p.bankName && ` (${p.bankName})`}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>
                              {fmtRupees(p.amount)}
                            </TableCell>
                            <TableCell>{p.recordedByName || 'System'}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                              {p.notes || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Print-only Statement Content */}
      <Box className="print-only" sx={{ mt: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: tokens.forest900, textAlign: 'center' }}>
          Customer Statement of Account
        </Typography>
        <Typography variant="subtitle1" sx={{ mb: 3, color: tokens.textSecondary, textAlign: 'center' }}>
          {customer.name} | Total Outstanding Credit: {fmtRupees(outstanding)}
          {(dateFrom || dateTo) && (
            <span style={{ display: 'block', fontSize: '0.85rem', marginTop: '4px' }}>
              Period: {dateFrom ? new Date(dateFrom).toLocaleDateString('en-IN') : 'Beginning'} to {dateTo ? new Date(dateTo).toLocaleDateString('en-IN') : 'Present'}
            </span>
          )}
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, color: tokens.forest800 }}>
          Purchase History
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 4, borderRadius: '12px' }}>
          <Table size="small">
            <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Invoice #</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Total Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((h, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {new Date(h.createdAt).toLocaleDateString('en-IN')}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{h.invoiceNumber}</TableCell>
                  <TableCell>{(h.type || '').toUpperCase()}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtRupees(h.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, color: tokens.forest800 }}>
          Payment History
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
          <Table size="small">
            <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Invoice Ref</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell align="right">Amount Paid</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!credit?.payments?.length ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: tokens.textSecondary }}>
                    No payment history found.
                  </TableCell>
                </TableRow>
              ) : (
                credit.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {new Date(p.recordedAt).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{p.invoiceRef || 'General'}</TableCell>
                    <TableCell>
                      {(p.method || '').toUpperCase()}
                      {p.method === 'upi' && p.upiId ? ` (${p.upiId})` : ''}
                      {p.method === 'bank' && p.bankName ? ` (${p.bankName})` : ''}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>
                      {fmtRupees(p.amount)}
                    </TableCell>
                    <TableCell>{p.notes || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
      {/* Record Payment Dialog */}
      <Dialog open={payDialogOpen} onClose={() => setPayDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handlePaymentSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>Record Customer Payment</DialogTitle>
          <Divider />
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {payError && <Alert severity="error">{payError}</Alert>}
              {payInvoiceRef ? (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  Paying for Invoice Ref: <strong>{payInvoiceRef}</strong>
                </Alert>
              ) : (
                <Typography variant="body2" sx={{ color: tokens.textSecondary }}>
                  Enter the payment amount received from this customer. The payment will be automatically applied to their oldest outstanding credit entries first.
                </Typography>
              )}
              <TextField
                label="Payment Amount (₹)"
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                fullWidth
                size="small"
                inputProps={{ min: 0.01, step: 0.01 }}
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1, color: tokens.textSecondary }}>₹</Typography>
                }}
              />
              <FormControl fullWidth size="small">
                <InputLabel>Payment Method</InputLabel>
                <Select
                  label="Payment Method"
                  value={payMethod}
                  onChange={(e) => {
                    setPayMethod(e.target.value)
                    if (e.target.value === 'upi' && upiAccounts.length > 0) {
                      setSelectedUpiAccount(upiAccounts[0].name)
                    } else {
                      setSelectedUpiAccount('')
                    }
                    if (e.target.value === 'bank' && bankAccounts.length > 0) {
                      setSelectedBank(bankAccounts[0].name)
                    } else {
                      setSelectedBank('')
                    }
                  }}
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="upi">UPI</MenuItem>
                  <MenuItem value="bank">Bank Transfer</MenuItem>
                </Select>
              </FormControl>

              {payMethod === 'upi' && upiAccounts.length > 0 && (
                <FormControl fullWidth size="small">
                  <InputLabel>UPI Account</InputLabel>
                  <Select
                    label="UPI Account"
                    value={selectedUpiAccount}
                    onChange={e => setSelectedUpiAccount(e.target.value)}
                    required
                  >
                    {upiAccounts.map(ac => (
                      <MenuItem key={ac.name} value={ac.name}>
                        {ac.name} ({ac.upi})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {payMethod === 'upi' && upiAccounts.length === 0 && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  No UPI accounts configured under Settings.
                </Alert>
              )}

              {payMethod === 'bank' && bankAccounts.length > 0 && (
                <FormControl fullWidth size="small">
                  <InputLabel>Bank Account</InputLabel>
                  <Select
                    label="Bank Account"
                    value={selectedBank}
                    onChange={e => setSelectedBank(e.target.value)}
                    required
                  >
                    {bankAccounts.map(ac => (
                      <MenuItem key={ac.name} value={ac.name}>
                        {ac.name} ({ac.account})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {payMethod === 'bank' && bankAccounts.length === 0 && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  No Bank accounts configured under Settings.
                </Alert>
              )}

              <TextField
                label="Notes (optional)"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                multiline
                rows={2}
                fullWidth
                size="small"
                placeholder="e.g. Cleared pending dues for June"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setPayDialogOpen(false)} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={recordPaymentMutation.isPending}
              sx={{ borderRadius: '10px', backgroundColor: tokens.emerald500, '&:hover': { backgroundColor: tokens.emerald600 } }}
            >
              {recordPaymentMutation.isPending ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      {/* Tab 4: Sales Report */}
      {tabValue === 3 && (
        <CustomerSalesReportView
          customerId={id}
          customerName={customer.name}
          stores={customer.stores || []}
          products={products}
          tokens={tokens}
        />
      )}

      {/* Toast Notification */}
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} sx={{ width: '100%', borderRadius: '10px' }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}


// ── Customer Sales Report Sub-View Component ─────────────────────────────────

function CustomerSalesReportView({ customerId, customerName, stores, products, tokens }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [productId, setProductId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [sortStoresByAmount, setSortStoresByAmount] = useState(true) // true = highest first

  const reportQuery = useQuery({
    queryKey: ['customer-sales-report', customerId, dateFrom, dateTo, productId, storeId],
    queryFn: () => customersApi.getCustomerSalesReport(customerId, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      productId: productId || undefined,
      storeId: storeId || undefined
    })
  })

  const reportData = reportQuery.data?.data || []
  const summary = reportQuery.data?.summary || { totalInvoices: 0, totalQuantity: 0, totalAmount: 0 }
  const storeSubtotals = reportQuery.data?.storeSubtotals || {}

  // Sort store subtotals
  const sortedStoreSubtotals = useMemo(() => {
    const entries = Object.entries(storeSubtotals)
    if (sortStoresByAmount) {
      return entries.sort(([, a], [, b]) => b.amount - a.amount)
    }
    return entries.sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
  }, [storeSubtotals, sortStoresByAmount])

  const handleDownloadPdf = async () => {
    try {
      await customersApi.downloadCustomerSalesReportPdf(customerId, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        productId: productId || undefined,
        storeId: storeId || undefined
      }, customerName)
    } catch (e) {
      console.error(e)
    }
  }

  const handleExportExcel = async () => {
    try {
      await customersApi.exportCustomerSalesReportExcel(customerId, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        productId: productId || undefined,
        storeId: storeId || undefined
      }, customerName)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Filters Bar */}
      <Grid container spacing={2} sx={{ mb: 3 }} className="no-print">
        <Grid item xs={12} sm={3}>
          <TextField
            label="From Date"
            type="date"
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            label="To Date"
            type="date"
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl size="small" fullWidth>
            <InputLabel id="rep-prod-filter-label">Product</InputLabel>
            <Select
              labelId="rep-prod-filter-label"
              value={productId}
              label="Product"
              onChange={(e) => setProductId(e.target.value)}
            >
              <MenuItem value="">
                <em>All Products</em>
              </MenuItem>
              {products.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl size="small" fullWidth>
            <InputLabel id="rep-store-filter-label">Store</InputLabel>
            <Select
              labelId="rep-store-filter-label"
              value={storeId}
              label="Store"
              onChange={(e) => setStoreId(e.target.value)}
            >
              <MenuItem value="">
                <em>All Stores / Direct Invoices</em>
              </MenuItem>
              {stores.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Export Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mb: 3 }} className="no-print">
        <Button
          variant="outlined"
          startIcon={<PictureAsPdfRoundedIcon />}
          onClick={handleDownloadPdf}
          sx={{ borderRadius: '10px', textTransform: 'none' }}
        >
          Download PDF
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadRoundedIcon />}
          onClick={handleExportExcel}
          sx={{ borderRadius: '10px', textTransform: 'none' }}
        >
          Export Excel
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Box sx={{ p: 2, backgroundColor: tokens.surfaceAlt, borderRadius: '12px', border: `1px solid ${tokens.border}`, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: tokens.textSecondary, fontWeight: 600 }}>Total Invoices</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{summary.totalInvoices}</Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Box sx={{ p: 2, backgroundColor: tokens.surfaceAlt, borderRadius: '12px', border: `1px solid ${tokens.border}`, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: tokens.textSecondary, fontWeight: 600 }}>Total Quantity Sold</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{summary.totalQuantity.toFixed(2)}</Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Box sx={{ p: 2, backgroundColor: tokens.surfaceAlt, borderRadius: '12px', border: `1px solid ${tokens.border}`, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: tokens.textSecondary, fontWeight: 600 }}>Total Sales Amount</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: tokens.emerald600 }}>{fmtRupees(summary.totalAmount)}</Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Main Details Table */}
      {reportQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : !reportData.length ? (
        <Typography sx={{ textAlign: 'center', py: 4, color: tokens.textSecondary }}>
          No report data found for selected filters.
        </Typography>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${tokens.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <Table size="small">
            <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Invoice #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Store</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Quantity</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Unit</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Unit Price</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Total Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reportData.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{row.invoiceNumber}</TableCell>
                  <TableCell>{new Date(row.date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{row.storeName}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{row.productName}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{row.quantity}</TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell align="right">{fmtRupees(row.unitPrice)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>{fmtRupees(row.totalAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Store-wise Subtotals section */}
      {Object.keys(storeSubtotals).length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: tokens.forest800 }}>Store-wise Subtotals</Typography>
            <Button
              size="small"
              variant="outlined"
              sx={{ borderRadius: '8px', textTransform: 'none', fontSize: '0.75rem', py: 0.25 }}
              onClick={() => setSortStoresByAmount(s => !s)}
            >
              {sortStoresByAmount ? 'Sorted: Highest First' : 'Sorted: A–Z'}
            </Button>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <TableContainer component={Paper} elevation={0} sx={{ maxWidth: 420, border: `1px solid ${tokens.border}`, borderRadius: '12px', overflow: 'hidden' }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Store Name</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedStoreSubtotals.map(([storeName, sub]) => (
                    <TableRow key={storeName}>
                      <TableCell sx={{ fontWeight: 600 }}>{storeName}</TableCell>
                      <TableCell align="right">{sub.quantity.toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>{fmtRupees(sub.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      )}
    </Box>
  )
}
