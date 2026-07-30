import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './mobile-ui.css'
import Feedback from './components/Feedback'
import AppIcon from './components/AppIcon'
import { AnimatedPage, AppMotionProvider } from './components/AppMotion'
import { supabase } from './lib/supabase'
import useIdleSessionGuard from './hooks/useIdleSessionGuard'
import usePersonalValuesVisibility, { setPersonalValuesVisibility } from './hooks/usePersonalValuesVisibility'
import AnalyticsPage from './pages/AnalyticsPage'
import CalculatorsPage from './pages/CalculatorsPage'
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


function decodeAuthToken(token) {
  try {
    const payload = token?.split('.')?.[1]

    if (!payload) return null

    const normalized = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(
        payload.length +
          (4 - (payload.length % 4 || 4)),
        '=',
      )

    return JSON.parse(atob(normalized))
  } catch {
    return null
  }
}

function getAuthSessionId(session) {
  return decodeAuthToken(
    session?.access_token,
  )?.session_id ?? null
}

function isSameAuthSession(previousSession, nextSession) {
  if (!previousSession || !nextSession) return false

  const previousId = getAuthSessionId(previousSession)
  const nextId = getAuthSessionId(nextSession)

  if (previousId && nextId) {
    return previousId === nextId
  }

  return (
    previousSession.user?.id ===
      nextSession.user?.id &&
    previousSession.access_token ===
      nextSession.access_token
  )
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
  })

  return Promise.race([
    promise,
    timeoutPromise,
  ]).finally(() => {
    window.clearTimeout(timeoutId)
  })
}

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
    value: 'calculators',
    label: 'Calculadoras',
    icon: 'calculator',
  },
  {
    value: 'more',
    label: 'Mais',
    icon: 'more',
  },
]

