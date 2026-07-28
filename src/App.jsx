import { useEffect, useMemo, useState } from 'react'
import './App.css'
import './mobile-ui.css'
import Feedback from './components/Feedback'
import AppIcon from './components/AppIcon'
import { supabase } from './lib/supabase'
import useIdleSessionGuard from './hooks/useIdleSessionGuard'
import AnalyticsPage from './pages/AnalyticsPage'
import AuthPage from './pages/AuthPage'
import DataPage from './pages/DataPage'
import HomePage from './pages/HomePage'
import MfaChallengePage from './pages/MfaChallengePage'
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
import {
  calculateInvestmentPositions,
} from './utils/investmentCalculator'

const NAV_ITEMS = [
  {
    value: 'home',
    label: 'Início',
    icon: 'home',
  },
  {
    value: 'data',
    label: 'Dados',
    icon: 'data',
  },
  {
    value: 'analytics',
    label: 'Análises',
    icon: 'analytics',
  },
  {
    value: 'more',
    label: 'Mais',
    icon: 'more',
  },
]

function LoadingPage({
  message = 'Carregando dados...',
}) {
  return (
    <main className="loading-page">
      <div className="loading-card">
        <div className="spinner" />
        <p>{message}</p>
      </div>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [
    checkingSession,
    setCheckingSession,
  ] = useState(true)
  const [
    checkingMfa,
    setCheckingMfa,
  ] = useState(true)
  const [
    mfaRequired,
    setMfaRequired,
  ] = useState(false)
  const [
    loadingData,
    setLoadingData,
  ] = useState(false)
  const [
    activePage,
    setActivePage,
  ] = useState('home')
  const [
    navigationRequest,
    setNavigationRequest,
  ] = useState({
    section: null,
    key: 0,
  })
  const [feedback, setFeedback] = useState({
    type: '',
    message: '',
  })

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] =
    useState([])
  const [transactions, setTransactions] =
    useState([])
  const [assets, setAssets] = useState([])
  const [operations, setOperations] =
    useState([])
  const [quotes, setQuotes] = useState([])
  const [incomes, setIncomes] = useState([])
  const [schedules, setSchedules] =
    useState([])
  const [occurrences, setOccurrences] =
    useState([])
  const [connections, setConnections] =
    useState([])
  const [syncLogs, setSyncLogs] =
    useState([])
  const [
    openFinanceConnections,
    setOpenFinanceConnections,
  ] = useState([])
  const [
    importedInvestmentPositions,
    setImportedInvestmentPositions,
  ] = useState([])
  const [
    importedInvestmentTransactions,
    setImportedInvestmentTransactions,
  ] = useState([])

  const user = session?.user ?? null

  const {
    ready: sessionGuardReady,
  } = useIdleSessionGuard({
    session,
    setFeedback,
    timeoutMs: 15 * 60 * 1000,
  })

  const canLoadPrivateData = Boolean(
    user &&
    sessionGuardReady &&
    !checkingMfa &&
    !mfaRequired,
  )

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const { data, error } =
        await supabase.auth.getSession()

      if (!mounted) return

      if (error) {
        setFeedback({
          type: 'error',
          message: error.message,
        })
      }

      setSession(data.session)
      setCheckingSession(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setCheckingSession(false)
        setCheckingMfa(Boolean(nextSession))
        setMfaRequired(Boolean(nextSession))
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function checkMfa() {
      if (!session) {
        setMfaRequired(false)
        setCheckingMfa(false)
        return
      }

      setCheckingMfa(true)

      const { data, error } =
        await supabase.auth.mfa
          .getAuthenticatorAssuranceLevel()

      if (!active) return

      if (error) {
        setFeedback({
          type: 'error',
          message:
            'Falha ao verificar a autenticação ' +
            `em duas etapas: ${error.message}`,
        })
        setMfaRequired(true)
        setCheckingMfa(false)
        return
      }

      setMfaRequired(
        data?.nextLevel === 'aal2' &&
        data?.currentLevel !== 'aal2',
      )
      setCheckingMfa(false)
    }

    checkMfa()

    return () => {
      active = false
    }
  }, [session?.access_token])

  useEffect(() => {
    if (!canLoadPrivateData) {
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
  }, [user?.id, canLoadPrivateData])

  async function loadAllData() {
    if (!user || !canLoadPrivateData) return

    setLoadingData(true)

    try {
      await ensureDefaultCategories(user.id)

      try {
        await refreshScheduledOccurrences(730)
      } catch (error) {
        if (
          !String(error?.message ?? '')
            .includes(
              'refresh_my_scheduled_occurrences',
            )
        ) {
          throw error
        }
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
        listScheduledTransactions()
          .catch((error) => {
            if (
              String(error?.message ?? '')
                .includes(
                  'scheduled_transactions',
                )
            ) {
              return []
            }

            throw error
          }),
        listScheduledOccurrences()
          .catch((error) => {
            if (
              String(error?.message ?? '')
                .includes(
                  'scheduled_occurrences',
                )
            ) {
              return []
            }

            throw error
          }),
        listBankConnections()
          .catch((error) => {
            if (
              String(error?.message ?? '')
                .includes('bank_connections')
            ) {
              return []
            }

            throw error
          }),
        listBankSyncLogs()
          .catch((error) => {
            if (
              String(error?.message ?? '')
                .includes('bank_sync_logs')
            ) {
              return []
            }

            throw error
          }),
        listOpenFinanceConnections()
          .catch((error) => {
            if (
              String(error?.message ?? '')
                .includes(
                  'open_finance_connections',
                )
            ) {
              return []
            }

            throw error
          }),
        listOpenFinanceInvestmentPositions()
          .catch((error) => {
            if (
              String(error?.message ?? '')
                .includes(
                  'open_finance_investment_positions',
                )
            ) {
              return []
            }

            throw error
          }),
        listOpenFinanceInvestmentTransactions()
          .catch((error) => {
            if (
              String(error?.message ?? '')
                .includes(
                  'open_finance_investment_transactions',
                )
            ) {
              return []
            }

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
      setOpenFinanceConnections(
        openFinanceConnectionRows,
      )
      setImportedInvestmentPositions(
        importedInvestmentPositionRows,
      )
      setImportedInvestmentTransactions(
        importedInvestmentTransactionRows,
      )
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          `Falha ao carregar os dados: ` +
          error.message,
      })
    } finally {
      setLoadingData(false)
    }
  }

  const investmentResult = useMemo(
    () =>
      calculateInvestmentPositions({
        assets,
        operations,
        quotes,
        incomes,
      }),
    [
      assets,
      operations,
      quotes,
      incomes,
    ],
  )

  function navigate(
    page,
    section = null,
  ) {
    setActivePage(page)
    setNavigationRequest({
      section,
      key: Date.now(),
    })
    setFeedback({
      type: '',
      message: '',
    })
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  async function logout() {
    const { error } =
      await supabase.auth.signOut()

    if (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    }
  }

  async function handleMfaVerified() {
    setCheckingMfa(true)
    setMfaRequired(true)

    const {
      data: aalData,
      error: aalError,
    } = await supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()

    if (aalError) {
      setFeedback({
        type: 'error',
        message:
          'Falha ao confirmar o segundo fator: ' +
          aalError.message,
      })
      setCheckingMfa(false)
      return
    }

    if (aalData?.currentLevel !== 'aal2') {
      setFeedback({
        type: 'error',
        message:
          'A sessão ainda não foi elevada para AAL2. Tente novamente.',
      })
      setCheckingMfa(false)
      return
    }

    const { data, error } =
      await supabase.auth.getSession()

    if (error || !data.session) {
      setFeedback({
        type: 'error',
        message:
          error?.message ??
          'A sessão autenticada não foi encontrada.',
      })
      setCheckingMfa(false)
      return
    }

    setSession(data.session)
    setMfaRequired(false)
    setCheckingMfa(false)
  }

  if (checkingSession) {
    return (
      <LoadingPage message="Verificando sessão..." />
    )
  }

  if (!session) {
    return <AuthPage />
  }

  if (checkingMfa) {
    return (
      <LoadingPage
        message="Verificando segurança da conta..."
      />
    )
  }

  if (mfaRequired) {
    return (
      <MfaChallengePage
        onVerified={handleMfaVerified}
      />
    )
  }

  return (
    <main className="app-page">
      <header className="app-header compact-app-header">
        <div className="app-brand">
          <div
            className="app-brand-mark"
            aria-hidden="true"
          >
            <AppIcon
              name="wallet"
              size={24}
            />
          </div>
          <div className="app-brand-copy">
            <span className="app-brand-kicker">
              Controle financeiro
            </span>
            <h1>Financeiro Pessoal</h1>
            <p>{user.email}</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="secondary-button header-action-button"
            type="button"
            onClick={loadAllData}
            disabled={loadingData}
            aria-label={
              loadingData
                ? 'Atualizando dados'
                : 'Atualizar dados'
            }
          >
            <AppIcon
              name="refresh"
              size={18}
              className={
                loadingData
                  ? 'is-spinning'
                  : ''
              }
            />
            <span>
              {loadingData
                ? 'Atualizando...'
                : 'Atualizar'}
            </span>
          </button>

          <button
            className="secondary-button header-action-button"
            type="button"
            onClick={logout}
            aria-label="Sair do sistema"
          >
            <AppIcon
              name="logout"
              size={18}
            />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <nav
        className="main-nav simplified-main-nav"
        aria-label="Navegação principal"
      >
        {NAV_ITEMS.map(
          ({
            value,
            label,
            icon,
          }) => (
            <button
              key={value}
              type="button"
              className={
                activePage === value
                  ? 'active'
                  : ''
              }
              onClick={() =>
                navigate(value)
              }
              aria-current={
                activePage === value
                  ? 'page'
                  : undefined
              }
            >
              <span
                className="nav-icon-wrap"
                aria-hidden="true"
              >
                <AppIcon
                  name={icon}
                  size={20}
                />
              </span>
              <span>{label}</span>
            </button>
          ),
        )}
      </nav>

      <section className="app-content">
        <div className="page-feedback">
          <Feedback feedback={feedback} />
        </div>

        {activePage === 'home' && (
          <HomePage
            accounts={accounts}
            transactions={transactions}
            investmentResult={
              investmentResult
            }
            importedInvestmentPositions={
              importedInvestmentPositions
            }
            scheduledOccurrences={
              occurrences
            }
            openFinanceConnections={
              openFinanceConnections
            }
            onNavigate={navigate}
          />
        )}

        {activePage === 'data' && (
          <DataPage
            key={
              `data-${navigationRequest.key}`
            }
            requestedSection={
              navigationRequest.section
            }
            user={user}
            accounts={accounts}
            categories={categories}
            onChanged={loadAllData}
            setFeedback={setFeedback}
          />
        )}

        {activePage === 'analytics' && (
          <AnalyticsPage
            key={
              `analytics-${navigationRequest.key}`
            }
            requestedSection={
              navigationRequest.section
            }
            user={user}
            accounts={accounts}
            transactions={transactions}
            assets={assets}
            operations={operations}
            quotes={quotes}
            incomes={incomes}
            investmentResult={
              investmentResult
            }
            importedInvestmentPositions={
              importedInvestmentPositions
            }
            importedInvestmentTransactions={
              importedInvestmentTransactions
            }
            scheduledOccurrences={
              occurrences
            }
            onChanged={loadAllData}
            setFeedback={setFeedback}
          />
        )}

        {activePage === 'more' && (
          <MorePage
            key={
              `more-${navigationRequest.key}`
            }
            requestedSection={
              navigationRequest.section
            }
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
      </section>
    </main>
  )
}
