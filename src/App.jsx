import { useEffect, useMemo, useState } from 'react'
import './App.css'
import Feedback from './components/Feedback'
import { supabase } from './lib/supabase'
import AnalyticsPage from './pages/AnalyticsPage'
import AuthPage from './pages/AuthPage'
import DataPage from './pages/DataPage'
import HomePage from './pages/HomePage'
import MorePage from './pages/MorePage'
import {
  ensureDefaultCategories,
  listAccounts,
  listCategories,
  listTransactions,
} from './services/financeService'
import {
  listAssets,
  listInvestmentIncome,
  listInvestmentOperations,
  listMarketQuotes,
} from './services/investmentService'
import {
  listScheduledOccurrences,
  listScheduledTransactions,
  refreshScheduledOccurrences,
} from './services/scheduleService'
import {
  listBankConnections,
  listBankSyncLogs,
} from './services/integrationService'
import {
  listOpenFinanceConnections,
  listOpenFinanceInvestmentPositions,
  listOpenFinanceInvestmentTransactions,
} from './services/openFinanceService'
import { calculateInvestmentPositions } from './utils/investmentCalculator'

const NAV_ITEMS = [
  ['home', 'Início'],
  ['data', 'Dados'],
  ['analytics', 'Análises'],
  ['more', 'Mais'],
]

