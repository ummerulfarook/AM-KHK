import { useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent,
  DialogTitle, Divider, IconButton, Snackbar, Stack, Typography, alpha,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import PrintRoundedIcon from '@mui/icons-material/PrintRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import api from '../../api/authApi'
import { billingApi } from '../../api/billingApi'
import StatusBadge from '../../components/common/StatusBadge'
import { tokens } from '../../theme/theme'

const fmt = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

/**
 * InvoiceDialog — shown after a successful sale.
 *
 * Props:
 *   sale       — the created sale object (from API)
 *   open       boolean
 *   onNewSale  — called when user clicks "New Sale"
 *   onClose    — called when dialog is closed
 */
export default function InvoiceDialog({ sale, open, onNewSale, onClose }) {
  const [printing, setPrinting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' })

  if (!sale) return null

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity })

  const handlePrint = async () => {
    setPrinting(true)
    try {
      await billingApi.printReceipt(sale.id)
      showToast('Receipt sent to printer')
    } catch (err) {
      const errMsg = err?.response?.data?.error || 'Thermal printer is not connected or offline. Please check connection and settings.'
      alert(`Print Failed:\n${errMsg}`)
    } finally {
      setPrinting(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await billingApi.downloadInvoice(sale.id, sale.invoiceNumber)
      showToast('Invoice downloaded')
    } catch (err) {
      showToast('Download failed', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const handleWhatsAppSend = async () => {
    setDownloading(true)
    try {
      // 1. Generate the PDF Blob from the backend
      const response = await api.get(`/api/billing/${sale.id}/pdf`, { responseType: 'blob' })
      const pdfBlob = response.data
      const fileName = `${sale.invoiceNumber || sale.id}.pdf`
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' })

      // 2. Try Web Share API first (works on mobile Chrome/Safari)
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `Invoice ${sale.invoiceNumber}`,
          text: `Invoice ${sale.invoiceNumber} — ${fmt(sale.total)}\nThank you for shopping at AM & KHK Vegetable Merchants!`,
          files: [pdfFile],
        })
        showToast('Invoice shared successfully!')
      } else {
        // Desktop fallback: download PDF first, then open WhatsApp chat
        const url = URL.createObjectURL(pdfBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        // Open WhatsApp chat with customer number pre-filled
        const phone = sale.customerPhone ? sale.customerPhone.replace(/\D/g, '') : ''
        const waUrl = phone
          ? `https://wa.me/91${phone}`
          : `https://wa.me/`
        
        // Small delay to allow download to initiate before opening WhatsApp
        setTimeout(() => {
          window.open(waUrl, '_blank')
        }, 500)

        alert(
          `📄 PDF invoice "${fileName}" has been downloaded.\n\n` +
          `WhatsApp will open now. Please:\n` +
          `1. Click the 📎 (attach) icon in WhatsApp\n` +
          `2. Select the downloaded PDF file\n` +
          `3. Send it to the customer`
        )
        showToast('PDF downloaded! Attach it in WhatsApp.', 'info')
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        showToast('Share cancelled', 'info')
      } else {
        console.error(err)
        showToast('Failed to share PDF', 'error')
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        {/* Header */}
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleRoundedIcon sx={{ color: tokens.emerald500, fontSize: 24 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>Sale Complete!</Typography>
            </Box>
            <IconButton size="small" onClick={onClose}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <Divider />

        <DialogContent sx={{ pt: 2 }}>
          {/* Invoice summary card */}
          <Box
            sx={{
              background: `linear-gradient(135deg, ${tokens.forest800}, ${tokens.forest900})`,
              borderRadius: '16px',
              p: 2.5,
              mb: 2.5,
              color: '#fff',
            }}
          >
            <Typography sx={{ fontSize: '0.72rem', color: alpha('#fff', 0.6), letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>
              Invoice Number
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', letterSpacing: '0.03em', mb: 1.5 }}>
              {sale.invoiceNumber}
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography sx={{ fontSize: '0.8rem', color: alpha('#fff', 0.7) }}>Customer</Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                {sale.customerName || 'Walk-in'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography sx={{ fontSize: '0.8rem', color: alpha('#fff', 0.7) }}>Items</Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{sale.items?.length || 0}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography sx={{ fontSize: '0.8rem', color: alpha('#fff', 0.7) }}>Payment</Typography>
              <StatusBadge status={sale.paymentMethod} size="small" />
            </Box>

            <Divider sx={{ borderColor: alpha('#fff', 0.15), mb: 1.5 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: sale.customerId ? 1.5 : 0 }}>
              <Typography sx={{ fontSize: '0.85rem', color: alpha('#fff', 0.8) }}>Total Amount</Typography>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: tokens.emerald400 }}>
                {fmt(sale.total)}
              </Typography>
            </Box>

            {sale.customerId && (
              <>
                <Divider sx={{ borderColor: alpha('#fff', 0.15), my: 1.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: alpha('#fff', 0.7) }}>Prev Due</Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmt(sale.previousBalance || 0)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: alpha('#fff', 0.7) }}>Received</Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmt(sale.amountPaid || 0)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: alpha('#fff', 0.7) }}>Bill Left</Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmt(sale.total - (sale.amountPaid || 0))}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: alpha('#fff', 0.9) }}>Total Due</Typography>
                  <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: tokens.amber500 }}>
                    {fmt((sale.previousBalance || 0) + (sale.total - (sale.amountPaid || 0)))}
                  </Typography>
                </Box>
              </>
            )}
          </Box>

          {/* Action buttons */}
          <Stack spacing={1.25}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                id="btn-invoice-print"
                variant="outlined"
                startIcon={printing ? <CircularProgress size={14} /> : <PrintRoundedIcon />}
                onClick={handlePrint}
                disabled={printing}
                fullWidth
                sx={{ borderRadius: '10px', fontSize: '0.78rem' }}
              >
                Thermal Print
              </Button>
              <Button
                id="btn-invoice-laser-print"
                variant="outlined"
                startIcon={<PrintRoundedIcon />}
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
                fullWidth
                sx={{ borderRadius: '10px', fontSize: '0.78rem' }}
              >
                Laser Print
              </Button>
              <Button
                id="btn-invoice-pdf"
                variant="outlined"
                startIcon={downloading ? <CircularProgress size={14} /> : <PictureAsPdfRoundedIcon />}
                onClick={handleDownload}
                disabled={downloading}
                fullWidth
                sx={{ borderRadius: '10px', fontSize: '0.78rem' }}
              >
                PDF
              </Button>
            </Box>

            <Button
              id="btn-invoice-whatsapp"
              variant="outlined"
              startIcon={downloading ? <CircularProgress size={14} /> : <WhatsAppIcon />}
              onClick={handleWhatsAppSend}
              disabled={downloading}
              fullWidth
              sx={{
                borderRadius: '10px',
                borderColor: '#25D366',
                color: '#25D366',
                '&:hover': { borderColor: '#128C7E', background: alpha('#25D366', 0.05) },
              }}
            >
              Send via WhatsApp
            </Button>

            <Button
              id="btn-new-sale"
              variant="contained"
              startIcon={<AddShoppingCartRoundedIcon />}
              onClick={onNewSale}
              fullWidth
              sx={{ borderRadius: '10px' }}
            >
              New Sale
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Toast */}
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
    </>
  )
}
