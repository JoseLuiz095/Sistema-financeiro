import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getOccurrenceStatusLabel, getTransactionTypeLabel } from '../constants/finance'
import {
  buildExpenseCategorySeries,
  buildMonthlyFinancialSeries,
  calculateFinancialSummary,
} from '../utils/financeSelectors'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  today,
} from '../utils/format'
import {
  getConnectionDisplayName,
  getInvestmentBalance,
  getInvestmentOriginalAmount,
  getInvestmentProfit,
} from '../utils/openFinance'

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatCompactAxis(value) {
  const amount = Number(value ?? 0)

  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(1)} mi`
  }

  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(0)} mil`
  }

  return String(Math.round(amount))
}

function getImportedInvestmentTypeLabel(type, subtype) {
  const subtypeLabels = {
    STOCK: 'Ação',
    BDR: 'BDR',
    REAL_ESTATE_FUND: 'FII',
    ETF: 'ETF',
    CDB: 'CDB',
    LCI: 'LCI',
    LCA: 'LCA',
    TREASURY: 'Tesouro Direto',
    DEBENTURES: 'Debênture',
    RETIREMENT: 'Previdência',
    PGBL: 'PGBL',
    VGBL: 'VGBL',
    INVESTMENT_FUND: 'Fundo de investimento',
    STOCK_FUND: 'Fundo de ações',
    MULTIMARKET_FUND: 'Fundo multimercado',
    FIXED_INCOME_FUND: 'Fundo de renda fixa',
  }

  if (subtypeLabels[subtype]) return subtypeLabels[subtype]

  const typeLabels = {
    FIXED_INCOME: 'Renda fixa',
    MUTUAL_FUND: 'Fundo',
    EQUITY: 'Renda variável',
    ETF: 'ETF',
    SECURITY: 'Previdência',
    COE: 'COE',
    OTHER: 'Outro',
  }

  return typeLabels[type] ?? subtype ?? type ?? 'Outro'
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 760px)').matches
      : false
  ))

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobile(media.matches)

    update()
    media.addEventListener('change', update)

    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
}

