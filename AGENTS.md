# AM & KHK Vegetable Merchants — Agent Rules (PINNED)

These rules are binding on every sub-agent working in this repository.
Do NOT deviate from them without explicit written approval from the project owner.

---

## Tech Stack (immutable)

- **Backend:** Python 3.11+, **Flask** with Blueprints, Flask-Login (session auth), Flask-CORS, Flask-Bcrypt
- **ORM / DB:** SQLAlchemy 2.0 + **SQLite** (`backend/data/amkhk.db`), Alembic for migrations
- **Frontend:** React 18 via **Vite**, **Material UI (MUI v5)**, React Router v6, TanStack Query (React Query v5), Recharts for charts, Axios for HTTP
- **PDF generation:** WeasyPrint
- **Thermal receipt printing:** python-escpos
- **Auth:** Flask-Login session cookies, bcrypt password hashing, role-based decorators on every protected route
- **Production server:** Waitress (WSGI), installed as a Windows Service via NSSM
- **Do NOT introduce:** Tailwind CSS, Next.js, Django, PostgreSQL, MySQL, Redux, or any second database engine

## Money fields
All monetary amounts are stored as **integers in paise** (1 INR = 100 paise), never as raw Python floats.
Use `Decimal` when performing arithmetic that crosses DB boundaries, and convert to paise (int) before writing.

## Design System (MUI theme tokens — do not override)

```js
palette: {
  forest900: '#0A2A1F', forest800: '#0E3A2A', forest700: '#134832',
  emerald600: '#059669', emerald500: '#10B981', emerald400: '#3DD9A4',
  lime500: '#8BC53F',
  background: '#F4F8F5', surface: '#FFFFFF', surfaceAlt: '#EEF5F0', border: '#E2EBE4',
  textPrimary: '#0F2419', textSecondary: '#71837A',
  amber500: '#F0940C', red500: '#E5484D', blue500: '#3F7FE0',
}
```

- **Font:** Poppins (300/400/500/600/700) — loaded via `@fontsource/poppins`
- **Border radius:** cards 20–22 px, buttons/inputs 10–12 px, chips fully round
- **Shadow on primary elements:** `0 14px 32px rgba(5,150,105,.28)`
- **Sidebar:** dark forest gradient (`#0E3A2A → #0A2A1F`), white text, active item = emerald pill + soft glow
- **Status colors (consistent everywhere):**
  - Green → paid / in-stock / delivered
  - Amber → due-soon / low-stock / packed / pending
  - Red → overdue / out-of-stock / cancelled
  - Blue → processing / wholesale

## Role Permissions (enforce SERVER-SIDE via decorators)

| Action | Owner | Manager | Accountant | Cashier |
|---|---|---|---|---|
| POS Billing | ✅ | ✅ | ❌ | ✅ |
| Inventory edit | ✅ | ✅ | ❌ | ❌ |
| Wholesale orders | ✅ | ✅ | ❌ | ❌ |
| Credit / record payments | ✅ | ✅ | ✅ | ❌ |
| Expenses (create) | ✅ | ✅ | ✅ | ❌ |
| Expenses (approve) | ✅ | ❌ | ✅ | ❌ |
| Reports | ✅ | ✅ | ✅ | ❌ |
| Settings / User mgmt | ✅ | ❌ | ❌ | ❌ |

## Coding standards
- Empty, loading, and error states on every list/table screen
- No hardcoded numbers in the UI — every value must come from a real DB query
- All list endpoints must be paginated (default page size 25)
- Use `snake_case` for Python, `camelCase` for JS/JSX
- Every new route must have its role guard applied before merge
