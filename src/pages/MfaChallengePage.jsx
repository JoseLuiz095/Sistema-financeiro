import { useEffect, useState } from 'react'
import Feedback from '../components/Feedback'
import { supabase } from '../lib/supabase'
import {
  getMfaSecurityState,
  verifyTotpFactor,
} from '../services/securityService'
import './security.css'

export default function MfaChallengePage({
  onVerified,
}) {
  const [factors, setFactors] = useState([])
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [feedback, setFeedback] = useState({
    type: '',
    message: '',
  })

  useEffect(() => {
    let active = true

    async function loadFactors() {
      try {
        const state = await getMfaSecurityState()
        if (!active) return

        const verifiedTotp = state.verifiedFactors
          .filter((factor) => factor.factor_type === 'totp')

        setFactors(verifiedTotp)
        setFactorId(verifiedTotp[0]?.id ?? '')

        if (verifiedTotp.length === 0) {
          setFeedback({
            type: 'error',
            message:
              'Nenhum autenticador verificado foi encontrado nesta conta.',
          })
        }
      } catch (error) {
        if (!active) return
        setFeedback({
          type: 'error',
          message: error.message,
        })
      } finally {
        if (active) setLoading(false)
      }
    }

    loadFactors()

    return () => {
      active = false
    }
  }, [])

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
      setFeedback({
        type: 'error',
        message: error.message,
      })
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

        {loading ? (
          <div className="security-loading">
            Carregando autenticadores...
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
