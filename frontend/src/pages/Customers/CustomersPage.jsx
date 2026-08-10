import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  IconButton, InputLabel, MenuItem, Pagination, Select, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography, Tooltip, alpha, Chip
} from '@mui/material'
import GroupRoundedIcon from '@mui/icons-material/GroupRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import { customersApi } from '../../api/customersApi'
import { tokens } from '../../theme/theme'
import { useAuth } from '../../contexts/AuthContext'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function CustomersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── State ────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null) // null means creating
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState(null)

  // Form Fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [type, setType] = useState('retail')
  const [creditLimit, setCreditLimit] = useState('0')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [partner, setPartner] = useState('neutral')
  const [formError, setFormError] = useState('')

  // Role permissions
  const canModify = user && ['owner', 'manager', 'accountant'].includes(user.role)

  // ── Query ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', page, search, typeFilter, partnerFilter],
    queryFn: () => customersApi.listCustomers({
      page,
      perPage: 15,
      search: search || undefined,
      type: typeFilter || undefined,
      partner: partnerFilter || undefined,
    }),
  })

  const customers = data?.data || []
  const pagination = data?.pagination

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: customersApi.createCustomer,
    onSuccess: () => {
      qc.invalidateQueries(['customers'])
      handleCloseDialog()
    },
    onError: (err) => {
      setFormError(err?.response?.data?.error || 'Failed to create customer')
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => customersApi.updateCustomer(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['customers'])
      handleCloseDialog()
    },
    onError: (err) => {
      setFormError(err?.response?.data?.error || 'Failed to update customer')
    }
  })

  const toggleMutation = useMutation({
    queryKey: ['customers'],
    mutationFn: customersApi.toggleCustomerActive,
    onSuccess: () => {
      qc.invalidateQueries(['customers'])
    }
  })

  const deleteMutation = useMutation({
    mutationFn: customersApi.deleteCustomer,
    onSuccess: () => {
      qc.invalidateQueries(['customers'])
      setDeleteConfirmOpen(false)
      setCustomerToDelete(null)
    },
    onError: (err) => {
      alert(err?.response?.data?.error || 'Failed to delete customer')
    }
  })

  // ── Dialog Handlers ──────────────────────────────────────────────────────
  const handleOpenAdd = () => {
    setEditingCustomer(null)
    setName('')
    setPhone('')
    setAddress('')
    setType('retail')
    setCreditLimit('0')
    setOpeningBalance('0')
    setPartner('neutral')
    setFormError('')
    setDialogOpen(true)
  }

  const handleOpenEdit = (cust) => {
    setEditingCustomer(cust)
    setName(cust.name)
    setPhone(cust.phone || '')
    setAddress(cust.address || '')
    setType(cust.type)
    setCreditLimit((cust.creditLimit / 100).toString())
    setOpeningBalance((cust.openingBalance / 100).toString())
    setPartner(cust.partner || 'neutral')
    setFormError('')
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Name is required')
      return
    }

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      type,
      creditLimit: parseFloat(creditLimit) || 0,
      openingBalance: parseFloat(openingBalance) || 0,
      partner: partner
    }

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <GroupRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Customer Directory (CRM)</Typography>
        </Box>
        {canModify && (
          <Button
            id="btn-add-customer"
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={handleOpenAdd}
            sx={{ borderRadius: '12px' }}
          >
            Add Customer
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          id="search-customer"
          label="Search by name or phone"
          size="small"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          sx={{ minWidth: 260 }}
          InputProps={{
            startAdornment: <SearchRoundedIcon sx={{ color: tokens.textSecondary, mr: 1 }} />
          }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Customer Type</InputLabel>
          <Select
            id="filter-type"
            label="Customer Type"
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All Types</MenuItem>
            <MenuItem value="retail">Retail</MenuItem>
            <MenuItem value="wholesale">Wholesale</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Partner</InputLabel>
          <Select
            id="filter-partner"
            label="Partner"
            value={partnerFilter}
            onChange={(e) => { setPartnerFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All Partners</MenuItem>
            <MenuItem value="am">AM</MenuItem>
            <MenuItem value="khk">KHK</MenuItem>
            <MenuItem value="neutral">Neutral</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Data Table */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
        {isError ? (
          <Box sx={{ p: 4 }}><Alert severity="error">Failed to load customers</Alert></Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : !customers.length ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>👥</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>No customers found</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Partner</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Credit Limit</TableCell>
                  <TableCell>Dues (Outstanding)</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id} hover sx={{ opacity: c.isActive ? 1 : 0.6 }}>
                    <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={c.type.toUpperCase()}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          backgroundColor: c.type === 'wholesale' ? alpha(tokens.blue500, 0.12) : alpha(tokens.emerald500, 0.12),
                          color: c.type === 'wholesale' ? tokens.blue500 : tokens.emerald600
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={(c.partner || 'neutral').toUpperCase()}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          backgroundColor: c.partner === 'am' 
                            ? alpha(tokens.amber500, 0.12) 
                            : c.partner === 'khk' 
                              ? alpha(tokens.blue500, 0.12) 
                              : alpha(tokens.textSecondary, 0.12),
                          color: c.partner === 'am' 
                            ? tokens.amber500 
                            : c.partner === 'khk' 
                              ? tokens.blue500 
                              : tokens.textSecondary
                        }}
                      />
                    </TableCell>
                    <TableCell>{c.phone || '—'}</TableCell>
                    <TableCell>{c.type === 'wholesale' ? fmtRupees(c.creditLimit) : 'No Limit'}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: c.outstandingBalance > 0 ? tokens.red500 : tokens.emerald600 }}>
                      {fmtRupees(c.outstandingBalance || 0)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={c.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        color={c.isActive ? 'success' : 'default'}
                        variant={c.isActive ? 'filled' : 'outlined'}
                        sx={{ height: 20, fontSize: '0.72rem', fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="View Profile / History">
                          <IconButton
                            id={`btn-view-${c.id}`}
                            size="small"
                            onClick={() => navigate(`/customers/${c.id}`)}
                            sx={{ color: tokens.emerald700 }}
                          >
                            <VisibilityRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canModify && (
                          <Tooltip title="Edit">
                            <IconButton
                              id={`btn-edit-${c.id}`}
                              size="small"
                              onClick={() => handleOpenEdit(c)}
                              sx={{ color: tokens.amber500 }}
                            >
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canModify && (
                          <Tooltip title={c.isActive ? "Deactivate" : "Activate"}>
                            <IconButton
                              id={`btn-toggle-${c.id}`}
                              size="small"
                              onClick={() => toggleMutation.mutate(c.id)}
                              sx={{ color: c.isActive ? tokens.red500 : tokens.emerald600 }}
                            >
                              {c.isActive ? <BlockRoundedIcon fontSize="small" /> : <CheckCircleRoundedIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                        {canModify && (
                          <Tooltip title="Delete Customer">
                            <IconButton
                              id={`btn-delete-${c.id}`}
                              size="small"
                              color="error"
                              onClick={() => {
                                setCustomerToDelete(c)
                                setDeleteConfirmOpen(true)
                              }}
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
              color="primary"
              size="small"
            />
          </Box>
        )}
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
          </DialogTitle>
          <Divider />
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {formError && <Alert severity="error">{formError}</Alert>}

              <TextField
                id="cust-form-name"
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
                size="small"
              />

              <TextField
                id="cust-form-phone"
                label="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
                size="small"
              />

              <TextField
                id="cust-form-address"
                label="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                multiline
                rows={2}
                fullWidth
                size="small"
              />

              <FormControl fullWidth size="small">
                <InputLabel>Customer Type</InputLabel>
                <Select
                  id="cust-form-type"
                  label="Customer Type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <MenuItem value="retail">Retail</MenuItem>
                  <MenuItem value="wholesale">Wholesale</MenuItem>
                </Select>
              </FormControl>

              {type === 'wholesale' && (
                <TextField
                  id="cust-form-limit"
                  label="Credit Limit (₹)"
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  fullWidth
                  size="small"
                  InputProps={{
                    startAdornment: <Typography sx={{ mr: 1, color: tokens.textSecondary }}>₹</Typography>
                  }}
                />
              )}

              <TextField
                id="cust-form-ob"
                label="Opening Balance / Initial Dues (₹)"
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1, color: tokens.textSecondary }}>₹</Typography>
                }}
              />

              <FormControl fullWidth size="small">
                <InputLabel>Associated Partner</InputLabel>
                <Select
                  id="cust-form-partner"
                  label="Associated Partner"
                  value={partner}
                  onChange={(e) => setPartner(e.target.value)}
                >
                  <MenuItem value="neutral">Neutral (None)</MenuItem>
                  <MenuItem value="am">AM</MenuItem>
                  <MenuItem value="khk">KHK</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleCloseDialog} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
            <Button
              id="btn-cust-submit"
              type="submit"
              variant="contained"
              disabled={createMutation.isPending || updateMutation.isPending}
              sx={{ borderRadius: '10px' }}
            >
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Customer?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: tokens.textSecondary, mb: 1 }}>
            Are you sure you want to delete customer <strong>{customerToDelete?.name}</strong>?
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.red500, fontWeight: 600 }}>
            ⚠️ This will completely remove the customer. Note that you can only delete customers who have no active transaction or billing history.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} variant="outlined" sx={{ borderRadius: '10px' }}>
            Cancel
          </Button>
          <Button
            onClick={() => deleteMutation.mutate(customerToDelete.id)}
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
            sx={{ borderRadius: '10px' }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  )
}
