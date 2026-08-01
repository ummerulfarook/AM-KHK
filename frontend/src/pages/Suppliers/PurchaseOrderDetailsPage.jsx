import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  Paper, Step, StepLabel, Stepper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, alpha, Stack,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded'
import InfoRoundedIcon from '@mui/icons-material/InfoRounded'
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded'
import PaymentRoundedIcon from '@mui/icons-material/PaymentRounded'
import { suppliersApi } from '../../api/suppliersApi'
import { tokens } from '../../theme/theme'
import StatusBadge from '../../components/common/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const PO_STEPS = ['draft', 'ordered', 'received']

export default function PurchaseOrderDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── State ────────────────────────────────────────────────────────────────
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payStatus, setPayStatus] = useState('pending')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNotes, setPayNotes] = useState('')

  // Role permissions
  const canModify = user && ['owner', 'manager', 'accountant'].includes(user.role)

  // ── Query ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => suppliersApi.getPurchaseOrder(id),
  })

  const po = data?.data

  // ── Mutations ────────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ status }) => suppliersApi.transitionPOStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries(['purchase-order', id])
      qc.invalidateQueries(['purchase-orders'])
      qc.invalidateQueries(['inventory'])
      qc.invalidateQueries(['inventoryStats'])
    },
    onError: (err) => {
      alert(err?.response?.data?.error || 'Failed to update PO status')
    }
  })

  const paymentMutation = useMutation({
    mutationFn: (payload) => suppliersApi.recordSupplierPayment(id, payload),
    onSuccess: () => {
      qc.invalidateQueries(['purchase-order', id])
      qc.invalidateQueries(['purchase-orders'])
      setPayDialogOpen(false)
      setPayNotes('')
    },
    onError: (err) => {
      alert(err?.response?.data?.error || 'Failed to log supplier payment')
    }
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !po) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load purchase order details</Alert>
      </Box>
    )
  }

  const activeStep = PO_STEPS.indexOf(po.status)
  const isCancelled = po.status === 'cancelled'

  const handleOpenPay = () => {
    setPayStatus(po.paymentStatus)
    setPayMethod(po.paymentMethod || 'cash')
    setPayNotes('')
    setPayDialogOpen(true)
  }

  const handlePaySubmit = () => {
    paymentMutation.mutate({
      paymentStatus: payStatus,
      paymentMethod: payMethod,
      notes: payNotes.trim()
    })
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/suppliers')} sx={{ border: `1px solid ${tokens.border}` }}>
          <ArrowBackRoundedIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Purchase Order {`PO-${po.id.toString().padStart(4, '0')}`}</Typography>
          <Typography variant="caption" sx={{ color: tokens.textSecondary }}>
            Drafted on {new Date(po.createdAt).toLocaleString('en-IN')}
          </Typography>
        </Box>
      </Box>

      {/* Stepper Status Timeline */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, mb: 3, p: 3 }}>
        {isCancelled ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CancelRoundedIcon sx={{ color: tokens.red500, fontSize: 32 }} />
            <Box>
              <Typography sx={{ fontWeight: 700, color: tokens.red500 }}>PO Cancelled</Typography>
              <Typography variant="caption" sx={{ color: tokens.textSecondary }}>This purchase order is cancelled.</Typography>
            </Box>
          </Box>
        ) : (
          <Stepper activeStep={activeStep} alternativeLabel>
            {PO_STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>
                  <Typography sx={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.85rem' }}>
                    {label}
                  </Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        )}
      </Card>

      <Grid container spacing={3}>
        {/* Left Column: PO Items */}
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Order Items</Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Cost Price</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {po.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{item.productName}</TableCell>
                        <TableCell align="right">{`${item.quantity} ${item.unit || 'kg'}`}</TableCell>
                        <TableCell align="right">{fmtRupees(item.unitCost)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtRupees(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Total Box */}
              <Box sx={{ mt: 3, ml: 'auto', width: '40%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 700 }}>Total PO Cost</Typography>
                <Typography sx={{ fontWeight: 850, fontSize: '1.2rem', color: tokens.emerald600 }}>
                  {fmtRupees(po.totalAmount)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Supplier Info & Action Flows */}
        <Grid item xs={12} md={4}>
          {/* Supplier Info */}
          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Supplier</Typography>
              <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: tokens.emerald700 }}>
                {po.supplierName}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary, mt: 0.5 }}>
                PO Status: <StatusBadge status={po.status} />
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                Payment Status: <StatusBadge status={po.paymentStatus} />
              </Typography>
              {po.paymentMethod && (
                <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary, mt: 0.5 }}>
                  Payment Method: <strong style={{ textTransform: 'uppercase' }}>{po.paymentMethod}</strong>
                </Typography>
              )}
              {po.expectedDelivery && (
                <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary, mt: 0.5 }}>
                  Expected Delivery: <strong>{new Date(po.expectedDelivery).toLocaleDateString('en-IN')}</strong>
                </Typography>
              )}
              {po.actualDelivery && (
                <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                  Actual Delivery: <strong>{new Date(po.actualDelivery).toLocaleDateString('en-IN')}</strong>
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Workflow Transitions */}
          {canModify && (
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, mb: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Workflow Actions</Typography>
                <Stack spacing={1.5}>
                  {po.status === 'draft' && (
                    <>
                      <Button
                        id="btn-submit-po"
                        variant="contained"
                        startIcon={<LocalShippingRoundedIcon />}
                        onClick={() => statusMutation.mutate({ status: 'ordered' })}
                        fullWidth
                      >
                        Submit Order
                      </Button>
                      <Button
                        id="btn-cancel-po"
                        variant="outlined"
                        color="error"
                        startIcon={<CancelRoundedIcon />}
                        onClick={() => statusMutation.mutate({ status: 'cancelled' })}
                        fullWidth
                      >
                        Cancel PO
                      </Button>
                    </>
                  )}
                  {po.status === 'ordered' && (
                    <>
                      <Button
                        id="btn-receive-po"
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircleRoundedIcon />}
                        onClick={() => {
                          if (window.confirm("Are you sure you want to receive stock? This will automatically increment inventory levels and update cost prices.")) {
                            statusMutation.mutate({ status: 'received' })
                          }
                        }}
                        fullWidth
                      >
                        Receive Stock
                      </Button>
                      <Button
                        id="btn-cancel-po"
                        variant="outlined"
                        color="error"
                        startIcon={<CancelRoundedIcon />}
                        onClick={() => statusMutation.mutate({ status: 'cancelled' })}
                        fullWidth
                      >
                        Cancel PO
                      </Button>
                    </>
                  )}
                  {['received', 'cancelled'].includes(po.status) && (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1.5, background: tokens.surfaceAlt, borderRadius: '12px' }}>
                      <InfoRoundedIcon sx={{ color: tokens.textSecondary }} />
                      <Typography variant="caption" sx={{ color: tokens.textSecondary }}>
                        PO is finalized. No further transitions allowed.
                      </Typography>
                    </Box>
                  )}

                  <Divider sx={{ my: 1 }} />

                  {/* Payment Update */}
                  <Button
                    id="btn-po-payment"
                    variant="outlined"
                    startIcon={<PaymentRoundedIcon />}
                    onClick={handleOpenPay}
                    fullWidth
                  >
                    Log Supplier Payment
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Activity Logs / Notes */}
          {po.notes && (
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Activity Notes</Typography>
                <Typography
                  sx={{
                    fontSize: '0.8rem',
                    whiteSpace: 'pre-wrap',
                    background: tokens.surfaceAlt,
                    p: 1.5,
                    borderRadius: '12px',
                    color: tokens.textPrimary
                  }}
                >
                  {po.notes}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Supplier Payment Dialog */}
      <Dialog open={payDialogOpen} onClose={() => setPayDialogOpen(false)} PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Log Supplier Payment</DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={2} sx={{ minWidth: 260, pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Payment Status</InputLabel>
              <Select
                id="po-pay-status"
                label="Payment Status"
                value={payStatus}
                onChange={e => setPayStatus(e.target.value)}
              >
                <MenuItem value="pending">Pending (Unpaid)</MenuItem>
                <MenuItem value="partial">Partial</MenuItem>
                <MenuItem value="paid">Paid (Fully Cleared)</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select
                id="po-pay-method"
                label="Payment Method"
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="bank">Bank Transfer</MenuItem>
              </Select>
            </FormControl>

            <TextField
              id="po-pay-notes"
              label="Payment Notes"
              multiline
              rows={2}
              fullWidth
              value={payNotes}
              onChange={e => setPayNotes(e.target.value)}
              placeholder="Cheque #, GPay transaction reference, amount paid etc…"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPayDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button
            id="btn-po-pay-confirm"
            onClick={handlePaySubmit}
            variant="contained"
            disabled={paymentMutation.isPending}
          >
            Log Payment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
