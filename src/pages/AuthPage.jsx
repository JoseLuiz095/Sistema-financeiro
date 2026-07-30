import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Feedback from '../components/Feedback'

const PENDING_SIGNUP_EMAIL_KEY =
  'financeiro:pending-signup-email'
const RESEND_COOLDOWN_SECONDS = 60

function normalizeOtp(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 8)
}

function getApplicationUrl() {
  return String(
    import.meta.env.VITE_APP_URL ||
      window.location.origin,
  ).replace(/\/+$/, '')
}


function readAuthErrorText(error) {
  if (typeof error === 'string') {
    return error.trim()
  }

  if (!error || typeof error !== 'object') {
    return ''
  }

  const candidates = [
    error.message,
    error.error_description,
    error.msg,
    error.details,
    error.hint,
    typeof error.error === 'string'
      ? error.error
      : error.error?.message,
    error.cause?.message,
  ]

  return String(
    candidates.find(
      (value) =>
        typeof value === 'string' &&
        value.trim() &&
        value.trim() !== '{}' &&
        value.trim() !== '[object Object]',
    ) ?? '',
  ).trim()
}

function getAuthErrorMessage(
  error,
  fallback = 'Não foi possível concluir esta operação.',
) {
  const code = String(
    error?.code ??
      error?.error_code ??
      error?.name ??
      '',
  ).trim()
  const status = Number(
    error?.status ??
      error?.statusCode ??
      0,
  )

  const messages = {
    email_exists:
      'Este e-mail já possui uma conta. Tente entrar ou use a recuperação de senha.',
    user_already_exists:
      'Este e-mail já possui uma conta. Tente entrar ou use a recuperação de senha.',
    identity_already_exists:
      'Este e-mail já está vinculado a uma conta. Tente entrar.',
    email_address_not_authorized:
      'Não foi possível enviar o e-mail de confirmação. Tente novamente mais tarde.',
    email_not_confirmed:
      'Seu e-mail ainda não foi confirmado. Informe o código recebido para continuar.',
    invalid_credentials:
      'E-mail ou senha inválidos.',
    otp_expired:
      'O código expirou ou já foi utilizado. Solicite um novo código.',
    otp_disabled:
      'A confirmação por código está temporariamente indisponível.',
    over_email_send_rate_limit:
      'Muitos códigos foram solicitados em pouco tempo. Aguarde alguns minutos e tente novamente.',
    over_request_rate_limit:
      'Muitas tentativas foram realizadas. Aguarde alguns minutos e tente novamente.',
    request_timeout:
      'A solicitação demorou além do esperado. Verifique sua conexão e tente novamente.',
    signup_disabled:
      'A criação de novas contas está temporariamente indisponível.',
    email_provider_disabled:
      'O cadastro por e-mail está temporariamente indisponível.',
    weak_password:
      'Escolha uma senha mais forte para continuar.',
    validation_failed:
      'Confira os dados informados e tente novamente.',
    user_not_found:
      'Não encontramos uma conta com este e-mail.',
    session_not_found:
      'Sua sessão não foi encontrada. Entre novamente.',
    session_expired:
      'Sua sessão expirou. Entre novamente.',
    unexpected_failure:
      'Não foi possível concluir o cadastro agora. Tente novamente em alguns minutos.',
    empty_signup_response:
      'Não foi possível concluir o cadastro agora. Tente novamente em alguns minutos.',
  }

  if (messages[code]) {
    return messages[code]
  }

  const message = readAuthErrorText(error)

  if (message) {
    if (/already|exists|registered/i.test(message)) {
      return messages.email_exists
    }

    if (/network|fetch|offline/i.test(message)) {
      return 'Não foi possível acessar o serviço. Verifique sua conexão com a internet e tente novamente.'
    }

    if (/smtp|mailer|sending confirmation|send email/i.test(message)) {
      return 'Não foi possível enviar o e-mail de confirmação. Tente novamente mais tarde.'
    }

    if (/password/i.test(message)) {
      return 'Confira a senha informada e tente novamente.'
    }
  }

  if (status >= 500) {
    return 'Não foi possível concluir sua solicitação agora. Tente novamente em alguns minutos.'
  }

  return fallback
}

function logAuthError(context, error) {
  console.error(`[AUTH][${context}]`, {
    name: error?.name,
    code: error?.code ?? error?.error_code,
    message: readAuthErrorText(error),
    status: error?.status ?? error?.statusCode,
    cause: error?.cause,
    raw: error,
  })
}

function isMaskedExistingUser(data) {
  const identities = data?.user?.identities

  return Boolean(
    data?.user &&
    Array.isArray(identities) &&
    identities.length === 0,
  )
}

