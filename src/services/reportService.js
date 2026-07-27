import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate, formatNumber, formatPercent } from '../utils/format'

function downloadBlob(content, fileName, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export function exportTransactionsCsv(transactions, year) {
  const rows = transactions
    .filter((item) => String(item.transaction_date).startsWith(String(year)))
    .map((item) => [
      formatDate(item.transaction_date),
      item.financial_accounts?.institution ?? '',
      item.financial_accounts?.account_name ?? '',
      item.transaction_type,
      item.categories?.name ?? '',
      item.original_description,
      item.counterparty ?? '',
      Number(item.amount).toFixed(2),
    ])

  const header = ['Data', 'Instituição', 'Conta', 'Tipo', 'Categoria', 'Descrição', 'Contraparte', 'Valor']
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n')
  downloadBlob(`\uFEFF${csv}`, `movimentacoes-${year}.csv`)
}

export function exportInvestmentOperationsCsv(operations, year) {
  const rows = operations
    .filter((item) => String(item.operation_date).startsWith(String(year)))
    .map((item) => [
      formatDate(item.operation_date),
      item.assets?.ticker ?? '',
      item.operation_type,
      item.trade_type,
      item.quantity,
      item.unit_price,
      item.gross_value,
      item.brokerage_fee,
      item.exchange_fee,
      item.taxes,
      item.other_costs,
      item.net_value,
    ])

  const header = [
    'Data', 'Ativo', 'Operação', 'Modalidade', 'Quantidade', 'Preço unitário',
    'Valor bruto', 'Corretagem', 'Emolumentos', 'Tributos', 'Outros custos', 'Valor líquido',
  ]
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n')
  downloadBlob(`\uFEFF${csv}`, `operacoes-investimentos-${year}.csv`)
}

export function generateAccountantPdf({
  year,
  userEmail,
  financialSummary,
  monthlySeries,
  positions,
  investmentSummary,
  realizedEvents,
  incomes,
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(18)
  doc.text(`Resumo financeiro e de investimentos - ${year}`, 14, 15)
  doc.setFontSize(9)
  doc.text(`Titular: ${userEmail}`, 14, 21)
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 26)
  doc.text('Documento de apoio. A classificação fiscal deve ser validada pelo contador.', 14, 31)

  autoTable(doc, {
    startY: 36,
    head: [['Resumo financeiro', 'Valor']],
    body: [
      ['Receitas operacionais', formatCurrency(financialSummary.operatingIncome)],
      ['Proventos e receitas de investimentos', formatCurrency(financialSummary.investmentIncome)],
      ['Despesas', formatCurrency(financialSummary.expenses)],
      ['Sobra do período', formatCurrency(financialSummary.surplus)],
      ['Taxa de poupança', formatPercent(financialSummary.savingsRate)],
      ['Aportes financeiros identificados', formatCurrency(financialSummary.contributions)],
    ],
    theme: 'grid',
    styles: { fontSize: 8 },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [['Mês', 'Receitas', 'Proventos', 'Despesas', 'Sobra']],
    body: monthlySeries.map((row) => [
      row.label,
      formatCurrency(row.income),
      formatCurrency(row.investmentIncome),
      formatCurrency(row.expenses),
      formatCurrency(row.surplus),
    ]),
    theme: 'grid',
    styles: { fontSize: 7 },
  })

  doc.addPage('a4', 'landscape')
  doc.setFontSize(15)
  doc.text('Posição consolidada de investimentos', 14, 15)
  doc.setFontSize(9)
  doc.text(
    `Custo atual: ${formatCurrency(investmentSummary.costBasis)} | Valor de mercado: ${formatCurrency(investmentSummary.marketValue)} | Retorno total: ${formatCurrency(investmentSummary.totalReturn)}`,
    14,
    22,
  )

  autoTable(doc, {
    startY: 28,
    head: [[
      'Ativo', 'Tipo', 'Quantidade', 'Preço médio', 'Cotação', 'Custo', 'Valor atual',
      'Não realizado', 'Realizado', 'Proventos', 'Retorno total',
    ]],
    body: positions.map((position) => [
      position.asset.ticker,
      position.asset.asset_type,
      formatNumber(position.quantity),
      formatCurrency(position.averagePrice),
      formatCurrency(position.currentPrice),
      formatCurrency(position.costBasis),
      formatCurrency(position.marketValue),
      formatCurrency(position.unrealized),
      formatCurrency(position.realized),
      formatCurrency(position.incomeNet),
      formatCurrency(position.totalReturn),
    ]),
    theme: 'grid',
    styles: { fontSize: 6.5 },
  })

  doc.addPage('a4', 'landscape')
  doc.setFontSize(15)
  doc.text('Resultados realizados e proventos', 14, 15)

  autoTable(doc, {
    startY: 22,
    head: [['Data', 'Ativo', 'Modalidade', 'Quantidade', 'Receita líquida', 'Custo', 'Resultado']],
    body: realizedEvents
      .filter((event) => String(event.date).startsWith(String(year)))
      .map((event) => [
        formatDate(event.date),
        event.ticker,
        event.tradeType,
        formatNumber(event.quantity),
        formatCurrency(event.proceeds),
        formatCurrency(event.cost),
        formatCurrency(event.result),
      ]),
    theme: 'grid',
    styles: { fontSize: 7 },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Data', 'Ativo', 'Tipo', 'Bruto', 'IRRF', 'Líquido']],
    body: incomes
      .filter((income) => String(income.payment_date).startsWith(String(year)))
      .map((income) => [
        formatDate(income.payment_date),
        income.assets?.ticker ?? '',
        income.income_type,
        formatCurrency(income.gross_value),
        formatCurrency(income.withholding_tax),
        formatCurrency(income.net_value),
      ]),
    theme: 'grid',
    styles: { fontSize: 7 },
  })

  doc.save(`relatorio-contador-${year}.pdf`)
}
