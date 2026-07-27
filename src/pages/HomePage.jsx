import { calculateFinancialSummary } from '../utils/financeSelectors'
import { formatCurrency, formatDate, today } from '../utils/format'

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function HomePage({
  accounts,
  transactions,
  investmentResult,
  importedInvestmentPositions = [],
  scheduledOccurrences = [],
  openFinanceConnections = [],
  onNavigate,
}) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthStart = `${currentMonth}-01`
  const monthEnd = `${currentMonth}-31`
  const summary = calculateFinancialSummary(transactions, monthStart, monthEnd)

  const accountBalance = accounts.reduce(
    (total, account) => total + Number(account.initial_balance ?? 0),
    0,
  ) + transactions.reduce((total, item) => total + Number(item.amount ?? 0), 0)

  const importedInvestments = importedInvestmentPositions.reduce(
    (total, position) => total + Number(position.net_balance ?? 0),
    0,
  )

  const calculatedInvestments = Number(investmentResult?.summary?.marketValue ?? 0)
  const todayValue = today()
  const next30Days = addDays(todayValue, 30)
  const upcoming = scheduledOccurrences
    .filter((item) => ['PENDING', 'OVERDUE'].includes(item.status))
    .filter((item) => item.due_date <= next30Days)

  const futureResult = upcoming.reduce(
    (total, item) => total + Number(item.amount ?? 0),
    0,
  )

  const recentTransactions = [...transactions]
    .sort((a, b) => {
      const dateCompare = String(b.transaction_date).localeCompare(String(a.transaction_date))
      if (dateCompare !== 0) return dateCompare
      return String(b.transaction_time ?? '').localeCompare(String(a.transaction_time ?? ''))
    })
    .slice(0, 6)

  const activeConnections = openFinanceConnections.filter(
    (connection) => connection.status === 'ACTIVE',
  ).length

  return (
    <div className="page-stack">
      <section className="home-hero panel">
        <div>
          <span className="eyebrow">Visão rápida</span>
          <h2>Seu financeiro sem complicação</h2>
          <p>
            Atualize os dados por extrato ou Open Finance e use a área de análises
            para investigar gastos, fluxo futuro e patrimônio.
          </p>
        </div>

        <div className="home-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate('data', 'import')}
          >
            Importar extrato
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onNavigate('data', 'openfinance')}
          >
            Atualizar Open Finance
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onNavigate('analytics', 'overview')}
          >
            Abrir análises
          </button>
        </div>
      </section>

      <section className="summary-grid summary-grid-4">
        <article className="summary-card">
          <span>Saldo acompanhado</span>
          <strong>{formatCurrency(accountBalance)}</strong>
          <small>Contas cadastradas e movimentações importadas.</small>
        </article>
        <article className="summary-card">
          <span>Resultado do mês</span>
          <strong className={summary.surplus >= 0 ? 'positive' : 'negative'}>
            {formatCurrency(summary.surplus)}
          </strong>
          <small>Receitas menos despesas operacionais.</small>
        </article>
        <article className="summary-card">
          <span>Investimentos acompanhados</span>
          <strong>{formatCurrency(calculatedInvestments || importedInvestments)}</strong>
          <small>
            {calculatedInvestments > 0
              ? 'Carteira calculada pelas operações.'
              : 'Posições informadas pelo Open Finance.'}
          </small>
        </article>
        <article className="summary-card">
          <span>Projeção de 30 dias</span>
          <strong className={futureResult >= 0 ? 'positive' : 'negative'}>
            {formatCurrency(futureResult)}
          </strong>
          <small>{upcoming.length} compromisso(s) previsto(s).</small>
        </article>
      </section>

      <div className="home-grid">
        <section className="panel">
          <div className="panel-header row-between">
            <div>
              <h2>Movimentações recentes</h2>
              <p>Últimos registros financeiros disponíveis.</p>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => onNavigate('more', 'transactions')}
            >
              Ver todas
            </button>
          </div>

          <div className="compact-list">
            {recentTransactions.length === 0 ? (
              <p className="empty-message">Nenhuma movimentação disponível.</p>
            ) : recentTransactions.map((transaction) => (
              <article className="compact-list-item" key={transaction.id}>
                <div>
                  <strong>{transaction.normalized_description || transaction.original_description}</strong>
                  <span>{formatDate(transaction.transaction_date)}</span>
                </div>
                <strong className={Number(transaction.amount) >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(transaction.amount)}
                </strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Status dos dados</h2>
            <p>Resumo das fontes utilizadas pelo sistema.</p>
          </div>

          <div className="data-status-list">
            <div>
              <span>Contas cadastradas</span>
              <strong>{accounts.length}</strong>
            </div>
            <div>
              <span>Conexões Open Finance ativas</span>
              <strong>{activeConnections}</strong>
            </div>
            <div>
              <span>Movimentações carregadas</span>
              <strong>{transactions.length}</strong>
            </div>
            <div>
              <span>Posições Open Finance</span>
              <strong>{importedInvestmentPositions.length}</strong>
            </div>
          </div>

          <button
            type="button"
            className="secondary-button full-width-button"
            onClick={() => onNavigate('data')}
          >
            Gerenciar fontes de dados
          </button>
        </section>
      </div>
    </div>
  )
}
