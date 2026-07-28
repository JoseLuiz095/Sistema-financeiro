import {
  useMemo,
  useState,
} from 'react'
import {
  exportTransactionsCsv,
  generateFinancialAnalysisPdf,
} from '../services/financialReportService'
import {
  buildMonthlyFinancialSeries,
  calculateFinancialSummary,
} from '../utils/financeSelectors'
import {
  currentYear,
  formatCurrency,
  formatPercent,
} from '../utils/format'

export default function ReportsPage({
  user,
  transactions,
}) {
  const years = useMemo(() => {
    const values = new Set([
      currentYear(),
    ])

    transactions.forEach((item) => {
      values.add(
        Number(
          String(
            item.transaction_date,
          ).slice(0, 4),
        ),
      )
    })

    return Array.from(values)
      .filter(Boolean)
      .sort((a, b) => b - a)
  }, [transactions])

  const [year, setYear] = useState(
    years[0] ?? currentYear(),
  )

  const start = `${year}-01-01`
  const end = `${year}-12-31`

  const yearTransactions =
    transactions.filter(
      (item) =>
        item.transaction_date >= start &&
        item.transaction_date <= end,
    )

  const financialSummary =
    calculateFinancialSummary(
      yearTransactions,
      start,
      end,
    )

  const monthlySeries =
    buildMonthlyFinancialSeries(
      yearTransactions,
      12,
    )

  function exportPdf() {
    generateFinancialAnalysisPdf({
      year,
      userEmail: user.email,
      financialSummary,
      monthlySeries,
      transactions: yearTransactions,
    })
  }

  return (
    <div className="page-stack">
      <section className="panel report-toolbar">
        <div>
          <h2>
            Relatório financeiro consolidado
          </h2>
          <p>
            Consolida movimentações recebidas por
            extrato e Open Finance, sem depender de
            operações de investimento cadastradas
            manualmente.
          </p>
        </div>

        <label>
          Ano
          <select
            value={year}
            onChange={(event) =>
              setYear(
                Number(event.target.value),
              )
            }
          >
            {years.map((item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            ))}
          </select>
        </label>

        <button
          className="primary-button"
          type="button"
          onClick={exportPdf}
        >
          Gerar PDF
        </button>

        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            exportTransactionsCsv(
              transactions,
              year,
            )
          }
        >
          Exportar CSV
        </button>
      </section>

      <section className="summary-grid summary-grid-4">
        <article className="summary-card">
          <span>Receitas e rendimentos</span>
          <strong className="personal-private-value">
            {formatCurrency(
              financialSummary.totalIncome,
            )}
          </strong>
        </article>

        <article className="summary-card">
          <span>Despesas</span>
          <strong className="personal-private-value">
            {formatCurrency(
              financialSummary.expenses,
            )}
          </strong>
        </article>

        <article className="summary-card">
          <span>Sobra anual</span>
          <strong
            className={
              `personal-private-value ` +
              (financialSummary.surplus >= 0
                ? 'positive'
                : 'negative')
            }
          >
            {formatCurrency(
              financialSummary.surplus,
            )}
          </strong>
        </article>

        <article className="summary-card">
          <span>Taxa de poupança</span>
          <strong className="personal-private-value">
            {formatPercent(
              financialSummary.savingsRate,
            )}
          </strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Escopo do relatório</h2>
          <p>
            O arquivo utiliza somente movimentações
            disponíveis nas fontes conectadas ou
            importadas.
          </p>
        </div>

        <div className="checklist-grid">
          <label>
            <input
              type="checkbox"
              checked
              readOnly
            />
            Extratos bancários importados
          </label>
          <label>
            <input
              type="checkbox"
              checked
              readOnly
            />
            Transações recebidas pelo Open Finance
          </label>
          <label>
            <input
              type="checkbox"
              checked
              readOnly
            />
            Categorias e consolidação mensal
          </label>
          <label>
            <input
              type="checkbox"
              checked
              readOnly
            />
            Rendimentos identificados nas movimentações
          </label>
        </div>
      </section>
    </div>
  )
}
