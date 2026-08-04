import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  Grid, IconButton, InputLabel, MenuItem, Select, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography, Tooltip, alpha, Tab, Tabs, Paper, Snackbar, Chip
} from '@mui/material'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CloudDownloadRoundedIcon from '@mui/icons-material/CloudDownloadRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import { settingsApi } from '../../api/settingsApi'
import { tokens } from '../../theme/theme'
import { useAuth } from '../../contexts/AuthContext'

export default function SettingsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  // Tabs
  const [activeTab, setActiveTab] = useState(0)

  // ── State ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' })
  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity })

  // Shop Profile state
  const [shopName, setShopName] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [gstin, setGstin] = useState('')
  const [creditDays, setCreditDays] = useState('30')
  const [invoicePrefix, setInvoicePrefix] = useState('INV')

  // Printer settings state
  const [printerType, setPrinterType] = useState('usb')
  const [usbVendorId, setUsbVendorId] = useState('')
  const [usbProductId, setUsbProductId] = useState('')
  const [serialPort, setSerialPort] = useState('')
  const [serialBaud, setSerialBaud] = useState('9600')
  const [printerIp, setPrinterIp] = useState('')
  const [printerPort, setPrinterPort] = useState('9100')

  // UPI accounts state
  const [upiAccounts, setUpiAccounts] = useState([])
  const [newUpiName, setNewUpiName] = useState('')
  const [newUpiId, setNewUpiId] = useState('')

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState([])
  const [newBankName, setNewBankName] = useState('')
  const [newBankAccountNum, setNewBankAccountNum] = useState('')

  // User CRUD state
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null) // null = create
  const [usrUsername, setUsrUsername] = useState('')
  const [usrPhone, setUsrPhone] = useState('')
  const [usrRole, setUsrRole] = useState('cashier')
  const [usrPassword, setUsrPassword] = useState('')
  const [usrStatus, setUsrStatus] = useState('active')
  const [usrError, setUsrError] = useState('')

  // Role gating
  const isOwner = user && user.role === 'owner'

  // ── Queries ──────────────────────────────────────────────────────────────
  // 1. Shop Settings query
  const settingsQuery = useQuery({
    queryKey: ['shop-settings'],
    queryFn: settingsApi.getSettings,
  })

  useEffect(() => {
    if (settingsQuery.data?.data) {
      const data = settingsQuery.data.data
      setShopName(data.shop_name || '')
      setShopPhone(data.shop_phone || '')
      setShopAddress(data.shop_address || '')
      setGstin(data.gstin || '')
      setCreditDays(data.credit_days || '30')
      setInvoicePrefix(data.invoice_prefix || 'INV')
      setPrinterType(data.printer_type || 'usb')
      setUsbVendorId(data.printer_usb_vendor_id || '')
      setUsbProductId(data.printer_usb_product_id || '')
      setSerialPort(data.printer_serial_port || '')
      setSerialBaud(data.printer_serial_baud || '9600')
      setPrinterIp(data.printer_ip || '')
      setPrinterPort(data.printer_port || '9100')
      try {
        const parsed = JSON.parse(data.upi_accounts || '[]')
        setUpiAccounts(parsed)
      } catch (e) {
        setUpiAccounts([])
      }
      try {
        const parsedBank = JSON.parse(data.bank_accounts || '[]')
        setBankAccounts(parsedBank)
      } catch (e) {
        setBankAccounts([])
      }
    }
  }, [settingsQuery.data])

  // 2. Users query (only run if owner)
  const usersQuery = useQuery({
    queryKey: ['system-users'],
    queryFn: settingsApi.listUsers,
    enabled: isOwner && activeTab === 3,
  })
  const users = usersQuery.data?.data || []

  // ── Mutations ────────────────────────────────────────────────────────────
  const saveSettingsMutation = useMutation({
    mutationFn: settingsApi.saveSettings,
    onSuccess: () => {
      qc.invalidateQueries(['shop-settings'])
      showToast('Settings saved successfully')
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to save settings', 'error')
    }
  })

  const createUserMutation = useMutation({
    mutationFn: settingsApi.createUser,
    onSuccess: () => {
      qc.invalidateQueries(['system-users'])
      handleCloseUserDialog()
      showToast('User created successfully')
    },
    onError: (err) => {
      setUsrError(err?.response?.data?.error || 'Failed to create user')
    }
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => settingsApi.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['system-users'])
      handleCloseUserDialog()
      showToast('User updated successfully')
    },
    onError: (err) => {
      setUsrError(err?.response?.data?.error || 'Failed to update user')
    }
  })

  const restoreMutation = useMutation({
    mutationFn: settingsApi.restoreDatabase,
    onSuccess: () => {
      showToast('Database restored successfully! Reloading page...', 'success')
      setTimeout(() => window.location.reload(), 1500)
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to restore database', 'error')
    }
  })

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSaveProfile = (e) => {
    e.preventDefault()
    saveSettingsMutation.mutate({
      shop_name: shopName,
      shop_phone: shopPhone,
      shop_address: shopAddress,
      gstin: gstin,
      credit_days: creditDays,
      invoice_prefix: invoicePrefix,
    })
  }

  const handleSavePrinter = (e) => {
    e.preventDefault()
    saveSettingsMutation.mutate({
      printer_type: printerType,
      printer_usb_vendor_id: usbVendorId,
      printer_usb_product_id: usbProductId,
      printer_serial_port: serialPort,
      printer_serial_baud: serialBaud,
      printer_ip: printerIp,
      printer_port: printerPort,
    })
  }

  const handleSaveUpiAccounts = (e) => {
    if (e) e.preventDefault()
    saveSettingsMutation.mutate({
      upi_accounts: JSON.stringify(upiAccounts)
    })
  }

  const handleAddUpiAccount = () => {
    if (!newUpiName.trim() || !newUpiId.trim()) {
      showToast('Please enter both Account Name and UPI ID/Details', 'warning')
      return
    }
    if (upiAccounts.some(a => a.name.toLowerCase() === newUpiName.trim().toLowerCase())) {
      showToast('Account name already exists', 'warning')
      return
    }
    const updated = [...upiAccounts, { name: newUpiName.trim(), upi: newUpiId.trim() }]
    setUpiAccounts(updated)
    setNewUpiName('')
    setNewUpiId('')
    saveSettingsMutation.mutate({
      upi_accounts: JSON.stringify(updated)
    })
  }

  const handleDeleteUpiAccount = (index) => {
    const updated = upiAccounts.filter((_, i) => i !== index)
    setUpiAccounts(updated)
    saveSettingsMutation.mutate({
      upi_accounts: JSON.stringify(updated)
    })
  }

  const handleSaveBankAccounts = (e) => {
    if (e) e.preventDefault()
    saveSettingsMutation.mutate({
      bank_accounts: JSON.stringify(bankAccounts)
    })
  }

  const handleAddBankAccount = () => {
    if (!newBankName.trim() || !newBankAccountNum.trim()) {
      showToast('Please enter both Bank Name and Account Details', 'warning')
      return
    }
    if (bankAccounts.some(a => a.name.toLowerCase() === newBankName.trim().toLowerCase())) {
      showToast('Bank account name already exists', 'warning')
      return
    }
    const updated = [...bankAccounts, { name: newBankName.trim(), account: newBankAccountNum.trim() }]
    setBankAccounts(updated)
    setNewBankName('')
    setNewBankAccountNum('')
    saveSettingsMutation.mutate({
      bank_accounts: JSON.stringify(updated)
    })
  }

  const handleDeleteBankAccount = (index) => {
    const updated = bankAccounts.filter((_, i) => i !== index)
    setBankAccounts(updated)
    saveSettingsMutation.mutate({
      bank_accounts: JSON.stringify(updated)
    })
  }

  const handleOpenAddUser = () => {
    setEditingUser(null)
    setUsrUsername('')
    setUsrPhone('')
    setUsrRole('cashier')
    setUsrPassword('')
    setUsrStatus('active')
    setUsrError('')
    setUserDialogOpen(true)
  }

  const handleOpenEditUser = (usr) => {
    setEditingUser(usr)
    setUsrUsername(usr.name)
    setUsrPhone(usr.phone || '')
    setUsrRole(usr.role)
    setUsrPassword('')
    setUsrStatus(usr.status)
    setUsrError('')
    setUserDialogOpen(true)
  }

  const handleCloseUserDialog = () => {
    setUserDialogOpen(false)
  }

  const handleSubmitUser = (e) => {
    e.preventDefault()
    if (!usrUsername.trim()) {
      setUsrError('Username is required')
      return
    }

    const payload = {
      name: usrUsername.trim(),
      phone: usrPhone.trim() || null,
      role: usrRole,
      status: usrStatus,
      password: usrPassword || undefined
    }

    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data: payload })
    } else {
      if (!usrPassword) {
        setUsrError('Password is required for new users')
        return
      }
      createUserMutation.mutate(payload)
    }
  }

  const handleToggleUserStatus = (usr) => {
    const nextStatus = usr.status === 'active' ? 'inactive' : 'active'
    updateUserMutation.mutate({
      id: usr.id,
      data: { name: usr.name, status: nextStatus }
    })
  }

  const handleBackupDownload = () => {
    settingsApi.downloadBackup().catch(() => showToast('Backup download failed', 'error'))
  }

  const handleRestoreUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (window.confirm("WARNING: Restoring database will overwrite all current sales, products, and user data. Are you sure you want to proceed?")) {
      restoreMutation.mutate(file)
    }
  }

  // Pre-load form fields if they resolved from query on mounting
  if (settingsQuery.isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <SettingsRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Settings</Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Shop Profile" id="tab-profile" />
          <Tab label="Thermal Printer" id="tab-printer" />
          <Tab label="UPI Accounts" id="tab-upi" />
          <Tab label="Bank Accounts" id="tab-banks" />
          {isOwner && <Tab label="User Management" id="tab-users" />}
          {isOwner && <Tab label="Database Backup & Restore" id="tab-db" />}
        </Tabs>
      </Box>

      {/* ── TAB 0: Shop Profile Settings ────────────────────────────────────── */}
      {activeTab === 0 && (
        <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, maxWidth: 600 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Shop Profile</Typography>
            <form onSubmit={handleSaveProfile}>
              <Stack spacing={2.5}>
                <TextField id="set-shop-name" label="Shop Name" value={shopName} onChange={e => setShopName(e.target.value)} required size="small" fullWidth disabled={!isOwner} />
                <TextField id="set-shop-phone" label="Shop Phone" value={shopPhone} onChange={e => setShopPhone(e.target.value)} size="small" fullWidth disabled={!isOwner} />
                <TextField id="set-shop-address" label="Branch Address" value={shopAddress} onChange={e => setShopAddress(e.target.value)} size="small" multiline rows={2} fullWidth disabled={!isOwner} />
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField id="set-gstin" label="GSTIN" value={gstin} onChange={e => setGstin(e.target.value)} size="small" fullWidth disabled={!isOwner} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField id="set-credit-days" label="Default Credit Period (Days)" type="number" value={creditDays} onChange={e => setCreditDays(e.target.value)} size="small" fullWidth disabled={!isOwner} />
                  </Grid>
                </Grid>
                <TextField id="set-invoice-prefix" label="Invoice Prefix (Retail)" value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)} size="small" fullWidth disabled={!isOwner} />
                
                {isOwner && (
                  <Button id="btn-save-profile" type="submit" variant="contained" startIcon={<SaveRoundedIcon />} disabled={saveSettingsMutation.isPending} sx={{ alignSelf: 'flex-start', borderRadius: '10px' }}>
                    Save Profile Config
                  </Button>
                )}
              </Stack>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 1: Thermal Printer Config ───────────────────────────────────── */}
      {activeTab === 1 && (
        <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, maxWidth: 600 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>ESC/POS Thermal Printer</Typography>
            <Typography variant="caption" sx={{ color: tokens.textSecondary, mb: 3, display: 'block' }}>Configure connectivity for billing receipt prints.</Typography>
            
            <form onSubmit={handleSavePrinter}>
              <Stack spacing={2.5}>
                <FormControl size="small" fullWidth disabled={!isOwner}>
                  <InputLabel>Connection Interface</InputLabel>
                  <Select id="set-printer-type" label="Connection Interface" value={printerType} onChange={e => setPrinterType(e.target.value)}>
                    <MenuItem value="usb">USB Port</MenuItem>
                    <MenuItem value="serial">Serial Port (COM)</MenuItem>
                    <MenuItem value="network">Network IP Ethernet</MenuItem>
                  </Select>
                </FormControl>

                {printerType === 'usb' && (
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField id="set-usb-vendor" label="Vendor ID (Hex)" placeholder="e.g. 0x04b8" value={usbVendorId} onChange={e => setUsbVendorId(e.target.value)} required size="small" fullWidth disabled={!isOwner} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField id="set-usb-product" label="Product ID (Hex)" placeholder="e.g. 0x0202" value={usbProductId} onChange={e => setUsbProductId(e.target.value)} required size="small" fullWidth disabled={!isOwner} />
                    </Grid>
                  </Grid>
                )}

                {printerType === 'serial' && (
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField id="set-serial-port" label="COM Port Name" placeholder="e.g. COM3" value={serialPort} onChange={e => setSerialPort(e.target.value)} required size="small" fullWidth disabled={!isOwner} />
                    </Grid>
                    <Grid item xs={6}>
                      <FormControl size="small" fullWidth disabled={!isOwner}>
                        <InputLabel>Baud Rate</InputLabel>
                        <Select id="set-serial-baud" label="Baud Rate" value={serialBaud} onChange={e => setSerialBaud(e.target.value)}>
                          <MenuItem value="9600">9600</MenuItem>
                          <MenuItem value="19200">19200</MenuItem>
                          <MenuItem value="38400">38400</MenuItem>
                          <MenuItem value="115200">115200</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                )}

                {printerType === 'network' && (
                  <Grid container spacing={2}>
                    <Grid item xs={8}>
                      <TextField id="set-ip-address" label="IP Address" placeholder="e.g. 192.168.1.100" value={printerIp} onChange={e => setPrinterIp(e.target.value)} required size="small" fullWidth disabled={!isOwner} />
                    </Grid>
                    <Grid item xs={4}>
                      <TextField id="set-ip-port" label="Port" value={printerPort} onChange={e => setPrinterPort(e.target.value)} required size="small" fullWidth disabled={!isOwner} />
                    </Grid>
                  </Grid>
                )}

                {isOwner && (
                  <Button id="btn-save-printer" type="submit" variant="contained" startIcon={<SaveRoundedIcon />} disabled={saveSettingsMutation.isPending} sx={{ alignSelf: 'flex-start', borderRadius: '10px' }}>
                    Save Printer Config
                  </Button>
                )}
              </Stack>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 2: UPI Accounts Config ──────────────────────────────────────── */}
      {activeTab === 2 && (
        <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, maxWidth: 650 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>UPI Accounts & IDs</Typography>
            <Typography variant="caption" sx={{ color: tokens.textSecondary, mb: 3, display: 'block' }}>
              Configure different UPI payment options (e.g. GPay Business, PhonePe Shop) to track received money.
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px', mb: 3, overflow: 'hidden' }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Account Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>UPI ID / Basic Details</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {upiAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3, color: tokens.textSecondary }}>
                        No UPI accounts configured. Add one below!
                      </TableCell>
                    </TableRow>
                  ) : (
                    upiAccounts.map((ac, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{ac.name}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{ac.upi}</TableCell>
                        <TableCell align="right">
                          <Button size="small" color="error" onClick={() => handleDeleteUpiAccount(idx)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {isOwner && (
              <Stack spacing={2}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Add New UPI Account</Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <TextField
                    id="upi-new-name"
                    label="Account/App Name"
                    placeholder="e.g. GPay Shop"
                    size="small"
                    value={newUpiName}
                    onChange={e => setNewUpiName(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    id="upi-new-id"
                    label="UPI ID / Details"
                    placeholder="e.g. merchants@okaxis"
                    size="small"
                    value={newUpiId}
                    onChange={e => setNewUpiId(e.target.value)}
                    fullWidth
                  />
                  <Button
                    id="btn-add-upi"
                    variant="contained"
                    onClick={handleAddUpiAccount}
                    disabled={!newUpiName || !newUpiId}
                    sx={{ borderRadius: '10px' }}
                  >
                    Add
                  </Button>
                </Stack>
                <Divider sx={{ my: 2 }} />
                <Button
                  id="btn-save-upi"
                  variant="contained"
                  startIcon={<SaveRoundedIcon />}
                  disabled={saveSettingsMutation.isPending}
                  onClick={handleSaveUpiAccounts}
                  sx={{ alignSelf: 'flex-start', borderRadius: '10px' }}
                >
                  Save UPI Config
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB 3: Bank Accounts Config ────────────────────────────────────── */}
      {activeTab === 3 && (
        <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, maxWidth: 650 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Bank Accounts</Typography>
            <Typography variant="caption" sx={{ color: tokens.textSecondary, mb: 3, display: 'block' }}>
              Configure different Bank accounts (e.g. Federal Bank, SBI Shop) for direct bank transfers.
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px', mb: 3, overflow: 'hidden' }}>
              <Table size="small">
                <TableHead sx={{ backgroundColor: tokens.surfaceAlt }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Bank / Account Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Account Details</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bankAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3, color: tokens.textSecondary }}>
                        No Bank accounts configured. Add one below!
                      </TableCell>
                    </TableRow>
                  ) : (
                    bankAccounts.map((ac, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{ac.name}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{ac.account}</TableCell>
                        <TableCell align="right">
                          <Button size="small" color="error" onClick={() => handleDeleteBankAccount(idx)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {isOwner && (
              <Stack spacing={2}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>Add New Bank Account</Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <TextField
                    id="bank-new-name"
                    label="Bank Name"
                    placeholder="e.g. Federal Bank"
                    size="small"
                    value={newBankName}
                    onChange={e => setNewBankName(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    id="bank-new-details"
                    label="Account Number / Details"
                    placeholder="e.g. A/C 1234567890"
                    size="small"
                    value={newBankAccountNum}
                    onChange={e => setNewBankAccountNum(e.target.value)}
                    fullWidth
                  />
                  <Button id="btn-add-bank" variant="outlined" startIcon={<AddRoundedIcon />} onClick={handleAddBankAccount} sx={{ borderRadius: '10px', height: 40, px: 3 }}>
                    Add
                  </Button>
                </Stack>
                <Divider sx={{ my: 2 }} />
                <Button id="btn-save-banks" variant="contained" startIcon={<SaveRoundedIcon />} disabled={saveSettingsMutation.isPending} onClick={handleSaveBankAccounts} sx={{ alignSelf: 'flex-start', borderRadius: '10px' }}>
                  Save Bank Config
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB 4: User Management (Owner only) ────────────────────────────── */}
      {activeTab === 4 && isOwner && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Button id="btn-add-user" variant="contained" startIcon={<AddRoundedIcon />} onClick={handleOpenAddUser} sx={{ borderRadius: '12px' }}>
              Add User
            </Button>
          </Box>

          <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
            {usersQuery.isError ? (
              <Box sx={{ p: 4 }}><Alert severity="error">Failed to load user directory</Alert></Box>
            ) : usersQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Username</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Phone</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map(usr => (
                      <TableRow key={usr.id} hover sx={{ opacity: usr.status === 'active' ? 1 : 0.6 }}>
                        <TableCell sx={{ fontWeight: 600 }}>{usr.name}</TableCell>
                        <TableCell>
                          <Chip label={(usr.role || '').toUpperCase()} size="small" sx={{ fontWeight: 700, fontSize: '0.65rem', backgroundColor: alpha(tokens.emerald500, 0.1), color: tokens.emerald700 }} />
                        </TableCell>
                        <TableCell>{usr.phone || '—'}</TableCell>
                        <TableCell>
                          <Chip label={usr.status === 'active' ? 'Active' : 'Inactive'} size="small" color={usr.status === 'active' ? 'success' : 'default'} />
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Edit / Reset Password">
                              <IconButton id={`btn-edit-usr-${usr.id}`} size="small" onClick={() => handleOpenEditUser(usr)} sx={{ color: tokens.amber500 }}>
                                    <EditRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {usr.id !== user?.id && (
                              <Tooltip title={usr.status === 'active' ? "Deactivate" : "Activate"}>
                                <IconButton id={`btn-toggle-usr-${usr.id}`} size="small" onClick={() => handleToggleUserStatus(usr)} sx={{ color: usr.status === 'active' ? tokens.red500 : tokens.emerald600 }}>
                                  {usr.status === 'active' ? <BlockRoundedIcon fontSize="small" /> : <CheckCircleRoundedIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </Box>
      )}

      {/* ── TAB 5: Database Tools (Owner only) ─────────────────────────────── */}
      {activeTab === 5 && isOwner && (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, height: '100%' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Backup Database</Typography>
                <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 3 }}>
                  Download a full backup of your SQLite database file (`amkhk.db`). Keep this file safe as a disaster recovery point.
                </Typography>
                <Button id="btn-db-backup" variant="outlined" startIcon={<CloudDownloadRoundedIcon />} onClick={handleBackupDownload} sx={{ alignSelf: 'flex-start', mt: 'auto', borderRadius: '10px' }}>
                  Download Backup File
                </Button>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}`, height: '100%' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: tokens.red500 }}>Restore Database</Typography>
                <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 3 }}>
                  Restore the system state by uploading a previously downloaded `.db` database backup.
                </Typography>
                
                <Box sx={{ alignSelf: 'flex-start', mt: 'auto' }}>
                  <input accept=".db" style={{ display: 'none' }} id="btn-db-restore-upload" type="file" onChange={handleRestoreUpload} disabled={restoreMutation.isPending} />
                  <label htmlFor="btn-db-restore-upload">
                    <Button id="btn-db-restore" component="span" variant="contained" color="error" startIcon={<CloudUploadRoundedIcon />} disabled={restoreMutation.isPending} sx={{ borderRadius: '10px' }}>
                      {restoreMutation.isPending ? 'Restoring...' : 'Upload & Restore'}
                    </Button>
                  </label>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* User CRUD Dialog */}
      <Dialog open={userDialogOpen} onClose={handleCloseUserDialog} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={handleSubmitUser}>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {editingUser ? 'Edit System User' : 'Add New User'}
          </DialogTitle>
          <Divider />
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              {usrError && <Alert severity="error">{usrError}</Alert>}

              <TextField id="usr-form-username" label="Username (Login Name)" value={usrUsername} onChange={e => setUsrUsername(e.target.value)} required size="small" fullWidth disabled={!!editingUser} />
              
              <TextField id="usr-form-phone" label="Phone" value={usrPhone} onChange={e => setUsrPhone(e.target.value)} size="small" fullWidth />

              <FormControl fullWidth size="small">
                <InputLabel>System Role</InputLabel>
                <Select id="usr-form-role" label="System Role" value={usrRole} onChange={e => setUsrRole(e.target.value)} disabled={editingUser && editingUser.id === user?.id}>
                  <MenuItem value="owner">Owner</MenuItem>
                  <MenuItem value="manager">Manager</MenuItem>
                  <MenuItem value="accountant">Accountant</MenuItem>
                  <MenuItem value="cashier">Cashier</MenuItem>
                </Select>
              </FormControl>

              <TextField id="usr-form-password" label={editingUser ? "Reset Password (leave blank to keep current)" : "Password"} type="password" value={usrPassword} onChange={e => setUsrPassword(e.target.value)} required={!editingUser} size="small" fullWidth />

              {editingUser && editingUser.id !== user?.id && (
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select id="usr-form-status" label="Status" value={usrStatus} onChange={e => setUsrStatus(e.target.value)}>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleCloseUserDialog} variant="outlined">Cancel</Button>
            <Button id="btn-usr-submit" type="submit" variant="contained" disabled={createUserMutation.isPending || updateUserMutation.isPending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Toast Notification */}
      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} sx={{ borderRadius: '12px' }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  )
}
