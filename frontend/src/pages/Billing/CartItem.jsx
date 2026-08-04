import { useState, useEffect } from 'react'
import {
  Box, IconButton, TextField, Typography, Tooltip,
} from '@mui/material'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import { tokens } from '../../theme/theme'

/**
 * CartItem — a single row in the POS cart.
 *
 * Props:
 *  item       { productId, name, unit, qty, unitPrice, subtotal, boxes, boxWeight }
 *  onQtyChange(productId, newQty)
 *  onPriceChange(productId, newPrice)  — price in rupees
 *  onRemove(productId)
 *  onBoxesChange(productId, boxes, boxWeight, calculatedQty)
 */
export default function CartItem({ item, onQtyChange, onPriceChange, onRemove, onEnterPress, onBoxesChange }) {
  const [localBoxes, setLocalBoxes] = useState(item.boxes ? item.boxes.toString() : '')
  const [localBoxWeight, setLocalBoxWeight] = useState(item.boxWeight ? item.boxWeight.toString() : '')
  const [localQty, setLocalQty] = useState(item.qty.toString())
  const [localPrice, setLocalPrice] = useState((item.unitPrice / 100).toString())

  useEffect(() => {
    setLocalBoxes(item.boxes ? item.boxes.toString() : '')
  }, [item.boxes])

  useEffect(() => {
    setLocalBoxWeight(item.boxWeight ? item.boxWeight.toString() : '')
  }, [item.boxWeight])

  useEffect(() => {
    setLocalQty(item.qty.toString())
  }, [item.qty])

  useEffect(() => {
    setLocalPrice((item.unitPrice / 100).toString())
  }, [item.unitPrice])

  const subtotalRs = ((item.qty * item.unitPrice) / 100).toFixed(2)

  const handleBoxesChangeLocal = (newBoxesStr, newWeightStr) => {
    setLocalBoxes(newBoxesStr)
    setLocalBoxWeight(newWeightStr)
    const boxes = parseInt(newBoxesStr)
    const weight = parseFloat(newWeightStr)
    if (!isNaN(boxes) && !isNaN(weight) && boxes >= 0 && weight >= 0) {
      const calculatedQty = boxes * weight
      onBoxesChange(item.productId, boxes, weight, calculatedQty)
    } else if (newBoxesStr === '' && newWeightStr === '') {
      onBoxesChange(item.productId, 0, 0.0, item.qty)
    }
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 65px 70px 75px 85px 70px 36px',
        gap: 0.75,
        alignItems: 'center',
        py: 0.75,
        borderBottom: `1px solid ${tokens.border}`,
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      {/* Product name */}
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.2 }}>
          {item.name}
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: tokens.textSecondary, display: 'inline' }}>
          per {item.unit}
        </Typography>
        {item.qty > item.availableStock && (
          <Typography sx={{ color: tokens.amber500, fontSize: '0.68rem', fontWeight: 600, display: 'block', mt: 0.1 }}>
            ⚠️ Low Stock ({item.availableStock})
          </Typography>
        )}
      </Box>

      {/* Boxes */}
      <TextField
        placeholder="Box"
        size="small"
        type="text"
        inputMode="numeric"
        value={localBoxes}
        onChange={(e) => handleBoxesChangeLocal(e.target.value, localBoxWeight)}
        sx={{
          '& .MuiInputBase-input': { fontSize: '0.8rem', textAlign: 'center', p: 0.5 },
        }}
      />

      {/* Wt/Box */}
      <TextField
        placeholder="Wt/Bx"
        size="small"
        type="text"
        inputMode="decimal"
        value={localBoxWeight}
        onChange={(e) => handleBoxesChangeLocal(localBoxes, e.target.value)}
        sx={{
          '& .MuiInputBase-input': { fontSize: '0.8rem', textAlign: 'center', p: 0.5 },
        }}
      />

      {/* Quantity */}
      <TextField
        id={`cart-qty-${item.productId}`}
        size="small"
        type="text"
        inputMode="decimal"
        value={localQty}
        onChange={(e) => {
          const valStr = e.target.value
          setLocalQty(valStr)
          const v = parseFloat(valStr)
          if (!isNaN(v) && v !== 0) {
            onQtyChange(item.productId, v)
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
          '& .MuiInputBase-input': { fontSize: '0.8rem', textAlign: 'center', p: 0.5 },
        }}
      />

      {/* Unit price */}
      <TextField
        id={`cart-price-${item.productId}`}
        size="small"
        type="text"
        inputMode="decimal"
        value={localPrice}
        onChange={(e) => {
          const valStr = e.target.value
          setLocalPrice(valStr)
          const v = parseFloat(valStr)
          if (!isNaN(v) && v >= 0) {
            onPriceChange(item.productId, v)
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
          '& .MuiInputBase-input': { fontSize: '0.8rem', textAlign: 'right', p: 0.5 },
        }}
      />

      {/* Subtotal */}
      <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', textAlign: 'right', color: tokens.emerald600 }}>
        ₹{subtotalRs}
      </Typography>

      {/* Remove */}
      <Tooltip title="Remove">
        <IconButton
          id={`cart-remove-${item.productId}`}
          size="small"
          onClick={() => onRemove(item.productId)}
          sx={{ color: tokens.red500, p: 0.5 }}
        >
          <DeleteRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