function LoadingPage() {
  return (
    <main className="loading-page">
      <div className="loading-card">
        <div className="spinner" />
        <p>Carregando dados...</p>
      </div>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [activePage, setActivePage] = useState('home')
  const [navigationRequest, setNavigationRequest] = useState({ section: null, key: 0 })
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [assets, setAssets] = useState([])
  const [operations, setOperations] = useState([])
  const [quotes, setQuotes] = useState([])
  const [incomes, setIncomes] = useState([])
  const [schedules, setSchedules] = useState([])
  const [occurrences, setOccurrences] = useState([])
  const [connections, setConnections] = useState([])
  const [syncLogs, setSyncLogs] = useState([])
  const [openFinanceConnections, setOpenFinanceConnections] = useState([])
  const [importedInvestmentPositions, setImportedInvestmentPositions] = useState([])
  const [importedInvestmentTransactions, setImportedInvestmentTransactions] = useState([])

  const user = session?.user ?? null

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (error) setFeedback({ type: 'error', message: error.message })
      setSession(data.session)
      setCheckingSession(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setCheckingSession(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setAccounts([])
      setCategories([])
      setTransactions([])
      setAssets([])
      setOperations([])
      setQuotes([])
      setIncomes([])
      setSchedules([])
      setOccurrences([])
      setConnections([])
      setSyncLogs([])
      setOpenFinanceConnections([])
      setImportedInvestmentPositions([])
      setImportedInvestmentTransactions([])
      return
    }
    loadAllData()
  }, [user?.id])

  async function loadAllData() {
    if (!user) return
    setLoadingData(true)

    try {
      await ensureDefaultCategories(user.id)

      try {
        await refreshScheduledOccurrences(730)
      } catch (error) {
        if (!String(error?.message ?? '').includes('refresh_my_scheduled_occurrences')) throw error
      }

      const [
        accountRows,
        categoryRows,
        transactionRows,
        assetRows,
        operationRows,
        quoteRows,
        incomeRows,
        scheduleRows,
        occurrenceRows,
        connectionRows,
        syncLogRows,
        openFinanceConnectionRows,
        importedInvestmentPositionRows,
        importedInvestmentTransactionRows,
      ] = await Promise.all([
        listAccounts(),
        listCategories(),
        listTransactions(),
        listAssets(),
        listInvestmentOperations(),
        listMarketQuotes(),
        listInvestmentIncome(),
        listScheduledTransactions().catch((error) => {
          if (String(error?.message ?? '').includes('scheduled_transactions')) return []
          throw error
        }),
        listScheduledOccurrences().catch((error) => {
          if (String(error?.message ?? '').includes('scheduled_occurrences')) return []
          throw error
        }),
        listBankConnections().catch((error) => {
          if (String(error?.message ?? '').includes('bank_connections')) return []
          throw error
        }),
        listBankSyncLogs().catch((error) => {
          if (String(error?.message ?? '').includes('bank_sync_logs')) return []
          throw error
        }),
        listOpenFinanceConnections().catch((error) => {
          if (String(error?.message ?? '').includes('open_finance_connections')) return []
          throw error
        }),
        listOpenFinanceInvestmentPositions().catch((error) => {
          if (String(error?.message ?? '').includes('open_finance_investment_positions')) return []
          throw error
        }),
        listOpenFinanceInvestmentTransactions().catch((error) => {
          if (String(error?.message ?? '').includes('open_finance_investment_transactions')) return []
          throw error
        }),
      ])

      setAccounts(accountRows)
      setCategories(categoryRows)
      setTransactions(transactionRows)
      setAssets(assetRows)
      setOperations(operationRows)
      setQuotes(quoteRows)
      setIncomes(incomeRows)
      setSchedules(scheduleRows)
      setOccurrences(occurrenceRows)
      setConnections(connectionRows)
      setSyncLogs(syncLogRows)
      setOpenFinanceConnections(openFinanceConnectionRows)
      setImportedInvestmentPositions(importedInvestmentPositionRows)
      setImportedInvestmentTransactions(importedInvestmentTransactionRows)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Falha ao carregar os dados: ${error.message}`,
      })
    } finally {
      setLoadingData(false)
    }
  }

  const investmentResult = useMemo(
    () => calculateInvestmentPositions({ assets, operations, quotes, incomes }),
    [assets, operations, quotes, incomes],
  )

  function navigate(page, section = null) {
    setActivePage(page)
    setNavigationRequest({ section, key: Date.now() })
    setFeedback({ type: '', message: '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) setFeedback({ type: 'error', message: error.message })
  }

  if (checkingSession) return <LoadingPage />
  if (!session) return <AuthPage />

  return (
    <main className="app-page">
      <header className="app-header compact-app-header">
        <div>
          <h1>Financeiro Pessoal</h1>
          <p>{user.email}</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={loadAllData} disabled={loadingData}>
            {loadingData ? 'Atualizando...' : 'Atualizar dados'}
          </button>
          <button className="secondary-button" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <nav className="main-nav simplified-main-nav" aria-label="Navegação principal">
        {NAV_ITEMS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={activePage === value ? 'active' : ''}
            onClick={() => navigate(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="page-feedback"><Feedback feedback={feedback} /></div>

      {activePage === 'home' && (
        <HomePage
          accounts={accounts}
          transactions={transactions}
          investmentResult={investmentResult}
          importedInvestmentPositions={importedInvestmentPositions}
          scheduledOccurrences={occurrences}
          openFinanceConnections={openFinanceConnections}
          onNavigate={navigate}
        />
      )}

      {activePage === 'data' && (
        <DataPage
          key={`data-${navigationRequest.key}`}
          requestedSection={navigationRequest.section}
          user={user}
          accounts={accounts}
          categories={categories}
          onChanged={loadAllData}
          setFeedback={setFeedback}
        />
      )}

      {activePage === 'analytics' && (
        <AnalyticsPage
          key={`analytics-${navigationRequest.key}`}
          requestedSection={navigationRequest.section}
          user={user}
          accounts={accounts}
          transactions={transactions}
          assets={assets}
          operations={operations}
          quotes={quotes}
          incomes={incomes}
          investmentResult={investmentResult}
          importedInvestmentPositions={importedInvestmentPositions}
          importedInvestmentTransactions={importedInvestmentTransactions}
          scheduledOccurrences={occurrences}
          onChanged={loadAllData}
          setFeedback={setFeedback}
        />
      )}

      {activePage === 'more' && (
        <MorePage
          key={`more-${navigationRequest.key}`}
          requestedSection={navigationRequest.section}
          user={user}
          accounts={accounts}
          categories={categories}
          transactions={transactions}
          schedules={schedules}
          occurrences={occurrences}
          connections={connections}
          syncLogs={syncLogs}
          onChanged={loadAllData}
          setFeedback={setFeedback}
        />
      )}
    </main>
  )
}
