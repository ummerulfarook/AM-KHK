import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Box, Typography, Chip, Avatar, Menu, MenuItem,
  IconButton, Divider, alpha, Tooltip,
} from '@mui/material'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded'
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded'
import { SIDEBAR_WIDTH } from './Sidebar'
import { useAuth } from '../../contexts/AuthContext'
import { tokens } from '../../theme/theme'

const ROLE_COLORS = {
  owner:      { bg: alpha(tokens.emerald600, 0.12), color: tokens.emerald600 },
  manager:    { bg: alpha(tokens.blue500, 0.12),    color: tokens.blue500 },
  accountant: { bg: alpha(tokens.amber500, 0.12),   color: tokens.amber500 },
  cashier:    { bg: alpha(tokens.textSecondary, 0.12), color: tokens.textSecondary },
}

export default function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState(null)

  const roleStyle = ROLE_COLORS[user?.role] ?? ROLE_COLORS.cashier

  const handleLogout = async () => {
    setAnchorEl(null)
    await logout()
    navigate('/login')
  }

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        left: SIDEBAR_WIDTH,
        width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
        backgroundColor: tokens.surface,
        borderBottom: `1px solid ${tokens.border}`,
        zIndex: 1100,
      }}
    >
      <Toolbar sx={{ gap: 2 }}>
        {/* ── Branch pill ──────────────────────────────────────────────── */}
        <Chip
          avatar={<Avatar src="/logo.png" alt="Logo" sx={{ width: 22, height: 22 }} />}
          label="AM & KHK — Cheranalloor"
          size="small"
          sx={{
            backgroundColor: alpha(tokens.emerald500, 0.10),
            color: tokens.emerald700,
            fontWeight: 600,
            fontSize: '0.78rem',
            border: `1px solid ${alpha(tokens.emerald500, 0.25)}`,
            py: 0.5,
          }}
        />

        <Box sx={{ flex: 1 }} />

        {/* ── Notifications (placeholder) ───────────────────────────── */}
        <Tooltip title="Notifications">
          <IconButton id="btn-notifications" size="small">
            <NotificationsNoneRoundedIcon
              sx={{ color: tokens.textSecondary, fontSize: 22 }}
            />
          </IconButton>
        </Tooltip>

        {/* ── User avatar + role ────────────────────────────────────── */}
        <Box
          id="btn-user-menu"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            px: 1.5,
            py: 0.75,
            borderRadius: '10px',
            transition: 'background 0.2s',
            '&:hover': { backgroundColor: alpha(tokens.emerald500, 0.06) },
          }}
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              background: `linear-gradient(135deg, ${tokens.emerald600} 0%, ${tokens.emerald400} 100%)`,
              fontSize: '0.875rem',
              fontWeight: 700,
            }}
          >
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography
              sx={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.textPrimary, lineHeight: 1.2 }}
            >
              {user?.name}
            </Typography>
            <Chip
              label={user?.role}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                ...roleStyle,
              }}
            />
          </Box>
        </Box>

        {/* ── User dropdown ─────────────────────────────────────────── */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: {
              mt: 1,
              borderRadius: '12px',
              border: `1px solid ${tokens.border}`,
              boxShadow: '0 8px 32px rgba(10,42,31,0.14)',
              minWidth: 180,
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem', color: tokens.textPrimary }}>
              {user?.name}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: tokens.textSecondary }}>
              {user?.phone ?? '—'}
            </Typography>
          </Box>
          <Divider sx={{ borderColor: tokens.border }} />
          <MenuItem
            id="menu-profile"
            onClick={() => { setAnchorEl(null); navigate('/settings') }}
            sx={{ gap: 1.5, fontSize: '0.875rem' }}
          >
            <AccountCircleRoundedIcon fontSize="small" sx={{ color: tokens.textSecondary }} />
            Profile
          </MenuItem>
          <MenuItem
            id="menu-logout"
            onClick={handleLogout}
            sx={{ gap: 1.5, fontSize: '0.875rem', color: tokens.red500 }}
          >
            <LogoutRoundedIcon fontSize="small" />
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  )
}
