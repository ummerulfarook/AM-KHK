import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Grid, Typography, Card, CardContent, CardHeader,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItem, ListItemText, ListItemIcon, LinearProgress,
  Alert, Skeleton, alpha, Divider, IconButton, Tooltip, TextField,
} from '@mui/material'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import AttachMoneyRoundedIcon from '@mui/icons-material/AttachMoneyRounded'
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded'
import ReceiptRoundedIcon from '@mui/icons-material/ReceiptRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import { dashboardApi } from '../../api/dashboardApi'
import StatCard from '../../components/common/StatCard'
import StatusBadge from '../../components/common/StatusBadge'
import { tokens } from '../../theme/theme'

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (paise) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const fmtK = (paise) => {
  const inr = paise / 100
  if (inr >= 100000) return '₹' + (inr / 100000).toFixed(1) + 'L'
  if (inr >= 1000) return '₹' + (inr / 1000).toFixed(1) + 'K'
  return '₹' + inr.toFixed(0)
}

// Custom tooltip for the area chart
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <Box
      sx={{
        background: tokens.forest800,
        border: `1px solid ${alpha(tokens.emerald500, 0.3)}`,
        borderRadius: '10px',
        p: 1.5,
        minWidth: 140,
      }}
    >
      <Typography sx={{ color: alpha('#fff', 0.6), fontSize: '0.72rem', mb: 0.5 }}>{label}</Typography>
      {payload.map((p) => (
        <Box key={p.name} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Typography sx={{ color: p.color, fontSize: '0.78rem', fontWeight: 600 }}>{p.name}</Typography>
          <Typography sx={{ color: '#fff', fontSize: '0.78rem' }}>{fmtK(p.value)}</Typography>
        </Box>
      ))}
    </Box>
  )
}

// Skeleton loaders
function StatSkeleton() {
  return (
    <Card sx={{ borderRadius: '20px', p: 2.5 }}>
      <Skeleton variant="text" width="60%" height={16} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="80%" height={36} sx={{ mb: 0.5 }} />
      <Skeleton variant="text" width="50%" height={14} />
    </Card>
  )
}

