/**
 * AM & KHK Vegetable Merchants — MUI Theme
 * Botanical-ERP identity: deep forest greens with emerald accents.
 */
import { createTheme, alpha } from '@mui/material/styles'
import '@fontsource/poppins/300.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'

// ── Design tokens ─────────────────────────────────────────────────────────────
export const tokens = {
  forest900: '#0A2A1F',
  forest800: '#0E3A2A',
  forest700: '#134832',
  emerald600: '#059669',
  emerald500: '#10B981',
  emerald400: '#3DD9A4',
  lime500: '#8BC53F',
  background: '#F4F8F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF5F0',
  border: '#E2EBE4',
  textPrimary: '#0F2419',
  textSecondary: '#71837A',
  amber500: '#F0940C',
  red500: '#E5484D',
  blue500: '#3F7FE0',
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: tokens.emerald600,
      light: tokens.emerald500,
      dark: tokens.forest700,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: tokens.lime500,
      contrastText: tokens.forest900,
    },
    background: {
      default: tokens.background,
      paper: tokens.surface,
    },
    text: {
      primary: tokens.textPrimary,
      secondary: tokens.textSecondary,
    },
    divider: tokens.border,
    error: { main: tokens.red500 },
    warning: { main: tokens.amber500 },
    info: { main: tokens.blue500 },
    success: { main: tokens.emerald500 },
    // Custom tokens available via theme.palette.custom.*
    custom: { ...tokens },
  },

  typography: {
    fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 700, fontSize: '2.25rem', lineHeight: 1.2 },
    h2: { fontWeight: 700, fontSize: '1.875rem', lineHeight: 1.25 },
    h3: { fontWeight: 600, fontSize: '1.5rem', lineHeight: 1.3 },
    h4: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.35 },
    h5: { fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.4 },
    h6: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5 },
    subtitle1: { fontWeight: 500, fontSize: '0.9375rem' },
    subtitle2: { fontWeight: 500, fontSize: '0.875rem' },
    body1: { fontWeight: 400, fontSize: '0.9375rem' },
    body2: { fontWeight: 400, fontSize: '0.875rem' },
    caption: { fontWeight: 400, fontSize: '0.75rem', color: tokens.textSecondary },
    overline: { fontWeight: 600, fontSize: '0.6875rem', letterSpacing: '0.08em' },
    button: { fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' },
  },

  shape: {
    borderRadius: 12,
  },

  shadows: [
    'none',
    '0 1px 3px rgba(10,42,31,0.08)',
    '0 2px 6px rgba(10,42,31,0.10)',
    '0 4px 12px rgba(10,42,31,0.12)',
    '0 6px 16px rgba(10,42,31,0.14)',
    '0 8px 20px rgba(10,42,31,0.16)',
    '0 10px 24px rgba(10,42,31,0.18)',
    '0 12px 28px rgba(10,42,31,0.20)',
    '0 14px 32px rgba(5,150,105,0.18)',
    '0 16px 36px rgba(5,150,105,0.20)',
    '0 18px 40px rgba(5,150,105,0.22)',
    '0 20px 44px rgba(5,150,105,0.24)',
    '0 22px 48px rgba(5,150,105,0.26)',
    '0 24px 52px rgba(5,150,105,0.28)',
    '0 2px 4px -1px rgba(0,0,0,.06), 0 4px 5px 0 rgba(0,0,0,.04), 0 1px 10px 0 rgba(0,0,0,.04)',
    '0 3px 5px -1px rgba(0,0,0,.06), 0 5px 8px 0 rgba(0,0,0,.04), 0 1px 14px 0 rgba(0,0,0,.04)',
    '0 3px 5px -1px rgba(0,0,0,.06), 0 6px 10px 0 rgba(0,0,0,.04), 0 1px 18px 0 rgba(0,0,0,.04)',
    '0 4px 5px -2px rgba(0,0,0,.06), 0 7px 10px 1px rgba(0,0,0,.04), 0 2px 16px 1px rgba(0,0,0,.04)',
    '0 5px 5px -3px rgba(0,0,0,.06), 0 8px 10px 1px rgba(0,0,0,.04), 0 3px 14px 2px rgba(0,0,0,.04)',
    '0 5px 6px -3px rgba(0,0,0,.06), 0 9px 12px 1px rgba(0,0,0,.04), 0 3px 16px 2px rgba(0,0,0,.04)',
    '0 6px 6px -3px rgba(0,0,0,.06), 0 10px 14px 1px rgba(0,0,0,.04), 0 4px 18px 3px rgba(0,0,0,.04)',
    '0 6px 7px -4px rgba(0,0,0,.06), 0 11px 15px 1px rgba(0,0,0,.04), 0 4px 20px 3px rgba(0,0,0,.04)',
    '0 7px 8px -4px rgba(0,0,0,.06), 0 12px 17px 2px rgba(0,0,0,.04), 0 5px 22px 4px rgba(0,0,0,.04)',
    '0 7px 8px -4px rgba(0,0,0,.06), 0 13px 19px 2px rgba(0,0,0,.04), 0 5px 24px 4px rgba(0,0,0,.04)',
    '0 7px 9px -4px rgba(0,0,0,.06), 0 14px 21px 2px rgba(0,0,0,.04), 0 5px 26px 4px rgba(0,0,0,.04)',
  ],

  components: {
    // ── MuiCssBaseline ─────────────────────────────────────────────────────
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        body: {
          backgroundColor: tokens.background,
          color: tokens.textPrimary,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '::-webkit-scrollbar': { width: '6px', height: '6px' },
        '::-webkit-scrollbar-track': { background: tokens.surfaceAlt },
        '::-webkit-scrollbar-thumb': {
          background: tokens.border,
          borderRadius: '3px',
          '&:hover': { background: tokens.textSecondary },
        },
      },
    },

    // ── MuiCard ────────────────────────────────────────────────────────────
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          boxShadow: '0 2px 12px rgba(10,42,31,0.08)',
          border: `1px solid ${tokens.border}`,
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            boxShadow: '0 6px 24px rgba(5,150,105,0.14)',
          },
        },
      },
    },

    // ── MuiButton ──────────────────────────────────────────────────────────
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '9px 22px',
          fontWeight: 600,
          fontSize: '0.9rem',
          transition: 'all 0.2s ease',
        },
        contained: {
          background: `linear-gradient(135deg, ${tokens.emerald600} 0%, ${tokens.emerald500} 100%)`,
          boxShadow: '0 4px 14px rgba(5,150,105,0.30)',
          '&:hover': {
            background: `linear-gradient(135deg, ${tokens.forest700} 0%, ${tokens.emerald600} 100%)`,
            boxShadow: '0 6px 20px rgba(5,150,105,0.40)',
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
        },
        outlined: {
          borderColor: tokens.emerald600,
          color: tokens.emerald600,
          '&:hover': {
            backgroundColor: alpha(tokens.emerald500, 0.08),
            borderColor: tokens.emerald500,
          },
        },
      },
    },

    // ── MuiTextField ───────────────────────────────────────────────────────
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: tokens.surface,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.emerald500,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: tokens.emerald600,
              borderWidth: '2px',
            },
          },
        },
      },
    },

    // ── MuiChip ────────────────────────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },

    // ── MuiTableHead ───────────────────────────────────────────────────────
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: tokens.surfaceAlt,
            color: tokens.textSecondary,
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderBottom: `2px solid ${tokens.border}`,
          },
        },
      },
    },

    // ── MuiTableRow ────────────────────────────────────────────────────────
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: alpha(tokens.emerald500, 0.04),
          },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },

    // ── MuiDialog ──────────────────────────────────────────────────────────
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(10,42,31,0.20)',
        },
      },
    },

    // ── MuiTooltip ─────────────────────────────────────────────────────────
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 8,
          backgroundColor: tokens.forest800,
          fontSize: '0.75rem',
        },
      },
    },

    // ── MuiLinearProgress ──────────────────────────────────────────────────
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, backgroundColor: alpha(tokens.emerald500, 0.15) },
        bar: { borderRadius: 999 },
      },
    },
  },
})

export default theme
