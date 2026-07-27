import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Feedback from '../components/Feedback'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', message: '' })

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setFeedback({ type: '', message: '' })

    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) {
          setMode('login')
          setFeedback({
            type: 'success',
            message: 'Cadastro realizado. Confirme o e-mail antes de entrar.',
          })
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (error) throw error
      }
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
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
            <p>Gastos, patrimônio e investimentos em um único local.</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">
            Entrar
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">
            Criar conta
          </button>
        </div>

        <form className="form" onSubmit={submit}>
          <label>
            E-mail
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Senha
            <input type="password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <Feedback feedback={feedback} />
          <button className="primary-button" disabled={loading}>
            {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
