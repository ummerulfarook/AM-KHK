import { useState, useEffect } from 'react'
import {
  Box, IconButton, TextField, Typography, Tooltip, alpha,
} from '@mui/material'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import { tokens } from '../../theme/theme'

/**
 * CartItem — a single row in the POS cart.
 *
 * Props:
 *  item       { productId, name, unit, qty, unitPrice, subtotal }
 *  onQtyChange(productId, newQty)
 *  onPriceChange(productId, newPrice)  — price in rupees
 *  onRemove(productId)
 */
export default function CartItem({ item, onQtyChange, onPriceChange, onRemove, onEnterPress }) {
  const [localQty, setLocalQty] = useState(item.qty.toString())
  const [localPrice, setLocalPrice] = useState((item.unitPrice / 100).toString())

  // Keep local state in sync when item props change from outside (e.g. barcode scan, quick add)
  useEffect(() => {
    setLocalQty(item.qty.toString())
  }, [item.qty])

  useEffect(() => {
    setLocalPrice((item.unitPrice / 100).toString())
  }, [item.unitPrice])

  const subtotalRs = ((item.qty * item.unitPrice) / 100).toFixed(2)

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 110px 100px 40px',
        gap: 1.5,
        alignItems: 'center',
        py: 1.25,
        px: 1,
        borderRadius: '8px',
        borderBottom: `1px solid ${tokens.border}`,
        '&:hover': { background: alpha(tokens.surfaceAlt, 0.6) },
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      {/* Product name */}
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3, color: tokens.textPrimary }}>
          {item.name}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: tokens.textSecondary, display: 'inline' }}>
          per {item.unit}
        </Typography>
        {item.qty > item.availableStock && (
          <Typography sx={{ color: tokens.amber500, fontSize: '0.72rem', fontWeight: 600, display: 'block', mt: 0.25 }}>
            ⚠️ Stock warning (Available: {item.availableStock})
          </Typography>
        )}
      </Box>

      {/* Quantity */}
      <TextField
        id={`cart-qty-${item.cartId}`}
        size="small"
        type="text"
        inputMode="decimal"
        value={localQty}
        onChange={(e) => {
          const valStr = e.target.value
          setLocalQty(valStr)
          const v = parseFloat(valStr)
          if (!isNaN(v) && v !== 0) {
            onQtyChange(item.cartId, v)
          }
        }}
        onBlur={() => {
          if (isNaN(parseFloat(localQty)) || parseFloat(localQty) === 0) {
            setLocalQty(item.qty.toString())
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnterPress?.()
          }
        }}
        sx={{
          '& .MuiInputBase-input': { fontSize: '0.9rem', fontWeight: 600, textAlign: 'center', py: 0.8 },
        }}
      />

      {/* Unit price (in rupees for display) */}
      <TextField
        id={`cart-price-${item.cartId}`}
        size="small"
        type="text"
        inputMode="decimal"
        value={localPrice}
        onChange={(e) => {
          const valStr = e.target.value
          setLocalPrice(valStr)
          const v = parseFloat(valStr)
          if (!isNaN(v) && v >= 0) {
            onPriceChange(item.cartId, v)
          }
        }}
        onBlur={() => {
          if (isNaN(parseFloat(localPrice)) || parseFloat(localPrice) < 0) {
            setLocalPrice((item.unitPrice / 100).toString())
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnterPress?.()
          }
        }}
        sx={{
          '& .MuiInputBase-input': { fontSize: '0.9rem', fontWeight: 600, textAlign: 'right', py: 0.8 },
        }}
      />

      {/* Subtotal */}
      <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', textAlign: 'right', color: tokens.emerald600 }}>
        ₹{subtotalRs}
      </Typography>

      {/* Remove */}
      <Tooltip title="Remove">
        <IconButton
          id={`cart-remove-${item.cartId}`}
          size="small"
          onClick={() => onRemove(item.cartId)}
          sx={{ color: tokens.red500, '&:hover': { background: alpha(tokens.red500, 0.1) } }}
        >
          <DeleteRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
