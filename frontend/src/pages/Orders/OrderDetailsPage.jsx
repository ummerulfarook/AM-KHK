import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  Paper, Step, StepLabel, Stepper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, alpha, Stack
} from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded'
import CancelRoundedIcon from '@mui/icons-material/CancelRounded'
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded'
import InfoRoundedIcon from '@mui/icons-material/InfoRounded'
import { ordersApi } from '../../api/ordersApi'
import { tokens } from '../../theme/theme'
import StatusBadge from '../../components/common/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'

const fmtRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const ORDER_STEPS = ['pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered']

export default function OrderDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  // ── State ────────────────────────────────────────────────────────────────
  const [transitionNotes, setTransitionNotes] = useState('')
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState('')

  // Role permissions
  const canModify = user && ['owner', 'manager'].includes(user.role)

  // ── Query ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getOrder(id),
  })

  const order = data?.data

  // ── Mutation ─────────────────────────────────────────────────────────────
  const transitionMutation = useMutation({
    mutationFn: ({ status, notes }) => ordersApi.transitionStatus(id, status, notes),
    onSuccess: () => {
      qc.invalidateQueries(['order', id])
      qc.invalidateQueries(['orders'])
      qc.invalidateQueries(['inventory'])
      setNotesDialogOpen(false)
      setTransitionNotes('')
    },
    onError: (err) => {
      alert(err?.response?.data?.error || 'Failed to update order status')
    }
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !order) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load order details</Alert>
      </Box>
    )
  }

  // Determine active step index
  const activeStep = ORDER_STEPS.indexOf(order.status)
  const isCancelled = order.status === 'cancelled'

  const handleOpenTransition = (status) => {
    setTargetStatus(status)
    // For dispatch/delivery/cancellation, open notes dialog
    if (['out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
      setNotesDialogOpen(true)
    } else {
      transitionMutation.mutate({ status, notes: '' })
    }
  }

  const handleNotesSubmit = () => {
    transitionMutation.mutate({ status: targetStatus, notes: transitionNotes })
  }

  const orderSubtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0)

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/orders')} sx={{ border: `1px solid ${tokens.border}` }}>
            <ArrowBackRoundedIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Order {`WO-${order.id?.toString().padStart(4, '0')}`}</Typography>
            <Typography variant="caption" sx={{ color: tokens.textSecondary }}>
              Placed on {new Date(order.createdAt).toLocaleString('en-IN')}
            </Typography>
          </Box>
        </Box>
        <Button
          id="btn-download-wo-pdf"
          variant="outlined"
          startIcon={<DownloadRoundedIcon />}
          onClick={() => ordersApi.downloadInvoice(order.id)}
          sx={{ borderRadius: '10px' }}
        >
          Invoice PDF
        </Button>
      </Box>

      {/* Stepper Timeline */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, mb: 3, p: 3 }}>
        {isCancelled ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CancelRoundedIcon sx={{ color: tokens.red500, fontSize: 32 }} />
            <Box>
              <Typography sx={{ fontWeight: 700, color: tokens.red500 }}>Order Cancelled</Typography>
              <Typography variant="caption" sx={{ color: tokens.textSecondary }}>This order is inactive and stock has been restored.</Typography>
            </Box>
          </Box>
        ) : (
          <Stepper activeStep={activeStep} alternativeLabel>
            {ORDER_STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>
                  <Typography sx={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.85rem' }}>
                    {label.replace(/_/g, ' ')}
                  </Typography>
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        )}
      </Card>

      <Grid container spacing={3}>
        {/* Left Column: Order Summary & Action Buttons */}
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
                      <TableCell align="right">Rate</TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{item.productName}</TableCell>
                        <TableCell align="right">{`${item.quantity} ${item.unit || 'kg'}`}</TableCell>
                        <TableCell align="right">{fmtRupees(item.unitPrice)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtRupees(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Totals Box */}
              <Box sx={{ mt: 3, ml: 'auto', width: '50%' }}>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.85rem', color: tokens.textSecondary }}>Subtotal</Typography>
                    <Typography sx={{ fontWeight: 600 }}>{fmtRupees(orderSubtotal)}</Typography>
                  </Box>
                  {order.discount > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: '0.85rem', color: tokens.red500 }}>Discount</Typography>
                      <Typography sx={{ fontWeight: 600, color: tokens.red500 }}>−{fmtRupees(order.discount)}</Typography>
                    </Box>
                  )}
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: 700 }}>Total Amount</Typography>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: tokens.emerald600 }}>
                      {fmtRupees(order.totalAmount)}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Customer & Process flow */}
        <Grid item xs={12} md={4}>
          {/* Customer Card */}
          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Wholesale Customer</Typography>
              <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: tokens.emerald700 }}>
                {order.customerName}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary, mt: 0.5 }}>
                Payment Method: <strong>{order.paymentMethod ? order.paymentMethod.toUpperCase() : 'CREDIT'}</strong>
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>
                Payment Status: <StatusBadge status={order.paymentStatus} />
              </Typography>
              {order.deliveryDate && (
                <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary, mt: 0.5 }}>
                  Delivery Date: <strong>{new Date(order.deliveryDate).toLocaleDateString('en-IN')}</strong>
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Workflow Transitions Card */}
          {canModify && (
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, mb: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Workflow Actions</Typography>
                <Stack spacing={1.5}>
                  {order.status === 'pending' && (
                    <>
                      <Button
                        id="btn-confirm-wo"
                        variant="contained"
                        startIcon={<CheckCircleRoundedIcon />}
                        onClick={() => handleOpenTransition('confirmed')}
                        fullWidth
                      >
                        Confirm Order
                      </Button>
                      <Button
                        id="btn-cancel-wo"
                        variant="outlined"
                        color="error"
                        startIcon={<CancelRoundedIcon />}
                        onClick={() => handleOpenTransition('cancelled')}
                        fullWidth
                      >
                        Cancel Order
                      </Button>
                    </>
                  )}
                  {order.status === 'confirmed' && (
                    <>
                      <Button
                        id="btn-pack-wo"
                        variant="contained"
                        startIcon={<InventoryRoundedIcon />}
                        onClick={() => handleOpenTransition('packed')}
                        fullWidth
                      >
                        Mark as Packed
                      </Button>
                      <Button
                        id="btn-cancel-wo"
                        variant="outlined"
                        color="error"
                        startIcon={<CancelRoundedIcon />}
                        onClick={() => handleOpenTransition('cancelled')}
                        fullWidth
                      >
                        Cancel Order
                      </Button>
                    </>
                  )}
                  {order.status === 'packed' && (
                    <Button
                      id="btn-dispatch-wo"
                      variant="contained"
                      startIcon={<LocalShippingRoundedIcon />}
                      onClick={() => handleOpenTransition('out_for_delivery')}
                      fullWidth
                    >
                      Dispatch Order
                    </Button>
                  )}
                  {order.status === 'out_for_delivery' && (
                    <Button
                      id="btn-deliver-wo"
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircleRoundedIcon />}
                      onClick={() => handleOpenTransition('delivered')}
                      fullWidth
                    >
                      Mark as Delivered
                    </Button>
                  )}
                  {['delivered', 'cancelled'].includes(order.status) && (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1.5, background: tokens.surfaceAlt, borderRadius: '12px' }}>
                      <InfoRoundedIcon sx={{ color: tokens.textSecondary }} />
                      <Typography variant="caption" sx={{ color: tokens.textSecondary }}>
                        Order is finalized. No further transitions allowed.
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          {/* Delivery Timeline Notes */}
          {order.notes && (
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>Delivery & Activity Notes</Typography>
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
                  {order.notes}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Notes / Dispatch notes input Dialog */}
      <Dialog open={notesDialogOpen} onClose={() => setNotesDialogOpen(false)} PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {targetStatus === 'cancelled' ? 'Cancel Order Notes' : 'Dispatch / Delivery details'}
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: tokens.textSecondary }}>
            {targetStatus === 'cancelled'
              ? 'Please state the reason for cancellation.'
              : 'Add driver details, vehicle number, GPS notes, or delivery notes (optional).'}
          </Typography>
          <TextField
            id="wo-status-notes"
            label="Notes"
            multiline
            rows={3}
            fullWidth
            value={transitionNotes}
            onChange={(e) => setTransitionNotes(e.target.value)}
            placeholder={
              targetStatus === 'cancelled'
                ? 'Out of stock, customer requested cancel, etc…'
                : 'KL-45-7788, Driver: Saji, Ph: 9845xxxxxx…'
            }
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setNotesDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button
            id="btn-notes-confirm"
            onClick={handleNotesSubmit}
            variant="contained"
            disabled={transitionMutation.isPending}
          >
            Confirm Transition
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
