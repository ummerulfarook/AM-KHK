import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import AppShell from './components/layout/AppShell'
import LoginPage from './pages/Login/LoginPage'
import DashboardPage from './pages/Dashboard/DashboardPage'
import InventoryPage from './pages/Inventory/InventoryPage'
import BillingPage from './pages/Billing/BillingPage'
import SalesHistoryPage from './pages/Billing/SalesHistoryPage'
import CustomersPage from './pages/Customers/CustomersPage'
import CustomerDetailsPage from './pages/Customers/CustomerDetailsPage'
import OrdersPage from './pages/Orders/OrdersPage'
import OrderDetailsPage from './pages/Orders/OrderDetailsPage'
import ExpensesPage from './pages/Expenses/ExpensesPage'
import ReportsPage from './pages/Reports/ReportsPage'
import CreditPage from './pages/Credit/CreditPage'
import SuppliersPage from './pages/Suppliers/SuppliersPage'
import PurchaseOrderDetailsPage from './pages/Suppliers/PurchaseOrderDetailsPage'
import SettingsPage from './pages/Settings/SettingsPage'
import PlaceholderPage from './components/common/PlaceholderPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected — all inside AppShell */}
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            <Route path="dashboard" element={<DashboardPage />} />

            <Route path="billing" element={<BillingPage />} />
            <Route path="billing/history" element={<SalesHistoryPage />} />

            <Route path="inventory" element={<InventoryPage />} />

            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailsPage />} />

            <Route path="credit" element={<CreditPage />} />

            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="suppliers/po/:id" element={<PurchaseOrderDetailsPage />} />

            <Route path="expenses" element={<ExpensesPage />} />

            <Route path="reports" element={<ReportsPage />} />

            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