function LoadingPage({
  message = 'Carregando dados...',
  detail = 'Preparando uma experiência segura e personalizada.',
  onRetry = null,
  onExit = null,
  recoveryDelay = 12000,
}) {
  const [showRecovery, setShowRecovery] = useState(false)
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState !== 'hidden',
  )
  const hasRecovery = Boolean(onRetry || onExit)

  useEffect(() => {
    function handleVisibilityChange() {
      const isVisible =
        document.visibilityState !== 'hidden'

      setPageVisible(isVisible)

      if (!isVisible) {
        setShowRecovery(false)
      }
    }

    function handlePageHide() {
      setPageVisible(false)
      setShowRecovery(false)
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      window.removeEventListener(
        'pagehide',
        handlePageHide,
      )
    }
  }, [])

  useEffect(() => {
    setShowRecovery(false)

    if (!hasRecovery || !pageVisible) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      if (document.visibilityState !== 'hidden') {
        setShowRecovery(true)
      }
    }, recoveryDelay)

    return () => window.clearTimeout(timerId)
  }, [message, hasRecovery, recoveryDelay, pageVisible])

  return (
    <main className="loading-page complete-loading-page">
      <div className="loading-ambient loading-ambient-one" />
      <div className="loading-ambient loading-ambient-two" />

      <section className="loading-card complete-loading-card" aria-live="polite">
        <div className="loading-brand-orbit" aria-hidden="true">
          <span className="loading-orbit-ring" />
          <span className="loading-orbit-dot loading-orbit-dot-one" />
          <span className="loading-orbit-dot loading-orbit-dot-two" />
          <div className="loading-brand-core">
            <AppIcon name="wallet" size={28} />
          </div>
        </div>

        <span className="loading-kicker">Financeiro Pessoal</span>
        <h1>{message}</h1>
        <p>{detail}</p>

        <div className="loading-progress-track" aria-hidden="true">
          <span />
        </div>

        <div className="loading-stage-grid" aria-hidden="true">
          <div className="active"><AppIcon name="shield" size={16} /><span>Segurança</span></div>
          <div><AppIcon name="data" size={16} /><span>Dados</span></div>
          <div><AppIcon name="analytics" size={16} /><span>Indicadores</span></div>
        </div>

        <div className="loading-bars" aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>

        {showRecovery && (
          <div className="loading-recovery" role="status">
            <strong>A verificação está demorando mais que o normal.</strong>
            <span>
              Isso pode acontecer ao voltar do Authenticator ou quando a conexão móvel oscila.
            </span>
            <div className="loading-recovery-actions">
              {onRetry && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={onRetry}
                >
                  Verificar novamente
                </button>
              )}
              {onExit && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onExit}
                >
                  Voltar ao login
                </button>
              )}
            </div>
          </div>
        )}
      </section>
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
  const [mfaCheckVersion, setMfaCheckVersion] = useState(0)
  const [
    loadingData,
    setLoadingData,
  ] = useState(false)
  const [
    privateDataReady,
    setPrivateDataReady,
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

  const sessionRef = useRef(null)
  const privateDataReadyRef = useRef(false)
  const mfaRequiredRef = useRef(false)
  const mfaCheckSequenceRef = useRef(0)
  const dataLoadSequenceRef = useRef(0)

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
  const personalValuesVisible =
    usePersonalValuesVisibility()

  const guardSession =
    session &&
    !checkingSession &&
    !checkingMfa &&
    !mfaRequired
      ? session
      : null

  const {
    ready: sessionGuardReady,
    authorized: sessionGuardAuthorized,
    sessionId: sessionGuardSessionId,
    authorizedSessionId,
    retry: retrySessionGuard,
  } = useIdleSessionGuard({
    session: guardSession,
    setFeedback,
    timeoutMs: 15 * 60 * 1000,
  })

  const canLoadPrivateData = Boolean(
    user &&
    guardSession &&
    sessionGuardReady &&
    sessionGuardAuthorized &&
    sessionGuardSessionId &&
    authorizedSessionId === sessionGuardSessionId &&
    !checkingMfa &&
    !mfaRequired,
  )

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    privateDataReadyRef.current = privateDataReady
  }, [privateDataReady])

  useEffect(() => {
    mfaRequiredRef.current = mfaRequired
  }, [mfaRequired])

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'A verificação da sessão demorou além do esperado.',
        )

        if (!mounted) return

        if (error) throw error

        const nextSession = data?.session ?? null

        sessionRef.current = nextSession
        setSession(nextSession)
        setCheckingSession(false)

        if (nextSession) {
          setMfaCheckVersion((current) => current + 1)
        } else {
          setCheckingMfa(false)
          setMfaRequired(false)
        }
      } catch (error) {
        if (!mounted) return

        sessionRef.current = null
        setSession(null)
        setCheckingSession(false)
        setCheckingMfa(false)
        setMfaRequired(false)
        setFeedback({
          type: 'error',
          message:
            error?.message ??
            'Não foi possível verificar a sessão.',
        })
      }
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return

        const previousSession = sessionRef.current
        const sameSession = isSameAuthSession(
          previousSession,
          nextSession,
        )

        sessionRef.current = nextSession
        setSession(nextSession)
        setCheckingSession(false)

        if (!nextSession || event === 'SIGNED_OUT') {
          privateDataReadyRef.current = false
          mfaRequiredRef.current = false
          setCheckingMfa(false)
          setMfaRequired(false)
          setPrivateDataReady(false)
          return
        }

        if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'USER_UPDATED'
        ) {
          if (!sameSession) {
            privateDataReadyRef.current = false
            setPrivateDataReady(false)
          }

          if (
            !mfaRequiredRef.current &&
            !privateDataReadyRef.current
          ) {
            setCheckingMfa(true)
          }

          setMfaCheckVersion((current) => current + 1)
        }

        if (event === 'TOKEN_REFRESHED') {
          const pageIsVisible =
            document.visibilityState !== 'hidden'

          if (
            pageIsVisible &&
            !mfaRequiredRef.current &&
            !privateDataReadyRef.current
          ) {
            setMfaCheckVersion((current) => current + 1)
          }
        }
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    const checkSequence =
      ++mfaCheckSequenceRef.current

    async function checkMfa() {
      if (!session) {
        mfaRequiredRef.current = false
        setMfaRequired(false)
        setCheckingMfa(false)
        return
      }

      const shouldBlockInterface =
        !privateDataReadyRef.current &&
        !mfaRequiredRef.current

      if (shouldBlockInterface) {
        setCheckingMfa(true)
      }

      try {
        const { data, error } = await withTimeout(
          supabase.auth.mfa
            .getAuthenticatorAssuranceLevel(),
          8000,
          'A verificação de segurança demorou além do esperado.',
        )

        if (
          !active ||
          checkSequence !==
            mfaCheckSequenceRef.current
        ) {
          return
        }

        if (error) throw error

        const nextMfaRequired = Boolean(
          data?.nextLevel === 'aal2' &&
          data?.currentLevel !== 'aal2',
        )

        mfaRequiredRef.current = nextMfaRequired
        setMfaRequired(nextMfaRequired)
      } catch (error) {
        if (
          !active ||
          checkSequence !==
            mfaCheckSequenceRef.current
        ) {
          return
        }

        setFeedback({
          type: 'error',
          message:
            'Falha ao verificar a autenticação em duas etapas: ' +
            error.message,
        })

        if (
          !privateDataReadyRef.current &&
          !mfaRequiredRef.current
        ) {
          mfaRequiredRef.current = true
          setMfaRequired(true)
        }
      } finally {
        if (
          active &&
          checkSequence ===
            mfaCheckSequenceRef.current
        ) {
          setCheckingMfa(false)
        }
      }
    }

    checkMfa()

    return () => {
      active = false
    }
  }, [session?.access_token, mfaCheckVersion])

  useEffect(() => {
    if (!canLoadPrivateData) {
      privateDataReadyRef.current = false
      setPrivateDataReady(false)
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

  async function loadAllData(options = {}) {
    const force = options?.force === true

    if (
      !user ||
      !canLoadPrivateData ||
      (loadingData && !force)
    ) {
      return
    }

    const loadSequence =
      ++dataLoadSequenceRef.current

    setLoadingData(true)
    let loadSucceeded = false

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
      ] = await withTimeout(
        Promise.all([
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
        ]),
        25000,
        'O carregamento dos dados demorou além do esperado.',
      )

      if (
        loadSequence !==
        dataLoadSequenceRef.current
      ) {
        return
      }

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
      loadSucceeded = true
    } catch (error) {
      if (
        loadSequence ===
        dataLoadSequenceRef.current
      ) {
        setFeedback({
          type: 'error',
          message:
            `Falha ao carregar os dados: ` +
            error.message,
        })
      }
    } finally {
      if (
        loadSequence ===
        dataLoadSequenceRef.current
      ) {
        setLoadingData(false)

        if (loadSucceeded) {
          privateDataReadyRef.current = true
          setPrivateDataReady(true)
        }
      }
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
    sessionRef.current = null
    privateDataReadyRef.current = false
    mfaRequiredRef.current = false
    setSession(null)
    setCheckingSession(false)
    setCheckingMfa(false)
    setMfaRequired(false)
    setPrivateDataReady(false)

    try {
      const { error } = await withTimeout(
        supabase.auth.signOut({
          scope: 'local',
        }),
        5000,
        'A saída demorou além do esperado.',
      )

      if (error) throw error
    } catch (error) {
      sessionStorage.setItem(
        'financeiro:logout-message',
        error?.message ??
          'A sessão foi removida deste dispositivo.',
      )
    }
  }

  async function handleMfaVerified(verification) {
    try {
      let aalData = verification?.aal ?? null

      if (aalData?.currentLevel !== 'aal2') {
        const {
          data,
          error,
        } = await withTimeout(
          supabase.auth.mfa
            .getAuthenticatorAssuranceLevel(),
          8000,
          'A confirmação do segundo fator demorou além do esperado.',
        )

        if (error) throw error
        aalData = data
      }

      if (aalData?.currentLevel !== 'aal2') {
        throw new Error(
          'A sessão ainda não foi elevada para AAL2. Aguarde alguns segundos e tente novamente.',
        )
      }

      const { data, error } =
        await supabase.auth.getSession()

      if (error || !data.session) {
        throw (
          error ??
          new Error(
            'A sessão autenticada não foi encontrada.',
          )
        )
      }

      sessionRef.current = data.session
      mfaRequiredRef.current = false
      privateDataReadyRef.current = false
      setSession(data.session)
      setMfaRequired(false)
      setCheckingMfa(false)
      setPrivateDataReady(false)
      setMfaCheckVersion((current) => current + 1)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          'Falha ao confirmar o segundo fator: ' +
          error.message,
      })
      mfaRequiredRef.current = true
      setMfaRequired(true)
      setCheckingMfa(false)
      throw error
    }
  }

  async function retrySecurityCheck() {
    setFeedback({ type: '', message: '' })
    setCheckingSession(false)
    setCheckingMfa(true)

    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        8000,
        'A recuperação da sessão demorou além do esperado.',
      )

      if (error || !data?.session) {
        throw (
          error ??
          new Error(
            'A sessão não foi encontrada neste dispositivo.',
          )
        )
      }

      sessionRef.current = data.session
      setSession(data.session)
      setMfaCheckVersion((current) => current + 1)
    } catch (error) {
      setCheckingMfa(false)
      setFeedback({
        type: 'error',
        message:
          error?.message ??
          'Não foi possível recuperar a sessão.',
      })
    }
  }

  async function exitSecurityFlow() {
    sessionRef.current = null
    privateDataReadyRef.current = false
    mfaRequiredRef.current = false
    setSession(null)
    setCheckingSession(false)
    setCheckingMfa(false)
    setMfaRequired(false)
    setPrivateDataReady(false)

    try {
      await withTimeout(
        supabase.auth.signOut({
          scope: 'local',
        }),
        5000,
        'A saída demorou além do esperado.',
      )
    } catch {
      // A interface retorna ao login mesmo se a chamada remota falhar.
    }
  }

  if (checkingSession) {
    return (
      <LoadingPage
        message="Verificando sessão..."
        detail="Validando sua sessão antes de liberar o painel financeiro."
        onRetry={retrySecurityCheck}
        onExit={exitSecurityFlow}
      />
    )
  }

  if (!session) {
    return <AuthPage />
  }

  if (mfaRequired) {
    return (
      <MfaChallengePage
        onVerified={handleMfaVerified}
      />
    )
  }

  if (checkingMfa) {
    return (
      <LoadingPage
        message="Verificando segurança da conta..."
        detail="Confirmando autenticação e proteção dos seus dados pessoais."
        onRetry={retrySecurityCheck}
        onExit={exitSecurityFlow}
      />
    )
  }

  if (guardSession && !sessionGuardReady) {
    return (
      <LoadingPage
        message="Validando sessão segura..."
        detail="Confirmando a proteção desta sessão antes de carregar seus dados."
        onRetry={retrySessionGuard}
        onExit={exitSecurityFlow}
      />
    )
  }

  if (
    guardSession &&
    sessionGuardReady &&
    !sessionGuardAuthorized
  ) {
    return (
      <LoadingPage
        message="Sessão segura pendente"
        detail="Não foi possível concluir a validação automática. Verifique a conexão e tente novamente."
        onRetry={retrySessionGuard}
        onExit={exitSecurityFlow}
        recoveryDelay={12000}
      />
    )
  }

  if (canLoadPrivateData && !privateDataReady) {
    return (
      <LoadingPage
        message="Montando seu painel..."
        detail="Consolidando contas, transações, investimentos e indicadores."
        onRetry={() =>
          loadAllData({ force: true })
        }
        onExit={exitSecurityFlow}
      />
    )
  }

  return (
    <AppMotionProvider>
      <main
      className="app-page"
      data-personal-values-hidden={
        personalValuesVisible
          ? 'false'
          : 'true'
      }
    >
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
            className="secondary-button header-action-button privacy-header-button"
            type="button"
            onClick={() =>
              setPersonalValuesVisibility(
                !personalValuesVisible,
              )
            }
            aria-pressed={!personalValuesVisible}
            aria-label={
              personalValuesVisible
                ? 'Ocultar valores pessoais'
                : 'Mostrar valores pessoais'
            }
            title={
              personalValuesVisible
                ? 'Ocultar saldos, investimentos e movimentações pessoais'
                : 'Mostrar saldos, investimentos e movimentações pessoais'
            }
          >
            <AppIcon
              name={
                personalValuesVisible
                  ? 'eye'
                  : 'eyeOff'
              }
              size={18}
            />
            <span>
              {personalValuesVisible
                ? 'Ocultar valores'
                : 'Mostrar valores'}
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

        <AnimatedPage
          pageKey={`${activePage}-${navigationRequest.key}`}
        >
        {activePage === 'home' && (
          <HomePage
            user={user}
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

        {activePage === 'calculators' && (
          <CalculatorsPage
            key={`calculators-${navigationRequest.key}`}
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
        </AnimatedPage>
      </section>
      </main>
    </AppMotionProvider>
  )
}
