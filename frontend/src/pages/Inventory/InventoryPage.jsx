import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Grid, IconButton, InputAdornment,
  LinearProgress, MenuItem, Pagination, Paper, Select, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography, alpha, FormControl, InputLabel,
  Alert, Snackbar, Stack,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import { inventoryApi } from '../../api/inventoryApi'
import StatusBadge from '../../components/common/StatusBadge'
import { tokens } from '../../theme/theme'
import { useAuth } from '../../contexts/AuthContext'

const fmt = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const fmtK = (paise) => {
  const inr = paise / 100
  if (inr >= 100000) return '₹' + (inr / 100000).toFixed(2) + 'L'
  if (inr >= 1000) return '₹' + (inr / 1000).toFixed(1) + 'K'
  return '₹' + inr.toFixed(0)
}

const UNIT_OPTIONS = ['kg', 'bunch', 'piece', 'litre']

const EMPTY_FORM = {
  name: '', categoryId: '', unit: 'kg',
  purchasePrice: '', sellingPrice: '', currentStock: '', lowStockThreshold: '5',
  supplierId: '', iconKey: '', addonProductId: '', addonQuantity: '1.0',
}

// ── Stat summary bar ──────────────────────────────────────────────────────────
function StatBar({ stats, loading }) {
  const items = [
    { label: 'Total Products', value: loading ? '—' : stats?.totalProducts ?? 0, color: tokens.emerald600 },
    { label: 'Stock Value', value: loading ? '—' : fmtK(stats?.stockValue ?? 0), color: tokens.blue500 },
    { label: 'In Stock', value: loading ? '—' : stats?.inStock ?? 0, color: tokens.emerald500 },
    { label: 'Low Stock', value: loading ? '—' : stats?.lowStock ?? 0, color: tokens.amber500 },
    { label: 'Out of Stock', value: loading ? '—' : stats?.outOfStock ?? 0, color: tokens.red500 },
  ]
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        mb: 3,
        p: 2,
        borderRadius: '16px',
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
      }}
    >
      {items.map((item, i) => (
        <Box
          key={item.label}
          sx={{
            flex: '1 1 100px',
            textAlign: 'center',
            borderRight: i < items.length - 1 ? `1px solid ${tokens.border}` : 'none',
            pr: 2,
          }}
        >
          {loading ? (
            <Skeleton width={60} height={28} sx={{ mx: 'auto' }} />
          ) : (
            <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: item.color, lineHeight: 1.2 }}>
              {item.value}
            </Typography>
          )}
          <Typography sx={{ fontSize: '0.72rem', color: tokens.textSecondary, fontWeight: 500 }}>
            {item.label}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// ── Product form dialog (Add / Edit) ──────────────────────────────────────────
function ProductDialog({ open, onClose, product, categories, suppliers, onSuccess }) {
  const qc = useQueryClient()
  const isEdit = Boolean(product)
  const [form, setForm] = useState(
    product
      ? {
          name: product.name,
          categoryId: product.categoryId,
          unit: product.unit,
          purchasePrice: (product.purchasePrice / 100).toString(),
          sellingPrice: (product.sellingPrice / 100).toString(),
          currentStock: product.currentStock.toString(),
          lowStockThreshold: product.lowStockThreshold.toString(),
          supplierId: product.supplierId || '',
          iconKey: product.iconKey || '',
          addonProductId: product.addonProductId || '',
          addonQuantity: (product.addonQuantity || 1.0).toString(),
        }
      : EMPTY_FORM
  )
  const [errors, setErrors] = useState({})

  const allProductsQuery = useQuery({
    queryKey: ['all-products-lookup'],
    queryFn: () => inventoryApi.getProducts({ perPage: 1000 }),
    enabled: open,
    staleTime: 30_000,
  })
  const allProducts = allProductsQuery.data?.data || []

  const createMutation = useMutation({
    mutationFn: inventoryApi.createProduct,
    onSuccess: () => { qc.invalidateQueries(['inventory']); qc.invalidateQueries(['inventoryStats']); onSuccess('Product created!'); onClose() },
    onError: (err) => setErrors(err.response?.data?.details || { _: err.response?.data?.error || 'Failed' }),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => inventoryApi.updateProduct(id, data),
    onSuccess: () => { qc.invalidateQueries(['inventory']); qc.invalidateQueries(['inventoryStats']); onSuccess('Product updated!'); onClose() },
    onError: (err) => setErrors(err.response?.data?.details || { _: err.response?.data?.error || 'Failed' }),
  })

  const isBusy = createMutation.isPending || updateMutation.isPending

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = () => {
    setErrors({})
    const payload = {
      name: form.name,
      categoryId: parseInt(form.categoryId) || 0,
      unit: form.unit,
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      currentStock: parseFloat(form.currentStock) || 0,
      lowStockThreshold: parseFloat(form.lowStockThreshold) || 5,
      supplierId: form.supplierId ? parseInt(form.supplierId) : null,
      iconKey: form.iconKey || null,
      addonProductId: form.addonProductId ? parseInt(form.addonProductId) : null,
      addonQuantity: parseFloat(form.addonQuantity) || 1.0,
    }
    if (isEdit) {
      updateMutation.mutate({ id: product.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        {isEdit ? 'Edit Product' : 'Add New Product'}
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        {errors._ && <Alert severity="error" sx={{ mb: 2 }}>{errors._}</Alert>}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              id="field-product-name"
              label="Product Name *"
              fullWidth value={form.name}
              onChange={set('name')}
              error={Boolean(errors.name)}
              helperText={errors.name}
            />
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Category *</InputLabel>
              <Select
                id="field-product-category"
                label="Category *"
                value={form.categoryId}
                onChange={set('categoryId')}
                error={Boolean(errors.categoryId)}
              >
                {categories?.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Unit *</InputLabel>
              <Select id="field-product-unit" label="Unit *" value={form.unit} onChange={set('unit')}>
                {UNIT_OPTIONS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <TextField
              id="field-purchase-price"
              label="Purchase Price (₹/unit) *"
              fullWidth type="number" inputProps={{ min: 0, step: 0.5 }}
              value={form.purchasePrice} onChange={set('purchasePrice')}
              error={Boolean(errors.purchasePrice)} helperText={errors.purchasePrice}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              id="field-selling-price"
              label="Selling Price (₹/unit) *"
              fullWidth type="number" inputProps={{ min: 0, step: 0.5 }}
              value={form.sellingPrice} onChange={set('sellingPrice')}
              error={Boolean(errors.sellingPrice)} helperText={errors.sellingPrice}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            />
          </Grid>
          {!isEdit && (
            <Grid item xs={6}>
              <TextField
                id="field-initial-stock"
                label="Initial Stock"
                fullWidth type="number" inputProps={{ min: 0, step: 0.1 }}
                value={form.currentStock} onChange={set('currentStock')}
              />
            </Grid>
          )}
          <Grid item xs={isEdit ? 6 : 6}>
            <TextField
              id="field-low-threshold"
              label="Low Stock Alert Threshold"
              fullWidth type="number" inputProps={{ min: 0, step: 0.1 }}
              value={form.lowStockThreshold} onChange={set('lowStockThreshold')}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth size="small">
              <InputLabel>Supplier (optional)</InputLabel>
              <Select
                id="field-product-supplier"
                label="Supplier (optional)"
                value={form.supplierId}
                onChange={set('supplierId')}
              >
                <MenuItem value="">— None —</MenuItem>
                {suppliers?.map(s => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              id="field-icon-key"
              label="Icon Key (optional)"
              fullWidth value={form.iconKey} onChange={set('iconKey')}
              helperText="e.g. tomato, onion, carrot"
              placeholder="tomato"
            />
          </Grid>
          <Grid item xs={8}>
            <FormControl fullWidth size="small">
              <InputLabel>Automated Addon (optional)</InputLabel>
              <Select
                id="field-product-addon-id"
                label="Automated Addon (optional)"
                value={form.addonProductId}
                onChange={set('addonProductId')}
              >
                <MenuItem value="">— None —</MenuItem>
                {allProducts
                  ?.filter(p => !product || p.id !== product.id)
                  ?.map(p => (
                    <MenuItem key={p.id} value={p.id}>{p.name} ({p.unit})</MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={4}>
            <TextField
              id="field-product-addon-qty"
              label="Addon Qty"
              fullWidth type="number" inputProps={{ min: 0.1, step: 0.1 }}
              value={form.addonQuantity} onChange={set('addonQuantity')}
              disabled={!form.addonProductId}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button id="btn-product-cancel" onClick={onClose} disabled={isBusy} variant="outlined">
          Cancel
        </Button>
        <Button
          id="btn-product-submit"
          variant="contained"
          onClick={handleSubmit}
          disabled={isBusy}
        >
          {isBusy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Product'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Stock Adjustment dialog ───────────────────────────────────────────────────
function StockDialog({ open, onClose, product, onSuccess }) {
  const qc = useQueryClient()
  const [adjustment, setAdjustment] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')

  const mutation = useMutation({
    mutationFn: ({ id, data }) => inventoryApi.adjustStock(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['inventory'])
      qc.invalidateQueries(['inventoryStats'])
      onSuccess('Stock adjusted!')
      onClose()
    },
    onError: (e) => setErr(e.response?.data?.error || 'Failed to adjust stock'),
  })

  const handleSubmit = () => {
    setErr('')
    const adj = parseFloat(adjustment)
    if (isNaN(adj) || adj === 0) { setErr('Enter a non-zero adjustment'); return }
    mutation.mutate({ id: product.id, data: { adjustment: adj, notes: notes || null } })
  }

  if (!product) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Adjust Stock — {product.name}</DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ mb: 2, p: 1.5, borderRadius: '10px', background: tokens.surfaceAlt }}>
          <Typography sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>Current Stock</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: tokens.textPrimary }}>
            {product.currentStock} {product.unit}
          </Typography>
        </Box>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <TextField
          id="field-stock-adjustment"
          label="Adjustment (+add / −remove)"
          fullWidth type="number"
          value={adjustment} onChange={e => setAdjustment(e.target.value)}
          helperText="Positive to add stock, negative to remove"
          inputProps={{ step: 0.1 }}
          sx={{ mb: 2 }}
        />
        <TextField
          id="field-stock-notes"
          label="Reason / Notes (optional)"
          fullWidth multiline rows={2}
          value={notes} onChange={e => setNotes(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button id="btn-stock-cancel" onClick={onClose} variant="outlined">Cancel</Button>
        <Button
          id="btn-stock-submit"
          variant="contained"
          onClick={handleSubmit}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Apply Adjustment'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const canEdit = user?.role === 'owner' || user?.role === 'manager'

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [stockProduct, setStockProduct] = useState(null)
  const [toast, setToast] = useState({ open: false, msg: '' })

  const showToast = (msg) => setToast({ open: true, msg })

  // Queries
  const statsQuery = useQuery({
    queryKey: ['inventoryStats'],
    queryFn: inventoryApi.getStats,
  })
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: inventoryApi.getCategories,
  })
  const suppliersQuery = useQuery({
    queryKey: ['suppliers-for-inventory'],
    queryFn: () => import('../../api/authApi').then(m => m.default.get('/api/suppliers/').then(r => r.data.data || [])),
  })

  const productsQuery = useQuery({
    queryKey: ['inventory', page, search, categoryId, statusFilter],
    queryFn: () =>
      inventoryApi.getProducts({
        page,
        perPage: 25,
        search: search || undefined,
        categoryId: categoryId || undefined,
        status: statusFilter || undefined,
      }),
    keepPreviousData: true,
  })

  const deactivateMutation = useMutation({
    mutationFn: inventoryApi.deactivateProduct,
    onSuccess: () => { qc.invalidateQueries(['inventory']); showToast('Product deactivated') },
  })
  const activateMutation = useMutation({
    mutationFn: inventoryApi.activateProduct,
    onSuccess: () => { qc.invalidateQueries(['inventory']); showToast('Product activated') },
  })

  const products = productsQuery.data?.data || []
  const pagination = productsQuery.data?.pagination
  const categories = categoriesQuery.data?.data || []
  const suppliersList = suppliersQuery.data || []


  return (
    <Box>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <InventoryRoundedIcon sx={{ color: tokens.emerald600, fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Inventory</Typography>
        </Box>
        {canEdit && (
          <Button
            id="btn-add-product"
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add Product
          </Button>
        )}
      </Box>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <StatBar stats={statsQuery.data} loading={statsQuery.isLoading} />

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
        <TextField
          id="field-search"
          placeholder="Search products…"
          size="small"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          sx={{ flex: '1 1 200px', maxWidth: 340 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" sx={{ color: tokens.textSecondary }} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Category</InputLabel>
          <Select
            id="filter-category"
            label="Category"
            value={categoryId}
            onChange={e => { setCategoryId(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All Categories</MenuItem>
            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Stock Status</InputLabel>
          <Select
            id="filter-status"
            label="Stock Status"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="in_stock">In Stock</MenuItem>
            <MenuItem value="low_stock">Low Stock</MenuItem>
            <MenuItem value="out_of_stock">Out of Stock</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* ── Product table ──────────────────────────────────────────────── */}
      <Card sx={{ borderRadius: '20px', border: `1px solid ${tokens.border}` }}>
        {productsQuery.isFetching && (
          <LinearProgress sx={{ borderRadius: '20px 20px 0 0' }} />
        )}

        {productsQuery.isError ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Alert severity="error">Failed to load products. Please try again.</Alert>
          </Box>
        ) : productsQuery.isLoading ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Product', 'Category', 'Unit', 'Purchase', 'Selling', 'Stock', 'Status', 'Actions'].map(h => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(8)].map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : !products.length ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>📦</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>No products found</Typography>
            <Typography sx={{ color: tokens.textSecondary, fontSize: '0.875rem' }}>
              {search || categoryId || statusFilter
                ? 'Try adjusting your filters'
                : 'Add your first product to get started'}
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell align="right">Purchase</TableCell>
                  <TableCell align="right">Selling</TableCell>
                  <TableCell>Stock</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Supplier</TableCell>
                  {canEdit && <TableCell align="center">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {products.map(p => (
                  <TableRow
                    key={p.id}
                    hover
                    sx={{ opacity: p.isActive ? 1 : 0.5 }}
                  >
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.name}</Typography>
                      {!p.isActive && (
                        <Chip label="Inactive" size="small" sx={{ height: 16, fontSize: '0.6rem', ml: 0.5 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{p.categoryName}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: tokens.textSecondary }}>{p.unit}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{fmt(p.purchasePrice)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{fmt(p.sellingPrice)}</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {p.currentStock} {p.unit}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, p.lowStockThreshold > 0
                            ? (p.currentStock / (p.lowStockThreshold * 3)) * 100
                            : 100
                          )}
                          sx={{
                            mt: 0.5, height: 4,
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: p.stockStatus === 'out_of_stock'
                                ? tokens.red500
                                : p.stockStatus === 'low_stock'
                                  ? tokens.amber500
                                  : tokens.emerald500,
                            },
                          }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell><StatusBadge status={p.stockStatus} /></TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', color: tokens.textSecondary }}>
                      {p.supplierName || '—'}
                    </TableCell>
                    {canEdit && (
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="Edit">
                            <IconButton
                              id={`btn-edit-${p.id}`}
                              size="small"
                              onClick={() => setEditProduct(p)}
                            >
                              <EditRoundedIcon fontSize="small" sx={{ color: tokens.blue500 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Adjust Stock">
                            <IconButton
                              id={`btn-stock-${p.id}`}
                              size="small"
                              onClick={() => setStockProduct(p)}
                            >
                              <TuneRoundedIcon fontSize="small" sx={{ color: tokens.amber500 }} />
                            </IconButton>
                          </Tooltip>
                          {p.isActive ? (
                            <Tooltip title="Deactivate">
                              <IconButton
                                id={`btn-deactivate-${p.id}`}
                                size="small"
                                onClick={() => deactivateMutation.mutate(p.id)}
                              >
                                <BlockRoundedIcon fontSize="small" sx={{ color: tokens.red500 }} />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Activate">
                              <IconButton
                                id={`btn-activate-${p.id}`}
                                size="small"
                                onClick={() => activateMutation.mutate(p.id)}
                              >
                                <CheckCircleRoundedIcon fontSize="small" sx={{ color: tokens.emerald500 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, borderTop: `1px solid ${tokens.border}` }}>
            <Pagination
              count={pagination.totalPages}
              page={page}
              onChange={(_, v) => setPage(v)}
              color="primary"
              size="small"
            />
          </Box>
        )}
      </Card>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      <ProductDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        suppliers={suppliersList}
        onSuccess={showToast}
      />
      {editProduct && (
        <ProductDialog
          open={Boolean(editProduct)}
          onClose={() => setEditProduct(null)}
          product={editProduct}
          categories={categories}
          suppliers={suppliersList}
          onSuccess={showToast}
        />
      )}
      {stockProduct && (
        <StockDialog
          open={Boolean(stockProduct)}
          onClose={() => setStockProduct(null)}
          product={stockProduct}
          onSuccess={showToast}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setToast(t => ({ ...t, open: false }))}
          severity="success"
          sx={{ borderRadius: '12px' }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}
