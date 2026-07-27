import { useMemo, useState } from 'react'
import {
  RECURRENCE_TYPES,
  TRANSACTION_TYPES,
  getOccurrenceStatusLabel,
  getRecurrenceTypeLabel,
  getTransactionType,
  getTransactionTypeLabel,
} from '../constants/finance'
import {
  createScheduledTransaction,
  deleteScheduledTransaction,
  refreshScheduledOccurrences,
  settleScheduledOccurrence,
  updateOccurrenceStatus,
  updateScheduledTransaction,
} from '../services/scheduleService'
import { formatCurrency, formatDate, parseBrazilianNumber, today } from '../utils/format'

const initialForm = {
  account_id: '',
  category_id: '',
  title: '',
  description: '',
  counterparty: '',
  transaction_type: 'EXPENSE',
  amount: '',
  recurrence_type: 'MONTHLY',
  recurrence_interval: '1',
  start_date: today(),
  end_date: '',
  auto_post: false,
  reminder_days: '3',
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function recurrenceDescription(schedule) {
  const interval = Number(schedule.recurrence_interval ?? 1)
  const label = getRecurrenceTypeLabel(schedule.recurrence_type)
  if (schedule.recurrence_type === 'ONCE') return label
  if (interval === 1) return label
  return `${label}, a cada ${interval} períodos`
}

export default function FutureTransactionsPage({
  user,
  accounts,
  categories,
  schedules,
  occurrences,
  onChanged,
  setFeedback,
}) {
  const [form, setForm] = useState({ ...initialForm, account_id: accounts[0]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [search, setSearch] = useState('')

  const currentType = getTransactionType(form.transaction_type)
  const availableCategories = categories.filter((category) => {
    if (!currentType?.categoryType) return false
    return category.category_type === currentType.categoryType || category.category_type === 'BOTH'
  })

  const todayValue = today()
  const next30 = addDays(todayValue, 30)

  const projection = useMemo(() => {
    const rows = occurrences.filter((occurrence) => (
      occurrence.due_date >= todayValue
      && occurrence.due_date <= next30
      && ['PENDING', 'OVERDUE'].includes(occurrence.status)
    ))
    const income = rows.reduce((total, row) => total + Math.max(0, Number(row.amount)), 0)
    const expenses = rows.reduce((total, row) => total + Math.abs(Math.min(0, Number(row.amount))), 0)
    const overdue = occurrences.filter((row) => row.status === 'OVERDUE').length
    return {
      income,
      expenses,
      net: income - expenses,
      count: rows.length,
      overdue,
    }
  }, [occurrences, todayValue, next30])

  const filteredOccurrences = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return occurrences.filter((occurrence) => {
      if (statusFilter === 'OPEN' && !['PENDING', 'OVERDUE'].includes(occurrence.status)) return false
      if (statusFilter !== 'ALL' && statusFilter !== 'OPEN' && occurrence.status !== statusFilter) return false
      if (!normalized) return true
      const schedule = occurrence.scheduled_transactions
      return [
        schedule?.title,
        schedule?.description,
        schedule?.counterparty,
        schedule?.financial_accounts?.institution,
        schedule?.categories?.name,
      ].some((value) => String(value ?? '').toLowerCase().includes(normalized))
    })
  }, [occurrences, search, statusFilter])

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const transactionType = getTransactionType(form.transaction_type)
      const absolute = Math.abs(parseBrazilianNumber(form.amount))
      if (!form.account_id) throw new Error('Selecione uma conta.')
      if (!form.title.trim()) throw new Error('Informe um título.')
      if (!form.description.trim()) throw new Error('Informe uma descrição.')
      if (!Number.isFinite(absolute) || absolute <= 0) throw new Error('Informe um valor válido.')

      const startDate = new Date(`${form.start_date}T12:00:00`)
      const signedAmount = absolute * (transactionType?.direction ?? 1)

      await createScheduledTransaction({
        user_id: user.id,
        account_id: form.account_id,
        category_id: form.category_id || null,
        title: form.title.trim(),
        description: form.description.trim(),
        counterparty: form.counterparty.trim() || null,
        transaction_type: form.transaction_type,
        amount: signedAmount,
        recurrence_type: form.recurrence_type,
        recurrence_interval: Number(form.recurrence_interval || 1),
        start_date: form.start_date,
        end_date: form.end_date || null,
        day_of_month: form.recurrence_type === 'MONTHLY' ? startDate.getDate() : null,
        weekday: form.recurrence_type === 'WEEKLY' ? startDate.getDay() : null,
        auto_post: form.auto_post,
        reminder_days: Number(form.reminder_days || 0),
        active: true,
      })

      await refreshScheduledOccurrences(730)
      setForm({ ...initialForm, account_id: form.account_id })
      setFeedback({ type: 'success', message: 'Lançamento futuro cadastrado e ocorrências geradas.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function settle(occurrence) {
    const paymentDate = window.prompt('Data efetiva do pagamento/recebimento (AAAA-MM-DD):', todayValue)
    if (!paymentDate) return
    try {
      await settleScheduledOccurrence(occurrence.id, paymentDate)
      setFeedback({ type: 'success', message: 'Ocorrência confirmada e lançamento real criado.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function skip(occurrence) {
    if (!window.confirm('Ignorar esta ocorrência sem criar lançamento real?')) return
    try {
      await updateOccurrenceStatus(occurrence.id, 'SKIPPED')
      setFeedback({ type: 'success', message: 'Ocorrência ignorada.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function toggleSchedule(schedule) {
    try {
      await updateScheduledTransaction(schedule.id, { active: !schedule.active })
      setFeedback({ type: 'success', message: schedule.active ? 'Agendamento pausado.' : 'Agendamento reativado.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function removeSchedule(schedule) {
    if (!window.confirm(`Excluir o agendamento "${schedule.title}" e suas ocorrências pendentes?`)) return
    try {
      await deleteScheduledTransaction(schedule.id)
      setFeedback({ type: 'success', message: 'Agendamento excluído.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  return (
    <div className="page-stack">
      <section className="summary-grid summary-grid-4">
        <article className="summary-card"><span>Receitas previstas — 30 dias</span><strong>{formatCurrency(projection.income)}</strong></article>
        <article className="summary-card"><span>Despesas previstas — 30 dias</span><strong>{formatCurrency(projection.expenses)}</strong></article>
        <article className="summary-card"><span>Resultado projetado</span><strong className={projection.net >= 0 ? 'positive' : 'negative'}>{formatCurrency(projection.net)}</strong></article>
        <article className="summary-card"><span>Ocorrências atrasadas</span><strong className={projection.overdue > 0 ? 'negative' : 'positive'}>{projection.overdue}</strong></article>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Novo lançamento futuro</h2>
            <p>Cadastre salário, aluguel, fatura, assinatura, aporte e outros compromissos recorrentes.</p>
          </div>

          <form className="form" onSubmit={submit}>
            <label>Conta
              <select value={form.account_id} onChange={(event) => setForm({ ...form, account_id: event.target.value })} required>
                <option value="">Selecione</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.institution} - {account.account_name}</option>)}
              </select>
            </label>

            <div className="two-columns">
              <label>Título
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Salário mensal" required />
              </label>
              <label>Pessoa ou empresa
                <input value={form.counterparty} onChange={(event) => setForm({ ...form, counterparty: event.target.value })} placeholder="Opcional" />
              </label>
            </div>

            <label>Descrição
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descrição do lançamento" required />
            </label>

            <div className="two-columns">
              <label>Tipo
                <select value={form.transaction_type} onChange={(event) => setForm({ ...form, transaction_type: event.target.value, category_id: '' })}>
                  {TRANSACTION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>Categoria
                <select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} disabled={!currentType?.categoryType}>
                  <option value="">Sem categoria</option>
                  {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            </div>

            <div className="two-columns">
              <label>Valor
                <input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0,00" required />
              </label>
              <label>Recorrência
                <select value={form.recurrence_type} onChange={(event) => setForm({ ...form, recurrence_type: event.target.value })}>
                  {RECURRENCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </div>

            <div className="three-columns">
              <label>Intervalo
                <input type="number" min="1" max="120" value={form.recurrence_interval} onChange={(event) => setForm({ ...form, recurrence_interval: event.target.value })} />
              </label>
              <label>Primeiro vencimento
                <input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} required />
              </label>
              <label>Data final
                <input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
              </label>
            </div>

            <div className="two-columns">
              <label>Dias de antecedência
                <input type="number" min="0" max="365" value={form.reminder_days} onChange={(event) => setForm({ ...form, reminder_days: event.target.value })} />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.auto_post} onChange={(event) => setForm({ ...form, auto_post: event.target.checked })} />
                <span>Lançar automaticamente na data</span>
              </label>
            </div>

            <div className="info-callout">
              Com lançamento automático, o Cron do Supabase cria a movimentação real quando a data chega. Sem essa opção, o valor aparece apenas como previsão até você confirmar.
            </div>

            <button className="primary-button" disabled={saving || accounts.length === 0}>{saving ? 'Salvando...' : 'Cadastrar previsão'}</button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Agendamentos ativos</h2>
            <p>{schedules.length} regras cadastradas.</p>
          </div>
          <div className="schedule-list">
            {schedules.length === 0 ? <div className="empty-state">Nenhum agendamento cadastrado.</div> : schedules.map((schedule) => (
              <article className="schedule-card" key={schedule.id}>
                <div className="schedule-card-main">
                  <div>
                    <div className="schedule-title-row">
                      <strong>{schedule.title}</strong>
                      <span className={`status-badge ${schedule.active ? 'active' : 'disabled'}`}>{schedule.active ? 'Ativo' : 'Pausado'}</span>
                      {schedule.auto_post && <span className="status-badge automated">Automático</span>}
                    </div>
                    <p>{schedule.description}</p>
                    <small>{schedule.financial_accounts?.institution} · {recurrenceDescription(schedule)} · início em {formatDate(schedule.start_date)}</small>
                  </div>
                  <strong className={Number(schedule.amount) >= 0 ? 'positive' : 'negative'}>{formatCurrency(schedule.amount)}</strong>
                </div>
                <div className="inline-actions">
                  <button type="button" className="secondary-button compact-button" onClick={() => toggleSchedule(schedule)}>{schedule.active ? 'Pausar' : 'Ativar'}</button>
                  <button type="button" className="danger-link" onClick={() => removeSchedule(schedule)}>Excluir</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header table-toolbar">
          <div>
            <h2>Calendário financeiro</h2>
            <p>Confirme os lançamentos realizados ou ignore ocorrências excepcionais.</p>
          </div>
          <div className="toolbar-fields">
            <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar..." />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="OPEN">Pendentes e atrasados</option>
              <option value="PENDING">Pendentes</option>
              <option value="OVERDUE">Atrasados</option>
              <option value="PAID">Realizados</option>
              <option value="SKIPPED">Ignorados</option>
              <option value="ALL">Todos</option>
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead><tr><th>Vencimento</th><th>Conta</th><th>Descrição</th><th>Tipo</th><th>Status</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {filteredOccurrences.length === 0 ? <tr><td colSpan="7" className="empty-cell">Nenhuma ocorrência encontrada.</td></tr> : filteredOccurrences.map((occurrence) => {
                const schedule = occurrence.scheduled_transactions
                const isOpen = ['PENDING', 'OVERDUE'].includes(occurrence.status)
                return (
                  <tr key={occurrence.id}>
                    <td>{formatDate(occurrence.due_date)}</td>
                    <td>{schedule?.financial_accounts?.institution}<small>{schedule?.financial_accounts?.account_name}</small></td>
                    <td>{schedule?.title}<small>{schedule?.description}</small></td>
                    <td>{getTransactionTypeLabel(schedule?.transaction_type)}</td>
                    <td><span className={`status-badge status-${String(occurrence.status).toLowerCase()}`}>{getOccurrenceStatusLabel(occurrence.status)}</span></td>
                    <td className={Number(occurrence.amount) >= 0 ? 'positive' : 'negative'}>{formatCurrency(occurrence.amount)}</td>
                    <td>
                      {isOpen && (
                        <div className="inline-actions no-wrap">
                          <button type="button" className="primary-link" onClick={() => settle(occurrence)}>Confirmar</button>
                          <button type="button" className="danger-link" onClick={() => skip(occurrence)}>Ignorar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
