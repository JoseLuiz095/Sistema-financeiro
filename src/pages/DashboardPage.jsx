import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MotionReveal } from '../components/AppMotion'
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
} from '../utils/format'
import {
  getConnectionDisplayName,
  getInvestmentBalance,
  getInvestmentOriginalAmount,
  getInvestmentProfit,
} from '../utils/openFinance'


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

function getImportedInvestmentTypeLabel(
  type,
  subtype,
) {
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
    INVESTMENT_FUND:
      'Fundo de investimento',
    STOCK_FUND: 'Fundo de ações',
    MULTIMARKET_FUND:
      'Fundo multimercado',
    FIXED_INCOME_FUND:
      'Fundo de renda fixa',
  }

  if (subtypeLabels[subtype]) {
    return subtypeLabels[subtype]
  }

  const typeLabels = {
    FIXED_INCOME: 'Renda fixa',
    MUTUAL_FUND: 'Fundo',
    EQUITY: 'Renda variável',
    ETF: 'ETF',
    SECURITY: 'Previdência',
    COE: 'COE',
    OTHER: 'Outro',
  }

  return (
    typeLabels[type] ??
    subtype ??
    type ??
    'Outro'
  )
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined'
        ? window.matchMedia(
            '(max-width: 760px)',
          ).matches
        : false,
  )

  useEffect(() => {
    const media = window.matchMedia(
      '(max-width: 760px)',
    )
    const update = () =>
      setIsMobile(media.matches)

    update()
    media.addEventListener('change', update)

    return () =>
      media.removeEventListener(
        'change',
        update,
      )
  }, [])

  return isMobile
}

