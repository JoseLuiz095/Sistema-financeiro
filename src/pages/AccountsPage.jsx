import { useState } from 'react'
import { ACCOUNT_TYPES, getAccountTypeLabel } from '../constants/finance'
import { createAccount } from '../services/financeService'
import { formatCurrency, parseBrazilianNumber } from '../utils/format'

const initialForm = {
  institution: '', account_name: '', account_type: 'CHECKING', agency: '', account_number: '', initial_balance: '0',
}

export default function AccountsPage({ user, accounts, onChanged, setFeedback }) {
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await createAccount({
        user_id: user.id,
        institution: form.institution.trim(),
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        agency: form.agency.trim() || null,
        account_number: form.account_number.trim() || null,
        initial_balance: parseBrazilianNumber(form.initial_balance),
        active: true,
      })
      setForm(initialForm)
      setFeedback({ type: 'success', message: 'Conta cadastrada.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-grid">
      <section className="panel">
        <div className="panel-header"><h2>Nova conta</h2><p>Banco, carteira digital, corretora ou dinheiro.</p></div>
        <form className="form" onSubmit={submit}>
          <label>Instituição<input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} required /></label>
          <label>Nome da conta<input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} required /></label>
          <label>Tipo<select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>{ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <div className="two-columns">
            <label>Agência<input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} /></label>
            <label>Conta<input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></label>
          </div>
          <label>Saldo inicial<input value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} /></label>
          <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar conta'}</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Contas cadastradas</h2><p>{accounts.length} conta(s).</p></div>
        <div className="cards-list">
          {accounts.map((account) => (
            <article className="list-card" key={account.id}>
              <div><strong>{account.account_name}</strong><span>{account.institution} · {getAccountTypeLabel(account.account_type)}</span></div>
              <strong>{formatCurrency(account.initial_balance)}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
