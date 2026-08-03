import { Navigate, Outlet } from 'react-router-dom'
import { Box, CircularProgress, Typography, GlobalStyles } from '@mui/material'
import Sidebar, { SIDEBAR_WIDTH } from './Sidebar'
import Topbar from './Topbar'
import { useAuth } from '../../contexts/AuthContext'
import { tokens } from '../../theme/theme'

const TOPBAR_HEIGHT = 64

/**
 * AppShell — protected layout wrapper.
 * Redirects to /login if not authenticated.
 * Renders Sidebar + Topbar + page content.
 */
export default function AppShell() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${tokens.forest800} 0%, ${tokens.forest900} 100%)`,
          gap: 2,
        }}
      >
        <CircularProgress sx={{ color: tokens.emerald400 }} size={48} thickness={3} />
        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
          Loading...
        </Typography>
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: tokens.background }}>
      <GlobalStyles styles={{
        '@media print': {
          'nav, header, .MuiAppBar-root, button, .no-print, .MuiTabs-root, .MuiPagination-root': {
            display: 'none !important',
          },
          '.MuiTypography-colorTextSecondary, .MuiTypography-body2, .text-secondary': {
            color: '#2d3748 !important', /* Exaggerate dimmed secondary text colors to dark charcoal */
          },
          '.MuiTableCell-root': {
            borderColor: '#a0aec0 !important', /* Make table grid borders darker gray for clear printing */
            padding: '6px 8px !important', /* Tighten padding for report columns to fit on A4 */
            fontSize: '0.78rem !important', /* Reduce text size slightly to prevent right-side cutoffs */
          },
          'table, .MuiTable-root': {
            width: '100% !important',
            tableLayout: 'auto !important',
          },
          '.MuiTableContainer-root': {
            overflow: 'visible !important',
            width: '100% !important',
          },
          '.print-main': {
            marginLeft: '0 !important',
            padding: '0 !important',
            width: '100% !important',
          },
          '.print-content': {
            marginTop: '0 !important',
            padding: '0 !important',
            overflow: 'visible !important',
          },
          'body, html': {
            backgroundColor: '#ffffff !important',
            color: '#000000 !important',
            margin: '0 !important',
            padding: '0 !important',
          },
          '.MuiCard-root, .MuiPaper-root': {
            boxShadow: 'none !important',
            border: 'none !important',
            padding: '0 !important',
            width: '100% !important',
          }
        }
      }} />

      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main content area — offset for fixed sidebar */}
      <Box
        component="main"
        className="print-main"
        sx={{
          flex: 1,
          marginLeft: `${SIDEBAR_WIDTH}px`,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {/* Fixed Topbar */}
        <Topbar />

        {/* Page content — offset for fixed topbar */}
        <Box
          className="print-content"
          sx={{
            flex: 1,
            mt: `${TOPBAR_HEIGHT}px`,
            p: 3,
            overflowY: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
