import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, CardHeader,
  Chip, CircularProgress, Divider, FormControl, Grid, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Snackbar, TextField, Typography,
  alpha, List, ListItemButton, ListItemText, ListItemIcon,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack, IconButton,
  Badge, Switch, FormControlLabel,
} from '@mui/material'
import PointOfSaleRoundedIcon from '@mui/icons-material/PointOfSaleRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import { inventoryApi } from '../../api/inventoryApi'
import { billingApi } from '../../api/billingApi'
import { tokens } from '../../theme/theme'
import { settingsApi } from '../../api/settingsApi'
import CartItem from './CartItem'
import InvoiceDialog from './InvoiceDialog'
import { useSearchParams } from 'react-router-dom'
import StatusBadge from '../../components/common/StatusBadge'

const fmt = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit (Due Later)' },
]

export default function BillingPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const redirectCustomerId = searchParams.get('customerId')

  // ── State ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pos_cart') || '[]')
      return saved.map(item => ({
        ...item,
        cartId: item.cartId || Math.random().toString(36).substring(2, 9)
      }))
    } catch (e) {
      return []
    }
  })
  const [customer, setCustomer] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pos_customer') || 'null')
    } catch (e) {
      return null
    }
  })
  const [paymentMethod, setPaymentMethod] = useState(() => localStorage.getItem('pos_payment_method') || 'cash')
  const [discount, setDiscount] = useState(() => localStorage.getItem('pos_discount') || '')
  const [creditDays, setCreditDays] = useState(() => localStorage.getItem('pos_credit_days') || '')
  const [notes, setNotes] = useState(() => localStorage.getItem('pos_notes') || '')
  const [invoiceDialogSale, setInvoiceDialogSale] = useState(null)
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' })
  const [selectedUpiAccount, setSelectedUpiAccount] = useState(() => localStorage.getItem('pos_selected_upi') || '')
  const [cashPaid, setCashPaid] = useState(() => localStorage.getItem('pos_cash_paid') || '')
  const [splitMode, setSplitMode] = useState(() => {
    try {
      const v = localStorage.getItem('pos_split_mode')
      return v ? JSON.parse(v) : false
    } catch { return false }
  })
  const [upiPaid, setUpiPaid] = useState(() => localStorage.getItem('pos_upi_paid') || '')
  const [bankPaid, setBankPaid] = useState(() => localStorage.getItem('pos_bank_paid') || '')
  const [selectedBank, setSelectedBank] = useState(() => localStorage.getItem('pos_selected_bank') || '')
  const [invoiceToPay, setInvoiceToPay] = useState(() => localStorage.getItem('pos_invoice_to_pay') || '')
  const [customDate, setCustomDate] = useState(() => localStorage.getItem('pos_custom_date') || '')

  // Held Bills and Recall states
  const [heldBills, setHeldBills] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pos_held_bills') || '[]')
    } catch (e) {
      return []
    }
  })
  const [recallOpen, setRecallOpen] = useState(false)
  const searchRef = useRef(null)

  const settingsQuery = useQuery({
    queryKey: ['shop-settings'],
    queryFn: settingsApi.getSettings,
  })

  const upiAccounts = useMemo(() => {
    try {
      return JSON.parse(settingsQuery.data?.data?.upi_accounts || '[]')
    } catch (e) {
      return []
    }
  }, [settingsQuery.data])

  const bankAccounts = useMemo(() => {
    try {
      return JSON.parse(settingsQuery.data?.data?.bank_accounts || '[]')
    } catch (e) {
      return []
    }
  }, [settingsQuery.data])

  // Return Billing State
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [returnProduct, setReturnProduct] = useState(null)
  const [returnQty, setReturnQty] = useState('')
  const [returnCustomer, setReturnCustomer] = useState(null)
  const [returnRefundMethod, setReturnRefundMethod] = useState('cash')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnSearch, setReturnSearch] = useState('')
  const [returnInvoiceNumber, setReturnInvoiceNumber] = useState('')

  // Quick Add State
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickCategory, setQuickCategory] = useState('')
  const [quickUnit, setQuickUnit] = useState('kg')
  const [quickSellingPrice, setQuickSellingPrice] = useState('')
  const [quickPurchasePrice, setQuickPurchasePrice] = useState('')
  const [quickInitialStock, setQuickInitialStock] = useState('0')

  // Ad-hoc Customer Details state
  const [adHocName, setAdHocName] = useState(() => localStorage.getItem('pos_adhoc_name') || '')
  const [adHocPhone, setAdHocPhone] = useState(() => localStorage.getItem('pos_adhoc_phone') || '')

  // Search Results Highlight state
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity })

  // Global keydown listener to focus search box when user starts typing
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault()
        document.getElementById('checkout-customer')?.focus()
        return
      }
      if (e.key === 'F4') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }

      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key.length > 1) return // Ignore special keys like Enter, Arrows, Shift, etc.

      const active = document.activeElement
      const isInput = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.getAttribute('contenteditable') === 'true'
      )
      if (isInput) return

      if (searchRef.current) {
        searchRef.current.focus()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Sync POS States to localStorage for Session Protection
  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(cart))
  }, [cart])
  useEffect(() => {
    localStorage.setItem('pos_customer', JSON.stringify(customer))
  }, [customer])
  useEffect(() => {
    localStorage.setItem('pos_payment_method', paymentMethod)
  }, [paymentMethod])
  useEffect(() => {
    localStorage.setItem('pos_discount', discount)
  }, [discount])
  useEffect(() => {
    localStorage.setItem('pos_credit_days', creditDays)
  }, [creditDays])
  useEffect(() => {
    localStorage.setItem('pos_notes', notes)
  }, [notes])
  useEffect(() => {
    localStorage.setItem('pos_selected_upi', selectedUpiAccount)
  }, [selectedUpiAccount])
  useEffect(() => {
    localStorage.setItem('pos_selected_bank', selectedBank)
  }, [selectedBank])
  useEffect(() => {
    localStorage.setItem('pos_cash_paid', cashPaid)
  }, [cashPaid])
  useEffect(() => {
    localStorage.setItem('pos_split_mode', JSON.stringify(splitMode))
  }, [splitMode])
  useEffect(() => {
    localStorage.setItem('pos_upi_paid', upiPaid)
  }, [upiPaid])
  useEffect(() => {
    localStorage.setItem('pos_bank_paid', bankPaid)
  }, [bankPaid])
  useEffect(() => {
    localStorage.setItem('pos_invoice_to_pay', invoiceToPay)
  }, [invoiceToPay])
  useEffect(() => {
    localStorage.setItem('pos_custom_date', customDate)
  }, [customDate])
  useEffect(() => {
    localStorage.setItem('pos_adhoc_name', adHocName)
  }, [adHocName])
  useEffect(() => {
    localStorage.setItem('pos_adhoc_phone', adHocPhone)
  }, [adHocPhone])
  useEffect(() => {
    localStorage.setItem('pos_held_bills', JSON.stringify(heldBills))
  }, [heldBills])

  const handleHoldBill = () => {
    if (!cart.length) {
      showToast('Cannot hold an empty cart', 'warning')
      return
    }
    const description = customer 
      ? `Customer: ${customer.name}` 
      : (adHocName ? `Draft: ${adHocName}` : `Walk-in Draft (${cart.length} items)`)
      
    const newHeld = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-IN'),
      description,
      cart,
      customer,
      paymentMethod,
      discount,
      creditDays,
      notes,
      adHocName,
      adHocPhone,
      selectedUpiAccount,
      selectedBank,
      cashPaid,
      invoiceToPay,
      customDate,
    }
    
    setHeldBills(prev => [...prev, newHeld])
    clearCart()
    showToast('Bill successfully put on hold', 'success')
  }

  // ── Queries ──────────────────────────────────────────────────────────────
  const productsQuery = useQuery({
    queryKey: ['inventory-pos', search],
    queryFn: () => inventoryApi.getProducts({ search: search || undefined, perPage: 20 }),
    enabled: search.length >= 1,
    staleTime: 15_000,
  })

  const returnProductsQuery = useQuery({
    queryKey: ['inventory-return', returnSearch],
    queryFn: () => inventoryApi.getProducts({ search: returnSearch || undefined, perPage: 20 }),
    enabled: returnDialogOpen,
    staleTime: 15_000,
  })

  const returnMutation = useMutation({
    mutationFn: (data) => import('../../api/authApi').then(m =>
      m.default.post('/api/billing/return', data).then(r => r.data)
    ),
    onSuccess: (res) => {
      showToast(`Return processed successfully! Refund: ₹${(res.refundAmount / 100).toFixed(2)}`, 'success')
      setReturnDialogOpen(false)
      setReturnProduct(null)
      setReturnQty('')
      setReturnCustomer(null)
      setReturnRefundMethod('cash')
      setReturnNotes('')
      setReturnSearch('')
      setReturnInvoiceNumber('')
      qc.invalidateQueries(['inventory-pos'])
      qc.invalidateQueries(['customers-list'])
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to process return', 'error')
    }
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories-list'],
    queryFn: inventoryApi.getCategories,
    staleTime: 300_000,
  })

  const customersQuery = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => import('../../api/authApi').then(m =>
      m.default.get('/api/customers/', { params: { perPage: 5000 } }).then(r => r.data.data || [])
    ),
  })

  const customers = customersQuery.data || []
  const products = productsQuery.data?.data || []
  const returnProducts = returnProductsQuery.data?.data || []
  const categories = categoriesQuery.data?.data || []

  useEffect(() => {
    if (redirectCustomerId && customers.length > 0) {
      const found = customers.find(c => c.id === parseInt(redirectCustomerId))
      if (found) {
        setCustomer(found)
      }
    }
  }, [redirectCustomerId, customers])

  // ── Cart operations ──────────────────────────────────────────────────────
  const addToCart = useCallback((product) => {
    const uniqueCartId = Math.random().toString(36).substring(2, 9)

    setCart(prev => {
      let nextCart = [...prev]
      nextCart.push({
        cartId: uniqueCartId,
        productId: product.id,
        name: product.name,
        unit: product.unit,
        qty: 1,
        unitPrice: product.sellingPrice,  // paise
        stockStatus: product.stockStatus,
        availableStock: product.currentStock,
        addonProductId: product.addonProductId,
        addonQuantity: product.addonQuantity,
        boxes: 0,
        boxWeight: 0.0,
      })

      // Add associated addon if present
      if (product.addonProductId) {
        const addonUniqueCartId = Math.random().toString(36).substring(2, 9)
        const addonQty = product.addonQuantity || 1.0
        nextCart.push({
          cartId: addonUniqueCartId,
          productId: product.addonProductId,
          name: product.addonProductName || 'Addon Item',
          unit: 'piece',
          qty: addonQty,
          unitPrice: product.addonProductSellingPrice || 0, // paise
          stockStatus: 'in_stock',
          availableStock: 9999,
          boxes: 0,
          boxWeight: 0.0,
        })
      }

      return nextCart
    })

    // Focus the qty input of the added product after React updates the DOM
    setTimeout(() => {
      const el = document.getElementById(`cart-qty-${uniqueCartId}`)
      if (el) {
        el.focus()
        el.select()
      }
    }, 80)

    setSearch('')
    setHighlightedIndex(-1)
  }, [])

  const handleSearchKeyDown = useCallback((e) => {
    if (!products.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev + 1) % products.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => (prev - 1 + products.length) % products.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = highlightedIndex >= 0 ? highlightedIndex : 0
      if (products[idx]) {
        addToCart(products[idx])
        setHighlightedIndex(-1)
      }
    }
  }, [products, highlightedIndex, addToCart])

  const updateQty = useCallback((cartId, qty) => {
    setCart(prev => prev.map(i => i.cartId === cartId ? { ...i, qty } : i))
  }, [])

  const updatePrice = useCallback((cartId, priceRs) => {
    const paise = Math.round(parseFloat(priceRs) * 100)
    setCart(prev => prev.map(i => i.cartId === cartId ? { ...i, unitPrice: paise } : i))
  }, [])

  const removeFromCart = useCallback((cartId) => {
    setCart(prev => prev.filter(i => i.cartId !== cartId))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setCustomer(null)
    setPaymentMethod('cash')
    setSelectedUpiAccount('')
    setDiscount('')
    setCreditDays('')
    setNotes('')
    setAdHocName('')
    setAdHocPhone('')
    setCustomDate('')
    setCashPaid('')
    setSplitMode(false)
    setUpiPaid('')
    setBankPaid('')
    setSelectedBank('')
    setInvoiceToPay('')
    
    // Explicitly clean up localStorage session keys
    localStorage.removeItem('pos_cart')
    localStorage.removeItem('pos_customer')
    localStorage.removeItem('pos_payment_method')
    localStorage.removeItem('pos_discount')
    localStorage.removeItem('pos_credit_days')
    localStorage.removeItem('pos_notes')
    localStorage.removeItem('pos_selected_upi')
    localStorage.removeItem('pos_selected_bank')
    localStorage.removeItem('pos_cash_paid')
    localStorage.removeItem('pos_split_mode')
    localStorage.removeItem('pos_upi_paid')
    localStorage.removeItem('pos_bank_paid')
    localStorage.removeItem('pos_invoice_to_pay')
    localStorage.removeItem('pos_custom_date')
    localStorage.removeItem('pos_adhoc_name')
    localStorage.removeItem('pos_adhoc_phone')
  }, [])

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotal = useMemo(
    () => cart.reduce((sum, i) => sum + Math.round(i.qty * i.unitPrice), 0),
    [cart]
  )
  const discountPaise = Math.round((parseFloat(discount) || 0) * 100)
  const total = Math.max(0, subtotal - discountPaise)

  // ── Checkout mutation ─────────────────────────────────────────────────────
  const createSaleMutation = useMutation({
    mutationFn: billingApi.createSale,
    onSuccess: (data) => {
      qc.invalidateQueries(['dashboard'])
      qc.invalidateQueries(['inventory'])
      qc.invalidateQueries(['inventoryStats'])
      setInvoiceDialogSale(data.data)
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to complete sale', 'error')
    },
  })

  const createProductMutation = useMutation({
    mutationFn: inventoryApi.createProduct,
    onSuccess: (res) => {
      qc.invalidateQueries(['inventory-pos'])
      qc.invalidateQueries(['inventory'])
      qc.invalidateQueries(['inventoryStats'])
      if (res?.data) {
        addToCart(res.data)
      }
      showToast('Product added to inventory and cart!')
      setQuickAddOpen(false)
      setQuickName('')
      setQuickCategory('')
      setQuickUnit('kg')
      setQuickSellingPrice('')
      setQuickPurchasePrice('')
      setQuickInitialStock('0')
    },
    onError: (err) => {
      showToast(err?.response?.data?.error || 'Failed to create product', 'error')
    },
  })

  const handleOpenQuickAdd = () => {
    setQuickName(search)
    setQuickCategory(categories[0]?.id || '')
    setQuickUnit('kg')
    setQuickSellingPrice('')
    setQuickPurchasePrice('')
    setQuickInitialStock('0')
    setQuickAddOpen(true)
  }

  const handleQuickAddSubmit = (e) => {
    e.preventDefault()
    if (!quickName.trim() || !quickCategory || !quickSellingPrice) {
      showToast('Please fill all required fields', 'warning')
      return
    }
    createProductMutation.mutate({
      name: quickName,
      categoryId: parseInt(quickCategory),
      unit: quickUnit,
      purchasePrice: parseFloat(quickPurchasePrice) || 0,
      sellingPrice: parseFloat(quickSellingPrice) || 0,
      currentStock: parseFloat(quickInitialStock) || 0,
      lowStockThreshold: 5,
    })
  }

  const handleCheckout = () => {
    if (!cart.length) { showToast('Cart is empty', 'warning'); return }
    if (paymentMethod === 'credit' && !customer) {
      showToast('Select a customer for credit sales', 'warning'); return
    }

    createSaleMutation.mutate({
      customerId: customer?.id || null,
      items: cart.map(i => ({
        productId: i.productId,
        quantity: i.qty,
        unitPrice: i.unitPrice / 100,  // send as rupees; backend converts
      })),
      paymentMethod: splitMode ? 'credit' : paymentMethod,
      upiId: selectedUpiAccount || null,
      bankName: (splitMode || paymentMethod === 'bank') ? selectedBank : null,
      cashPaid: splitMode ? (cashPaid ? parseFloat(cashPaid) : 0) : ((paymentMethod === 'cash' || paymentMethod === 'credit') && cashPaid ? parseFloat(cashPaid) : null),
      upiPaid: splitMode ? (upiPaid ? parseFloat(upiPaid) : 0) : (paymentMethod === 'upi' ? total / 100 : null),
      bankPaid: splitMode ? (bankPaid ? parseFloat(bankPaid) : 0) : (paymentMethod === 'bank' ? total / 100 : null),
      invoiceToPay: ((splitMode || paymentMethod === 'cash') && invoiceToPay) ? invoiceToPay : null,
      discount: discount ? parseFloat(discount) : 0,
      creditDays: creditDays ? parseInt(creditDays) : null,
      notes: notes || null,
      billingCustomerName: customer ? null : adHocName || null,
      billingCustomerPhone: customer ? null : adHocPhone || null,
      customDate: customDate || null,
    })
  }

  const cartIsEmpty = cart.length === 0

  return (
    <Box sx={{ height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <PointOfSaleRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>POS Billing</Typography>
        {!cartIsEmpty && (
          <Chip
            label={`${cart.length} item${cart.length > 1 ? 's' : ''}`}
            size="small"
            sx={{ ml: 1, background: alpha(tokens.emerald500, 0.12), color: tokens.emerald600, fontWeight: 700 }}
          />
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button
          id="btn-pos-hold"
          variant="outlined"
          color="secondary"
          startIcon={<PauseRoundedIcon />}
          onClick={handleHoldBill}
          disabled={cartIsEmpty}
          sx={{
            borderRadius: '10px',
            fontWeight: 600,
            color: tokens.textSecondary,
            borderColor: tokens.border,
            '&:hover': { borderColor: tokens.textSecondary, background: tokens.surfaceAlt }
          }}
        >
          Hold Bill
        </Button>
        <Button
          id="btn-pos-recall"
          variant="contained"
          onClick={() => setRecallOpen(true)}
          startIcon={
            <Badge badgeContent={heldBills.length} color="error" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 16, minWidth: 16 } }}>
              <HistoryRoundedIcon />
            </Badge>
          }
          sx={{
            borderRadius: '10px',
            fontWeight: 600,
            background: tokens.forest800,
            color: '#fff',
            '&:hover': { background: tokens.forest900 }
          }}
        >
          Recall Draft ({heldBills.length})
        </Button>
        <Button
          id="btn-pos-return"
          variant="outlined"
          color="warning"
          onClick={() => setReturnDialogOpen(true)}
          sx={{ borderRadius: '10px', fontWeight: 600 }}
        >
          Return Billing
        </Button>
      </Box>

      <Grid container spacing={2.5} sx={{ flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT: Product search + Cart ──────────────────────────────────── */}
        <Grid item xs={12} lg={7} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Customer Selection */}
          <Card sx={{ borderRadius: '16px', border: `1px solid ${tokens.border}`, mb: 2 }}>
            <CardContent sx={{ pb: '16px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Autocomplete
                id="checkout-customer"
                options={customers}
                getOptionLabel={(c) => c.name || ''}
                value={customer}
                onChange={(_, v) => {
                  setCustomer(v)
                  setTimeout(() => searchRef.current?.focus(), 50)
                }}
                autoHighlight
                openOnFocus
                filterOptions={(options, state) => {
                  const query = state.inputValue.toLowerCase()
                  return options.filter(c =>
                    (c.name && c.name.toLowerCase().includes(query)) ||
                    (c.phone && c.phone.includes(query))
                  )
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Customer (optional)"
                    placeholder="Walk-in if not selected"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <PersonRoundedIcon fontSize="small" sx={{ color: tokens.textSecondary }} />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{option.name}</Typography>
                      {option.phone && (
                        <Typography sx={{ fontSize: '0.75rem', color: tokens.textSecondary }}>{option.phone}</Typography>
                      )}
                    </Box>
                  </Box>
                )}
                noOptionsText="No customers found"
                loadingText="Loading…"
              />

              {!customer && (
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    id="checkout-adhoc-name"
                    label="New Customer Name (optional)"
                    placeholder="Ad-hoc name"
                    size="small"
                    value={adHocName}
                    onChange={e => setAdHocName(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    id="checkout-adhoc-phone"
                    label="New Customer Phone (optional)"
                    placeholder="Ad-hoc phone"
                    size="small"
                    value={adHocPhone}
                    onChange={e => setAdHocPhone(e.target.value)}
                    fullWidth
                  />
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* Product search */}
          <Card sx={{ borderRadius: '16px', border: `1px solid ${tokens.border}`, mb: 2 }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <TextField
                id="pos-search"
                inputRef={searchRef}
                fullWidth
                placeholder="Search product by name… (start typing)"
                value={search}
                onChange={e => { setSearch(e.target.value); setHighlightedIndex(-1); }}
                onKeyDown={handleSearchKeyDown}
                autoFocus
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ color: tokens.textSecondary }} />
                    </InputAdornment>
                  ),
                  endAdornment: productsQuery.isFetching && (
                    <InputAdornment position="end">
                      <CircularProgress size={16} />
                    </InputAdornment>
                  ),
                }}
              />

              {/* Search results dropdown */}
              {search.length >= 1 && (
                <Paper
                  elevation={4}
                  sx={{
                    mt: 0.5,
                    borderRadius: '10px',
                    maxHeight: 260,
                    overflow: 'auto',
                    border: `1px solid ${tokens.border}`,
                  }}
                >
                  {!products.length ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem', mb: 1.5 }}>
                        {productsQuery.isFetching ? 'Searching…' : 'No products found'}
                      </Typography>
                      {!productsQuery.isFetching && (
                        <Button
                          variant="contained"
                          size="small"
                          onClick={handleOpenQuickAdd}
                          sx={{ borderRadius: '8px' }}
                        >
                          Quick Add "{search}"
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <List dense disablePadding>
                      {products.map((p, idx) => (
                        <ListItemButton
                          key={p.id}
                          id={`product-${p.id}`}
                          onClick={() => addToCart(p)}
                          sx={{
                            borderBottom: `1px solid ${tokens.border}`,
                            '&:last-child': { borderBottom: 'none' },
                            backgroundColor: idx === highlightedIndex ? alpha(tokens.emerald500, 0.08) : 'transparent',
                            '&:hover': {
                              backgroundColor: idx === highlightedIndex ? alpha(tokens.emerald500, 0.12) : alpha(tokens.border, 0.4),
                            }
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.name}</Typography>
                                <StatusBadge status={p.stockStatus} />
                              </Box>
                            }
                            secondary={`Stock: ${p.currentStock} ${p.unit}`}
                          />
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography sx={{ fontWeight: 700, color: tokens.emerald600, fontSize: '0.9rem' }}>
                              {fmt(p.sellingPrice)}
                            </Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: tokens.textSecondary }}>
                              per {p.unit}
                            </Typography>
                          </Box>
                        </ListItemButton>
                      ))}
                    </List>
                  )}
                </Paper>
              )}
            </CardContent>
          </Card>

          {/* Cart */}
          <Card
            sx={{
              borderRadius: '16px',
              border: `1px solid ${tokens.border}`,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <CardHeader
              title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShoppingCartRoundedIcon sx={{ color: tokens.emerald600, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Cart</Typography>
                </Box>
              }
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ flex: 1, overflow: 'auto', pt: 1 }}>
              {cartIsEmpty ? (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <Typography sx={{ fontSize: '2rem', mb: 1 }}>🛒</Typography>
                  <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
                    Search and click a product to add it to the cart
                  </Typography>
                </Box>
              ) : (
                <>
                  {/* Column headers */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 100px 80px 36px',
                      gap: 1,
                      pb: 0.75,
                      mb: 0.5,
                      borderBottom: `2px solid ${tokens.border}`,
                    }}
                  >
                    {['Product', 'Qty', 'Rate (₹)', 'Total', ''].map((h, i) => (
                      <Typography
                        key={i}
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: tokens.textSecondary,
                          textTransform: 'uppercase',
                          textAlign: i > 0 ? 'right' : 'left',
                        }}
                      >
                        {h}
                      </Typography>
                    ))}
                  </Box>
                  {cart.map(item => (
                    <CartItem
                      key={item.cartId}
                      item={item}
                      onQtyChange={updateQty}
                      onPriceChange={updatePrice}
                      onRemove={removeFromCart}
                      onEnterPress={() => searchRef.current?.focus()}
                    />
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── RIGHT: Checkout panel ─────────────────────────────────────────── */}
        <Grid item xs={12} lg={5} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Card
            sx={{
              borderRadius: '16px',
              border: `1px solid ${tokens.border}`,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <CardHeader
              title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ReceiptLongRoundedIcon sx={{ color: tokens.emerald600, fontSize: 20 }} />
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Checkout</Typography>
                </Box>
              }
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>

              {/* Split Payment modes toggle */}
              {customer && (
                <FormControlLabel
                  control={
                    <Switch
                      id="checkout-split-mode-toggle"
                      checked={splitMode}
                      onChange={(e) => {
                        setSplitMode(e.target.checked)
                        if (e.target.checked) {
                          setCashPaid('')
                          setUpiPaid('')
                          setBankPaid('')
                        }
                      }}
                      color="primary"
                    />
                  }
                  label={
                    <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: tokens.textPrimary }}>
                      Split Payment Modes
                    </Typography>
                  }
                />
              )}

              {splitMode ? (
                <Stack spacing={2}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: tokens.emerald600 }}>
                    Enter split modes received amounts (Rupees):
                  </Typography>
                  
                  <TextField
                    id="checkout-split-cash"
                    label="Cash Paid (₹)"
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 0.5 }}
                    value={cashPaid}
                    onChange={e => setCashPaid(e.target.value)}
                    fullWidth
                  />

                  <TextField
                    id="checkout-split-upi"
                    label="UPI Paid (₹)"
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 0.5 }}
                    value={upiPaid}
                    onChange={e => setUpiPaid(e.target.value)}
                    fullWidth
                  />

                  {parseFloat(upiPaid) > 0 && upiAccounts.length > 0 && (
                    <FormControl fullWidth size="small">
                      <InputLabel>UPI Account</InputLabel>
                      <Select
                        id="checkout-upi-account-split"
                        label="UPI Account"
                        value={selectedUpiAccount}
                        onChange={e => setSelectedUpiAccount(e.target.value)}
                        required
                      >
                        {upiAccounts.map(ac => (
                          <MenuItem key={ac.name} value={ac.name}>
                            {ac.name} ({ac.upi})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {parseFloat(upiPaid) > 0 && upiAccounts.length === 0 && (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      No UPI accounts configured under Settings.
                    </Alert>
                  )}

                  <TextField
                    id="checkout-split-bank"
                    label="Bank Paid (₹)"
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 0.5 }}
                    value={bankPaid}
                    onChange={e => setBankPaid(e.target.value)}
                    fullWidth
                  />

                  {parseFloat(bankPaid) > 0 && bankAccounts.length > 0 && (
                    <FormControl fullWidth size="small">
                      <InputLabel>Bank Account</InputLabel>
                      <Select
                        id="checkout-bank-account-split"
                        label="Bank Account"
                        value={selectedBank}
                        onChange={e => setSelectedBank(e.target.value)}
                        required
                      >
                        {bankAccounts.map(ac => (
                          <MenuItem key={ac.name} value={ac.name}>
                            {ac.name} ({ac.account})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {parseFloat(bankPaid) > 0 && bankAccounts.length === 0 && (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      No Bank accounts configured under Settings.
                    </Alert>
                  )}

                  {/* Calculations summary */}
                  {(() => {
                    const cPaid = parseFloat(cashPaid) || 0
                    const uPaid = parseFloat(upiPaid) || 0
                    const bPaid = parseFloat(bankPaid) || 0
                    const totPaid = cPaid + uPaid + bPaid
                    const billTotal = total / 100
                    const diff = billTotal - totPaid
                    return (
                      <Box sx={{ background: tokens.surfaceAlt, p: 1.5, borderRadius: '8px' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography sx={{ fontSize: '0.78rem', color: tokens.textSecondary }}>Total Paid:</Typography>
                          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700 }}>₹{totPaid.toFixed(2)}</Typography>
                        </Box>
                        {diff > 0 ? (
                          <Typography sx={{ fontSize: '0.78rem', color: tokens.amber500, fontWeight: 600 }}>
                            ⚠️ Remaining ₹{diff.toFixed(2)} will be added to credit dues
                          </Typography>
                        ) : diff < 0 ? (
                          <Typography sx={{ fontSize: '0.78rem', color: tokens.emerald600, fontWeight: 600 }}>
                            ✨ Surplus of ₹{Math.abs(diff).toFixed(2)} will reduce older dues
                          </Typography>
                        ) : (
                          <Typography sx={{ fontSize: '0.78rem', color: tokens.emerald600, fontWeight: 600 }}>
                            ✅ Fully paid (Exact match)
                          </Typography>
                        )}
                      </Box>
                    )
                  })()}

                  <TextField
                    id="checkout-split-credit-days"
                    label="Credit Days (optional)"
                    placeholder="e.g. 7"
                    size="small"
                    type="number"
                    inputProps={{ min: 1 }}
                    value={creditDays}
                    onChange={e => setCreditDays(e.target.value)}
                  />

                  <TextField
                    id="checkout-split-invoice-to-pay"
                    label="Pay Previous Invoice # (optional)"
                    placeholder="e.g. INV-0012"
                    size="small"
                    value={invoiceToPay}
                    onChange={e => setInvoiceToPay(e.target.value)}
                    fullWidth
                    helperText="Specify to apply surplus to a specific older bill"
                  />
                </Stack>
              ) : (
                <>
                  {/* Payment method */}
                  <FormControl fullWidth size="small">
                    <InputLabel>Payment Method</InputLabel>
                    <Select
                      id="checkout-payment"
                      label="Payment Method"
                      value={paymentMethod}
                      onChange={e => {
                        setPaymentMethod(e.target.value)
                        if (e.target.value === 'upi' && upiAccounts.length > 0) {
                          setSelectedUpiAccount(upiAccounts[0].name)
                        } else {
                          setSelectedUpiAccount('')
                        }
                        if (e.target.value === 'bank' && bankAccounts.length > 0) {
                          setSelectedBank(bankAccounts[0].name)
                        } else {
                          setSelectedBank('')
                        }
                      }}
                    >
                      {PAYMENT_METHODS.map(m => (
                        <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {paymentMethod === 'upi' && upiAccounts.length > 0 && (
                    <FormControl fullWidth size="small">
                      <InputLabel>UPI Account</InputLabel>
                      <Select
                        id="checkout-upi-account"
                        label="UPI Account"
                        value={selectedUpiAccount}
                        onChange={e => setSelectedUpiAccount(e.target.value)}
                        required
                      >
                        {upiAccounts.map(ac => (
                          <MenuItem key={ac.name} value={ac.name}>
                            {ac.name} ({ac.upi})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {paymentMethod === 'upi' && upiAccounts.length === 0 && (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      No UPI accounts configured under Settings.
                    </Alert>
                  )}

                  {paymentMethod === 'bank' && bankAccounts.length > 0 && (
                    <FormControl fullWidth size="small">
                      <InputLabel>Bank Account</InputLabel>
                      <Select
                        id="checkout-bank-account"
                        label="Bank Account"
                        value={selectedBank}
                        onChange={e => setSelectedBank(e.target.value)}
                        required
                      >
                        {bankAccounts.map(ac => (
                          <MenuItem key={ac.name} value={ac.name}>
                            {ac.name} ({ac.account})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {paymentMethod === 'bank' && bankAccounts.length === 0 && (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      No Bank accounts configured under Settings.
                    </Alert>
                  )}

                  {['cash', 'upi', 'bank'].includes(paymentMethod) && customer && (
                    <Stack spacing={1.5}>
                      <TextField
                        id="checkout-cash-paid"
                        label="Amount Received (optional)"
                        placeholder="e.g. 5000"
                        size="small"
                        type="number"
                        inputProps={{ min: 0, step: 0.5 }}
                        value={cashPaid}
                        onChange={e => setCashPaid(e.target.value)}
                        fullWidth
                        helperText={cashPaid && parseFloat(cashPaid) > 0 ? (
                          parseFloat(cashPaid) < (total / 100)
                            ? `Shortage of ₹${((total / 100) - parseFloat(cashPaid)).toFixed(2)} will be added to credit dues`
                            : `Surplus of ₹${(parseFloat(cashPaid) - (total / 100)).toFixed(2)} will reduce credit dues`
                        ) : ''}
                      />
                      <TextField
                        id="checkout-invoice-to-pay"
                        label="Pay Previous Invoice # (optional)"
                        placeholder="e.g. INV-0012"
                        size="small"
                        value={invoiceToPay}
                        onChange={e => setInvoiceToPay(e.target.value)}
                        fullWidth
                        helperText="Specify to apply surplus to a specific older bill"
                      />
                    </Stack>
                  )}

                  {paymentMethod === 'credit' && !customer && (
                    <Alert severity="warning" sx={{ py: 0.5 }}>
                      Please select a customer for credit sales
                    </Alert>
                  )}

                  {paymentMethod === 'credit' && (
                    <Stack spacing={1.5}>
                      {customer && (
                        <TextField
                          id="checkout-credit-cash-paid"
                          label="Downpayment Received (optional)"
                          placeholder="e.g. 1000"
                          size="small"
                          type="number"
                          inputProps={{ min: 0, step: 0.5 }}
                          value={cashPaid}
                          onChange={e => setCashPaid(e.target.value)}
                          fullWidth
                          helperText={cashPaid && parseFloat(cashPaid) > 0 ? (
                            parseFloat(cashPaid) >= (total / 100)
                              ? `Downpayment matches/exceeds total. No credit will be added.`
                              : `Remaining ₹${((total / 100) - parseFloat(cashPaid)).toFixed(2)} will be added to credit dues`
                          ) : ''}
                        />
                      )}
                      <TextField
                        id="checkout-credit-days"
                        label="Credit Days (optional)"
                        placeholder="e.g. 7"
                        size="small"
                        type="number"
                        inputProps={{ min: 1 }}
                        value={creditDays}
                        onChange={e => setCreditDays(e.target.value)}
                      />
                    </Stack>
                  )}
                </>
              )}

              {/* Discount */}
              <TextField
                id="checkout-discount"
                label="Discount (₹)"
                size="small"
                type="number"
                inputProps={{ min: 0, step: 0.5 }}
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />

              {/* Notes */}
              <TextField
                id="checkout-notes"
                label="Notes (optional)"
                size="small"
                multiline
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />

              {/* Totals summary */}
              <Box
                sx={{
                  background: tokens.surfaceAlt,
                  borderRadius: '12px',
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.85rem', color: tokens.textSecondary }}>Subtotal</Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{fmt(subtotal)}</Typography>
                </Box>
                {discountPaise > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={{ fontSize: '0.85rem', color: tokens.red500 }}>Discount</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: tokens.red500 }}>−{fmt(discountPaise)}</Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1, borderColor: tokens.border }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>Total</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', color: tokens.emerald600 }}>
                    {fmt(total)}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ flex: 1 }} />

              {/* Confirm sale */}
              <Button
                id="btn-confirm-sale"
                variant="contained"
                size="large"
                fullWidth
                disabled={cartIsEmpty || createSaleMutation.isPending}
                onClick={handleCheckout}
                sx={{
                  borderRadius: '12px',
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 700,
                  boxShadow: `0 8px 24px ${alpha(tokens.emerald600, 0.35)}`,
                }}
                startIcon={createSaleMutation.isPending
                  ? <CircularProgress size={18} color="inherit" />
                  : <PointOfSaleRoundedIcon />
                }
              >
                {createSaleMutation.isPending ? 'Processing…' : `Confirm Sale — ${fmt(total)}`}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Invoice dialog ────────────────────────────────────────────────── */}
      <InvoiceDialog
        sale={invoiceDialogSale}
        open={Boolean(invoiceDialogSale)}
        onNewSale={() => { clearCart(); setInvoiceDialogSale(null) }}
        onClose={() => setInvoiceDialogSale(null)}
      />

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setToast(t => ({ ...t, open: false }))}
          severity={toast.severity}
          sx={{ borderRadius: '12px' }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>

      {/* ── Quick Add Product Dialog ─────────────────────────────────────── */}
      <Dialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>Quick Add Product</Typography>
            <IconButton size="small" onClick={() => setQuickAddOpen(false)}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <Divider />
        <form onSubmit={handleQuickAddSubmit}>
          <DialogContent sx={{ pt: 2.5 }}>
            <Stack spacing={2.5}>
              <TextField
                label="Product Name *"
                fullWidth
                size="small"
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
                required
              />

              <FormControl fullWidth size="small">
                <InputLabel>Category *</InputLabel>
                <Select
                  label="Category *"
                  value={quickCategory}
                  onChange={e => setQuickCategory(e.target.value)}
                  required
                >
                  {categories?.map(c => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Unit *</InputLabel>
                <Select
                  label="Unit *"
                  value={quickUnit}
                  onChange={e => setQuickUnit(e.target.value)}
                  required
                >
                  <MenuItem value="kg">kg</MenuItem>
                  <MenuItem value="bunch">bunch</MenuItem>
                  <MenuItem value="piece">piece</MenuItem>
                  <MenuItem value="litre">litre</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Selling Price (₹/unit) *"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 0, step: 0.5 }}
                value={quickSellingPrice}
                onChange={e => setQuickSellingPrice(e.target.value)}
                required
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />

              <TextField
                label="Purchase Price (₹/unit) (optional)"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 0, step: 0.5 }}
                value={quickPurchasePrice}
                onChange={e => setQuickPurchasePrice(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />

              <TextField
                label="Initial Stock"
                fullWidth
                size="small"
                type="number"
                inputProps={{ min: 0, step: 0.1 }}
                value={quickInitialStock}
                onChange={e => setQuickInitialStock(e.target.value)}
              />
            </Stack>
          </DialogContent>
          <Divider />
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button onClick={() => setQuickAddOpen(false)} disabled={createProductMutation.isPending} variant="outlined" sx={{ borderRadius: '10px' }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createProductMutation.isPending}
              sx={{ borderRadius: '10px' }}
            >
              {createProductMutation.isPending ? 'Saving…' : 'Add & Cart'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={returnDialogOpen} onClose={() => setReturnDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <form onSubmit={(e) => {
          e.preventDefault()
          if (!returnProduct) {
            showToast('Please select a product to return', 'warning')
            return
          }
          if (!returnQty || parseFloat(returnQty) <= 0) {
            showToast('Please enter a valid quantity', 'warning')
            return
          }
          returnMutation.mutate({
            productId: returnProduct.id,
            quantity: parseFloat(returnQty),
            customerId: returnCustomer?.id || null,
            refundMethod: returnCustomer ? returnRefundMethod : 'cash',
            invoiceNumber: returnInvoiceNumber.trim() || null,
            notes: returnNotes.trim() || null
          })
        }}>
          <DialogTitle sx={{ fontWeight: 700 }}>Return Billing (Product Return)</DialogTitle>
          <Divider />
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                id="return-invoice-number"
                label="Invoice Number (optional)"
                size="small"
                value={returnInvoiceNumber}
                onChange={e => setReturnInvoiceNumber(e.target.value)}
                fullWidth
                placeholder="e.g. INV-0012"
                helperText="Link this return to a specific purchase invoice"
              />

              <Autocomplete
                id="return-product-select"
                options={returnProducts}
                getOptionLabel={(p) => p.name || ''}
                value={returnProduct}
                onChange={(_, v) => setReturnProduct(v)}
                onInputChange={(_, v) => setReturnSearch(v)}
                renderInput={(params) => <TextField {...params} label="Select Product" size="small" required />}
              />

              <TextField
                id="return-qty-input"
                label="Return Quantity"
                type="number"
                size="small"
                value={returnQty}
                onChange={e => setReturnQty(e.target.value)}
                required
                fullWidth
                inputProps={{ min: 0.0001, step: 'any' }}
                helperText={returnProduct ? `Unit: ${returnProduct.unit}` : ''}
              />

              <Autocomplete
                id="return-customer-select"
                options={customers}
                getOptionLabel={(c) => c.name || ''}
                value={returnCustomer}
                onChange={(_, v) => {
                  setReturnCustomer(v)
                  if (!v) setReturnRefundMethod('cash')
                }}
                renderInput={(params) => <TextField {...params} label="Customer (optional)" size="small" placeholder="Walk-in if not selected" />}
              />

              {returnCustomer && (
                <FormControl fullWidth size="small">
                  <InputLabel>Refund Option</InputLabel>
                  <Select
                    label="Refund Option"
                    value={returnRefundMethod}
                    onChange={e => setReturnRefundMethod(e.target.value)}
                  >
                    <MenuItem value="cash">Cash Refund</MenuItem>
                    <MenuItem value="credit">Deduct from Credit Balance (Dues)</MenuItem>
                  </Select>
                </FormControl>
              )}

              <TextField
                label="Notes (optional)"
                size="small"
                multiline
                rows={2}
                value={returnNotes}
                onChange={e => setReturnNotes(e.target.value)}
                fullWidth
                placeholder="Reason for return..."
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setReturnDialogOpen(false)} variant="outlined">Cancel</Button>
            <Button type="submit" variant="contained" color="warning" disabled={returnMutation.isPending}>
              {returnMutation.isPending ? 'Processing...' : 'Submit Return'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Held / Recall Draft Bills Dialog */}
      <Dialog
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>Held Draft Bills</Typography>
            <IconButton size="small" onClick={() => setRecallOpen(false)}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ p: 2, maxHeight: 400, overflow: 'auto' }}>
          {heldBills.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
                No bills currently on hold.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {heldBills.map((held) => {
                const itemTotalPaise = held.cart.reduce((sum, i) => sum + Math.round(i.qty * i.unitPrice), 0);
                const discountPaise = Math.round((parseFloat(held.discount) || 0) * 100);
                const finalTotal = Math.max(0, itemTotalPaise - discountPaise);
                return (
                  <Card
                    key={held.id}
                    variant="outlined"
                    sx={{
                      borderRadius: '12px',
                      borderColor: tokens.border,
                      p: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      backgroundColor: tokens.surface,
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: tokens.textPrimary }}>
                          {held.description}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
                          Held at {held.time} on {held.date}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: tokens.emerald600 }}>
                        {fmt(finalTotal)}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: tokens.textSecondary }}>
                      {held.cart.length} item{held.cart.length > 1 ? 's' : ''} • Method: {held.paymentMethod.toUpperCase()}
                    </Typography>
                    <Divider sx={{ borderColor: tokens.border, my: 0.25 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          setHeldBills(prev => prev.filter(b => b.id !== held.id))
                          showToast('Held bill discarded', 'info')
                        }}
                        sx={{ fontSize: '0.72rem', py: 0.25, borderRadius: '8px' }}
                      >
                        Discard
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                          setCart(held.cart.map(item => ({
                            ...item,
                            cartId: item.cartId || Math.random().toString(36).substring(2, 9)
                          })))
                          setCustomer(held.customer)
                          setPaymentMethod(held.paymentMethod)
                          setDiscount(held.discount)
                          setCreditDays(held.creditDays)
                          setNotes(held.notes)
                          setAdHocName(held.adHocName || '')
                          setAdHocPhone(held.adHocPhone || '')
                          setSelectedUpiAccount(held.selectedUpiAccount || '')
                          setSelectedBank(held.selectedBank || '')
                          setCashPaid(held.cashPaid || '')
                          setInvoiceToPay(held.invoiceToPay || '')
                          setCustomDate(held.customDate || '')
                          setHeldBills(prev => prev.filter(b => b.id !== held.id))
                          setRecallOpen(false)
                          showToast('Bill restored', 'success')
                        }}
                        sx={{
                          fontSize: '0.72rem',
                          py: 0.25,
                          borderRadius: '8px',
                          background: tokens.emerald600,
                          color: '#fff',
                          '&:hover': { background: tokens.emerald500 }
                        }}
                      >
                        Restore
                      </Button>
                    </Box>
                  </Card>
                )
              })}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
