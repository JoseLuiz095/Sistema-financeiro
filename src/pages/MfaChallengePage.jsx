import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import Feedback from '../components/Feedback'
import { supabase } from '../lib/supabase'
import {
  getMfaSecurityState,
  verifyTotpFactor,
} from '../services/securityService'
import './security.css'

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

function getMfaErrorMessage(error) {
  const code = String(error?.code ?? '').trim()

  const messages = {
    mfa_verification_failed:
      'Código inválido ou expirado. Aguarde o próximo código do Authenticator e tente novamente.',
    insufficient_aal:
      'A sessão ainda não atingiu o nível de segurança necessário.',
    session_not_found:
      'A sessão não foi encontrada. Entre novamente.',
    session_expired:
      'A sessão expirou. Entre novamente.',
    request_timeout:
      'A verificação demorou além do esperado. Verifique a conexão e tente novamente.',
  }

  if (messages[code]) return messages[code]

  const message = String(error?.message ?? '').trim()

  if (/invalid|expired|verification/i.test(message)) {
    return messages.mfa_verification_failed
  }

  return message ||
    'Não foi possível concluir a verificação em duas etapas.'
}

export default function MfaChallengePage({
  onVerified,
}) {
  const [factors, setFactors] = useState([])
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [feedback, setFeedback] = useState({
    type: '',
    message: '',
  })
  const codeInputRef = useRef(null)
  const mountedRef = useRef(true)

  const loadFactors = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    setFeedback({ type: '', message: '' })

    try {
      const state = await withTimeout(
        getMfaSecurityState(),
        8000,
        'O carregamento dos autenticadores demorou além do esperado.',
      )

      if (!mountedRef.current) return

      const verifiedTotp = state.verifiedFactors
        .filter(
          (factor) =>
            factor.factor_type === 'totp',
        )

      setFactors(verifiedTotp)
      setFactorId(
        (current) =>
          verifiedTotp.some(
            (factor) => factor.id === current,
          )
            ? current
            : verifiedTotp[0]?.id ?? '',
      )

      if (verifiedTotp.length === 0) {
        setLoadFailed(true)
        setFeedback({
          type: 'error',
          message:
            'Nenhum autenticador verificado foi encontrado nesta conta.',
        })
      }
    } catch (error) {
      if (!mountedRef.current) return

      setLoadFailed(true)
      setFeedback({
        type: 'error',
        message: getMfaErrorMessage(error),
      })
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    loadFactors()

    return () => {
      mountedRef.current = false
    }
  }, [loadFactors])

  useEffect(() => {
    function focusCodeWhenVisible() {
      if (
        document.visibilityState === 'visible' &&
        !loading &&
        !verifying &&
        factorId
      ) {
        window.setTimeout(() => {
          codeInputRef.current?.focus({
            preventScroll: true,
          })
        }, 180)
      }
    }

    document.addEventListener(
      'visibilitychange',
      focusCodeWhenVisible,
    )
    window.addEventListener(
      'pageshow',
      focusCodeWhenVisible,
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        focusCodeWhenVisible,
      )
      window.removeEventListener(
        'pageshow',
        focusCodeWhenVisible,
      )
    }
  }, [factorId, loading, verifying])

  async function submit(event) {
    event.preventDefault()
    setVerifying(true)
    setFeedback({ type: '', message: '' })

    try {
      const verification =
        await verifyTotpFactor(
          factorId,
          code,
        )

      await onVerified(verification)
    } catch (error) {
      setCode('')
      setFeedback({
        type: 'error',
        message: getMfaErrorMessage(error),
      })

      window.setTimeout(() => {
        codeInputRef.current?.focus()
      }, 80)
    } finally {
      setVerifying(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut({
      scope: 'local',
    })
  }

  return (
    <main className="auth-page security-auth-page">
      <section className="auth-card mfa-challenge-card">
        <div className="security-heading">
          <div
            className="security-shield"
            aria-hidden="true"
          >
            ✓
          </div>
          <div>
            <span className="security-kicker">
              Verificação em duas etapas
            </span>
            <h1>Código do autenticador</h1>
            <p>
              Abra o aplicativo autenticador e informe
              o código atual de 6 dígitos.
            </p>
          </div>
        </div>

        <div className="mfa-app-switch-note">
          <strong>Você pode trocar de aplicativo.</strong>
          <span>
            Ao voltar do Authenticator, esta tela e o código digitado continuarão disponíveis.
          </span>
        </div>

        {loading ? (
          <div className="security-loading" aria-live="polite">
            Carregando autenticadores...
          </div>
        ) : loadFailed ? (
          <div className="mfa-load-recovery">
            <Feedback feedback={feedback} />
            <button
              type="button"
              className="primary-button"
              onClick={loadFactors}
            >
              Carregar novamente
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={logout}
            >
              Voltar ao login
            </button>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            {factors.length > 1 && (
              <label>
                Autenticador
                <select
                  value={factorId}
                  onChange={(event) =>
                    setFactorId(event.target.value)
                  }
                >
                  {factors.map((factor) => (
                    <option
                      key={factor.id}
                      value={factor.id}
                    >
                      {factor.friendly_name ||
                        'Aplicativo autenticador'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Código de segurança
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength="6"
                value={code}
                onChange={(event) => {
                  setCode(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 6),
                  )
                }}
                placeholder="000000"
                className="mfa-code-input"
                required
                autoFocus
              />
            </label>

            <Feedback feedback={feedback} />

            <button
              className="primary-button"
              disabled={
                verifying ||
                !factorId ||
                code.length !== 6
              }
            >
              {verifying
                ? 'Verificando...'
                : 'Verificar e entrar'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={logout}
              disabled={verifying}
            >
              Sair da conta
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
