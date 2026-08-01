import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, IconButton, InputLabel, MenuItem, Pagination, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Tooltip, alpha, Autocomplete, Chip, Tab, Tabs, Paper
} from '@mui/material'
import AgricultureRoundedIcon from '@mui/icons-material/AgricultureRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import Rating from '@mui/material/Rating'
import { suppliersApi } from '../../api/suppliersApi'
import { inventoryApi } from '../../api/inventoryApi'
import { tokens } from '../../theme/theme'
import StatusBadge from '../../components/common/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function SuppliersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  // Tabs
  const [activeTab, setActiveTab] = useState(0)

  // ── State for Supplier Tab ────────────────────────────────────────────────
  const [supPage, setSupPage] = useState(1)
  const [supSearch, setSupSearch] = useState('')
  const [supDialogOpen, setSupDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)

  // Supplier Form state
  const [supName, setSupName] = useState('')
  const [supPhone, setSupPhone] = useState('')
  const [supLocation, setSupLocation] = useState('')
  const [supTerms, setSupTerms] = useState('')
  const [supRating, setSupRating] = useState(3)
  const [supError, setSupError] = useState('')

  // ── State for PO Tab ───────────────────────────────────────────────────────
  const [poPage, setPoPage] = useState(1)
  const [poStatusFilter, setPoStatusFilter] = useState('')
  const [poDialogOpen, setPoDialogOpen] = useState(false)

  // PO Form state
  const [poSupplier, setPoSupplier] = useState(null)
  const [poExpectedDelivery, setPoExpectedDelivery] = useState('')
  const [poNotes, setPoNotes] = useState('')
  const [poItems, setPoItems] = useState([]) // [{ productId, productName, unit, quantity, unitCost (paise), subtotal }]
  const [poError, setPoError] = useState('')

  // PO Item Entry state
  const [poSelProduct, setPoSelProduct] = useState(null)
  const [poItemQty, setPoItemQty] = useState('1')
  const [poItemCost, setPoItemCost] = useState('')

  // Role permissions
  const canModify = user && ['owner', 'manager', 'accountant'].includes(user.role)

  // ── Queries ──────────────────────────────────────────────────────────────
  // 1. Suppliers List
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', supPage, supSearch],
    queryFn: () => suppliersApi.listSuppliers({
      page: supPage,
      perPage: 15,
      search: supSearch || undefined
    }),
  })
  const suppliers = suppliersQuery.data?.data || []
  const supPagination = suppliersQuery.data?.pagination

  // 2. POs List
  const posQuery = useQuery({
    queryKey: ['purchase-orders', poPage, poStatusFilter],
    queryFn: () => suppliersApi.listPurchaseOrders({
      page: poPage,
      perPage: 15,
      status: poStatusFilter || undefined
    }),
    enabled: activeTab === 1,
  })
  const purchaseOrders = posQuery.data?.data || []
  const poPagination = posQuery.data?.pagination

  // Products for PO creation
  const [prodSearch, setProdSearch] = useState('')
  const productsQuery = useQuery({
    queryKey: ['po-products', prodSearch],
    queryFn: () => inventoryApi.getProducts({ search: prodSearch || undefined, perPage: 20 }),
    enabled: poDialogOpen && prodSearch.length >= 1,
  })
  const availableProducts = productsQuery.data?.data || []

  // ── Mutations ────────────────────────────────────────────────────────────
  // Supplier Mutations
  const createSupMutation = useMutation({
    mutationFn: suppliersApi.createSupplier,
    onSuccess: () => {
      qc.invalidateQueries(['suppliers'])
      handleCloseSupDialog()
    },
    onError: (err) => {
      setSupError(err?.response?.data?.error || 'Failed to create supplier')
    }
  })

  const updateSupMutation = useMutation({
    mutationFn: ({ id, data }) => suppliersApi.updateSupplier(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['suppliers'])
      handleCloseSupDialog()
    },
    onError: (err) => {
      setSupError(err?.response?.data?.error || 'Failed to update supplier')
    }
  })

  const toggleSupMutation = useMutation({
    mutationFn: suppliersApi.toggleSupplierActive,
    onSuccess: () => {
      qc.invalidateQueries(['suppliers'])
    }
  })

  // PO Mutations
  const createPOMutation = useMutation({
    mutationFn: suppliersApi.createPurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries(['purchase-orders'])
      handleClosePODialog()
    },
    onError: (err) => {
      setPoError(err?.response?.data?.error || 'Failed to create purchase order')
    }
  })

  // ── Handlers for Supplier ────────────────────────────────────────────────
  const handleOpenAddSup = () => {
    setEditingSupplier(null)
    setSupName('')
    setSupPhone('')
    setSupLocation('')
    setSupTerms('')
    setSupRating(3)
    setSupError('')
    setSupDialogOpen(true)
  }

  const handleOpenEditSup = (sup) => {
    setEditingSupplier(sup)
    setSupName(sup.name)
    setSupPhone(sup.phone || '')
    setSupLocation(sup.location || '')
    setSupTerms(sup.paymentTerms || '')
    setSupRating(sup.rating || 3)
    setSupError('')
    setSupDialogOpen(true)
  }

  const handleCloseSupDialog = () => {
    setSupDialogOpen(false)
  }

  const handleSubmitSupplier = (e) => {
    e.preventDefault()
    if (!supName.trim()) {
      setSupError('Name is required')
      return
    }

    const payload = {
      name: supName.trim(),
      phone: supPhone.trim() || null,
      location: supLocation.trim() || null,
      paymentTerms: supTerms.trim() || null,
      rating: supRating
    }

    if (editingSupplier) {
      updateSupMutation.mutate({ id: editingSupplier.id, data: payload })
    } else {
      createSupMutation.mutate(payload)
    }
  }

  // ── Handlers for PO ──────────────────────────────────────────────────────
  const handleOpenAddPO = () => {
    setPoSupplier(null)
    setPoExpectedDelivery('')
    setPoNotes('')
    setPoItems([])
    setPoSelProduct(null)
    setPoItemQty('1')
    setPoItemCost('')
    setPoError('')
    setPoDialogOpen(true)
  }

  const handleClosePODialog = () => {
    setPoDialogOpen(false)
  }

  const handleAddPOItem = () => {
    const productName = poSelProduct && typeof poSelProduct === 'object' ? poSelProduct.name : prodSearch.trim()
    const productId = poSelProduct && typeof poSelProduct === 'object' ? poSelProduct.id : null

    if (!productName) {
      setPoError('Please select or type a product name')
      return
    }

    const qty = parseFloat(poItemQty)
    const cost = parseFloat(poItemCost)
    if (isNaN(qty) || qty <= 0) {
      setPoError('Quantity must be greater than zero')
      return
    }
    if (isNaN(cost) || cost < 0) {
      setPoError('Invalid item cost')
      return
    }

    const costPaise = Math.round(cost * 100)
    const subtotal = Math.round(qty * costPaise)

    setPoItems(prev => {
      const idx = prev.findIndex(x => productId ? x.productId === productId : x.productName.toLowerCase() === productName.toLowerCase())
      if (idx > -1) {
        return prev.map((x, i) => i === idx ? { ...x, quantity: x.quantity + qty, subtotal: x.subtotal + subtotal } : x)
      }
      return [...prev, {
        productId,
        productName,
        unit: poSelProduct && typeof poSelProduct === 'object' ? poSelProduct.unit : 'kg',
        quantity: qty,
        unitPrice: costPaise,
        subtotal
      }]
    })

    setPoSelProduct(null)
    setProdSearch('')
    setPoItemQty('1')
    setPoItemCost('')
    setPoError('')
  }

  const handleRemovePOItem = (idx) => {
    setPoItems(prev => prev.filter((_, i) => i !== idx))
  }

  const poSubtotal = poItems.reduce((sum, item) => sum + item.subtotal, 0)

  const handleSubmitPO = (e) => {
    e.preventDefault()
    if (!poSupplier) {
      setPoError('Supplier is required')
      return
    }
    if (!poItems.length) {
      setPoError('At least one item is required in PO')
      return
    }

    const payload = {
      supplierId: poSupplier.id,
      expectedDelivery: poExpectedDelivery || null,
      notes: poNotes.trim() || null,
      items: poItems.map(item => ({
        productId: item.productId || null,
        productName: item.productId ? null : item.productName,
        quantity: item.quantity,
        unitCost: item.unitPrice / 100
      }))
    }

    createPOMutation.mutate(payload)
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AgricultureRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Supplier Management</Typography>
        </Box>
        {canModify && (
          activeTab === 0 ? (
            <Button
              id="btn-add-supplier"
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={handleOpenAddSup}
              sx={{ borderRadius: '12px' }}
            >
              Add Supplier
            </Button>
          ) : (
            <Button
              id="btn-new-po"
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={handleOpenAddPO}
              sx={{ borderRadius: '12px' }}
            >
              New Purchase Order
            </Button>
          )
        )}
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => { setActiveTab(v); setSupPage(1); setPoPage(1) }}>
          <Tab label="Supplier Directory" id="tab-suppliers" />
          <Tab label="Purchase Orders" id="tab-pos" />
        </Tabs>
      </Box>

      {/* ── TAB 1: Supplier Directory ────────────────────────────────────────── */}
      {activeTab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <TextField
              id="search-supplier"
              label="Search by name, location, phone"
              size="small"
              value={supSearch}
              onChange={(e) => { setSupSearch(e.target.value); setSupPage(1) }}
              sx={{ minWidth: 280 }}
              InputProps={{
                startAdornment: <SearchRoundedIcon sx={{ color: tokens.textSecondary, mr: 1 }} />
              }}
            />
          </Box>

          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
            {suppliersQuery.isError ? (
              <Box sx={{ p: 4 }}><Alert severity="error">Failed to load suppliers</Alert></Box>
            ) : suppliersQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : !suppliers.length ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '2rem', mb: 1 }}>🌾</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>No suppliers found</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Phone</TableCell>
                      <TableCell>Rating</TableCell>
                      <TableCell>Payment Terms</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {suppliers.map((sup) => (
                      <TableRow key={sup.id} hover sx={{ opacity: sup.isActive ? 1 : 0.6 }}>
                        <TableCell sx={{ fontWeight: 600 }}>{sup.name}</TableCell>
                        <TableCell>{sup.location || '—'}</TableCell>
                        <TableCell>{sup.phone || '—'}</TableCell>
                        <TableCell>
                          <Rating value={sup.rating || 0} readOnly size="small" />
                        </TableCell>
                        <TableCell>{sup.paymentTerms || 'COD'}</TableCell>
                        <TableCell>
                          <Chip
                            label={sup.isActive ? 'Active' : 'Inactive'}
                            size="small"
                            color={sup.isActive ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            {canModify && (
                              <Tooltip title="Edit">
                                <IconButton
                                  id={`btn-edit-sup-${sup.id}`}
                                  size="small"
                                  onClick={() => handleOpenEditSup(sup)}
                                  sx={{ color: tokens.amber500 }}
                                >
                                  <EditRoundedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canModify && (
                              <Tooltip title={sup.isActive ? "Deactivate" : "Activate"}>
                                <IconButton
                                  id={`btn-toggle-sup-${sup.id}`}
                                  size="small"
                                  onClick={() => toggleSupMutation.mutate(sup.id)}
                                  sx={{ color: sup.isActive ? tokens.red500 : tokens.emerald600 }}
                                >
                                  {sup.isActive ? <BlockRoundedIcon fontSize="small" /> : <CheckCircleRoundedIcon fontSize="small" />}
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

            {supPagination && supPagination.totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Pagination count={supPagination.totalPages} page={supPage} onChange={(_, v) => setSupPage(v)} size="small" />
              </Box>
            )}
          </Card>
        </Box>
      )}

      {/* ── TAB 2: Purchase Orders ───────────────────────────────────────────── */}
      {activeTab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>PO Status</InputLabel>
              <Select
                id="filter-po-status"
                label="PO Status"
                value={poStatusFilter}
                onChange={(e) => { setPoStatusFilter(e.target.value); setPoPage(1) }}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="ordered">Ordered</MenuItem>
                <MenuItem value="received">Received</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
            {posQuery.isError ? (
              <Box sx={{ p: 4 }}><Alert severity="error">Failed to load purchase orders</Alert></Box>
            ) : posQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : !purchaseOrders.length ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '2rem', mb: 1 }}>📄</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>No purchase orders found</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>PO ID</TableCell>
                      <TableCell>Supplier</TableCell>
                      <TableCell>Expected Delivery</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Payment Status</TableCell>
                      <TableCell align="right">Total Cost</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {purchaseOrders.map((po) => (
                      <TableRow key={po.id} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{`PO-${po.id.toString().padStart(4, '0')}`}</TableCell>
                        <TableCell>{po.supplierName}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                          {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString('en-IN') : '—'}
                        </TableCell>
                        <TableCell><StatusBadge status={po.status} /></TableCell>
                        <TableCell><StatusBadge status={po.paymentStatus} /></TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>{fmtRupees(po.totalAmount)}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="View Details / Update Status">
                            <IconButton
                              id={`btn-view-po-${po.id}`}
                              size="small"
                              onClick={() => navigate(`/suppliers/po/${po.id}`)}
                              sx={{ color: tokens.emerald700 }}
                            >
                              <VisibilityRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {poPagination && poPagination.totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Pagination count={poPagination.totalPages} page={poPage} onChange={(_, v) => setPoPage(v)} size="small" />
              </Box>
            )}
          </Card>
        </Box>
      )}

      {/* Supplier Dialog */}
      <Dialog open={supDialogOpen} onClose={handleCloseSupDialog} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handleSubmitSupplier}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
          </DialogTitle>
          <Divider />
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {supError && <Alert severity="error">{supError}</Alert>}
              <TextField id="sup-name" label="Supplier Name" value={supName} onChange={e => setSupName(e.target.value)} required size="small" />
              <TextField id="sup-phone" label="Phone" value={supPhone} onChange={e => setSupPhone(e.target.value)} size="small" />
              <TextField id="sup-location" label="Location / City" value={supLocation} onChange={e => setSupLocation(e.target.value)} size="small" />
              <TextField id="sup-terms" label="Payment Terms" value={supTerms} onChange={e => setSupTerms(e.target.value)} placeholder="e.g. COD, Net 15" size="small" />
              <Box>
                <Typography sx={{ fontSize: '0.75rem', color: tokens.textSecondary, mb: 0.5 }}>Supplier Rating</Typography>
                <Rating value={supRating} onChange={(_, v) => setSupRating(v || 3)} />
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleCloseSupDialog} variant="outlined">Cancel</Button>
            <Button id="btn-sup-submit" type="submit" variant="contained" disabled={createSupMutation.isPending || updateSupMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* PO Dialog */}
      <Dialog open={poDialogOpen} onClose={handleClosePODialog} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handleSubmitPO}>
          <DialogTitle sx={{ fontWeight: 700 }}>New Purchase Order</DialogTitle>
          <Divider />
          <DialogContent>
            <Grid container spacing={2.5} sx={{ pt: 1 }}>
              {poError && <Grid item xs={12}><Alert severity="error">{poError}</Alert></Grid>}

              <Grid item xs={12} sm={6}>
                <Autocomplete
                  id="po-supplier"
                  options={suppliers.filter(s => s.isActive)}
                  getOptionLabel={(s) => s.name || ''}
                  value={poSupplier}
                  onChange={(_, v) => setPoSupplier(v)}
                  renderInput={(params) => <TextField {...params} label="Supplier" required size="small" />}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  id="po-delivery-date"
                  label="Expected Delivery Date"
                  type="date"
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={poExpectedDelivery}
                  onChange={e => setPoExpectedDelivery(e.target.value)}
                />
              </Grid>

              {/* Item bar */}
              <Grid item xs={12}>
                <Typography sx={{ fontWeight: 700, mb: 1, fontSize: '0.9rem' }}>Add Items</Typography>
                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={5}>
                    <Autocomplete
                      id="po-product-search"
                      freeSolo
                      options={availableProducts}
                      getOptionLabel={(p) => (typeof p === 'string' ? p : p.name || '')}
                      inputValue={prodSearch}
                      onInputChange={(_, v) => setProdSearch(v)}
                      value={poSelProduct}
                      onChange={(_, v) => {
                        setPoSelProduct(v)
                        if (v && typeof v === 'object') {
                          setPoItemCost((v.purchasePrice ? v.purchasePrice / 100 : 0).toString())
                        }
                      }}
                      renderInput={(params) => <TextField {...params} label="Search/Add Product" size="small" />}
                    />
                  </Grid>
                  <Grid item xs={3}>
                    <TextField id="po-item-qty" label="Qty" type="number" size="small" value={poItemQty} onChange={e => setPoItemQty(e.target.value)} />
                  </Grid>
                  <Grid item xs={3}>
                    <TextField id="po-item-cost" label="Cost (₹)" type="number" size="small" value={poItemCost} onChange={e => setPoItemCost(e.target.value)} />
                  </Grid>
                  <Grid item xs={1}>
                    <Button variant="outlined" onClick={handleAddPOItem} sx={{ minWidth: 40, height: 40, borderRadius: '10px' }}>
                      Add
                    </Button>
                  </Grid>
                </Grid>
              </Grid>

              {/* Items Table */}
              <Grid item xs={12}>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Cost Price</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {!poItems.length ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 3, color: tokens.textSecondary }}>
                            No products added to PO.
                          </TableCell>
                        </TableRow>
                      ) : (
                        poItems.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ fontWeight: 600 }}>{item.productName}</TableCell>
                            <TableCell align="right">{`${item.quantity} ${item.unit || 'kg'}`}</TableCell>
                            <TableCell align="right">{fmtRupees(item.unitPrice)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtRupees(item.subtotal)}</TableCell>
                            <TableCell align="center">
                              <IconButton size="small" onClick={() => handleRemovePOItem(idx)} sx={{ color: tokens.red500 }}>
                                <DeleteRoundedIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              {/* Notes and Totals */}
              <Grid item xs={12} sm={6}>
                <TextField id="po-notes" label="Notes" multiline rows={2} fullWidth size="small" value={poNotes} onChange={e => setPoNotes(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ background: tokens.surfaceAlt, p: 2, borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%' }}>
                  <Typography sx={{ fontWeight: 700 }}>Total PO Cost</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: tokens.emerald600 }}>{fmtRupees(poSubtotal)}</Typography>
                </Box>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClosePODialog} variant="outlined">Cancel</Button>
            <Button id="btn-po-submit" type="submit" variant="contained" disabled={createPOMutation.isPending || !poItems.length}>
              Save PO Draft
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  )
}
