import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Alert, Box, Card, CardContent, CardHeader, Chip, Divider, FormControl,
  InputLabel, MenuItem, Pagination, Select, Skeleton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
  InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  IconButton, Paper, Autocomplete, Snackbar, Tooltip
} from '@mui/material'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import PrintRoundedIcon from '@mui/icons-material/PrintRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import { billingApi } from '../../api/billingApi'
import { inventoryApi } from '../../api/inventoryApi'
import StatusBadge from '../../components/common/StatusBadge'
import { tokens } from '../../theme/theme'

const fmt = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

export default function SalesHistoryPage() {
  const [page, setPage] = useState(1)
  const [paymentFilter, setPaymentFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [selectedSale, setSelectedSale] = useState(null)
  const [dateTo, setDateTo] = useState('')

  // Edit Invoice States
  const [editSale, setEditSale] = useState(null)
  const [editItems, setEditItems] = useState([])
  const [editDiscount, setEditDiscount] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState('')
  const [editCashPaid, setEditCashPaid] = useState('')
  const [editSearchProduct, setEditSearchProduct] = useState('')
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' })

  // Delete & Reprint states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [saleToDelete, setSaleToDelete] = useState(null)
  const [printingId, setPrintingId] = useState(null)

  const deleteSaleMutation = useMutation({
    mutationFn: billingApi.deleteSale,
    onSuccess: () => {
      showToast('Invoice deleted and stock restored successfully')
      setDeleteConfirmOpen(false)
      setSaleToDelete(null)
      refetch()
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to delete invoice', 'error')
    }
  })

  const handleReprint = async (saleId) => {
    setPrintingId(saleId)
    try {
      await billingApi.printReceipt(saleId)
      showToast('Receipt sent to printer')
    } catch (err) {
      showToast(err?.response?.data?.error || 'Printer not available', 'warning')
    } finally {
      setPrintingId(null)
    }
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales-history', page, paymentFilter, dateFrom, dateTo],
    queryFn: () => billingApi.listSales({
      page,
      perPage: 25,
      paymentMethod: paymentFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  })

  const editProductsQuery = useQuery({
    queryKey: ['inventory-edit-invoice', editSearchProduct],
    queryFn: () => inventoryApi.getProducts({ search: editSearchProduct || undefined, perPage: 15 }),
    enabled: !!editSale,
  })

  const editProducts = editProductsQuery.data?.data || []

  const showToast = (msg, severity = 'success') => {
    setToast({ open: true, msg, severity })
  }

  const handleOpenEdit = (sale) => {
    setEditSale(sale)
    setEditItems(sale.items.map(i => ({
      productId: i.product_id || i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice / 100,
    })))
    setEditDiscount((sale.discount / 100).toString())
    setEditPaymentMethod(sale.paymentMethod)
    setEditCashPaid(sale.amountPaid ? (sale.amountPaid / 100).toString() : '')
  }

  const sales = data?.data || []
  const pagination = data?.pagination

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }} className="no-print">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HistoryRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Invoices Directory</Typography>
        </Box>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<PrintRoundedIcon />}
          onClick={() => window.print()}
          sx={{ borderRadius: '10px' }}
        >
          Print Statement
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2.5 }} className="no-print">
        <TextField
          id="filter-date-from"
          label="From Date"
          type="date"
          size="small"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          id="filter-date-to"
          label="To Date"
          type="date"
          size="small"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1) }}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 160 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Payment Method</InputLabel>
          <Select
            id="filter-payment"
            label="Payment Method"
            value={paymentFilter}
            onChange={e => { setPaymentFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="upi">UPI</MenuItem>
            <MenuItem value="bank">Bank</MenuItem>
            <MenuItem value="credit">Credit</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Table */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
        {isError ? (
          <Box sx={{ p: 4 }}>
            <Alert severity="error">Failed to load sales history</Alert>
          </Box>
        ) : isLoading ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Date', 'Invoice', 'Customer', 'Items', 'Payment', 'Total'].map(h => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : !sales.length ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>🧾</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>No sales recorded yet</Typography>
            <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
              Sales will appear here once you create them from the POS screen
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date & Time</TableCell>
                  <TableCell>Invoice</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="center">Items</TableCell>
                  <TableCell>Cashier</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="center" className="no-print">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sales.map(sale => (
                  <TableRow key={sale.id} hover>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                      {new Date(sale.createdAt).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.85rem', fontWeight: 600, color: tokens.emerald700 }}>
                      {sale.invoiceNumber || `#${sale.id}`}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.85rem' }}>{sale.customerName}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={sale.items?.length || 0}
                        size="small"
                        sx={{ height: 20, fontSize: '0.72rem', fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                      {sale.cashierName || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={sale.paymentMethod} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: tokens.emerald600 }}>
                      {fmt(sale.total)}
                    </TableCell>
                    <TableCell align="center" className="no-print" style={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="View Invoice">
                        <IconButton
                          id={`btn-view-sale-${sale.id}`}
                          size="small"
                          color="primary"
                          onClick={() => setSelectedSale(sale)}
                        >
                          <VisibilityRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit Invoice">
                        <IconButton
                          id={`btn-edit-sale-${sale.id}`}
                          size="small"
                          color="warning"
                          onClick={() => handleOpenEdit(sale)}
                          sx={{ ml: 0.5 }}
                        >
                          <EditRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reprint Thermal Receipt">
                        <IconButton
                          id={`btn-print-sale-${sale.id}`}
                          size="small"
                          color="success"
                          onClick={() => handleReprint(sale.id)}
                          disabled={printingId === sale.id}
                          sx={{ ml: 0.5 }}
                        >
                          {printingId === sale.id ? <CircularProgress size={18} /> : <PrintRoundedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Laser Print (A4/A5)">
                        <IconButton
                          id={`btn-laser-print-${sale.id}`}
                          size="small"
                          color="info"
                          onClick={() => {
                            const iframeId = `print-iframe-${sale.id}`;
                            const existing = document.getElementById(iframeId);
                            if (existing) document.body.removeChild(existing);
                            
                            const iframe = document.createElement('iframe');
                            iframe.id = iframeId;
                            iframe.style.position = 'fixed';
                            iframe.style.right = '0';
                            iframe.style.bottom = '0';
                            iframe.style.width = '0';
                            iframe.style.height = '0';
                            iframe.style.border = '0';
                            iframe.src = `/api/billing/${sale.id}/preview?print=true`;
                            
                            const handleMsg = (e) => {
                              if (e.data && e.data.type === 'INVOICE_PRINT_DONE') {
                                window.removeEventListener('message', handleMsg);
                                const el = document.getElementById(iframeId);
                                if (el) document.body.removeChild(el);
                              }
                            };
                            window.addEventListener('message', handleMsg);
                            document.body.appendChild(iframe);
                          }}
                          sx={{ ml: 0.5 }}
                        >
                          <PictureAsPdfRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Invoice">
                        <IconButton
                          id={`btn-delete-sale-${sale.id}`}
                          size="small"
                          color="error"
                          onClick={() => {
                            setSaleToDelete(sale)
                            setDeleteConfirmOpen(true)
                          }}
                          sx={{ ml: 0.5 }}
                        >
                          <DeleteRoundedIcon fontSize="small" />
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
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: `1px solid ${tokens.border}` }} className="no-print">
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

      {/* Sale Detail / Invoice check Dialog */}
      <Dialog
        open={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        {selectedSale && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Invoice Details: {selectedSale.invoiceNumber || `#${selectedSale.id}`}
                </Typography>
                <IconButton size="small" onClick={() => setSelectedSale(null)}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ py: 2.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block' }}>Customer</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{selectedSale.customerName || 'Walk-in'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block' }}>Date</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{new Date(selectedSale.createdAt).toLocaleString('en-IN')}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block' }}>Payment Method</Typography>
                  <StatusBadge status={selectedSale.paymentMethod} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block' }}>Cashier</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{selectedSale.cashierName || '—'}</Typography>
                </Box>
              </Box>

              <Typography sx={{ fontWeight: 700, mb: 1, fontSize: '0.9rem' }}>Purchased Products</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px', mb: 2 }}>
                <Table size="small">
                  <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Rate</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedSale.items?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ fontWeight: 600 }}>{item.productName || '—'}</TableCell>
                        <TableCell align="right">{item.quantity} {item.unit || ''}</TableCell>
                        <TableCell align="right">{fmt(item.unitPrice)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', mt: 1 }}>
                <Box sx={{ width: '40%', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" sx={{ color: tokens.textSecondary }}>Subtotal</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{fmt(selectedSale.subtotal)}</Typography>
                </Box>
                {selectedSale.discount > 0 && (
                  <Box sx={{ width: '40%', display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ color: tokens.textSecondary }}>Discount</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.red500 }}>-{fmt(selectedSale.discount)}</Typography>
                  </Box>
                )}
                <Box sx={{ width: '40%', display: 'flex', justifyContent: 'space-between', mt: 1, borderTop: `1px solid ${tokens.border}`, pt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>Total</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.emerald600 }}>{fmt(selectedSale.total)}</Typography>
                </Box>
              </Box>

              {selectedSale.notes && (
                <Box sx={{ mt: 2, p: 1.5, background: tokens.background, borderRadius: '8px', borderLeft: `3px solid ${tokens.emerald500}` }}>
                  <Typography variant="caption" sx={{ color: tokens.textSecondary, display: 'block', fontWeight: 600 }}>Notes / Audit log</Typography>
                  <Typography sx={{ fontSize: '0.82rem', whiteSpace: 'pre-line' }}>{selectedSale.notes}</Typography>
                </Box>
              )}
            </DialogContent>
            <Divider />
            <DialogActions sx={{ px: 3, py: 1.5 }}>
              <Button onClick={() => setSelectedSale(null)} variant="contained" sx={{ borderRadius: '10px' }}>
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Edit Sale Dialog */}
      <Dialog
        open={!!editSale}
        onClose={() => setEditSale(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        {editSale && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Edit Invoice: {editSale.invoiceNumber || `#${editSale.id}`}
                </Typography>
                <IconButton size="small" onClick={() => setEditSale(null)}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ py: 2.5 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Payment Method</InputLabel>
                  <Select
                    label="Payment Method"
                    value={editPaymentMethod}
                    onChange={e => setEditPaymentMethod(e.target.value)}
                  >
                    <MenuItem value="cash">Cash</MenuItem>
                    <MenuItem value="upi">UPI</MenuItem>
                    <MenuItem value="bank">Bank</MenuItem>
                    <MenuItem value="credit">Credit</MenuItem>
                  </Select>
                </FormControl>

                {(editPaymentMethod === 'cash' || editPaymentMethod === 'credit') && (
                  <TextField
                    label={editPaymentMethod === 'cash' ? 'Amount Received' : 'Downpayment Received'}
                    type="number"
                    size="small"
                    value={editCashPaid}
                    onChange={e => setEditCashPaid(e.target.value)}
                    sx={{ minWidth: 160 }}
                  />
                )}

                <TextField
                  label="Discount (₹)"
                  type="number"
                  size="small"
                  value={editDiscount}
                  onChange={e => setEditDiscount(e.target.value)}
                  sx={{ minWidth: 120 }}
                />
              </Box>

              <Typography sx={{ fontWeight: 700, mb: 1, fontSize: '0.9rem' }}>Invoice Items</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px', mb: 3 }}>
                <Table size="small">
                  <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="right" sx={{ width: 120 }}>Qty</TableCell>
                      <TableCell align="right" sx={{ width: 140 }}>Rate (₹)</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                      <TableCell align="center" sx={{ width: 60 }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {editItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell sx={{ fontWeight: 600 }}>{item.productName}</TableCell>
                        <TableCell align="right">
                          <TextField
                            type="number"
                            size="small"
                            value={item.quantity}
                            inputProps={{ min: 0.001, step: 'any' }}
                            onChange={e => {
                              const newItems = [...editItems]
                              newItems[idx].quantity = e.target.value
                              setEditItems(newItems)
                            }}
                            sx={{ width: 100 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            type="number"
                            size="small"
                            value={item.unitPrice}
                            inputProps={{ min: 0, step: 0.5 }}
                            onChange={e => {
                              const newItems = [...editItems]
                              newItems[idx].unitPrice = e.target.value
                              setEditItems(newItems)
                            }}
                            sx={{ width: 110 }}
                            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          ₹{(parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)).toFixed(2)}
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            color="error"
                            size="small"
                            onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))}
                            disabled={editItems.length <= 1}
                          >
                            <DeleteRoundedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Add Product Autocomplete */}
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Autocomplete
                  id="add-item-to-edit"
                  options={editProducts}
                  getOptionLabel={(p) => p.name || ''}
                  onInputChange={(_, v) => setEditSearchProduct(v)}
                  onChange={(_, v) => {
                    if (v) {
                      const exists = editItems.find(i => i.productId === v.id)
                      if (exists) {
                        showToast(`Product ${v.name} is already in the invoice!`, 'warning')
                        return
                      }
                      setEditItems([...editItems, {
                        productId: v.id,
                        productName: v.name,
                        quantity: 1,
                        unitPrice: v.sellingPrice / 100
                      }])
                    }
                  }}
                  renderInput={(params) => <TextField {...params} label="Add Product to Invoice" size="small" sx={{ width: 280 }} />}
                />
              </Box>
            </DialogContent>
            <Divider />
            <DialogActions sx={{ px: 3, py: 1.5 }}>
              <Button onClick={() => setEditSale(null)} variant="outlined" sx={{ borderRadius: '10px' }}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const payload = {
                      items: editItems.map(i => ({
                        productId: i.productId,
                        quantity: parseFloat(i.quantity),
                        unitPrice: parseFloat(i.unitPrice)
                      })),
                      discount: parseFloat(editDiscount || 0),
                      paymentMethod: editPaymentMethod,
                      cashPaid: editCashPaid ? parseFloat(editCashPaid) : null
                    }
                    await billingApi.updateSale(editSale.id, payload)
                    showToast('Invoice updated successfully!')
                    setEditSale(null)
                    refetch()
                  } catch (err) {
                    showToast(err?.response?.data?.error || 'Failed to update invoice', 'error')
                  }
                }}
                variant="contained"
                sx={{ borderRadius: '10px' }}
                disabled={editItems.length === 0}
              >
                Save Changes
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Invoice?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: tokens.textSecondary, mb: 1 }}>
            Are you sure you want to delete invoice <strong>{saleToDelete?.invoiceNumber || `#${saleToDelete?.id}`}</strong>?
          </Typography>
          <Typography variant="body2" sx={{ color: tokens.red500, fontWeight: 600 }}>
            ⚠️ This will restore the sold quantities back to inventory and subtract the amount from the customer's dues. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} variant="outlined" sx={{ borderRadius: '10px' }}>
            Cancel
          </Button>
          <Button
            onClick={() => deleteSaleMutation.mutate(saleToDelete.id)}
            variant="contained"
            color="error"
            disabled={deleteSaleMutation.isPending}
            sx={{ borderRadius: '10px' }}
          >
            Delete
          </Button>
        </DialogActions>
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
