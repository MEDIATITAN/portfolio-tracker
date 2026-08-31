import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './pages/DashboardPage'
import { PositionsPage } from './pages/PositionsPage'
import { PnlPage } from './pages/PnlPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { Sidebar } from './components/layout/Sidebar'
import { ThemeProvider } from './lib/ThemeContext'
import type { ClassFilter, Page } from './lib/navigation'

const queryClient = new QueryClient()

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

function AppShell(): React.JSX.Element {
  const [page, setPage] = useState<Page>('dashboard')
  const [classFilter, setClassFilter] = useState<ClassFilter>('ALL')

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      <Sidebar
        page={page}
        classFilter={classFilter}
        onNavigateDashboard={(filter) => {
          setPage('dashboard')
          setClassFilter(filter)
        }}
        onNavigatePositions={() => setPage('positions')}
        onNavigatePnl={() => setPage('pnl')}
        onNavigateTransactions={() => setPage('transactions')}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {page === 'dashboard' && (
          <DashboardPage classFilter={classFilter} onNavigateToPositions={() => setPage('positions')} />
        )}
        {page === 'positions' && <PositionsPage />}
        {page === 'pnl' && <PnlPage />}
        {page === 'transactions' && <TransactionsPage />}
      </main>
    </div>
  )
}

export default App