export default function DashboardPage({
  transactions,
  investmentResult,
  importedInvestmentPositions = [],
  scheduledOccurrences = [],
}) {
  const isMobile = useMobileViewport()
  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthStart = `${currentMonth}-01`
  const monthEnd = `${currentMonth}-31`
  const summary = calculateFinancialSummary(transactions, monthStart, monthEnd)
  const monthly = buildMonthlyFinancialSeries(transactions)
  const categories = buildExpenseCategorySeries(transactions, monthStart, monthEnd)
  const investment = investmentResult.summary

  const manualActivePositions = useMemo(
    () => investmentResult.positions
      .filter((position) => Number(position.quantity ?? 0) > 0)
      .sort((a, b) => b.marketValue - a.marketValue),
    [investmentResult],
  )

  const importedPositions = useMemo(
    () => [...importedInvestmentPositions]
      .sort((a, b) => getInvestmentBalance(b) - getInvestmentBalance(a)),
    [importedInvestmentPositions],
  )

  const todayValue = today()
  const next30 = addDays(todayValue, 30)
  const upcoming = scheduledOccurrences
    .filter((item) => ['PENDING', 'OVERDUE'].includes(item.status))
    .filter((item) => item.due_date <= next30)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))

  const plannedIncome = upcoming.reduce(
    (total, item) => total + Math.max(0, Number(item.amount)),
    0,
  )
  const plannedExpenses = upcoming.reduce(
    (total, item) => total + Math.abs(Math.min(0, Number(item.amount))),
    0,
  )
  const plannedNet = plannedIncome - plannedExpenses
  const overdueCount = scheduledOccurrences.filter((item) => item.status === 'OVERDUE').length

  const importedInvestmentSummary = importedPositions.reduce(
    (currentSummary, position) => {
      currentSummary.balance += getInvestmentBalance(position)
      currentSummary.original += getInvestmentOriginalAmount(position)
      currentSummary.profit += getInvestmentProfit(position)
      return currentSummary
    },
    { balance: 0, original: 0, profit: 0 },
  )

  const hasImportedPositions = importedPositions.length > 0

  return (
    <div className="page-stack dashboard-page">
      <section className="summary-grid summary-grid-4">
        <article className="summary-card"><span>Receitas do mês</span><strong>{formatCurrency(summary.totalIncome)}</strong></article>
        <article className="summary-card"><span>Despesas do mês</span><strong>{formatCurrency(summary.expenses)}</strong></article>
        <article className="summary-card"><span>Sobra do mês</span><strong className={summary.surplus >= 0 ? 'positive' : 'negative'}>{formatCurrency(summary.surplus)}</strong></article>
        <article className="summary-card"><span>Taxa de poupança</span><strong>{formatPercent(summary.savingsRate)}</strong></article>
      </section>

      <section className="summary-grid summary-grid-4">
        <article className="summary-card"><span>Receitas previstas — 30 dias</span><strong>{formatCurrency(plannedIncome)}</strong></article>
        <article className="summary-card"><span>Compromissos — 30 dias</span><strong>{formatCurrency(plannedExpenses)}</strong></article>
        <article className="summary-card"><span>Resultado futuro</span><strong className={plannedNet >= 0 ? 'positive' : 'negative'}>{formatCurrency(plannedNet)}</strong></article>
        <article className="summary-card"><span>Lançamentos atrasados</span><strong className={overdueCount > 0 ? 'negative' : 'positive'}>{overdueCount}</strong></article>
      </section>

      {hasImportedPositions ? (
        <section className="summary-grid summary-grid-4">
          <article className="summary-card">
            <span>Posições via Open Finance</span>
            <strong>{importedPositions.length}</strong>
          </article>
          <article className="summary-card">
            <span>Saldo atual dos investimentos</span>
            <strong>{formatCurrency(importedInvestmentSummary.balance)}</strong>
          </article>
          <article className="summary-card">
            <span>Valor originalmente aplicado</span>
            <strong>{formatCurrency(importedInvestmentSummary.original)}</strong>
          </article>
          <article className="summary-card">
            <span>Resultado informado</span>
            <strong className={importedInvestmentSummary.profit >= 0 ? 'positive' : 'negative'}>
              {formatCurrency(importedInvestmentSummary.profit)}
            </strong>
          </article>
        </section>
      ) : (
        <section className="summary-grid summary-grid-4">
          <article className="summary-card"><span>Custo atual da carteira manual</span><strong>{formatCurrency(investment.costBasis)}</strong></article>
          <article className="summary-card"><span>Valor de mercado manual</span><strong>{formatCurrency(investment.marketValue)}</strong></article>
          <article className="summary-card"><span>Resultado não realizado</span><strong className={investment.unrealized >= 0 ? 'positive' : 'negative'}>{formatCurrency(investment.unrealized)}</strong></article>
          <article className="summary-card"><span>Retorno total manual</span><strong className={investment.totalReturn >= 0 ? 'positive' : 'negative'}>{formatCurrency(investment.totalReturn)}</strong></article>
        </section>
      )}

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-header"><h2>Receitas, despesas e sobra</h2><p>Comparação mensal, incluindo proventos.</p></div>
          <div className="chart-container dashboard-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthly}
                margin={isMobile
                  ? { top: 8, right: 4, left: -24, bottom: 0 }
                  : { top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: isMobile ? 10 : 12 }} />
                <YAxis
                  width={isMobile ? 48 : 60}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickFormatter={isMobile ? formatCompactAxis : undefined}
                />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                {!isMobile && <Legend />}
                <Bar dataKey="income" name="Receitas" fill="#2474c6" />
                <Bar dataKey="investmentIncome" name="Proventos" fill="#6f42c1" />
                <Bar dataKey="expenses" name="Despesas" fill="#c84040" />
                <Bar dataKey="surplus" name="Sobra" fill="#16845b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel chart-panel">
          <div className="panel-header"><h2>Despesas por categoria</h2><p>Principais gastos do mês atual.</p></div>
          <div className="chart-container dashboard-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categories}
                layout="vertical"
                margin={isMobile
                  ? { top: 4, right: 4, left: 0, bottom: 0 }
                  : { top: 4, right: 12, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickFormatter={isMobile ? formatCompactAxis : undefined}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={isMobile ? 78 : 120}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="value" name="Despesas" fill="#c84040" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="panel responsive-data-panel">
        <div className="panel-header"><h2>Próximos lançamentos</h2><p>Previsões pendentes ou atrasadas para os próximos 30 dias.</p></div>

        <div className="table-wrapper desktop-data-table">
          <table>
            <thead><tr><th>Vencimento</th><th>Conta</th><th>Descrição</th><th>Tipo</th><th>Status</th><th>Valor</th></tr></thead>
            <tbody>
              {upcoming.length === 0 ? (
                <tr><td colSpan="6" className="empty-cell">Nenhuma previsão aberta para os próximos 30 dias.</td></tr>
              ) : upcoming.slice(0, 20).map((occurrence) => {
                const schedule = occurrence.scheduled_transactions
                return (
                  <tr key={occurrence.id}>
                    <td>{formatDate(occurrence.due_date)}</td>
                    <td>{schedule?.financial_accounts?.institution}<small>{schedule?.financial_accounts?.account_name}</small></td>
                    <td>{schedule?.title}<small>{schedule?.description}</small></td>
                    <td>{getTransactionTypeLabel(schedule?.transaction_type)}</td>
                    <td><span className={`status-badge status-${String(occurrence.status).toLowerCase()}`}>{getOccurrenceStatusLabel(occurrence.status)}</span></td>
                    <td className={Number(occurrence.amount) >= 0 ? 'positive' : 'negative'}>{formatCurrency(occurrence.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mobile-data-list" aria-label="Próximos lançamentos">
          {upcoming.length === 0 ? (
            <div className="mobile-empty-state">Nenhuma previsão aberta para os próximos 30 dias.</div>
          ) : upcoming.slice(0, 20).map((occurrence) => {
            const schedule = occurrence.scheduled_transactions

            return (
              <article className="mobile-data-card" key={occurrence.id}>
                <div className="mobile-data-card-header">
                  <div>
                    <strong>{schedule?.title || 'Lançamento previsto'}</strong>
                    <span>{schedule?.financial_accounts?.institution || 'Conta não informada'}</span>
                  </div>
                  <strong className={Number(occurrence.amount) >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(occurrence.amount)}
                  </strong>
                </div>
                <div className="mobile-data-card-grid">
                  <div><span>Vencimento</span><strong>{formatDate(occurrence.due_date)}</strong></div>
                  <div><span>Tipo</span><strong>{getTransactionTypeLabel(schedule?.transaction_type)}</strong></div>
                  <div><span>Conta</span><strong>{schedule?.financial_accounts?.account_name || '-'}</strong></div>
                  <div><span>Status</span><strong>{getOccurrenceStatusLabel(occurrence.status)}</strong></div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {hasImportedPositions ? (
        <section className="panel responsive-data-panel">
          <div className="panel-header">
            <h2>Posições via Open Finance</h2>
            <p>
              Retrato atual informado pelas instituições. Não representa o preço médio fiscal calculado por operações manuais.
            </p>
          </div>

          <div className="table-wrapper desktop-data-table">
            <table>
              <thead>
                <tr>
                  <th>Instituição</th>
                  <th>Ativo</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Valor unitário</th>
                  <th>Aplicado</th>
                  <th>Saldo atual</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {importedPositions.map((position) => {
                  const currentBalance = getInvestmentBalance(position)
                  const originalAmount = getInvestmentOriginalAmount(position)
                  const profit = getInvestmentProfit(position)
                  const connectionName = position.open_finance_connections
                    ? getConnectionDisplayName(position.open_finance_connections)
                    : position.institution_name || '-'

                  return (
                    <tr key={position.id}>
                      <td>{connectionName}</td>
                      <td>
                        <strong>{position.investment_code || position.investment_name || '-'}</strong>
                        <small>
                          {position.investment_code
                            ? position.investment_name
                            : position.issuer || ''}
                        </small>
                      </td>
                      <td>{getImportedInvestmentTypeLabel(position.investment_type, position.investment_subtype)}</td>
                      <td>{position.quantity == null ? '-' : formatNumber(position.quantity)}</td>
                      <td>{position.unit_value == null ? '-' : formatCurrency(position.unit_value, position.currency || 'BRL')}</td>
                      <td>{formatCurrency(originalAmount, position.currency || 'BRL')}</td>
                      <td>{formatCurrency(currentBalance, position.currency || 'BRL')}</td>
                      <td className={profit >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(profit, position.currency || 'BRL')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-data-list" aria-label="Posições via Open Finance">
            {importedPositions.map((position) => {
              const currentBalance = getInvestmentBalance(position)
              const originalAmount = getInvestmentOriginalAmount(position)
              const profit = getInvestmentProfit(position)
              const connectionName = position.open_finance_connections
                ? getConnectionDisplayName(position.open_finance_connections)
                : position.institution_name || '-'

              return (
                <article className="mobile-data-card investment-mobile-card" key={position.id}>
                  <div className="mobile-data-card-header">
                    <div>
                      <strong>{position.investment_code || position.investment_name || 'Investimento'}</strong>
                      <span>{connectionName}</span>
                    </div>
                    <div className="mobile-investment-value">
                      <span>Saldo atual</span>
                      <strong>{formatCurrency(currentBalance, position.currency || 'BRL')}</strong>
                    </div>
                  </div>

                  <div className="mobile-data-card-grid investment-mobile-grid">
                    <div>
                      <span>Tipo</span>
                      <strong>{getImportedInvestmentTypeLabel(position.investment_type, position.investment_subtype)}</strong>
                    </div>
                    <div>
                      <span>Quantidade</span>
                      <strong>{position.quantity == null ? '-' : formatNumber(position.quantity)}</strong>
                    </div>
                    <div>
                      <span>Valor unitário</span>
                      <strong>{position.unit_value == null ? '-' : formatCurrency(position.unit_value, position.currency || 'BRL')}</strong>
                    </div>
                    <div>
                      <span>Aplicado</span>
                      <strong>{formatCurrency(originalAmount, position.currency || 'BRL')}</strong>
                    </div>
                    <div>
                      <span>Resultado</span>
                      <strong className={profit >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(profit, position.currency || 'BRL')}
                      </strong>
                    </div>
                    <div>
                      <span>Referência</span>
                      <strong>{formatDate(position.reference_date)}</strong>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : (
        <section className="panel responsive-data-panel">
          <div className="panel-header">
            <h2>Posições calculadas manualmente</h2>
            <p>Preço médio, cotação, valorização e proventos calculados a partir das operações cadastradas.</p>
          </div>

          <div className="table-wrapper desktop-data-table">
            <table>
              <thead><tr><th>Ativo</th><th>Quantidade</th><th>Preço médio</th><th>Cotação</th><th>Custo</th><th>Valor atual</th><th>Não realizado</th><th>Proventos</th><th>Retorno total</th></tr></thead>
              <tbody>
                {manualActivePositions.length === 0 ? (
                  <tr><td colSpan="9" className="empty-cell">Nenhuma posição manual ativa.</td></tr>
                ) : manualActivePositions.map((position) => (
                  <tr key={position.asset.id}>
                    <td><strong>{position.asset.ticker}</strong><small>{position.asset.asset_name}</small></td>
                    <td>{formatNumber(position.quantity)}</td>
                    <td>{formatCurrency(position.averagePrice)}</td>
                    <td>{formatCurrency(position.currentPrice)}</td>
                    <td>{formatCurrency(position.costBasis)}</td>
                    <td>{formatCurrency(position.marketValue)}</td>
                    <td className={position.unrealized >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.unrealized)}<small>{formatPercent(position.unrealizedPercent)}</small></td>
                    <td>{formatCurrency(position.incomeNet)}</td>
                    <td className={position.totalReturn >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.totalReturn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-data-list" aria-label="Posições calculadas manualmente">
            {manualActivePositions.length === 0 ? (
              <div className="mobile-empty-state">Nenhuma posição manual ativa.</div>
            ) : manualActivePositions.map((position) => (
              <article className="mobile-data-card investment-mobile-card" key={position.asset.id}>
                <div className="mobile-data-card-header">
                  <div>
                    <strong>{position.asset.ticker}</strong>
                    <span>{position.asset.asset_name}</span>
                  </div>
                  <div className="mobile-investment-value">
                    <span>Valor atual</span>
                    <strong>{formatCurrency(position.marketValue)}</strong>
                  </div>
                </div>
                <div className="mobile-data-card-grid investment-mobile-grid">
                  <div><span>Quantidade</span><strong>{formatNumber(position.quantity)}</strong></div>
                  <div><span>Preço médio</span><strong>{formatCurrency(position.averagePrice)}</strong></div>
                  <div><span>Cotação</span><strong>{formatCurrency(position.currentPrice)}</strong></div>
                  <div><span>Custo</span><strong>{formatCurrency(position.costBasis)}</strong></div>
                  <div><span>Não realizado</span><strong className={position.unrealized >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.unrealized)}</strong></div>
                  <div><span>Retorno total</span><strong className={position.totalReturn >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.totalReturn)}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}