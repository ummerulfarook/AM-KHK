import React, { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Stack, Grid, TextField, Autocomplete,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton,
  Chip, CircularProgress, Alert, Paper, Divider, FormControl, InputLabel, Select, MenuItem, InputAdornment
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import ReceiptIcon from '@mui/icons-material/Receipt'
import PersonIcon from '@mui/icons-material/Person'
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import { billingApi } from '../../api/billingApi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export default function ReturnBillingDialog({ open, onClose, customers = [], showToast, onReturnSuccess }) {
  const queryClient = useQueryClient()

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [returnCart, setReturnCart] = useState([]) // [{ productId, productName, unit, unitPrice, soldQty, availableToReturn, returnQty, subtotal }]
  const [refundMethod, setRefundMethod] = useState('credit') // 'credit' or 'cash'
  const [notes, setNotes] = useState('')

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      setSelectedCustomer(null)
      setInvoiceSearch('')
      setSelectedInvoice(null)
      setReturnCart([])
      setRefundMethod('credit')
      setNotes('')
    }
  }, [open])

  // Fetch invoices for selected customer or direct search
  const invoicesQuery = useQuery({
    queryKey: ['customer-invoices-lookup', selectedCustomer?.id, invoiceSearch],
    queryFn: () => billingApi.invoiceLookup({
      customerId: selectedCustomer?.id || undefined,
      q: invoiceSearch.trim() || undefined,
      perPage: 100
    }),
    enabled: (!!selectedCustomer?.id || invoiceSearch.trim().length >= 2) && open,
    staleTime: 3000,
  })

  // Fetch items for return when an invoice is selected
  const invoiceItemsQuery = useQuery({
    queryKey: ['invoice-items-for-return', selectedInvoice?.id],
    queryFn: () => billingApi.getSaleItemsForReturn(selectedInvoice.id),
    enabled: !!selectedInvoice?.id && open,
    staleTime: 3000,
  })

  const customerInvoices = invoicesQuery.data?.data || []
  const invoiceProducts = invoiceItemsQuery.data?.data || []

  // Add item to return cart
  const handleAddToCart = (prod) => {
    if (prod.availableToReturn <= 0) {
      showToast(`No remaining returnable quantity for ${prod.productName}`, 'warning')
      return
    }

    const existingIndex = returnCart.findIndex(item => item.productId === prod.productId)
    if (existingIndex >= 0) {
      showToast(`${prod.productName} is already in the return cart`, 'info')
      return
    }

    const defaultQty = Math.min(1, prod.availableToReturn)
    const subtotal = Math.round(defaultQty * prod.unitPrice)

    setReturnCart(prev => [
      ...prev,
      {
        productId: prod.productId,
        productName: prod.productName,
        unit: prod.unit,
        unitPrice: prod.unitPrice,
        soldQty: prod.originalQty,
        alreadyReturned: prod.alreadyReturned,
        availableToReturn: prod.availableToReturn,
        returnQty: defaultQty.toString(),
        subtotal: subtotal,
      }
    ])
  }

  // Handle return quantity change in cart
  const handleQtyChange = (productId, newQtyStr) => {
    setReturnCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = parseFloat(newQtyStr)
        const validatedQty = isNaN(newQty) ? 0 : Math.max(0, Math.min(newQty, item.availableToReturn))
        return {
          ...item,
          returnQty: newQtyStr,
          subtotal: Math.round(validatedQty * item.unitPrice)
        }
      }
      return item
    }))
  }

  // Remove item from return cart
  const handleRemoveFromCart = (productId) => {
    setReturnCart(prev => prev.filter(item => item.productId !== productId))
  }

  // Calculate cart total return amount in paise
  const totalReturnAmount = returnCart.reduce((sum, item) => {
    const qty = parseFloat(item.returnQty) || 0
    return sum + Math.round(qty * item.unitPrice)
  }, 0)

  // Submit return mutation
  const returnMutation = useMutation({
    mutationFn: (payload) => billingApi.recordReturn(payload),
    onSuccess: (res) => {
      showToast(`Return processed successfully! Total: ₹${(res.refundAmount / 100).toFixed(2)}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['sales-history'] })
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-pos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['customer-details'] })

      if (onReturnSuccess) {
        onReturnSuccess({
          returnTransactionId: res.returnTransactionId,
          returnNumber: res.returnNumber,
          refundAmount: res.refundAmount,
        })
      }
      onClose()
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to process return billing', 'error')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!selectedInvoice) {
      showToast('Please select an invoice to return against', 'warning')
      return
    }

    if (returnCart.length === 0) {
      showToast('Please add at least one product to the return cart', 'warning')
      return
    }

    const validItems = []
    for (const item of returnCart) {
      const qty = parseFloat(item.returnQty)
      if (isNaN(qty) || qty <= 0) {
        showToast(`Please enter a valid quantity for ${item.productName}`, 'warning')
        return
      }
      if (qty > item.availableToReturn + 0.0001) {
        showToast(`Return quantity for ${item.productName} (${qty}) exceeds maximum available (${item.availableToReturn})`, 'warning')
        return
      }
      validItems.push({
        productId: item.productId,
        quantity: qty
      })
    }

    returnMutation.mutate({
      customerId: selectedCustomer?.id || selectedInvoice.customerId || null,
      invoiceNumber: selectedInvoice.invoiceNumber,
      refundMethod: refundMethod,
      notes: notes.trim() || null,
      items: validItems
    })
  }

  const fmtCurrency = (paise) => `₹${((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px', p: 1 } }}>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShoppingBagIcon sx={{ color: '#F0940C' }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#0A2A1F' }}>
            Return Billing (Product Return)
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 2, pb: 2 }}>
          <Stack spacing={3}>

            {/* STEP 1: CUSTOMER SELECTION */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0E3A2A', mb: 1, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <PersonIcon fontSize="small" sx={{ color: '#059669' }} />
                1. Select Customer
              </Typography>
              <Autocomplete
                id="return-customer-autocomplete"
                options={customers}
                getOptionLabel={(c) => `${c.name} ${c.phone ? `(${c.phone})` : ''}`}
                value={selectedCustomer}
                onChange={(_, v) => {
                  setSelectedCustomer(v)
                  setSelectedInvoice(null)
                  setReturnCart([])
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Customer"
                    placeholder="Search & select customer to view invoices..."
                    size="small"
                  />
                )}
              />
            </Box>

            {/* STEP 2: INVOICES SELECTION */}
            {(selectedCustomer || invoiceSearch.trim().length >= 2) && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0E3A2A', display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <ReceiptIcon fontSize="small" sx={{ color: '#059669' }} />
                    2. Select Invoice
                  </Typography>
                  <TextField
                    size="small"
                    placeholder="Filter by Invoice # (e.g. INV-1001)..."
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      )
                    }}
                    sx={{ width: 260 }}
                  />
                </Box>

                {invoicesQuery.isLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : customerInvoices.length === 0 ? (
                  <Alert severity="info" sx={{ borderRadius: '12px' }}>
                    No matching invoices found {selectedCustomer ? `for ${selectedCustomer.name}` : ''}.
                  </Alert>
                ) : (
                  <Grid container spacing={1.5} sx={{ maxHeight: 200, overflowY: 'auto', pr: 0.5 }}>
                    {customerInvoices.map((inv) => {
                      const isSelected = selectedInvoice?.id === inv.id
                      return (
                        <Grid item xs={12} sm={6} key={inv.id}>
                          <Paper
                            onClick={() => {
                              setSelectedInvoice(inv)
                              setReturnCart([])
                            }}
                            elevation={isSelected ? 3 : 0}
                            sx={{
                              p: 1.5,
                              borderRadius: '14px',
                              cursor: 'pointer',
                              border: isSelected ? '2px solid #059669' : '1px solid #E2EBE4',
                              bgcolor: isSelected ? '#EEF5F0' : '#FFFFFF',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                borderColor: '#059669',
                                bgcolor: '#F4F8F5'
                              }
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isSelected ? '#059669' : '#0F2419' }}>
                                {inv.invoiceNumber}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#71837A', fontWeight: 600 }}>
                                {new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.8 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0A2A1F' }}>
                                Total: {fmtCurrency(inv.total)}
                              </Typography>
                              <Chip
                                label={`${inv.itemCount} items`}
                                size="small"
                                sx={{ height: 20, fontSize: '0.7rem', bgcolor: isSelected ? '#059669' : '#EEF5F0', color: isSelected ? '#FFF' : '#71837A' }}
                              />
                            </Box>
                            <Typography variant="caption" sx={{ color: '#71837A', display: 'block', mt: 0.3, fontStyle: 'italic' }}>
                              Billed to: {inv.customerName}
                            </Typography>
                          </Paper>
                        </Grid>
                      )
                    })}
                  </Grid>
                )}
              </Box>
            )}

            {/* STEP 3: PRODUCTS IN SELECTED INVOICE */}
            {selectedInvoice && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0E3A2A', mb: 1 }}>
                  3. Products in Invoice ({selectedInvoice.invoiceNumber})
                </Typography>

                {invoiceItemsQuery.isLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : invoiceProducts.length === 0 ? (
                  <Alert severity="warning" sx={{ borderRadius: '12px' }}>
                    No returnable products found in this invoice.
                  </Alert>
                ) : (
                  <Paper variant="outlined" sx={{ borderRadius: '14px', overflow: 'hidden', mb: 2 }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#F4F8F5' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Sold Qty</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Rate</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Available Return Qty</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700 }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {invoiceProducts.map((prod) => {
                          const isInCart = returnCart.some(item => item.productId === prod.productId)
                          const disabled = prod.availableToReturn <= 0 || isInCart
                          return (
                            <TableRow key={prod.saleItemId}>
                              <TableCell sx={{ fontWeight: 600 }}>{prod.productName}</TableCell>
                              <TableCell align="right">{prod.originalQty} {prod.unit}</TableCell>
                              <TableCell align="right">{fmtCurrency(prod.unitPrice)}</TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" sx={{ fontWeight: 700, color: prod.availableToReturn > 0 ? '#059669' : '#E5484D' }}>
                                  {prod.availableToReturn} {prod.unit}
                                </Typography>
                                {prod.alreadyReturned > 0 && (
                                  <Typography variant="caption" sx={{ color: '#71837A', display: 'block' }}>
                                    (Returned: {prod.alreadyReturned})
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="center">
                                <Button
                                  size="small"
                                  variant={isInCart ? 'outlined' : 'contained'}
                                  color="success"
                                  disabled={disabled}
                                  startIcon={<AddCircleOutlineIcon />}
                                  onClick={() => handleAddToCart(prod)}
                                  sx={{ borderRadius: '8px', textTransform: 'none', py: 0.3 }}
                                >
                                  {isInCart ? 'Added' : 'Add to Return'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </Paper>
                )}
              </Box>
            )}

            {/* STEP 4: RETURN CART & SUMMARY */}
            {returnCart.length > 0 && (
              <Box sx={{ borderTop: '2px dashed #E2EBE4', pt: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#F0940C', mb: 1 }}>
                  4. Return Cart ({returnCart.length} product{returnCart.length > 1 ? 's' : ''})
                </Typography>

                <Paper variant="outlined" sx={{ borderRadius: '14px', overflow: 'hidden', mb: 2 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#FFFBEB' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, color: '#B45309' }}>Product</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, color: '#B45309', width: 140 }}>Return Qty</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#B45309' }}>Rate</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#B45309' }}>Return Subtotal</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, color: '#B45309', width: 60 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {returnCart.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {item.productName}
                            <Typography variant="caption" sx={{ color: '#71837A', display: 'block' }}>
                              Max: {item.availableToReturn} {item.unit}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <TextField
                              size="small"
                              type="number"
                              value={item.returnQty}
                              onChange={(e) => handleQtyChange(item.productId, e.target.value)}
                              inputProps={{
                                min: 0.001,
                                max: item.availableToReturn,
                                step: 'any',
                                style: { textAlign: 'center', padding: '4px 8px', fontWeight: 700 }
                              }}
                              sx={{ width: 100 }}
                            />
                          </TableCell>
                          <TableCell align="right">{fmtCurrency(item.unitPrice)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: '#E5484D' }}>
                            {fmtCurrency(item.subtotal)}
                          </TableCell>
                          <TableCell align="center">
                            <IconButton size="small" color="error" onClick={() => handleRemoveFromCart(item.productId)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>

                {/* Return Totals & Options */}
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Refund Settlement Method</InputLabel>
                      <Select
                        label="Refund Settlement Method"
                        value={refundMethod}
                        onChange={(e) => setRefundMethod(e.target.value)}
                      >
                        <MenuItem value="credit">Deduct from Customer Credit Balance (Dues)</MenuItem>
                        <MenuItem value="cash">Direct Cash Refund</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 1.5, bgcolor: '#FFF5F5', borderRadius: '12px', textAlign: 'right', border: '1px solid #FCA5A5' }}>
                      <Typography variant="caption" sx={{ color: '#991B1B', fontWeight: 600, textTransform: 'uppercase' }}>
                        Total Return Amount
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: '#E5484D' }}>
                        {fmtCurrency(totalReturnAmount)}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 2 }}>
                  <TextField
                    label="Notes / Reason for Return (optional)"
                    size="small"
                    multiline
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    fullWidth
                    placeholder="Provide reason for returned goods..."
                  />
                </Box>
              </Box>
            )}

          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="warning"
            disabled={returnMutation.isPending || returnCart.length === 0}
            sx={{ fontWeight: 700, px: 3 }}
          >
            {returnMutation.isPending ? 'Processing Return...' : `Submit Return (${fmtCurrency(totalReturnAmount)})`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
