import { Chip, alpha } from '@mui/material'
import { tokens } from '../../theme/theme'

/**
 * StatusBadge — color-coded chip for stock status, payment status, order status, etc.
 *
 * Variant presets:
 *   Stock:   in_stock | low_stock | out_of_stock
 *   Credit:  paid | due | due_soon | overdue
 *   Order:   pending | confirmed | packed | out_for_delivery | delivered | cancelled
 *   Expense: pending | approved | rejected
 *   Payment: cash | upi | bank | credit
 */

const STATUS_CONFIG = {
  // Stock
  in_stock:         { label: 'In Stock',        color: tokens.emerald500 },
  low_stock:        { label: 'Low Stock',        color: tokens.amber500 },
  out_of_stock:     { label: 'Out of Stock',     color: tokens.red500 },

  // Credit / payment
  paid:             { label: 'Paid',             color: tokens.emerald500 },
  due:              { label: 'Due',              color: tokens.textSecondary },
  due_soon:         { label: 'Due Soon',         color: tokens.amber500 },
  overdue:          { label: 'Overdue',          color: tokens.red500 },

  // Wholesale order status
  pending:          { label: 'Pending',          color: tokens.amber500 },
  confirmed:        { label: 'Confirmed',        color: tokens.blue500 },
  packed:           { label: 'Packed',           color: tokens.amber500 },
  out_for_delivery: { label: 'Out for Delivery', color: tokens.blue500 },
  delivered:        { label: 'Delivered',        color: tokens.emerald500 },
  cancelled:        { label: 'Cancelled',        color: tokens.red500 },

  // Expense approval
  approved:         { label: 'Approved',         color: tokens.emerald500 },
  rejected:         { label: 'Rejected',         color: tokens.red500 },

  // Payment methods
  cash:             { label: 'Cash',             color: tokens.emerald600 },
  upi:              { label: 'UPI',              color: tokens.blue500 },
  bank:             { label: 'Bank',             color: tokens.blue500 },
  credit:           { label: 'Credit',           color: tokens.amber500 },

  // Purchase order
  draft:            { label: 'Draft',            color: tokens.textSecondary },
  ordered:          { label: 'Ordered',          color: tokens.blue500 },
  received:         { label: 'Received',         color: tokens.emerald500 },

  // Wholesale payment
  partial:          { label: 'Partial',          color: tokens.amber500 },
}

export default function StatusBadge({ status, size = 'small', sx = {} }) {
  const config = STATUS_CONFIG[status] || { label: status, color: tokens.textSecondary }

  return (
    <Chip
      label={config.label}
      size={size}
      sx={{
        borderRadius: '999px',
        fontWeight: 700,
        fontSize: size === 'small' ? '0.68rem' : '0.78rem',
        letterSpacing: '0.03em',
        backgroundColor: alpha(config.color, 0.12),
        color: config.color,
        border: `1px solid ${alpha(config.color, 0.25)}`,
        height: size === 'small' ? 22 : 28,
        ...sx,
      }}
    />
  )
}
