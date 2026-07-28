import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Feedback from '../components/Feedback'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState({
    type: '',
    message: '',
  })

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setFeedback({ type: '', message: '' })

    try {
      const { error } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
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
      <section className="auth-card">
        <div className="brand">
          <div className="brand-icon">F</div>
          <div>
            <h1>Financeiro Pessoal</h1>
            <p>
              Acesso restrito ao proprietário da conta.
            </p>
          </div>
        </div>

        <div className="info-callout info-callout-secondary">
          O cadastro público está fechado. Usuários
          autorizados são criados diretamente no Supabase.
        </div>

        <form className="form" onSubmit={submit}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
              autoFocus
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
            />
          </label>

          <Feedback feedback={feedback} />

          <button
            className="primary-button"
            disabled={loading}
          >
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
