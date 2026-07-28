import AppIcon from '../components/AppIcon'
import {
  calculateFinancialSummary,
} from '../utils/financeSelectors'
import {
  formatCurrency,
  formatDate,
} from '../utils/format'
import {
  getInvestmentBalance,
} from '../utils/openFinance'


const SUMMARY_ITEMS = [
  {
    key: 'balance',
    label: 'Saldo acompanhado',
    icon: 'wallet',
    helper:
      'Contas e movimentações importadas.',
  },
  {
    key: 'month',
    label: 'Resultado do mês',
    icon: 'trend',
    helper:
      'Receitas menos despesas operacionais.',
  },
  {
    key: 'investments',
    label: 'Investimentos',
    icon: 'investments',
  },
  {
    key: 'sources',
    label: 'Fontes ativas',
    icon: 'bank',
  },
]

export default function HomePage({
  accounts,
  transactions,
  importedInvestmentPositions = [],
  openFinanceConnections = [],
  onNavigate,
}) {
  const currentMonth = new Date()
    .toISOString()
    .slice(0, 7)
  const monthStart = `${currentMonth}-01`
  const monthEnd = `${currentMonth}-31`

  const summary = calculateFinancialSummary(
    transactions,
    monthStart,
    monthEnd,
  )

  const accountBalance = accounts.reduce(
    (total, account) =>
      total +
      Number(account.initial_balance ?? 0),
    0,
  ) + transactions.reduce(
    (total, item) =>
      total + Number(item.amount ?? 0),
    0,
  )

  const importedInvestments =
    importedInvestmentPositions.reduce(
      (total, position) =>
        total + getInvestmentBalance(position),
      0,
    )



  const recentTransactions = [
    ...transactions,
  ]
    .sort((a, b) => {
      const dateCompare = String(
        b.transaction_date,
      ).localeCompare(
        String(a.transaction_date),
      )

      if (dateCompare !== 0) {
        return dateCompare
      }

      return String(
        b.transaction_time ?? '',
      ).localeCompare(
        String(a.transaction_time ?? ''),
      )
    })
    .slice(0, 6)

  const activeConnections =
    openFinanceConnections.filter(
      (connection) =>
        connection.status === 'ACTIVE',
    ).length

  const summaryValues = {
    balance: {
      value: formatCurrency(accountBalance),
      tone:
        accountBalance >= 0
          ? 'positive'
          : 'negative',
      helper: SUMMARY_ITEMS[0].helper,
    },
    month: {
      value: formatCurrency(summary.surplus),
      tone:
        summary.surplus >= 0
          ? 'positive'
          : 'negative',
      helper: SUMMARY_ITEMS[1].helper,
    },
    investments: {
      value: formatCurrency(
        importedInvestments,
      ),
      tone: '',
      helper:
        'Posições informadas pelo Open Finance.',
    },
    sources: {
      value: String(activeConnections),
      tone: activeConnections > 0 ? 'positive' : '',
      helper:
        'Instituições conectadas ao Open Finance.',
    },
  }

  return (
    <div className="page-stack home-page">
      <section className="home-hero panel">
        <div className="home-hero-copy">
          <div className="hero-badge">
            <AppIcon
              name="shield"
              size={16}
            />
            Atualização segura e integrada
          </div>

          <span className="eyebrow">
            Visão rápida
          </span>
          <h2>
            Seu financeiro organizado em um só lugar
          </h2>
          <p>
            Importe extratos, conecte instituições e
            acompanhe gastos, investimentos e compromissos
            futuros com uma leitura simples no celular ou
            computador.
          </p>
        </div>

        <div className="home-actions">
          <button
            type="button"
            className="primary-button action-button-with-icon"
            onClick={() =>
              onNavigate('data', 'import')
            }
          >
            <AppIcon
              name="upload"
              size={18}
            />
            Importar extrato
          </button>

          <button
            type="button"
            className="secondary-button action-button-with-icon"
            onClick={() =>
              onNavigate(
                'data',
                'openfinance',
              )
            }
          >
            <AppIcon
              name="bank"
              size={18}
            />
            Open Finance
          </button>

          <button
            type="button"
            className="secondary-button action-button-with-icon"
            onClick={() =>
              onNavigate(
                'analytics',
                'overview',
              )
            }
          >
            <AppIcon
              name="analytics"
              size={18}
            />
            Abrir análises
          </button>
        </div>
      </section>

      <section className="summary-grid summary-grid-4 home-summary-grid">
        {SUMMARY_ITEMS.map((item) => {
          const metric =
            summaryValues[item.key]

          return (
            <article
              className={
                `summary-card metric-card ` +
                `metric-${item.key}`
              }
              key={item.key}
            >
              <div className="metric-card-header">
                <div
                  className="metric-icon"
                  aria-hidden="true"
                >
                  <AppIcon
                    name={item.icon}
                    size={20}
                  />
                </div>
                <span>{item.label}</span>
              </div>

              <strong
                className={
                  `${metric.tone} ` +
                  (item.key === 'sources'
                    ? ''
                    : 'personal-private-value')
                }
              >
                {metric.value}
              </strong>
              <small>{metric.helper}</small>
            </article>
          )
        })}
      </section>

      <div className="home-grid">
        <section className="panel recent-panel">
          <div className="panel-header row-between">
            <div>
              <span className="panel-kicker">
                Atividade recente
              </span>
              <h2>Movimentações recentes</h2>
              <p>
                Últimos registros recebidos das fontes de
                dados.
              </p>
            </div>
          </div>

          <div className="compact-list">
            {recentTransactions.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <div className="empty-state-icon">
                  <AppIcon
                    name="transactions"
                    size={22}
                  />
                </div>
                <strong>
                  Nenhuma movimentação disponível
                </strong>
                <span>
                  Importe um extrato ou conecte uma
                  instituição para começar.
                </span>
              </div>
            ) : (
              recentTransactions.map(
                (transaction) => (
                  <article
                    className="compact-list-item"
                    key={transaction.id}
                  >
                    <div className="transaction-main">
                      <span
                        className={
                          `transaction-dot ` +
                          (Number(
                            transaction.amount,
                          ) >= 0
                            ? 'income'
                            : 'expense')
                        }
                      />

                      <div>
                        <strong>
                          {transaction.normalized_description ||
                            transaction.original_description}
                        </strong>
                        <span>
                          {formatDate(
                            transaction.transaction_date,
                          )}
                        </span>
                      </div>
                    </div>

                    <strong
                      className={
                        `transaction-value personal-private-value ` +
                        (Number(
                          transaction.amount,
                        ) >= 0
                          ? 'positive'
                          : 'negative')
                      }
                    >
                      {formatCurrency(
                        transaction.amount,
                      )}
                    </strong>
                  </article>
                ),
              )
            )}
          </div>
        </section>

        <section className="panel data-health-panel">
          <div className="panel-header">
            <span className="panel-kicker">
              Cobertura
            </span>
            <h2>Status dos dados</h2>
            <p>
              Resumo das fontes utilizadas pelo sistema.
            </p>
          </div>

          <div className="data-status-list">
            <div>
              <span>Contas identificadas</span>
              <strong>{accounts.length}</strong>
            </div>
            <div>
              <span>Conexões Open Finance</span>
              <strong>{activeConnections}</strong>
            </div>
            <div>
              <span>Movimentações carregadas</span>
              <strong>{transactions.length}</strong>
            </div>
            <div>
              <span>Posições de investimento</span>
              <strong>
                {importedInvestmentPositions.length}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="secondary-button full-width-button action-button-with-icon"
            onClick={() => onNavigate('data')}
          >
            <AppIcon
              name="data"
              size={18}
            />
            Gerenciar fontes de dados
          </button>
        </section>
      </div>
    </div>
  )
}
