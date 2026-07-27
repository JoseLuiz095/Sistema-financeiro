import { useMemo, useState } from 'react'
import { exportInvestmentOperationsCsv, exportTransactionsCsv, generateAccountantPdf } from '../services/reportService'
import { buildMonthlyFinancialSeries, calculateFinancialSummary } from '../utils/financeSelectors'
import { calculateInvestmentPositions } from '../utils/investmentCalculator'
import { currentYear, formatCurrency, formatPercent } from '../utils/format'

export default function ReportsPage({
  user,
  transactions,
  assets,
  operations,
  quotes,
  incomes,
}) {
  const years = useMemo(() => {
    const values = new Set([currentYear()])
    transactions.forEach((item) => values.add(Number(String(item.transaction_date).slice(0, 4))))
    operations.forEach((item) => values.add(Number(String(item.operation_date).slice(0, 4))))
    incomes.forEach((item) => values.add(Number(String(item.payment_date).slice(0, 4))))
    return Array.from(values).filter(Boolean).sort((a, b) => b - a)
  }, [transactions, operations, incomes])

  const [year, setYear] = useState(years[0] ?? currentYear())
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  const yearTransactions = transactions.filter((item) => item.transaction_date >= start && item.transaction_date <= end)
  const financialSummary = calculateFinancialSummary(yearTransactions, start, end)
  const monthlySeries = buildMonthlyFinancialSeries(yearTransactions, 12)
  const investmentResult = calculateInvestmentPositions({
    assets,
    operations,
    quotes,
    incomes,
    cutoffDate: end,
  })
  const yearIncomes = incomes.filter((item) => item.payment_date >= start && item.payment_date <= end)
  const yearRealized = investmentResult.realizedEvents.filter((event) => event.date >= start && event.date <= end)

  function exportPdf() {
    generateAccountantPdf({
      year,
      userEmail: user.email,
      financialSummary,
      monthlySeries,
      positions: investmentResult.positions,
      investmentSummary: investmentResult.summary,
      realizedEvents: yearRealized,
      incomes: yearIncomes,
    })
  }

  return (
    <div className="page-stack">
      <section className="panel report-toolbar">
        <div><h2>Relatório para conferência e contador</h2><p>Consolida fluxo financeiro, posições, vendas e proventos. Não substitui a apuração fiscal profissional.</p></div>
        <label>Ano<select value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button className="primary-button" type="button" onClick={exportPdf}>Gerar PDF</button>
        <button className="secondary-button" type="button" onClick={() => exportTransactionsCsv(transactions, year)}>CSV financeiro</button>
        <button className="secondary-button" type="button" onClick={() => exportInvestmentOperationsCsv(operations, year)}>CSV operações</button>
      </section>

      <section className="summary-grid summary-grid-4">
        <article className="summary-card"><span>Receitas e proventos</span><strong>{formatCurrency(financialSummary.totalIncome)}</strong></article>
        <article className="summary-card"><span>Despesas</span><strong>{formatCurrency(financialSummary.expenses)}</strong></article>
        <article className="summary-card"><span>Sobra anual</span><strong className={financialSummary.surplus >= 0 ? 'positive' : 'negative'}>{formatCurrency(financialSummary.surplus)}</strong></article>
        <article className="summary-card"><span>Taxa de poupança</span><strong>{formatPercent(financialSummary.savingsRate)}</strong></article>
      </section>

      <section className="summary-grid summary-grid-4">
        <article className="summary-card"><span>Posição em 31/12</span><strong>{formatCurrency(investmentResult.summary.marketValue)}</strong></article>
        <article className="summary-card"><span>Resultado não realizado</span><strong>{formatCurrency(investmentResult.summary.unrealized)}</strong></article>
        <article className="summary-card"><span>Resultados em vendas</span><strong>{formatCurrency(yearRealized.reduce((sum, item) => sum + item.result, 0))}</strong></article>
        <article className="summary-card"><span>Proventos registrados</span><strong>{formatCurrency(yearIncomes.reduce((sum, item) => sum + Number(item.net_value), 0))}</strong></article>
      </section>

      <section className="panel">
        <div className="panel-header"><h2>Checklist documental</h2><p>Itens recomendados para conferência anual.</p></div>
        <div className="checklist-grid">
          <label><input type="checkbox" /> Informes de rendimentos de bancos e corretoras</label>
          <label><input type="checkbox" /> Notas de corretagem e extrato de operações</label>
          <label><input type="checkbox" /> Posição da B3 em 31 de dezembro</label>
          <label><input type="checkbox" /> DARFs e comprovantes de pagamento</label>
          <label><input type="checkbox" /> Extratos de dividendos, JCP e rendimentos de FIIs</label>
          <label><input type="checkbox" /> Conferência de vendas e prejuízos acumulados</label>
        </div>
      </section>
    </div>
  )
}
