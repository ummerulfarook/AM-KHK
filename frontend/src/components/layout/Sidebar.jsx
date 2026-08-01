import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, Tooltip, alpha,
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
import GrassRoundedIcon from '@mui/icons-material/GrassRounded'
import { tokens } from '../../theme/theme'

const SIDEBAR_WIDTH = 260

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

  return (
    <Box
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
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
      }}
    >
      {/* ── Logo / Brand ─────────────────────────────────────────────────── */}
      <Box sx={{ px: 2.5, py: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 46,
            height: 46,
            borderRadius: '14px',
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
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              color: '#fff',
              fontWeight: 700,
              lineHeight: 1.2,
              fontSize: '0.85rem',
              letterSpacing: '-0.01em',
            }}
          >
            AM & KHK
          </Typography>
          <Typography
            sx={{
              color: alpha('#fff', 0.55),
              fontSize: '0.68rem',
              fontWeight: 500,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Vegetable Merchants
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: alpha('#fff', 0.08), mx: 2 }} />

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <List sx={{ flex: 1, px: 1.5, py: 1.5 }}>
        {navItems.map((item) => {
          const active = item.path === '/billing'
            ? location.pathname === '/billing'
            : (location.pathname === item.path ||
               (item.path !== '/dashboard' && location.pathname.startsWith(item.path)))

          return (
            <Tooltip key={item.path} title="" placement="right">
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => navigate(item.path)}
                  sx={{
                    borderRadius: '10px',
                    px: 1.5,
                    py: 1,
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
                      minWidth: 36,
                      color: active ? '#fff' : alpha('#fff', 0.55),
                      '& .MuiSvgIcon-root': { fontSize: 20 },
                      transition: 'color 0.2s',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.875rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? '#fff' : alpha('#fff', 0.75),
                      letterSpacing: active ? '-0.01em' : 'normal',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            </Tooltip>
          )
        })}
      </List>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <Box sx={{ px: 2.5, py: 2 }}>
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
    </Box>
  )
}

export { SIDEBAR_WIDTH }
