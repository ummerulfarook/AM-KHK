import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, IconButton, InputLabel, MenuItem, Pagination, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, Tooltip, alpha, Autocomplete, Chip, Paper
} from '@mui/material'
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import { ordersApi } from '../../api/ordersApi'
import { inventoryApi } from '../../api/inventoryApi'
import { tokens } from '../../theme/theme'
import StatusBadge from '../../components/common/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function OrdersPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── State ────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  // Order Creation Form State
  const [customer, setCustomer] = useState(null)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('credit')
  const [discount, setDiscount] = useState('0')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([]) // [{ productId, productName, unit, quantity, unitPrice (paise), subtotal }]
  const [formError, setFormError] = useState('')

  // Product Add state
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [itemQty, setItemQty] = useState('1')
  const [itemPrice, setItemPrice] = useState('')

  // Role check
  const canCreate = user && ['owner', 'manager'].includes(user.role)

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders', page, search, statusFilter],
    queryFn: () => ordersApi.listOrders({
      page,
      perPage: 15,
      search: search || undefined,
      status: statusFilter || undefined,
    }),
  })

  const orders = data?.data || []
  const pagination = data?.pagination

  const customersQuery = useQuery({
    queryKey: ['customers-wholesale'],
    queryFn: () => import('../../api/authApi').then(m =>
      m.default.get('/api/customers/', { params: { perPage: 5000 } }).then(r => (r.data.data || []).filter(c => c.type === 'wholesale' && c.isActive))
    ),
  })
  const wholesaleCustomers = customersQuery.data || []

  // Products for item entry autocomplete
  const [prodSearch, setProdSearch] = useState('')
  const productsQuery = useQuery({
    queryKey: ['order-products', prodSearch],
    queryFn: () => inventoryApi.getProducts({ search: prodSearch || undefined, status: 'in_stock', perPage: 20 }),
    enabled: prodSearch.length >= 1,
  })
  const availableProducts = productsQuery.data?.data || []

  // ── Mutations ────────────────────────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: ordersApi.createOrder,
    onSuccess: () => {
      qc.invalidateQueries(['orders'])
      handleCloseDialog()
    },
    onError: (err) => {
      setFormError(err?.response?.data?.error || 'Failed to create wholesale order')
    }
  })

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleOpenAdd = () => {
    setCustomer(null)
    setDeliveryDate('')
    setPaymentMethod('credit')
    setDiscount('0')
    setNotes('')
    setItems([])
    setSelectedProduct(null)
    setItemQty('1')
    setItemPrice('')
    setFormError('')
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
  }

  const handleAddProductItem = () => {
    if (!selectedProduct) return
    const qty = parseFloat(itemQty)
    const price = parseFloat(itemPrice)
    if (isNaN(qty) || qty <= 0) {
      setFormError('Item quantity must be greater than 0')
      return
    }
    if (isNaN(price) || price < 0) {
      setFormError('Item price is invalid')
      return
    }

    const pricePaise = Math.round(price * 100)
    const subtotal = Math.round(qty * pricePaise)

    setItems(prev => {
      // check if exists
      const idx = prev.findIndex(x => x.productId === selectedProduct.id)
      if (idx > -1) {
        return prev.map((x, i) => i === idx ? { ...x, quantity: x.quantity + qty, subtotal: x.subtotal + subtotal } : x)
      }
      return [...prev, {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        unit: selectedProduct.unit,
        quantity: qty,
        unitPrice: pricePaise,
        subtotal
      }]
    })

    setSelectedProduct(null)
    setItemQty('1')
    setItemPrice('')
    setFormError('')
  }

  const handleRemoveItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const orderSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
  const discountPaise = Math.round((parseFloat(discount) || 0) * 100)
  const orderTotal = Math.max(0, orderSubtotal - discountPaise)

  const handleSubmitOrder = (e) => {
    e.preventDefault()
    if (!customer) {
      setFormError('Customer is required')
      return
    }
    if (!items.length) {
      setFormError('At least one item is required in the order')
      return
    }

    const payload = {
      customerId: customer.id,
      deliveryDate: deliveryDate || null,
      paymentMethod,
      discount: parseFloat(discount) || 0,
      notes: notes.trim() || null,
      items: items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice / 100 // send as rupees (backend translates)
      }))
    }

    createOrderMutation.mutate(payload)
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LocalShippingRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Wholesale Orders</Typography>
        </Box>
        {canCreate && (
          <Button
            id="btn-new-order"
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={handleOpenAdd}
            sx={{ borderRadius: '12px' }}
          >
            New Order
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          id="search-orders"
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
          <InputLabel>Order Status</InputLabel>
          <Select
            id="filter-order-status"
            label="Order Status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="confirmed">Confirmed</MenuItem>
            <MenuItem value="packed">Packed</MenuItem>
            <MenuItem value="out_for_delivery">Out For Delivery</MenuItem>
            <MenuItem value="delivered">Delivered</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Data Table */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
        {isError ? (
          <Box sx={{ p: 4 }}><Alert severity="error">Failed to load orders</Alert></Box>
        ) : isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : !orders.length ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>📦</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>No wholesale orders found</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Order ID</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Order Date</TableCell>
                  <TableCell>Delivery Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{`WO-${o.id?.toString().padStart(4, '0')}`}</TableCell>
                    <TableCell>{o.customerName}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                      {new Date(o.createdAt).toLocaleDateString('en-IN')}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                      {o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('en-IN') : 'Asap'}
                    </TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>{fmtRupees(o.totalAmount)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="View Lifecycle / Dispatch">
                        <IconButton
                          id={`btn-view-order-${o.id}`}
                          size="small"
                          onClick={() => navigate(`/orders/${o.id}`)}
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

      {/* Add Wholesale Order Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handleSubmitOrder}>
          <DialogTitle sx={{ fontWeight: 700 }}>New Wholesale Order</DialogTitle>
          <Divider />
          <DialogContent>
            <Grid container spacing={2.5} sx={{ pt: 1 }}>
              {formError && (
                <Grid item xs={12}>
                  <Alert severity="error">{formError}</Alert>
                </Grid>
              )}

              {/* Customer Selector */}
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  id="order-customer"
                  options={wholesaleCustomers}
                  getOptionLabel={(c) => c.name || ''}
                  value={customer}
                  onChange={(_, v) => setCustomer(v)}
                  renderInput={(params) => (
                    <TextField {...params} label="Wholesale Customer" required size="small" />
                  )}
                />
              </Grid>

              {/* Delivery Date */}
              <Grid item xs={12} sm={6}>
                <TextField
                  id="order-delivery-date"
                  label="Requested Delivery Date"
                  type="date"
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </Grid>

              {/* Items Entry Bar */}
              <Grid item xs={12}>
                <Typography sx={{ fontWeight: 700, mb: 1, fontSize: '0.9rem' }}>Add Order Items</Typography>
                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={5}>
                    <Autocomplete
                      id="order-prod-search"
                      options={availableProducts}
                      getOptionLabel={(p) => p.name || ''}
                      inputValue={prodSearch}
                      onInputChange={(_, v) => setProdSearch(v)}
                      value={selectedProduct}
                      onChange={(_, v) => {
                        setSelectedProduct(v)
                        if (v) setItemPrice((v.wholesalePrice ? v.wholesalePrice / 100 : v.sellingPrice / 100).toString())
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="Search Product" size="small" />
                      )}
                      renderOption={(props, option) => (
                        <Box component="li" {...props} key={option.id}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <Typography sx={{ fontSize: '0.85rem' }}>{option.name} ({option.unit})</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>Stock: {option.currentStock}</Typography>
                          </Box>
                        </Box>
                      )}
                    />
                  </Grid>
                  <Grid item xs={3}>
                    <TextField
                      id="order-item-qty"
                      label="Qty"
                      type="number"
                      size="small"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                      InputProps={{
                        endAdornment: selectedProduct && (
                          <Typography variant="caption" sx={{ color: tokens.textSecondary }}>
                            {selectedProduct.unit}
                          </Typography>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={3}>
                    <TextField
                      id="order-item-price"
                      label="Price (₹)"
                      type="number"
                      size="small"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      InputProps={{
                        startAdornment: <Typography variant="caption" sx={{ mr: 0.5, color: tokens.textSecondary }}>₹</Typography>
                      }}
                    />
                  </Grid>
                  <Grid item xs={1}>
                    <Button variant="outlined" onClick={handleAddProductItem} sx={{ minWidth: 40, height: 40, borderRadius: '10px' }}>
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
                        <TableCell align="right">Rate</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="center"></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {!items.length ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 3, color: tokens.textSecondary }}>
                            No items added to this order yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ fontWeight: 600 }}>{item.productName}</TableCell>
                            <TableCell align="right">{`${item.quantity} ${item.unit}`}</TableCell>
                            <TableCell align="right">{fmtRupees(item.unitPrice)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtRupees(item.subtotal)}</TableCell>
                            <TableCell align="center">
                              <IconButton size="small" onClick={() => handleRemoveItem(idx)} sx={{ color: tokens.red500 }}>
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

              {/* Totals Summary */}
              <Grid item xs={12} sm={6}>
                <TextField
                  id="order-discount"
                  label="Discount (₹)"
                  type="number"
                  fullWidth
                  size="small"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                <TextField
                  id="order-notes"
                  label="Notes / Delivery instructions"
                  multiline
                  rows={2}
                  fullWidth
                  size="small"
                  sx={{ mt: 2 }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Box sx={{ background: tokens.surfaceAlt, borderRadius: '12px', p: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', color: tokens.textSecondary }}>Subtotal</Typography>
                    <Typography sx={{ fontWeight: 600 }}>{fmtRupees(orderSubtotal)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', color: tokens.red500 }}>Discount</Typography>
                    <Typography sx={{ fontWeight: 600, color: tokens.red500 }}>−{fmtRupees(discountPaise)}</Typography>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: 700 }}>Final Total</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', color: tokens.emerald600 }}>
                      {fmtRupees(orderTotal)}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleCloseDialog} variant="outlined" sx={{ borderRadius: '10px' }}>Cancel</Button>
            <Button
              id="btn-order-submit"
              type="submit"
              variant="contained"
              disabled={createOrderMutation.isPending || !items.length}
              sx={{ borderRadius: '10px' }}
            >
              Submit Order
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  )
}
