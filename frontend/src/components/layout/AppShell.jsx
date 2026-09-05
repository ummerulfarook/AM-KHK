import { Navigate, Outlet } from 'react-router-dom'
import { Box, CircularProgress, Typography, GlobalStyles } from '@mui/material'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAuth } from '../../contexts/AuthContext'
import { LayoutProvider, useLayout } from '../../contexts/LayoutContext'
import { tokens } from '../../theme/theme'

const TOPBAR_HEIGHT = 64

function AppShellContent() {
  const { sidebarWidth } = useLayout()

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: tokens.background }}>
      <GlobalStyles styles={{
        '@media print': {
          'nav, header, .MuiAppBar-root, button, .no-print, .MuiTabs-root, .MuiPagination-root': {
            display: 'none !important',
          },
          '.MuiTypography-colorTextSecondary, .MuiTypography-body2, .text-secondary': {
            color: '#2d3748 !important',
          },
          '.MuiTableCell-root': {
            borderColor: '#a0aec0 !important',
            padding: '6px 8px !important',
            fontSize: '0.78rem !important',
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
          marginLeft: `${sidebarWidth}px`,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
            p: { xs: 1.5, sm: 2, md: 2.5 },
            overflowY: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

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
    <LayoutProvider>
      <AppShellContent />
    </LayoutProvider>
  )
}
