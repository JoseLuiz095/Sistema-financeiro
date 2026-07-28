import { useEffect, useState } from 'react'
import Feedback from '../components/Feedback'
import {
  changePassword,
  getMfaSecurityState,
  removeMfaFactor,
  signOutAllSessions,
  startTotpEnrollment,
  verifyTotpFactor,
} from '../services/securityService'
import './security.css'

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function getAalLabel(level) {
  return level === 'aal2'
    ? 'Verificação em duas etapas concluída'
    : 'Somente senha'
}

export default function SecurityPage({
  user,
  setFeedback: setGlobalFeedback,
}) {
  const [state, setState] = useState({
    factors: [],
    verifiedFactors: [],
    unverifiedFactors: [],
    currentLevel: 'aal1',
    nextLevel: 'aal1',
  })
  const [loading, setLoading] = useState(true)
  const [enrollment, setEnrollment] = useState(null)
  const [deviceName, setDeviceName] = useState(
    'Celular principal',
  )
  const [verificationCode, setVerificationCode] =
    useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({
    type: '',
    message: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  async function loadState() {
    setLoading(true)

    try {
      const nextState = await getMfaSecurityState()
      setState(nextState)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadState()
  }, [])

  async function beginEnrollment() {
    setBusy(true)
    setFeedback({ type: '', message: '' })

    try {
      const data = await startTotpEnrollment(
        `Financeiro Pessoal - ${
          deviceName.trim() || 'Autenticador'
        }`,
      )

      setEnrollment(data)
      setVerificationCode('')
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function verifyEnrollment(event) {
    event.preventDefault()

    if (!enrollment?.id) return

    setBusy(true)
    setFeedback({ type: '', message: '' })

    try {
      await verifyTotpFactor(
        enrollment.id,
        verificationCode,
      )

      setEnrollment(null)
      setVerificationCode('')
      setFeedback({
        type: 'success',
        message:
          'Aplicativo autenticador ativado. Os próximos acessos exigirão senha e código.',
      })
      setGlobalFeedback?.({
        type: 'success',
        message:
          'Verificação em duas etapas ativada.',
      })

      await loadState()
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function removeFactor(factor) {
    const confirmed = window.confirm(
      `Remover o autenticador "${
        factor.friendly_name ||
        'Aplicativo autenticador'
      }"?\n\n` +
        'Depois da remoção, este dispositivo não poderá gerar códigos para a conta.',
    )

    if (!confirmed) return

    setBusy(true)
    setFeedback({ type: '', message: '' })

    try {
      await removeMfaFactor(factor.id)
      setFeedback({
        type: 'success',
        message: 'Autenticador removido.',
      })
      await loadState()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          `${error.message}. Para remover um fator verificado, a sessão precisa estar em AAL2.`,
      })
    } finally {
      setBusy(false)
    }
  }

  async function submitPassword(event) {
    event.preventDefault()

    if (
      passwordForm.newPassword !==
      passwordForm.confirmPassword
    ) {
      setFeedback({
        type: 'error',
        message:
          'A confirmação da nova senha não confere.',
      })
      return
    }

    setBusy(true)
    setFeedback({ type: '', message: '' })

    try {
      await changePassword(passwordForm)
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setFeedback({
        type: 'success',
        message: 'Senha alterada com sucesso.',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function logoutEverywhere() {
    const confirmed = window.confirm(
      'Encerrar todas as sessões desta conta em todos os dispositivos?',
    )

    if (!confirmed) return

    setBusy(true)

    try {
      await signOutAllSessions()
    } catch (error) {
      setBusy(false)
      setFeedback({
        type: 'error',
        message: error.message,
      })
    }
  }

  const verifiedTotp = state.verifiedFactors
    .filter(
      (factor) => factor.factor_type === 'totp',
    )

  return (
    <div className="page-stack security-page">
      <section className="section-intro section-intro-card">
        <div
          className="security-shield"
          aria-hidden="true"
        >
          ✓
        </div>
        <div>
          <span className="eyebrow">
            Proteção da conta
          </span>
          <h2>Segurança e autenticação</h2>
          <p>
            Gerencie o aplicativo autenticador,
            senha e sessões da conta.
          </p>
        </div>
      </section>

      <Feedback feedback={feedback} />

      <section className="summary-grid summary-grid-4">
        <article className="summary-card">
          <span>Nível da sessão</span>
          <strong>
            {getAalLabel(state.currentLevel)}
          </strong>
        </article>
        <article className="summary-card">
          <span>Autenticadores ativos</span>
          <strong>{verifiedTotp.length}</strong>
        </article>
        <article className="summary-card">
          <span>Conta</span>
          <strong className="security-email">
            {user?.email ?? '-'}
          </strong>
        </article>
        <article className="summary-card">
          <span>Proteção recomendada</span>
          <strong>
            {verifiedTotp.length > 0
              ? 'Ativada'
              : 'Pendente'}
          </strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Aplicativo autenticador</h2>
          <p>
            Compatível com Google Authenticator,
            Microsoft Authenticator, 1Password,
            Authy e outros aplicativos TOTP.
          </p>
        </div>

        {loading ? (
          <div className="security-loading">
            Verificando fatores...
          </div>
        ) : (
          <>
            {verifiedTotp.length > 0 && (
              <div className="security-factor-list">
                {verifiedTotp.map((factor) => (
                  <article
                    className="security-factor-card"
                    key={factor.id}
                  >
                    <div>
                      <strong>
                        {factor.friendly_name ||
                          'Aplicativo autenticador'}
                      </strong>
                      <span>
                        Ativado em{' '}
                        {formatDateTime(
                          factor.created_at,
                        )}
                      </span>
                    </div>
                    <span className="status-badge status-success">
                      Verificado
                    </span>
                    <button
                      type="button"
                      className="danger-link"
                      disabled={busy}
                      onClick={() =>
                        removeFactor(factor)
                      }
                    >
                      Remover
                    </button>
                  </article>
                ))}
              </div>
            )}

            {!enrollment && (
              <div className="security-enroll-start">
                <label>
                  Nome do dispositivo
                  <input
                    value={deviceName}
                    maxLength="50"
                    onChange={(event) =>
                      setDeviceName(
                        event.target.value,
                      )
                    }
                    placeholder="Ex.: Celular principal"
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  onClick={beginEnrollment}
                  disabled={busy}
                >
                  {verifiedTotp.length > 0
                    ? 'Adicionar autenticador de reserva'
                    : 'Ativar aplicativo autenticador'}
                </button>
              </div>
            )}

            {enrollment && (
              <form
                className="security-enrollment"
                onSubmit={verifyEnrollment}
              >
                <div className="security-qr-wrap">
                  <img
                    src={enrollment.totp.qr_code}
                    alt="QR Code para configurar o aplicativo autenticador"
                    className="security-qr"
                  />
                </div>

                <div className="security-enrollment-copy">
                  <h3>1. Escaneie o QR Code</h3>
                  <p>
                    Abra o aplicativo autenticador e
                    adicione uma nova conta.
                  </p>

                  <details>
                    <summary>
                      Não conseguiu escanear?
                    </summary>
                    <p>
                      Digite manualmente esta chave no
                      aplicativo:
                    </p>
                    <code className="security-secret">
                      {enrollment.totp.secret}
                    </code>
                  </details>

                  <h3>2. Confirme o código</h3>
                  <label>
                    Código de 6 dígitos
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength="6"
                      pattern="[0-9]*"
                      value={verificationCode}
                      onChange={(event) => {
                        setVerificationCode(
                          event.target.value
                            .replace(/\D/g, '')
                            .slice(0, 6),
                        )
                      }}
                      className="mfa-code-input"
                      placeholder="000000"
                      required
                    />
                  </label>

                  <div className="inline-actions">
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        verificationCode.length !== 6
                      }
                    >
                      {busy
                        ? 'Confirmando...'
                        : 'Confirmar ativação'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        setEnrollment(null)
                        setVerificationCode('')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </form>
            )}
          </>
        )}

        <div className="info-callout info-callout-secondary">
          Cadastre um segundo autenticador em outro
          dispositivo como contingência. O Supabase
          não fornece códigos de recuperação para TOTP.
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Alterar senha</h2>
          <p>
            Use no mínimo 12 caracteres com letras
            maiúsculas, minúsculas, número e símbolo.
          </p>
        </div>

        <form
          className="form security-password-form"
          onSubmit={submitPassword}
        >
          <label>
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(event) => {
                setPasswordForm({
                  ...passwordForm,
                  currentPassword:
                    event.target.value,
                })
              }}
              required
            />
          </label>

          <div className="two-columns">
            <label>
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                minLength="12"
                value={passwordForm.newPassword}
                onChange={(event) => {
                  setPasswordForm({
                    ...passwordForm,
                    newPassword:
                      event.target.value,
                  })
                }}
                required
              />
            </label>

            <label>
              Confirmar nova senha
              <input
                type="password"
                autoComplete="new-password"
                minLength="12"
                value={passwordForm.confirmPassword}
                onChange={(event) => {
                  setPasswordForm({
                    ...passwordForm,
                    confirmPassword:
                      event.target.value,
                  })
                }}
                required
              />
            </label>
          </div>

          <button
            className="primary-button"
            disabled={busy}
          >
            Alterar senha
          </button>
        </form>
      </section>

      <section className="panel security-danger-zone">
        <div className="panel-header">
          <h2>Sessões abertas</h2>
          <p>
            Use esta opção após perder um dispositivo
            ou suspeitar de acesso indevido.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={logoutEverywhere}
          disabled={busy}
        >
          Encerrar sessões em todos os dispositivos
        </button>
      </section>
    </div>
  )
}
