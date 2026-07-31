import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import AppIcon from '../components/AppIcon'
import { buildInvestmentInsights } from '../utils/investmentInsights'
import {
  formatCurrency,
  formatDate,
} from '../utils/format'
import {
  getInvestmentBalance,
  getInvestmentOriginalAmount,
  getInvestmentProfit,
} from '../utils/openFinance'

const RANGE_OPTIONS = [
  { value: 12, label: '12 meses' },
  { value: 24, label: '2 anos' },
  { value: 60, label: '5 anos' },
  { value: 0, label: 'Todo período' },
]

const EVENT_LABELS = {
  CONTRIBUTION: 'Aporte',
  REDEMPTION: 'Resgate',
  INCOME: 'Rendimento',
}

function formatCompact(value) {
  const number = Number(value ?? 0)
  if (Math.abs(number) >= 1000000) {
    return `${(number / 1000000).toFixed(1)} mi`
  }
  if (Math.abs(number) >= 1000) {
    return `${(number / 1000).toFixed(0)} mil`
  }
  return String(Math.round(number))
}

export default function InvestmentInsightsPage({
  transactions,
  importedPositions = [],
}) {
  const [range, setRange] = useState(60)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const pageSize = 40

  const insights = useMemo(
    () => buildInvestmentInsights(transactions),
    [transactions],
  )

  const monthlyView = useMemo(
    () =>
      range > 0
        ? insights.monthly.slice(-range)
        : insights.monthly,
    [insights.monthly, range],
  )

  const filteredMovements = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return insights.movements

    return insights.movements.filter((movement) =>
      [
        movement.description,
        movement.asset?.code,
        movement.asset?.name,
        EVENT_LABELS[movement.event],
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalized),
        ),
    )
  }, [insights.movements, search])

  const pageCount = Math.max(
    1,
    Math.ceil(filteredMovements.length / pageSize),
  )
  const visibleMovements = filteredMovements.slice(
    (page - 1) * pageSize,
    page * pageSize,
  )

  const openFinanceSummary = useMemo(
    () =>
      importedPositions.reduce(
        (summary, position) => {
          summary.balance += getInvestmentBalance(position)
          summary.original += getInvestmentOriginalAmount(position)
          summary.profit += getInvestmentProfit(position)
          return summary
        },
        { balance: 0, original: 0, profit: 0 },
      ),
    [importedPositions],
  )

  const topAssets = insights.assets
    .filter((item) => item.estimatedBalance > 0)
    .slice(0, 10)

  return (
    <div className="page-stack investment-insights-page">
      <section className="investment-insights-hero panel-heading-surface">
        <div className="section-icon" aria-hidden="true">
          <AppIcon name="trend" size={24} />
        </div>
        <div>
          <span className="eyebrow">Investimentos consolidados</span>
          <h2>Aportes, resgates e rendimentos do extrato</h2>
          <p>
            Esta visão usa as movimentações identificadas no extrato. Quando
            houver Open Finance, as posições atuais aparecem separadamente.
          </p>
        </div>
      </section>

      {insights.summary.movementCount === 0 &&
      importedPositions.length === 0 ? (
        <section className="panel empty-analysis-state">
          <AppIcon name="upload" size={30} />
          <h2>Nenhum investimento identificado</h2>
          <p>
            Importe um extrato com aportes, resgates ou rendimentos. Em CSV,
            mantenha descrições como “APORTE PETR4”, “DIVIDENDO PETR4” ou
            “RENDIMENTO CDB”.
          </p>
        </section>
      ) : (
        <>
          <section className="summary-grid investment-summary-grid">
            <article className="summary-card">
              <span>Total aportado</span>
              <strong>{formatCurrency(insights.summary.contributions)}</strong>
            </article>
            <article className="summary-card">
              <span>Total resgatado</span>
              <strong>{formatCurrency(insights.summary.redemptions)}</strong>
            </article>
            <article className="summary-card">
              <span>Rendimentos recebidos</span>
              <strong className="positive">
                {formatCurrency(insights.summary.income)}
              </strong>
            </article>
            <article className="summary-card">
              <span>Aporte líquido estimado</span>
              <strong>
                {formatCurrency(insights.summary.netContributed)}
              </strong>
            </article>
            <article className="summary-card">
              <span>Movimentações identificadas</span>
              <strong>
                {insights.summary.movementCount.toLocaleString('pt-BR')}
              </strong>
            </article>
          </section>

          <div className="info-callout investment-estimate-note">
            O extrato bancário informa fluxo de dinheiro, mas normalmente não
            contém quantidade, preço médio e cotação atual. Por isso, “aporte
            líquido estimado” não representa valor de mercado ou rentabilidade.
          </div>

          <section className="panel chart-panel chart-panel-wide">
            <div className="panel-header chart-panel-header">
              <div>
                <h2>Evolução dos investimentos</h2>
                <p>
                  Compare aportes, resgates e rendimentos ao longo do tempo.
                </p>
              </div>
              <div className="chart-range-controls" role="group">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={range === option.value ? 'active' : ''}
                    onClick={() => setRange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="chart-container investment-flow-chart mobile-portrait-chart personal-private-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyView}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" minTickGap={24} />
                  <YAxis tickFormatter={formatCompact} width={64} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar
                    dataKey="contributions"
                    name="Aportes"
                    fill="#2474c6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="redemptions"
                    name="Resgates"
                    fill="#c06b24"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="income"
                    name="Rendimentos"
                    fill="#16845b"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="netFlow"
                    name="Aporte líquido"
                    stroke="#6f42c1"
                    strokeWidth={3}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="dashboard-visual-grid investment-visual-grid">
            <section className="panel chart-panel">
              <div className="panel-header">
                <h2>Distribuição aproximada por ativo</h2>
                <p>
                  Soma de aportes menos resgates encontrados no extrato.
                </p>
              </div>
              {topAssets.length === 0 ? (
                <div className="chart-empty-state">
                  Não foi possível identificar o ativo das movimentações.
                </div>
              ) : (
                <div className="chart-container investment-allocation-chart mobile-portrait-chart personal-private-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topAssets}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatCompact} />
                      <YAxis
                        type="category"
                        dataKey="code"
                        width={92}
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(value)}
                      />
                      <Bar
                        dataKey="estimatedBalance"
                        name="Aporte líquido"
                        fill="#2474c6"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="panel investment-annual-panel">
              <div className="panel-header">
                <h2>Resumo anual</h2>
                <p>Leitura rápida dos cinco anos importados.</p>
              </div>
              <div className="investment-year-list">
                {insights.annual.map((year) => (
                  <article key={year.year}>
                    <strong>{year.year}</strong>
                    <span>
                      Aportes {formatCurrency(year.contributions)}
                    </span>
                    <span>
                      Resgates {formatCurrency(year.redemptions)}
                    </span>
                    <span className="positive">
                      Rendimentos {formatCurrency(year.income)}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          </div>

          {importedPositions.length > 0 && (
            <section className="panel open-finance-investment-summary">
              <div className="panel-header">
                <span className="eyebrow">Open Finance</span>
                <h2>Posição atual informada pelas instituições</h2>
                <p>
                  Este bloco representa saldo e posição atuais, diferente do
                  histórico de fluxos do extrato.
                </p>
              </div>
              <div className="summary-grid summary-grid-4">
                <article className="summary-card">
                  <span>Posições</span>
                  <strong>{importedPositions.length}</strong>
                </article>
                <article className="summary-card">
                  <span>Saldo atual</span>
                  <strong>{formatCurrency(openFinanceSummary.balance)}</strong>
                </article>
                <article className="summary-card">
                  <span>Valor aplicado</span>
                  <strong>{formatCurrency(openFinanceSummary.original)}</strong>
                </article>
                <article className="summary-card">
                  <span>Resultado informado</span>
                  <strong className={openFinanceSummary.profit >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(openFinanceSummary.profit)}
                  </strong>
                </article>
              </div>
            </section>
          )}

          <section className="panel investment-movements-panel">
            <div className="panel-header row-between">
              <div>
                <h2>Movimentações de investimento</h2>
                <p>
                  Consulte os registros importados sem carregar milhares de
                  linhas ao mesmo tempo.
                </p>
              </div>
              <label className="investment-search-field">
                Buscar
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Ativo ou descrição"
                />
              </label>
            </div>

            <div className="table-wrapper desktop-data-table">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Ativo</th>
                    <th>Movimento</th>
                    <th>Descrição</th>
                    <th>Conta</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDate(movement.date)}</td>
                      <td>
                        <strong>{movement.asset.code}</strong>
                        <small>{movement.asset.name}</small>
                      </td>
                      <td>
                        <span className={`badge investment-event-${movement.event.toLowerCase()}`}>
                          {EVENT_LABELS[movement.event]}
                        </span>
                      </td>
                      <td>{movement.description}</td>
                      <td>
                        {movement.account
                          ? `${movement.account.institution} - ${movement.account.account_name}`
                          : '-'}
                      </td>
                      <td className={movement.event === 'CONTRIBUTION' ? 'negative' : 'positive'}>
                        {formatCurrency(movement.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-data-cards investment-mobile-movements">
              {visibleMovements.map((movement) => (
                <article className="mobile-data-card" key={`mobile-${movement.id}`}>
                  <div className="mobile-data-card-head">
                    <div>
                      <strong>{movement.asset.code}</strong>
                      <span>{formatDate(movement.date)}</span>
                    </div>
                    <strong className={movement.event === 'CONTRIBUTION' ? 'negative' : 'positive'}>
                      {formatCurrency(movement.amount)}
                    </strong>
                  </div>
                  <p>{movement.description}</p>
                  <span className={`badge investment-event-${movement.event.toLowerCase()}`}>
                    {EVENT_LABELS[movement.event]}
                  </span>
                </article>
              ))}
            </div>

            <div className="import-pagination">
              <button
                type="button"
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </button>
              <span>Página {page} de {pageCount}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Próxima
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