export default function DashboardPage({
  transactions,
  importedInvestmentPositions = [],
}) {
  const isMobile = useMobileViewport()
  const [monthlyRange, setMonthlyRange] = useState(12)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedAllocation, setSelectedAllocation] = useState(0)
  const currentMonth = new Date()
    .toISOString()
    .slice(0, 7)
  const monthStart = `${currentMonth}-01`
  const monthEnd = `${currentMonth}-31`

  const summary = useMemo(
    () => calculateFinancialSummary(
      transactions,
      monthStart,
      monthEnd,
    ),
    [transactions, monthStart, monthEnd],
  )
  const monthly = useMemo(
    () => buildMonthlyFinancialSeries(
      transactions,
      24,
    ),
    [transactions],
  )
  const categories = useMemo(
    () => buildExpenseCategorySeries(
      transactions,
      monthStart,
      monthEnd,
    ),
    [transactions, monthStart, monthEnd],
  )

  const importedPositions = useMemo(
    () =>
      [...importedInvestmentPositions].sort(
        (a, b) =>
          getInvestmentBalance(b) -
          getInvestmentBalance(a),
      ),
    [importedInvestmentPositions],
  )



  const monthlyView = useMemo(() => {
    let runningBalance = 0
    return monthly
      .slice(-monthlyRange)
      .map((item) => {
        runningBalance += Number(item.surplus ?? 0)
        return {
          ...item,
          cumulative: runningBalance,
        }
      })
  }, [monthly, monthlyRange])

  const categoryView = useMemo(
    () => categories.slice(0, isMobile ? 6 : 8),
    [categories, isMobile],
  )

  const selectedCategoryRow = useMemo(
    () => categoryView.find((item) => item.category === selectedCategory) ?? categoryView[0] ?? null,
    [categoryView, selectedCategory],
  )

  const allocation = useMemo(() => {
    const groups = new Map()

    importedPositions.forEach((position) => {
      const label = getImportedInvestmentTypeLabel(
        position.investment_type,
        position.investment_subtype,
      )
      groups.set(
        label,
        (groups.get(label) ?? 0) + getInvestmentBalance(position),
      )
    })

    return Array.from(groups.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [importedPositions])

  const allocationTotal = allocation.reduce(
    (total, item) => total + item.value,
    0,
  )

  const allocationColors = [
    '#1456a0',
    '#16845b',
    '#6f42c1',
    '#c06b24',
    '#2f7896',
    '#9b4d75',
  ]

  const investmentSummary =
    importedPositions.reduce(
      (currentSummary, position) => {
        currentSummary.balance +=
          getInvestmentBalance(position)
        currentSummary.original +=
          getInvestmentOriginalAmount(
            position,
          )
        currentSummary.profit +=
          getInvestmentProfit(position)
        return currentSummary
      },
      {
        balance: 0,
        original: 0,
        profit: 0,
      },
    )

  return (
    <div className="page-stack dashboard-page">
      <section className="summary-grid summary-grid-4">
        <article className="summary-card">
          <span>Receitas do mês</span>
          <strong className="personal-private-value">
            {formatCurrency(
              summary.totalIncome,
            )}
          </strong>
        </article>

        <article className="summary-card">
          <span>Despesas do mês</span>
          <strong className="personal-private-value">
            {formatCurrency(summary.expenses)}
          </strong>
        </article>

        <article className="summary-card">
          <span>Sobra do mês</span>
          <strong
            className={
              `personal-private-value ` +
              (summary.surplus >= 0
                ? 'positive'
                : 'negative')
            }
          >
            {formatCurrency(summary.surplus)}
          </strong>
        </article>

        <article className="summary-card">
          <span>Taxa de poupança</span>
          <strong className="personal-private-value">
            {formatPercent(
              summary.savingsRate,
            )}
          </strong>
        </article>
      </section>



      <section className="summary-grid summary-grid-4">
        <article className="summary-card">
          <span>Posições via Open Finance</span>
          <strong>
            {importedPositions.length}
          </strong>
        </article>

        <article className="summary-card">
          <span>
            Saldo atual dos investimentos
          </span>
          <strong className="personal-private-value">
            {formatCurrency(
              investmentSummary.balance,
            )}
          </strong>
        </article>

        <article className="summary-card">
          <span>
            Valor originalmente informado
          </span>
          <strong className="personal-private-value">
            {formatCurrency(
              investmentSummary.original,
            )}
          </strong>
        </article>

        <article className="summary-card">
          <span>Resultado informado</span>
          <strong
            className={
              `personal-private-value ` +
              (investmentSummary.profit >= 0
                ? 'positive'
                : 'negative')
            }
          >
            {formatCurrency(
              investmentSummary.profit,
            )}
          </strong>
        </article>
      </section>

      <MotionReveal delay={0.03}>
        <div className="dashboard-visual-grid">
          <section className="panel chart-panel chart-panel-wide interactive-chart-panel">
            <div className="panel-header chart-panel-header">
              <div>
                <h2>Fluxo financeiro e saldo acumulado</h2>
                <p>
                  Interaja com o período e passe o cursor pelos meses para comparar entradas, saídas e evolução do resultado.
                </p>
              </div>

              <div className="chart-range-controls" role="group" aria-label="Período do gráfico">
                {[6, 12, 24].map((range) => (
                  <button
                    key={range}
                    type="button"
                    className={monthlyRange === range ? 'active' : ''}
                    onClick={() => setMonthlyRange(range)}
                  >
                    {range}m
                  </button>
                ))}
              </div>
            </div>

            <div className="chart-container dashboard-chart-container dashboard-chart-large personal-private-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyView}
                  margin={isMobile
                    ? { top: 12, right: 4, left: -24, bottom: 0 }
                    : { top: 12, right: 18, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    minTickGap={18}
                  />
                  <YAxis
                    width={isMobile ? 48 : 64}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    tickFormatter={formatCompactAxis}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    cursor={{ fill: 'rgba(20, 86, 160, 0.05)' }}
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: '#d7e1ec',
                      boxShadow: '0 12px 28px rgba(30, 51, 78, 0.12)',
                    }}
                  />
                  {!isMobile && <Legend />}
                  <Bar
                    dataKey="income"
                    name="Receitas"
                    fill="#2474c6"
                    radius={[5, 5, 0, 0]}
                    animationDuration={600}
                  />
                  <Bar
                    dataKey="investmentIncome"
                    name="Rendimentos"
                    fill="#6f42c1"
                    radius={[5, 5, 0, 0]}
                    animationDuration={650}
                  />
                  <Bar
                    dataKey="expenses"
                    name="Despesas"
                    fill="#c84040"
                    radius={[5, 5, 0, 0]}
                    animationDuration={700}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Saldo acumulado"
                    stroke="#16845b"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                    animationDuration={850}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel chart-panel interactive-chart-panel">
            <div className="panel-header">
              <h2>Despesas por categoria</h2>
              <p>Toque ou passe o cursor sobre as barras para destacar um grupo.</p>
            </div>

            <div className="chart-container dashboard-chart-container personal-private-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryView}
                  layout="vertical"
                  onMouseMove={(state) => {
                    const row = state?.activePayload?.[0]?.payload
                    if (row?.category) setSelectedCategory(row.category)
                  }}
                  onClick={(state) => {
                    const row = state?.activePayload?.[0]?.payload
                    if (row?.category) setSelectedCategory(row.category)
                  }}
                  margin={isMobile
                    ? { top: 4, right: 4, left: 0, bottom: 0 }
                    : { top: 4, right: 12, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    tickFormatter={formatCompactAxis}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={isMobile ? 78 : 120}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                  />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar
                    dataKey="value"
                    name="Despesas"
                    fill="#c84040"
                    radius={[0, 7, 7, 0]}
                    animationDuration={700}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {selectedCategoryRow && (
              <div className="chart-selection-summary">
                <span>Categoria em destaque</span>
                <strong>{selectedCategoryRow.category}</strong>
                <em className="personal-private-value">{formatCurrency(selectedCategoryRow.value)}</em>
              </div>
            )}
          </section>

          <section className="panel chart-panel interactive-chart-panel">
            <div className="panel-header">
              <h2>Distribuição dos investimentos</h2>
              <p>Composição atual das posições importadas por tipo de ativo.</p>
            </div>

            {allocation.length === 0 ? (
              <div className="chart-empty-state">
                Nenhuma posição com saldo disponível para montar a distribuição.
              </div>
            ) : (
              <>
                <div className="chart-container dashboard-chart-container personal-private-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocation}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="48%"
                        innerRadius={isMobile ? 54 : 64}
                        outerRadius={isMobile ? 86 : 100}
                        paddingAngle={3}
                        onMouseEnter={(_entry, index) => setSelectedAllocation(index)}
                        animationDuration={750}
                      >
                        {allocation.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={allocationColors[index % allocationColors.length]}
                            opacity={selectedAllocation === index ? 1 : 0.72}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      {!isMobile && <Legend />}
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-selection-summary allocation-selection-summary">
                  <span>Tipo em destaque</span>
                  <strong>{allocation[selectedAllocation]?.name ?? allocation[0]?.name}</strong>
                  <em className="personal-private-value">
                    {formatCurrency(allocation[selectedAllocation]?.value ?? allocation[0]?.value ?? 0)} · {' '}
                    {formatPercent(allocationTotal > 0
                      ? ((allocation[selectedAllocation]?.value ?? allocation[0]?.value ?? 0) / allocationTotal) * 100
                      : 0)}
                  </em>
                </div>
              </>
            )}
          </section>
        </div>
      </MotionReveal>

      <section className="panel responsive-data-panel">
        <div className="panel-header">
          <h2>
            Posições recebidas pelo Open Finance
          </h2>
          <p>
            Retrato atual informado pelas instituições
            conectadas.
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
              {importedPositions.length === 0 ? (
                <tr>
                  <td
                    colSpan="8"
                    className="empty-cell"
                  >
                    Nenhuma posição foi recebida pelas
                    conexões atuais.
                  </td>
                </tr>
              ) : (
                importedPositions.map((position) => {
                  const currentBalance =
                    getInvestmentBalance(position)
                  const originalAmount =
                    getInvestmentOriginalAmount(
                      position,
                    )
                  const profit =
                    getInvestmentProfit(position)
                  const connectionName =
                    position.open_finance_connections
                      ? getConnectionDisplayName(
                          position.open_finance_connections,
                        )
                      : position.institution_name || '-'

                  return (
                    <tr key={position.id}>
                      <td>{connectionName}</td>
                      <td>
                        <strong>
                          {position.investment_code ||
                            position.investment_name ||
                            '-'}
                        </strong>
                        <small>
                          {position.investment_code
                            ? position.investment_name
                            : position.issuer || ''}
                        </small>
                      </td>
                      <td>
                        {getImportedInvestmentTypeLabel(
                          position.investment_type,
                          position.investment_subtype,
                        )}
                      </td>
                      <td><span className="personal-private-value">
                        {position.quantity == null
                          ? '-'
                          : formatNumber(
                              position.quantity,
                            )}
                      </span></td>
                      <td>
                        {position.unit_value == null
                          ? '-'
                          : formatCurrency(
                              position.unit_value,
                              position.currency ||
                                'BRL',
                            )}
                      </td>
                      <td><span className="personal-private-value">
                        {formatCurrency(
                          originalAmount,
                          position.currency || 'BRL',
                        )}
                      </span></td>
                      <td><span className="personal-private-value">
                        {formatCurrency(
                          currentBalance,
                          position.currency || 'BRL',
                        )}
                      </span></td>
                      <td
                        className={
                          `personal-private-value ` +
                          (profit >= 0
                            ? 'positive'
                            : 'negative')
                        }
                      >
                        {formatCurrency(
                          profit,
                          position.currency || 'BRL',
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div
          className="mobile-data-list"
          aria-label="Posições via Open Finance"
        >
          {importedPositions.length === 0 ? (
            <div className="mobile-empty-state">
              Nenhuma posição foi recebida pelas
              conexões atuais.
            </div>
          ) : (
            importedPositions.map((position) => {
              const currentBalance =
                getInvestmentBalance(position)
              const originalAmount =
                getInvestmentOriginalAmount(
                  position,
                )
              const profit =
                getInvestmentProfit(position)
              const connectionName =
                position.open_finance_connections
                  ? getConnectionDisplayName(
                      position.open_finance_connections,
                    )
                  : position.institution_name || '-'

              return (
                <article
                  className="mobile-data-card investment-mobile-card"
                  key={position.id}
                >
                  <div className="mobile-data-card-header">
                    <div>
                      <strong>
                        {position.investment_code ||
                          position.investment_name ||
                          'Investimento'}
                      </strong>
                      <span>{connectionName}</span>
                    </div>

                    <div className="mobile-investment-value">
                      <span>Saldo atual</span>
                      <strong className="personal-private-value">
                        {formatCurrency(
                          currentBalance,
                          position.currency || 'BRL',
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="mobile-data-card-grid investment-mobile-grid">
                    <div>
                      <span>Tipo</span>
                      <strong>
                        {getImportedInvestmentTypeLabel(
                          position.investment_type,
                          position.investment_subtype,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Quantidade</span>
                      <strong className="personal-private-value">
                        {position.quantity == null
                          ? '-'
                          : formatNumber(
                              position.quantity,
                            )}
                      </strong>
                    </div>
                    <div>
                      <span>Valor unitário</span>
                      <strong>
                        {position.unit_value == null
                          ? '-'
                          : formatCurrency(
                              position.unit_value,
                              position.currency ||
                                'BRL',
                            )}
                      </strong>
                    </div>
                    <div>
                      <span>Aplicado</span>
                      <strong className="personal-private-value">
                        {formatCurrency(
                          originalAmount,
                          position.currency || 'BRL',
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Resultado</span>
                      <strong
                        className={
                          `personal-private-value ` +
                          (profit >= 0
                            ? 'positive'
                            : 'negative')
                        }
                      >
                        {formatCurrency(
                          profit,
                          position.currency || 'BRL',
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Referência</span>
                      <strong>
                        {formatDate(
                          position.reference_date,
                        )}
                      </strong>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
