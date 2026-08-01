import { Box, Card, CardContent, Typography, alpha } from '@mui/material'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded'
import { tokens } from '../../theme/theme'

/**
 * StatCard — reusable dashboard metric card.
 *
 * Props:
 *  title        string
 *  value        string | number   — formatted display value
 *  subtitle     string            — secondary line below value
 *  icon         ReactNode
 *  color        string            — one of tokens keys e.g. tokens.emerald600
 *  trend        number | null     — percentage change; positive=green, negative=red
 *  loading      boolean
 */
export default function StatCard({ title, value, subtitle, icon, color, trend, loading }) {
  const trendUp = trend > 0
  const trendColor = trend === 0 ? tokens.textSecondary : trendUp ? tokens.emerald500 : tokens.red500

  return (
    <Card
      sx={{
        borderRadius: '20px',
        border: `1px solid ${tokens.border}`,
        background: tokens.surface,
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': { transform: 'translateY(-2px)' },
      }}
    >
      {/* Decorative gradient blob */}
      <Box
        sx={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: alpha(color || tokens.emerald600, 0.10),
          pointerEvents: 'none',
        }}
      />

      <CardContent sx={{ p: 2.5 }}>
        {/* Header row: title + icon */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: tokens.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {title}
          </Typography>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: alpha(color || tokens.emerald600, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color || tokens.emerald600,
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
        </Box>

        {/* Main value */}
        {loading ? (
          <Box sx={{ height: 36, background: tokens.surfaceAlt, borderRadius: 2, mb: 1 }} />
        ) : (
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              color: tokens.textPrimary,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              mb: 0.75,
            }}
          >
            {value}
          </Typography>
        )}

        {/* Subtitle + trend */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {subtitle && (
            <Typography sx={{ fontSize: '0.78rem', color: tokens.textSecondary, flex: 1 }}>
              {subtitle}
            </Typography>
          )}
          {trend != null && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {trendUp
                ? <TrendingUpRoundedIcon sx={{ fontSize: 14, color: trendColor }} />
                : <TrendingDownRoundedIcon sx={{ fontSize: 14, color: trendColor }} />
              }
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: trendColor }}>
                {Math.abs(trend)}%
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}
