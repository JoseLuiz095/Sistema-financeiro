import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Feedback from '../components/Feedback'

export default function AuthPage() {
  const signupEnabled =
    String(import.meta.env.VITE_ALLOW_SIGNUP ?? 'true') !== 'false'

  const [mode, setMode] = useState('LOGIN')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState({
    type: '',
    message: '',
  })

  const isSignup = mode === 'SIGNUP'

  const submitLabel = useMemo(() => {
    if (loading) {
      return isSignup ? 'Criando conta...' : 'Verificando...'
    }

    return isSignup ? 'Criar minha conta' : 'Entrar'
  }, [isSignup, loading])

  function changeMode(nextMode) {
    setMode(nextMode)
    setFeedback({ type: '', message: '' })
    setPassword('')
    setConfirmPassword('')
  }

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setFeedback({ type: '', message: '' })

    try {
      const normalizedEmail = email.trim().toLowerCase()

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
            emailRedirectTo: window.location.origin,
            data: {
              display_name: name.trim(),
              onboarding_source: 'SELF_SERVICE',
            },
          },
        })

        if (error) throw error

        if (data?.session) {
          setFeedback({
            type: 'success',
            message:
              'Conta criada. Seu espaço financeiro e suas conexões bancárias serão isolados dos demais usuários.',
          })
          return
        }

        setFeedback({
          type: 'success',
          message:
            'Conta criada. Confirme o e-mail enviado pelo Supabase e depois entre no sistema.',
        })

        setMode('LOGIN')
        setPassword('')
        setConfirmPassword('')
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error) throw error
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setLoading(false)
    }
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
            Depois de entrar, conecte seus bancos pelo Pluggy Connect dentro do próprio sistema. As credenciais da aplicação permanecem apenas nas Edge Functions.
          </p>
        )}
      </section>
    </main>
  )
}