export default function AuthPage() {
  const signupEnabled =
    String(import.meta.env.VITE_ALLOW_SIGNUP ?? 'true') !== 'false'

  const storedPendingEmail =
    sessionStorage.getItem(PENDING_SIGNUP_EMAIL_KEY) ?? ''

  const [mode, setMode] = useState(
    storedPendingEmail ? 'VERIFY_SIGNUP' : 'LOGIN',
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState(storedPendingEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [feedback, setFeedback] = useState({
    type: '',
    message: '',
  })

  const isSignup = mode === 'SIGNUP'
  const isVerification = mode === 'VERIFY_SIGNUP'
  const applicationUrl = useMemo(() => getApplicationUrl(), [])

  useEffect(() => {
    const logoutMessage = sessionStorage.getItem(
      'financeiro:logout-message',
    )

    if (!logoutMessage) return

    sessionStorage.removeItem('financeiro:logout-message')
    setFeedback({
      type: 'info',
      message: logoutMessage,
    })
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return undefined

    const timerId = window.setInterval(() => {
      setResendCooldown((current) =>
        current > 0 ? current - 1 : 0,
      )
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [resendCooldown])

  const submitLabel = useMemo(() => {
    if (loading) {
      return isSignup ? 'Criando conta...' : 'Entrando...'
    }

    return isSignup ? 'Criar minha conta' : 'Entrar'
  }, [isSignup, loading])

  function changeMode(nextMode) {
    setMode(nextMode)
    setFeedback({ type: '', message: '' })
    setPassword('')
    setConfirmPassword('')
    setVerificationCode('')
  }

  function openVerification(emailAddress) {
    const normalizedEmail = emailAddress.trim().toLowerCase()

    sessionStorage.setItem(
      PENDING_SIGNUP_EMAIL_KEY,
      normalizedEmail,
    )
    setEmail(normalizedEmail)
    setVerificationCode('')
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    setMode('VERIFY_SIGNUP')
  }

  function closeVerification(nextMode = 'LOGIN') {
    sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY)
    setVerificationCode('')
    setResendCooldown(0)
    setMode(nextMode)
    setFeedback({ type: '', message: '' })
  }

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setFeedback({ type: '', message: '' })

    const normalizedEmail = email.trim().toLowerCase()

    try {
      if (isSignup) {
        if (name.trim().length < 2) {
          throw new Error('Informe seu nome.')
        }

        if (password.length < 8) {
          throw new Error(
            'A senha precisa ter pelo menos 8 caracteres.',
          )
        }

        if (password !== confirmPassword) {
          throw new Error('As senhas não conferem.')
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${applicationUrl}/`,
            data: {
              display_name: name.trim(),
              onboarding_source: 'SELF_SERVICE',
            },
          },
        })

        if (error) throw error

        if (isMaskedExistingUser(data)) {
          const duplicateError = new Error(
            'Este e-mail já possui uma conta. Tente entrar ou use a recuperação de senha.',
          )
          duplicateError.code = 'email_exists'
          duplicateError.status = 422
          throw duplicateError
        }

        if (!data?.user && !data?.session) {
          const emptyResponseError = new Error(
            'Não foi possível concluir o cadastro agora. Tente novamente em alguns minutos.',
          )
          emptyResponseError.code = 'empty_signup_response'
          throw emptyResponseError
        }

        if (data?.session) {
          sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY)
          setFeedback({
            type: 'success',
            message:
              'Conta criada. Seu espaço financeiro e suas conexões bancárias serão isolados dos demais usuários.',
          })
          return
        }

        setPassword('')
        setConfirmPassword('')
        openVerification(normalizedEmail)
        setFeedback({
          type: 'success',
          message:
            'Enviamos um código de confirmação para o seu e-mail. Digite-o nesta mesma tela para continuar neste dispositivo.',
        })
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error) throw error
    } catch (error) {
      logAuthError(isSignup ? 'SIGNUP' : 'LOGIN', error)

      const code = String(error?.code ?? '').trim()

      if (!isSignup && code === 'email_not_confirmed') {
        openVerification(normalizedEmail)
        setFeedback({
          type: 'info',
          message:
            'Este e-mail ainda precisa ser confirmado. Digite o código recebido para continuar.',
        })
        return
      }

      setFeedback({
        type: 'error',
        message: getAuthErrorMessage(
          error,
          isSignup
            ? 'Não foi possível criar a conta.'
            : 'Não foi possível entrar.',
        ),
      })
    } finally {
      setLoading(false)
    }
  }

  async function verifySignup(event) {
    event.preventDefault()
    setLoading(true)
    setFeedback({ type: '', message: '' })

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const token = normalizeOtp(verificationCode)

      if (!normalizedEmail) {
        throw new Error(
          'O e-mail pendente de confirmação não foi encontrado.',
        )
      }

      if (token.length < 6) {
        throw new Error(
          'Informe o código de confirmação recebido por e-mail.',
        )
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: 'email',
      })

      if (error) throw error

      sessionStorage.removeItem(PENDING_SIGNUP_EMAIL_KEY)
      setVerificationCode('')

      if (data?.session) {
        setFeedback({
          type: 'success',
          message:
            'E-mail confirmado. Preparando o seu painel financeiro...',
        })
        return
      }

      setMode('LOGIN')
      setFeedback({
        type: 'success',
        message:
          'E-mail confirmado. Entre com a senha cadastrada.',
      })
    } catch (error) {
      logAuthError('VERIFY_SIGNUP', error)
      setFeedback({
        type: 'error',
        message: getAuthErrorMessage(
          error,
          'Não foi possível confirmar o código.',
        ),
      })
    } finally {
      setLoading(false)
    }
  }

  async function resendSignupCode() {
    if (resending || resendCooldown > 0) return

    setResending(true)
    setFeedback({ type: '', message: '' })

    try {
      const normalizedEmail = email.trim().toLowerCase()

      if (!normalizedEmail) {
        throw new Error(
          'O e-mail pendente de confirmação não foi encontrado.',
        )
      }

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${applicationUrl}/`,
        },
      })

      if (error) throw error

      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setFeedback({
        type: 'success',
        message:
          'Um novo código foi enviado. Use sempre o código mais recente.',
      })
    } catch (error) {
      logAuthError('RESEND_SIGNUP', error)
      setFeedback({
        type: 'error',
        message: getAuthErrorMessage(
          error,
          'Não foi possível reenviar o código.',
        ),
      })
    } finally {
      setResending(false)
    }
  }

  if (isVerification) {
    return (
      <main className="auth-page">
        <section className="auth-card auth-card-multi-user auth-verification-card">
          <div className="brand">
            <div className="brand-icon">F</div>
            <div>
              <span className="auth-step-kicker">
                Confirmação de cadastro
              </span>
              <h1>Digite o código do e-mail</h1>
              <p>
                Você continua na página em que iniciou o cadastro. Abra o e-mail em qualquer dispositivo e informe o código abaixo.
              </p>
            </div>
          </div>

          <div className="auth-verification-email">
            <span>Código enviado para</span>
            <strong>{email}</strong>
          </div>

          <form className="form" onSubmit={verifySignup}>
            <label>
              Código de confirmação
              <input
                className="signup-code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                minLength={6}
                maxLength={8}
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(
                    normalizeOtp(event.target.value),
                  )
                }
                placeholder="000000"
                required
                autoFocus
              />
            </label>

            <Feedback feedback={feedback} />

            <button
              className="primary-button"
              disabled={loading}
            >
              {loading ? 'Confirmando...' : 'Confirmar e continuar'}
            </button>
          </form>

          <div className="auth-verification-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={resendSignupCode}
              disabled={
                resending ||
                resendCooldown > 0 ||
                loading
              }
            >
              {resending
                ? 'Reenviando...'
                : resendCooldown > 0
                  ? `Reenviar em ${resendCooldown}s`
                  : 'Reenviar código'}
            </button>

            <button
              className="text-button auth-text-button"
              type="button"
              onClick={() => closeVerification('SIGNUP')}
              disabled={loading || resending}
            >
              Alterar e-mail ou cadastro
            </button>
          </div>

          <p className="auth-security-note">
            Não é necessário abrir um link de acesso no celular. Apenas copie o código recebido e conclua a confirmação nesta página.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-multi-user">
        <div className="brand">
          <div className="brand-icon">F</div>
          <div>
            <h1>Financeiro Pessoal</h1>
            <p>
              Cada usuário possui seu próprio painel e suas próprias conexões Open Finance.
            </p>
          </div>
        </div>

        {signupEnabled && (
          <div className="auth-tabs" role="tablist" aria-label="Acesso ao sistema">
            <button
              type="button"
              role="tab"
              className={mode === 'LOGIN' ? 'active' : ''}
              aria-selected={mode === 'LOGIN'}
              onClick={() => changeMode('LOGIN')}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              className={mode === 'SIGNUP' ? 'active' : ''}
              aria-selected={mode === 'SIGNUP'}
              onClick={() => changeMode('SIGNUP')}
            >
              Criar conta
            </button>
          </div>
        )}

        <div className="info-callout info-callout-secondary auth-isolation-callout">
          {isSignup
            ? 'Ao criar a conta, você terá um ambiente próprio. Instituições, saldos, cartões, investimentos e sincronizações não são compartilhados com outros usuários.'
            : 'Entre com sua conta para acessar somente os seus dados e as suas autorizações bancárias.'}
        </div>

        <form className="form" onSubmit={submit}>
          {isSignup && (
            <label>
              Nome
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </label>
          )}

          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus={!isSignup}
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={isSignup ? 8 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {isSignup && (
            <label>
              Confirmar senha
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
          )}

          <Feedback feedback={feedback} />

          <button className="primary-button" disabled={loading}>
            {submitLabel}
          </button>
        </form>

        {isSignup && (
          <p className="auth-security-note">
            Depois de criar a conta, você receberá um código por e-mail e concluirá a confirmação nesta mesma tela.
          </p>
        )}
      </section>
    </main>
  )
}