export default function DashboardPage() {
  const qc = useQueryClient()
  const [workingDate, setWorkingDate] = useState(() => {
    return localStorage.getItem('working_date') || ''
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.getDashboard,
    refetchInterval: 60_000,  // auto-refresh every minute
  })

  const chartData = useMemo(() => {
    if (!data?.weeklySales) return []
    return data.weeklySales.map(d => ({
      ...d,
      retailINR: d.retail / 100,
      wholesaleINR: d.wholesale / 100,
    }))
  }, [data])

  const handleWorkingDateChange = (val) => {
    setWorkingDate(val)
    if (val) {
      localStorage.setItem('working_date', val)
    } else {
      localStorage.removeItem('working_date')
    }
    // Invalidate queries so that all dashboard stats and summaries reload for the selected date!
    qc.invalidateQueries(['dashboard'])
    qc.invalidateQueries(['inventory'])
    qc.invalidateQueries(['inventoryStats'])
  }

  if (isError) {
    return (
      <Alert severity="error" sx={{ borderRadius: '12px' }}>
        Failed to load dashboard: {error?.message || 'Unknown error'}
      </Alert>
    )
  }

  return (
    <Box>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: tokens.textPrimary }}>
            Dashboard
          </Typography>
          <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TextField
            id="global-working-date"
            label="System Working Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={workingDate}
            onChange={(e) => handleWorkingDateChange(e.target.value)}
            sx={{
              width: 170,
              '& .MuiOutlinedInput-root': {
                borderRadius: '10px',
                backgroundColor: tokens.surface,
              }
            }}
          />
          {workingDate && (
            <Button
              size="small"
              variant="text"
              color="error"
              onClick={() => handleWorkingDateChange('')}
              sx={{ fontWeight: 600, fontSize: '0.78rem' }}
            >
              Reset
            </Button>
          )}
        </Box>
      </Box>

      {/* ── Row 1: Stat cards ────────────────────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {isLoading ? (
          [0, 1, 2, 3].map(i => (
            <Grid item xs={12} sm={6} lg={3} key={i}><StatSkeleton /></Grid>
          ))
        ) : (
          <>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                title="Today's Sales"
                value={fmtK(data?.todaySales?.total || 0)}
                subtitle={`Retail ${fmtK(data?.todaySales?.retail || 0)} · Wholesale ${fmtK(data?.todaySales?.wholesale || 0)}`}
                icon={<ShoppingCartRoundedIcon fontSize="small" />}
                color={tokens.emerald600}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                title="Pending Credits"
                value={fmtK(data?.pendingCredits?.total || 0)}
                subtitle={`Overdue ${fmtK(data?.pendingCredits?.overdue || 0)}`}
                icon={<CreditCardRoundedIcon fontSize="small" />}
                color={data?.pendingCredits?.overdue > 0 ? tokens.red500 : tokens.amber500}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                title="Today's Expenses"
                value={fmtK(data?.todayExpenses || 0)}
                subtitle="Approved expenses only"
                icon={<ReceiptRoundedIcon fontSize="small" />}
                color={tokens.amber500}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg={3}>
              <StatCard
                title="Est. Net Profit"
                value={fmtK(data?.netProfit || 0)}
                subtitle="Sales minus approved expenses"
                icon={<TrendingUpRoundedIcon fontSize="small" />}
                color={data?.netProfit >= 0 ? tokens.emerald600 : tokens.red500}
              />
            </Grid>
          </>
        )}
      </Grid>

      {/* ── Row 2: Chart + Low-stock alerts ──────────────────────────────── */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Weekly Sales Chart */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
            <CardHeader
              title={
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: tokens.textPrimary }}>
                  Weekly Sales
                </Typography>
              }
              subheader={
                <Typography sx={{ fontSize: '0.78rem', color: tokens.textSecondary }}>
                  Last 7 days — Retail vs Wholesale
                </Typography>
              }
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ pt: 1 }}>
              {isLoading ? (
                <Skeleton variant="rectangular" height={220} sx={{ borderRadius: '10px' }} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRetail" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={tokens.emerald500} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={tokens.emerald500} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradWholesale" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={tokens.blue500} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={tokens.blue500} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: tokens.textSecondary }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                      tick={{ fontSize: 11, fill: tokens.textSecondary }}
                      axisLine={false}
                      tickLine={false}
                      width={55}
                    />
                    <ReTooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '0.78rem', paddingTop: '8px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="retailINR"
                      name="Retail"
                      stroke={tokens.emerald500}
                      strokeWidth={2.5}
                      fill="url(#gradRetail)"
                      dot={{ r: 3, fill: tokens.emerald500 }}
                      activeDot={{ r: 5 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="wholesaleINR"
                      name="Wholesale"
                      stroke={tokens.blue500}
                      strokeWidth={2.5}
                      fill="url(#gradWholesale)"
                      dot={{ r: 3, fill: tokens.blue500 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Low Stock Alerts */}
        <Grid item xs={12} lg={4}>
          <Card
            sx={{
              borderRadius: '20px',
              border: `1px solid ${tokens.border}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <CardHeader
              title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningAmberRoundedIcon sx={{ color: tokens.amber500, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: tokens.textPrimary }}>
                    Stock Alerts
                  </Typography>
                </Box>
              }
              subheader={
                <Typography sx={{ fontSize: '0.78rem', color: tokens.textSecondary }}>
                  {isLoading ? '—' : `${data?.lowStockAlerts?.length || 0} products need attention`}
                </Typography>
              }
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ pt: 1, flex: 1, overflow: 'auto' }}>
              {isLoading ? (
                [0, 1, 2, 3].map(i => (
                  <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: '8px', mb: 1 }} />
                ))
              ) : !data?.lowStockAlerts?.length ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ fontSize: '1.5rem', mb: 1 }}>✅</Typography>
                  <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
                    All products well-stocked
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding>
                  {data.lowStockAlerts.map((item, i) => (
                    <Box key={item.productId}>
                      <ListItem disablePadding sx={{ py: 0.75 }}>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: '0.825rem', fontWeight: 600, color: tokens.textPrimary }}>
                              {item.name}
                            </Typography>
                            <StatusBadge status={item.stockStatus} />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, (item.currentStock / (item.threshold || 1)) * 100)}
                              sx={{
                                flex: 1,
                                height: 5,
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: item.stockStatus === 'out_of_stock'
                                    ? tokens.red500 : tokens.amber500,
                                },
                              }}
                            />
                            <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary, whiteSpace: 'nowrap' }}>
                              {item.currentStock} / {item.threshold} {item.unit}
                            </Typography>
                          </Box>
                        </Box>
                      </ListItem>
                      {i < data.lowStockAlerts.length - 1 && (
                        <Divider sx={{ borderColor: tokens.border }} />
                      )}
                    </Box>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Row 3: Recent transactions + Overdue credits ──────────────────── */}
      <Grid container spacing={2.5}>
        {/* Recent Transactions */}
        <Grid item xs={12} lg={7}>
          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
            <CardHeader
              title={<Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>Recent Transactions</Typography>}
              subheader={<Typography sx={{ fontSize: '0.78rem', color: tokens.textSecondary }}>Last 10 retail sales</Typography>}
            />
            <CardContent sx={{ pt: 0 }}>
              {isLoading ? (
                [0, 1, 2, 3, 4].map(i => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)
              ) : !data?.recentTransactions?.length ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ fontSize: '1.5rem', mb: 1 }}>🧾</Typography>
                  <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
                    No sales recorded yet
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Invoice</TableCell>
                        <TableCell>Customer</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.recentTransactions.map(tx => (
                        <TableRow key={tx.id} hover>
                          <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {tx.invoiceNumber || `#${tx.id}`}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>{tx.customerName}</TableCell>
                          <TableCell>
                            <StatusBadge status={tx.paymentMethod} />
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 700, color: tokens.emerald600 }}>
                            {fmt(tx.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Overdue / Due-soon Credits */}
        <Grid item xs={12} lg={5}>
          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
            <CardHeader
              title={<Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>Credit Alerts</Typography>}
              subheader={<Typography sx={{ fontSize: '0.78rem', color: tokens.textSecondary }}>Overdue & due-soon accounts</Typography>}
            />
            <CardContent sx={{ pt: 0 }}>
              {isLoading ? (
                [0, 1, 2, 3].map(i => <Skeleton key={i} height={48} sx={{ mb: 1 }} />)
              ) : !data?.overdueCredits?.length ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ fontSize: '1.5rem', mb: 1 }}>💚</Typography>
                  <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
                    No overdue accounts
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding>
                  {data.overdueCredits.map((c, i) => (
                    <Box key={c.id}>
                      <ListItem
                        disablePadding
                        secondaryAction={
                          c.customerPhone ? (
                            <Tooltip title="WhatsApp reminder">
                              <IconButton
                                size="small"
                                href={`https://wa.me/${c.customerPhone}?text=${encodeURIComponent(
                                  `Dear ${c.customerName}, you have a pending balance of ${fmt(c.balance)}. Please clear it at the earliest. — AM & KHK Vegetable Merchants`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <WhatsAppIcon sx={{ color: '#25D366', fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          ) : null
                        }
                        sx={{ py: 1 }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                {c.customerName}
                              </Typography>
                              <StatusBadge status={c.status} />
                            </Box>
                          }
                          secondary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: tokens.red500 }}>
                                {fmt(c.balance)}
                              </Typography>
                              {c.dueDate && (
                                <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
                                  Due: {new Date(c.dueDate).toLocaleDateString('en-IN')}
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                      {i < data.overdueCredits.length - 1 && (
                        <Divider sx={{ borderColor: tokens.border }} />
                      )}
                    </Box>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
