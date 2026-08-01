/**
 * Reusable placeholder page component for modules not yet implemented.
 */
import { Box, Typography, Chip, alpha } from '@mui/material'
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded'
import { tokens } from '../../theme/theme'

export default function PlaceholderPage({ title, emoji, milestone, description }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{title}</Typography>
        <Chip
          icon={<ConstructionRoundedIcon sx={{ fontSize: '14px !important' }} />}
          label={milestone}
          size="small"
          sx={{
            backgroundColor: alpha(tokens.amber500, 0.12),
            color: tokens.amber500,
            fontWeight: 600,
            border: `1px solid ${alpha(tokens.amber500, 0.25)}`,
          }}
        />
      </Box>

      <Box
        sx={{
          borderRadius: '20px',
          border: `2px dashed ${tokens.border}`,
          backgroundColor: alpha(tokens.emerald500, 0.03),
          p: 6,
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>{emoji}</Typography>
        <Typography variant="h6" sx={{ fontWeight: 600, color: tokens.textPrimary, mb: 1 }}>
          {title} — {milestone}
        </Typography>
        <Typography sx={{ color: tokens.textSecondary, fontSize: '0.9rem' }}>
          {description}
        </Typography>
      </Box>
    </Box>
  )
}
