import { createContext, useContext, useState, useEffect } from 'react'

const LayoutContext = createContext({
  collapsed: false,
  toggleCollapse: () => {},
  sidebarWidth: 260,
})

export function LayoutProvider({ children }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', JSON.stringify(collapsed))
    } catch (e) {
      // Ignore storage errors
    }
  }, [collapsed])

  const toggleCollapse = () => setCollapsed(prev => !prev)
  const sidebarWidth = collapsed ? 72 : 260

  return (
    <LayoutContext.Provider value={{ collapsed, toggleCollapse, sidebarWidth }}>
      {children}
    </LayoutContext.Provider>
  )
}

export const useLayout = () => useContext(LayoutContext)
