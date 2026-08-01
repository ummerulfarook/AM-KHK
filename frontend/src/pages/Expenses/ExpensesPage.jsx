import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, IconButton, InputLabel, MenuItem, Pagination, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Tooltip, alpha, Chip, Snackbar
} from '@mui/material'
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import { expensesApi } from '../../api/expensesApi'
import { tokens } from '../../theme/theme'
import StatusBadge from '../../components/common/StatusBadge'
import StatCard from '../../components/common/StatCard'
import { useAuth } from '../../contexts/AuthContext'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const EXPENSE_CATEGORIES = [
  { value: 'transport', label: 'Transport' },
  { value: 'labour', label: 'Labour' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'rent', label: 'Rent' },
  { value: 'misc', label: 'Miscellaneous' },
]

export default function ExpensesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── State ────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null) // null means creating

  // Form Fields
  const [category, setCategory] = useState('misc')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' })

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity })

  // Role permissions
  const canApprove = user && ['owner', 'accountant'].includes(user.role)
  const canDelete = user && ['owner', 'manager'].includes(user.role)

  // ── Query ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['expenses', page, categoryFilter, statusFilter, dateFrom, dateTo],
    queryFn: () => expensesApi.listExpenses({
      page,
      perPage: 15,
      category: categoryFilter || undefined,
      status: statusFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  })

  const expenses = data?.data || []
  const summary = data?.summary || { pendingApprovals: 0, totalApproved: 0 }
  const pagination = data?.pagination

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: expensesApi.createExpense,
    onSuccess: () => {
      qc.invalidateQueries(['expenses'])
      qc.invalidateQueries(['dashboard'])
      handleCloseDialog()
      showToast('Expense logged successfully')
    },
    onError: (err) => {
      setFormError(err?.response?.data?.error || 'Failed to log expense')
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => expensesApi.updateExpense(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(['expenses'])
      qc.invalidateQueries(['dashboard'])
      handleCloseDialog()
      showToast('Expense updated successfully')
    },
    onError: (err) => {
      setFormError(err?.response?.data?.error || 'Failed to update expense')
    }
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => expensesApi.updateExpenseStatus(id, status),
    onSuccess: (_, variables) => {
      qc.invalidateQueries(['expenses'])
      qc.invalidateQueries(['dashboard'])
      showToast(`Expense successfully ${variables.status}`)
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to update status', 'error')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: expensesApi.deleteExpense,
    onSuccess: () => {
      qc.invalidateQueries(['expenses'])
      qc.invalidateQueries(['dashboard'])
      showToast('Expense deleted successfully')
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to delete expense', 'error')
    }
  })

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleOpenAdd = () => {
    setEditingExpense(null)
    setCategory('misc')
    setAmount('')
    setExpenseDate(new Date().toISOString().split('T')[0])
    setNotes('')
    setFormError('')
    setDialogOpen(true)
  }

  const handleOpenEdit = (exp) => {
    setEditingExpense(exp)
    setCategory(exp.category)
    setAmount((exp.amount / 100).toString())
    setExpenseDate(exp.expenseDate)
    setNotes(exp.notes || '')
    setFormError('')
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      setFormError('Amount must be greater than zero')
      return
    }

    const payload = {
      category,
      amount: amt,
      expenseDate,
      notes: notes.trim() || null
    }

    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <RequestQuoteRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Expense Tracker</Typography>
        </Box>
        <Button
          id="btn-add-expense"
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={handleOpenAdd}
          sx={{ borderRadius: '12px' }}
        >
          Log Expense
        </Button>
      </Box>

      {/* Stats row */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6}>
          <StatCard
            title="Pending Approvals"
            value={summary.pendingApprovals.toString()}
            icon={<RequestQuoteRoundedIcon sx={{ color: tokens.amber500 }} />}
            subtitle="Needs accountant/owner verification"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <StatCard
            title="Total Approved Expenses"
            value={fmtRupees(summary.totalApproved)}
            icon={<RequestQuoteRoundedIcon sx={{ color: tokens.red500 }} />}
            subtitle="Current aggregated approved total"
          />
        </Grid>
      </Grid>

      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Category</InputLabel>
          <Select
            id="filter-category"
            label="Category"
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All Categories</MenuItem>
            {EXPENSE_CATEGORIES.map(c => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select
            id="filter-status"
            label="Status"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </Select>
        </FormControl>

        <TextField
          id="filter-date-from"
          label="From Date"
          type="date"
          size="small"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          id="filter-date-to"
          label="To Date"
          type="date"
          size="small"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1) }}
          InputLabelProps={{ shrink: true }}
        />
      </Box>

      {/* Expenses Table */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
        {isError ? (
          <Box sx={{ p: 4 }}><Alert severity="error">Failed to load expenses</Alert></Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : !expenses.length ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>📊</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>No expenses recorded</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Logged By</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expenses.map(exp => (
                  <TableRow key={exp.id} hover sx={{ opacity: exp.status === 'rejected' ? 0.5 : 1 }}>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                      {new Date(exp.expenseDate).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                      {exp.category}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: tokens.red500 }}>
                      {fmtRupees(exp.amount)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                      {exp.recordedByName || 'System'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exp.notes || '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={exp.status} /></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {exp.status === 'pending' && canApprove && (
                          <>
                            <Tooltip title="Approve">
                              <IconButton
                                id={`btn-approve-${exp.id}`}
                                size="small"
                                onClick={() => statusMutation.mutate({ id: exp.id, status: 'approved' })}
                                sx={{ color: tokens.emerald600 }}
                              >
                                <CheckCircleRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject">
                              <IconButton
                                id={`btn-reject-${exp.id}`}
                                size="small"
                                onClick={() => statusMutation.mutate({ id: exp.id, status: 'rejected' })}
                                sx={{ color: tokens.red500 }}
                              >
                                <CancelRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {exp.status === 'pending' && (
                          <Tooltip title="Edit">
                            <IconButton
                              id={`btn-edit-${exp.id}`}
                              size="small"
                              onClick={() => handleOpenEdit(exp)}
                              sx={{ color: tokens.amber500 }}
                            >
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {exp.status === 'pending' && canDelete && (
                          <Tooltip title="Delete">
                            <IconButton
                              id={`btn-delete-${exp.id}`}
                              size="small"
                              onClick={() => deleteMutation.mutate(exp.id)}
                              sx={{ color: tokens.red500 }}
                            >
                              <DeleteRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
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
              size="small"
            />
          </Box>
        )}
      </Card>

      {/* Log Expense Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {editingExpense ? 'Edit Expense Log' : 'Log Expense'}
          </DialogTitle>
          <Divider />
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              {formError && <Alert severity="error">{formError}</Alert>}

              <FormControl fullWidth size="small" required>
                <InputLabel>Category</InputLabel>
                <Select
                  id="exp-category"
                  label="Category"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map(c => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                id="exp-amount"
                label="Amount (₹)"
                type="number"
                required
                fullWidth
                size="small"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                inputProps={{ step: 0.01, min: 0.01 }}
              />

              <TextField
                id="exp-date"
                label="Expense Date"
                type="date"
                required
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                value={expenseDate}
                onChange={e => setExpenseDate(e.target.value)}
              />

              <TextField
                id="exp-notes"
                label="Description / Notes"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Details of expense..."
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleCloseDialog} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
            <Button
              id="btn-exp-submit"
              type="submit"
              variant="contained"
              disabled={createMutation.isPending || updateMutation.isPending}
              sx={{ borderRadius: '10px' }}
            >
              Save Log
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Snackbar */}
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
