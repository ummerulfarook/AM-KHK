import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, IconButton, InputLabel, MenuItem, Pagination, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Tooltip, alpha, Snackbar
} from '@mui/material'
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import PaymentRoundedIcon from '@mui/icons-material/PaymentRounded'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import { creditApi } from '../../api/creditApi'
import { tokens } from '../../theme/theme'
import StatusBadge from '../../components/common/StatusBadge'
import StatCard from '../../components/common/StatCard'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function CreditPage() {
  const qc = useQueryClient()

  // ── State ────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeEntry, setActiveEntry] = useState(null)
  
  // Payment Form fields
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNotes, setPayNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' })

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity })

  // ── Query ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['credit-ledger', page, search, statusFilter],
    queryFn: () => creditApi.listCredit({
      page,
      perPage: 15,
      search: search || undefined,
      status: statusFilter || undefined,
    }),
  })

  const entries = data?.data || []
  const summary = data?.summary || { totalOutstanding: 0, overdueBalance: 0, collectedToday: 0 }
  const pagination = data?.pagination

  // ── Mutations ────────────────────────────────────────────────────────────
  const payMutation = useMutation({
    mutationFn: ({ id, payload }) => creditApi.recordPayment(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(['credit-ledger'])
      qc.invalidateQueries(['dashboard'])
      handleCloseDialog()
      showToast('Payment recorded successfully')
    },
    onError: (err) => {
      setFormError(err?.response?.data?.error || 'Failed to record payment')
    }
  })

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleOpenPay = (entry) => {
    setActiveEntry(entry)
    setPayAmount((entry.balance / 100).toString())
    setPayMethod('cash')
    setPayNotes('')
    setFormError('')
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
  }

  const handleSubmitPayment = (e) => {
    e.preventDefault()
    if (!activeEntry) return

    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) {
      setFormError('Amount must be greater than zero')
      return
    }

    const payload = {
      amount: amt,
      method: payMethod,
      notes: payNotes.trim() || null
    }

    payMutation.mutate({ id: activeEntry.id, payload })
  }

  const handleWhatsApp = (entry) => {
    const balanceRs = (entry.balance / 100).toFixed(2)
    const dueDateStr = entry.dueDate ? new Date(entry.dueDate).toLocaleDateString('en-IN') : 'N/A'
    const msgText = `Hello *${entry.customerName}*,\n\n` +
      `This is a friendly reminder that an outstanding payment of *₹${balanceRs}* is pending for Invoice *${entry.invoiceRef}* (due on *${dueDateStr}*).\n\n` +
      `Please settle this at your earliest convenience.\n\n` +
      `Thank you,\nAM & KHK Vegetable Merchants`

    const encodedText = encodeURIComponent(msgText)
    const url = entry.customerPhone
      ? `https://wa.me/91${entry.customerPhone.replace(/\D/g, '')}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`

    window.open(url, '_blank')
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CreditCardRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Credit Ledger</Typography>
        </Box>
        <Button
          className="no-print"
          variant="outlined"
          onClick={() => window.print()}
          sx={{ borderRadius: '12px' }}
        >
          Print Ledger
        </Button>
      </Box>

      {/* Aggregate Cards */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="Total Outstanding"
            value={fmtRupees(summary.totalOutstanding)}
            icon={<CreditCardRoundedIcon sx={{ color: tokens.amber500 }} />}
            subtitle="Across all accounts"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="Overdue Dues"
            value={fmtRupees(summary.overdueBalance)}
            icon={<CreditCardRoundedIcon sx={{ color: tokens.red500 }} />}
            subtitle="Past due date"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="Dues Collected Today"
            value={fmtRupees(summary.collectedToday)}
            icon={<PaymentRoundedIcon sx={{ color: tokens.emerald500 }} />}
            subtitle="Cash / UPI / Bank collections"
          />
        </Grid>
      </Grid>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          id="search-credit"
          label="Search by customer name"
          size="small"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          sx={{ minWidth: 260 }}
          InputProps={{
            startAdornment: <SearchRoundedIcon sx={{ color: tokens.textSecondary, mr: 1 }} />
          }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Credit Status</InputLabel>
          <Select
            id="filter-credit-status"
            label="Credit Status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="due">Due</MenuItem>
            <MenuItem value="due_soon">Due Soon</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Credit Table */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
        {isError ? (
          <Box sx={{ p: 4 }}><Alert severity="error">Failed to load credit entries</Alert></Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : !entries.length ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>💳</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>No outstanding credits</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Customer</TableCell>
                  <TableCell>Invoice Ref</TableCell>
                  <TableCell align="right">Invoice Amt</TableCell>
                  <TableCell align="right">Paid Amt</TableCell>
                  <TableCell align="right">Outstanding Balance</TableCell>
                  <TableCell>Due Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} hover sx={{ opacity: entry.status === 'paid' ? 0.6 : 1 }}>
                    <TableCell sx={{ fontWeight: 600 }}>{entry.customerName}</TableCell>
                    <TableCell>{entry.invoiceRef || `ID: ${entry.id}`}</TableCell>
                    <TableCell align="right">{fmtRupees(entry.amount)}</TableCell>
                    <TableCell align="right">{fmtRupees(entry.amountPaid)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: entry.status === 'paid' ? 'inherit' : tokens.red500 }}>
                      {fmtRupees(entry.balance)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                      {entry.dueDate ? new Date(entry.dueDate).toLocaleDateString('en-IN') : '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={entry.status} /></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {entry.status !== 'paid' && (
                          <>
                            <Button
                              id={`btn-pay-${entry.id}`}
                              variant="outlined"
                              size="small"
                              startIcon={<PaymentRoundedIcon />}
                              onClick={() => handleOpenPay(entry)}
                              sx={{ borderRadius: '8px', fontSize: '0.75rem', py: 0.5 }}
                            >
                              Pay
                            </Button>
                            <Tooltip title="Send WhatsApp Reminder">
                              <IconButton
                                id={`btn-whatsapp-${entry.id}`}
                                size="small"
                                onClick={() => handleWhatsApp(entry)}
                                sx={{
                                  color: '#25D366',
                                  border: `1px solid ${alpha('#25D366', 0.25)}`,
                                  backgroundColor: alpha('#25D366', 0.05),
                                  '&:hover': { backgroundColor: alpha('#25D366', 0.15) }
                                }}
                              >
                                <WhatsAppIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {pagination && pagination.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: `1px solid ${tokens.border}` }}>
            <Pagination
              count={pagination.totalPages}
              page={page}
              onChange={(_, v) => setPage(v)}
              color="primary"
              size="small"
            />
          </Box>
        )}
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handleSubmitPayment}>
          <DialogTitle sx={{ fontWeight: 700 }}>Record Payment</DialogTitle>
          <Divider />
          <DialogContent>
            {activeEntry && (
              <Stack spacing={2.5} sx={{ pt: 1 }}>
                {formError && <Alert severity="error">{formError}</Alert>}

                <Box sx={{ background: tokens.surfaceAlt, p: 2, borderRadius: '12px' }}>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary }}>Outstanding Balance</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: tokens.red500 }}>
                    {fmtRupees(activeEntry.balance)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary, mt: 0.5, display: 'block' }}>
                    Customer: <strong>{activeEntry.customerName}</strong>
                  </Typography>
                </Box>

                <TextField
                  id="pay-form-amount"
                  label="Payment Amount (₹)"
                  type="number"
                  required
                  fullWidth
                  size="small"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  inputProps={{ step: 0.01, min: 0.01 }}
                />

                <FormControl fullWidth size="small">
                  <InputLabel>Payment Method</InputLabel>
                  <Select
                    id="pay-form-method"
                    label="Payment Method"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <MenuItem value="cash">Cash</MenuItem>
                    <MenuItem value="upi">UPI</MenuItem>
                    <MenuItem value="bank">Bank Transfer</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  id="pay-form-notes"
                  label="Notes / Reference Number"
                  fullWidth
                  size="small"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="GPay ref, cheque #, etc…"
                />
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleCloseDialog} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
            <Button
              id="btn-pay-submit"
              type="submit"
              variant="contained"
              disabled={payMutation.isPending}
              sx={{ borderRadius: '10px' }}
            >
              Record
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Snackbar Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.severity} sx={{ borderRadius: '12px' }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}
