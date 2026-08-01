import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Card, CardContent, TextField, Button, Typography,
  Alert, CircularProgress, InputAdornment, IconButton, alpha,
} from '@mui/material'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import GrassRoundedIcon from '@mui/icons-material/GrassRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import { useAuth } from '../../contexts/AuthContext'
import { tokens } from '../../theme/theme'

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) {
      setError('Please enter your username and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${tokens.forest900} 0%, ${tokens.forest700} 60%, ${alpha(tokens.emerald600, 0.8)} 100%)`,
        position: 'relative',
        overflow: 'hidden',
        px: 2,
      }}
    >
      {/* Decorative blobs */}
      {[
        { top: '-10%', right: '-5%', size: 420, opacity: 0.06 },
        { bottom: '-15%', left: '-8%', size: 500, opacity: 0.04 },
        { top: '40%',  left: '5%',  size: 200, opacity: 0.08 },
      ].map((b, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            top: b.top, bottom: b.bottom, left: b.left, right: b.right,
            width: b.size, height: b.size,
            borderRadius: '50%',
            background: tokens.emerald400,
            opacity: b.opacity,
            pointerEvents: 'none',
            filter: 'blur(40px)',
          }}
        />
      ))}

      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          borderRadius: '24px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
          border: `1px solid ${alpha('#fff', 0.10)}`,
          backdropFilter: 'blur(20px)',
          backgroundColor: alpha(tokens.surface, 0.97),
          position: 'relative',
          zIndex: 1,
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Logo */}
          <Box sx={{ textAlign: 'center', mb: 3.5 }}>
            <Box
              sx={{
                display: 'inline-flex',
                width: 90,
                height: 90,
                borderRadius: '24px',
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 32px rgba(5,150,105,0.25)',
                mb: 2,
                p: 1.2,
                border: `1px solid ${alpha(tokens.emerald500, 0.25)}`,
              }}
            >
              <Box
                component="img"
                src="/logo.png"
                alt="AM & KHK Logo"
                sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: tokens.textPrimary, mb: 0.5 }}>
              AM & KHK
            </Typography>
            <Typography sx={{ color: tokens.textSecondary, fontSize: '0.85rem', fontWeight: 500 }}>
              Vegetable Merchants ERP
            </Typography>
          </Box>

          {/* Error alert */}
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2.5, borderRadius: '10px', fontSize: '0.85rem' }}
              onClose={() => setError('')}
            >
              {error}
            </Alert>
          )}

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              id="input-username"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              fullWidth
              autoFocus
              autoComplete="username"
              disabled={loading}
              sx={{ mb: 2 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonRoundedIcon fontSize="small" sx={{ color: tokens.textSecondary }} />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              id="input-password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
              disabled={loading}
              sx={{ mb: 3 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockRoundedIcon fontSize="small" sx={{ color: tokens.textSecondary }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      id="btn-toggle-password"
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                    >
                      {showPassword
                        ? <VisibilityOffRoundedIcon fontSize="small" />
                        : <VisibilityRoundedIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              id="btn-login"
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ py: 1.5, fontSize: '1rem', fontWeight: 700 }}
            >
              {loading ? <CircularProgress size={22} thickness={3} sx={{ color: '#fff' }} /> : 'Sign In'}
            </Button>
          </Box>

          <Typography
            sx={{ textAlign: 'center', mt: 3, fontSize: '0.72rem', color: tokens.textSecondary }}
          >
            NH-17, Cheranalloor, Ernakulam, Kerala
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
