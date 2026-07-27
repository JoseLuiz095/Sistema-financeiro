import { useMemo, useState } from 'react'
import { TRANSACTION_TYPES, getTransactionType, getTransactionTypeLabel } from '../constants/finance'
import { createTransaction, deleteTransaction } from '../services/financeService'
import { formatCurrency, formatDate, parseBrazilianNumber, today } from '../utils/format'
import { randomToken } from '../utils/hash'

const initialForm = {
  account_id: '',
  transaction_date: today(),
  transaction_time: '',
  transaction_type: 'EXPENSE',
  category_id: '',
  description: '',
  counterparty: '',
  amount: '',
}

export default function TransactionsPage({ user, accounts, categories, transactions, onChanged, setFeedback }) {
  const [form, setForm] = useState({ ...initialForm, account_id: accounts[0]?.id ?? '' })
  const [filter, setFilter] = useState('')
  const [saving, setSaving] = useState(false)

  const currentType = getTransactionType(form.transaction_type)
  const availableCategories = categories.filter((category) => {
    if (!currentType?.categoryType) return false
    return category.category_type === currentType.categoryType || category.category_type === 'BOTH'
  })

  const filteredTransactions = useMemo(() => {
    const normalized = filter.trim().toLowerCase()
    if (!normalized) return transactions
    return transactions.filter((item) => [
      item.original_description,
      item.counterparty,
      item.financial_accounts?.institution,
      item.categories?.name,
    ].some((value) => String(value ?? '').toLowerCase().includes(normalized)))
  }, [transactions, filter])

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const transactionType = getTransactionType(form.transaction_type)
      const absolute = Math.abs(parseBrazilianNumber(form.amount))
      if (!Number.isFinite(absolute) || absolute <= 0) throw new Error('Informe um valor válido.')
      const amount = absolute * (transactionType?.direction ?? 1)
      await createTransaction({
        user_id: user.id,
        account_id: form.account_id,
        category_id: form.category_id || null,
        transaction_date: form.transaction_date,
        transaction_time: form.transaction_time || null,
        original_description: form.description.trim(),
        normalized_description: form.description.trim(),
        counterparty: form.counterparty.trim() || null,
        transaction_type: form.transaction_type,
        amount,
        record_hash: randomToken('manual-transaction'),
        needs_review: false,
        reviewed: true,
        confidence: 100,
        source_data: { source: 'MANUAL' },
      })
      setForm({ ...initialForm, account_id: form.account_id })
      setFeedback({ type: 'success', message: 'Lançamento cadastrado.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    if (!window.confirm('Excluir este lançamento?')) return
    try {
      await deleteTransaction(id)
      setFeedback({ type: 'success', message: 'Lançamento excluído.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  return (
    <div className="page-stack">
      <div className="content-grid">
        <section className="panel">
          <div className="panel-header"><h2>Novo lançamento</h2><p>Receitas, despesas, transferências, aportes e resgates.</p></div>
          <form className="form" onSubmit={submit}>
            <label>Conta<select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} required><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.institution} - {account.account_name}</option>)}</select></label>
            <div className="two-columns">
              <label>Data<input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} required /></label>
              <label>Hora<input type="time" value={form.transaction_time} onChange={(e) => setForm({ ...form, transaction_time: e.target.value })} /></label>
            </div>
            <label>Tipo<select value={form.transaction_type} onChange={(e) => setForm({ ...form, transaction_type: e.target.value, category_id: '' })}>{TRANSACTION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label>Categoria<select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} disabled={!currentType?.categoryType}><option value="">Sem categoria</option>{availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Descrição<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
            <label>Pessoa ou empresa<input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} /></label>
            <label>Valor<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" required /></label>
            <button className="primary-button" disabled={saving || accounts.length === 0}>{saving ? 'Salvando...' : 'Cadastrar lançamento'}</button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header"><h2>Consulta rápida</h2><p>Pesquise descrição, contraparte, conta ou categoria.</p></div>
          <input className="search-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar lançamentos..." />
          <div className="metric-list">
            <div><span>Registros carregados</span><strong>{transactions.length}</strong></div>
            <div><span>Exibidos no filtro</span><strong>{filteredTransactions.length}</strong></div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header"><h2>Lançamentos</h2></div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Data</th><th>Conta</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {filteredTransactions.length === 0 ? <tr><td colSpan="7" className="empty-cell">Nenhum lançamento.</td></tr> : filteredTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.transaction_date)}</td>
                  <td>{transaction.financial_accounts?.institution}<small>{transaction.financial_accounts?.account_name}</small></td>
                  <td>{getTransactionTypeLabel(transaction.transaction_type)}</td>
                  <td>{transaction.categories?.name ?? '-'}</td>
                  <td>{transaction.original_description}<small>{transaction.counterparty}</small></td>
                  <td className={Number(transaction.amount) >= 0 ? 'positive' : 'negative'}>{formatCurrency(transaction.amount)}</td>
                  <td><button type="button" className="danger-link" onClick={() => remove(transaction.id)}>Excluir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
