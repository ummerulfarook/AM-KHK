import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, Tooltip, IconButton, alpha,
} from '@mui/material'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded'
import PointOfSaleRoundedIcon from '@mui/icons-material/PointOfSaleRounded'
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded'
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded'
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded'
import AgricultureRoundedIcon from '@mui/icons-material/AgricultureRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import { tokens } from '../../theme/theme'
import { useLayout } from '../../contexts/LayoutContext'

const navItems = [
  { label: 'Dashboard',        icon: <DashboardRoundedIcon />,          path: '/dashboard' },
  { label: 'POS Billing',      icon: <PointOfSaleRoundedIcon />,        path: '/billing' },
  { label: 'Inventory',        icon: <InventoryRoundedIcon />,          path: '/inventory' },
  { label: 'Invoices',         icon: <LocalShippingRoundedIcon />,      path: '/billing/history' },
  { label: 'Customers',        icon: <PeopleAltRoundedIcon />,          path: '/customers' },
  { label: 'Credit',           icon: <AccountBalanceWalletRoundedIcon />, path: '/credit' },
  { label: 'Suppliers',        icon: <AgricultureRoundedIcon />,        path: '/suppliers' },
  { label: 'Expenses',         icon: <ReceiptLongRoundedIcon />,        path: '/expenses' },
  { label: 'Reports',          icon: <AssessmentRoundedIcon />,         path: '/reports' },
  { label: 'Settings',         icon: <SettingsRoundedIcon />,           path: '/settings' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { collapsed, toggleCollapse, sidebarWidth } = useLayout()

  return (
    <Box
      component="nav"
      sx={{
        width: sidebarWidth,
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${tokens.forest800} 0%, ${tokens.forest900} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 1200,
        boxShadow: '4px 0 24px rgba(0,0,0,0.20)',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* ── Logo / Brand ─────────────────────────────────────────────────── */}
      <Box
        sx={{
          px: collapsed ? 1.5 : 2,
          py: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Box
            sx={{
              width: collapsed ? 40 : 44,
              height: collapsed ? 40 : 44,
              borderRadius: '12px',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.30)',
              flexShrink: 0,
              p: 0.75,
            }}
          >
            <Box
              component="img"
              src="/logo.png"
              alt="AM & KHK Logo"
              sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </Box>
          {!collapsed && (
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  color: '#fff',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  fontSize: '0.85rem',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                AM & KHK
              </Typography>
              <Typography
                sx={{
                  color: alpha('#fff', 0.55),
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Vegetable Merchants
              </Typography>
            </Box>
          )}
        </Box>

        <IconButton
          id="btn-sidebar-collapse-toggle"
          onClick={toggleCollapse}
          size="small"
          sx={{
            color: alpha('#fff', 0.7),
            background: alpha('#fff', 0.08),
            '&:hover': { background: alpha('#fff', 0.18), color: '#fff' },
            borderRadius: '8px',
            p: 0.5,
          }}
        >
          {collapsed ? <ChevronRightRoundedIcon fontSize="small" /> : <ChevronLeftRoundedIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Divider sx={{ borderColor: alpha('#fff', 0.08), mx: 1.5 }} />

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <List sx={{ flex: 1, px: 1, py: 1.5 }}>
        {navItems.map((item) => {
          const active = item.path === '/billing'
            ? location.pathname === '/billing'
            : (location.pathname === item.path ||
               (item.path !== '/dashboard' && location.pathname.startsWith(item.path)))

          return (
            <Tooltip key={item.path} title={collapsed ? item.label : ''} placement="right" arrow>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: '10px',
                    px: collapsed ? 1 : 1.5,
                    py: 1,
                    justifyContent: collapsed ? 'center' : 'initial',
                    transition: 'all 0.2s ease',
                    background: active
                      ? `linear-gradient(135deg, ${tokens.emerald600} 0%, ${tokens.emerald500} 100%)`
                      : 'transparent',
                    boxShadow: active ? '0 4px 14px rgba(5,150,105,0.35)' : 'none',
                    '&:hover': {
                      background: active
                        ? `linear-gradient(135deg, ${tokens.emerald600} 0%, ${tokens.emerald500} 100%)`
                        : alpha('#fff', 0.06),
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: collapsed ? 0 : 36,
                      mr: collapsed ? 0 : 0,
                      justifyContent: 'center',
                      color: active ? '#fff' : alpha('#fff', 0.55),
                      '& .MuiSvgIcon-root': { fontSize: 22 },
                      transition: 'color 0.2s',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.875rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#fff' : alpha('#fff', 0.75),
                        letterSpacing: active ? '-0.01em' : 'normal',
                        whiteSpace: 'nowrap',
                      }}
                    />
                  )}
                </ListItemButton>
              </ListItem>
            </Tooltip>
          )
        })}
      </List>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      {!collapsed && (
        <Box sx={{ px: 2, py: 2, textAlign: 'center' }}>
          <Typography
            sx={{
              color: alpha('#fff', 0.25),
              fontSize: '0.65rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Cheranalloor, Ernakulam
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export const SIDEBAR_WIDTH = 260
