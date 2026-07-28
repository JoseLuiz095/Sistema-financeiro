import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  formatCurrency,
  formatDate,
  formatPercent,
} from '../utils/format'

function downloadBlob(
  content,
  fileName,
  type = 'text/csv;charset=utf-8',
) {
  const blob = new Blob([content], {
    type,
  })
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

export function exportTransactionsCsv(
  transactions,
  year,
) {
  const rows = transactions
    .filter((item) =>
      String(item.transaction_date).startsWith(
        String(year),
      ),
    )
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

  const header = [
    'Data',
    'Instituição',
    'Conta',
    'Tipo',
    'Categoria',
    'Descrição',
    'Contraparte',
    'Valor',
  ]

  const csv = [header, ...rows]
    .map((row) =>
      row.map(csvEscape).join(';'),
    )
    .join('\n')

  downloadBlob(
    `\uFEFF${csv}`,
    `movimentacoes-${year}.csv`,
  )
}

export function generateFinancialAnalysisPdf({
  year,
  userEmail,
  financialSummary,
  monthlySeries,
  transactions,
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  doc.setFontSize(18)
  doc.text(
    `Resumo financeiro consolidado - ${year}`,
    14,
    15,
  )

  doc.setFontSize(9)
  doc.text(
    `Titular: ${userEmail}`,
    14,
    21,
  )
  doc.text(
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    14,
    26,
  )
  doc.text(
    'Baseado em extratos importados e dados sincronizados.',
    14,
    31,
  )

  autoTable(doc, {
    startY: 36,
    head: [['Resumo financeiro', 'Valor']],
    body: [
      [
        'Receitas operacionais',
        formatCurrency(
          financialSummary.operatingIncome,
        ),
      ],
      [
        'Rendimentos financeiros identificados',
        formatCurrency(
          financialSummary.investmentIncome,
        ),
      ],
      [
        'Despesas',
        formatCurrency(
          financialSummary.expenses,
        ),
      ],
      [
        'Sobra do período',
        formatCurrency(
          financialSummary.surplus,
        ),
      ],
      [
        'Taxa de poupança',
        formatPercent(
          financialSummary.savingsRate,
        ),
      ],
      [
        'Aportes financeiros identificados',
        formatCurrency(
          financialSummary.contributions,
        ),
      ],
    ],
    theme: 'grid',
    styles: {
      fontSize: 8,
    },
  })

  autoTable(doc, {
    startY:
      doc.lastAutoTable.finalY + 5,
    head: [[
      'Mês',
      'Receitas',
      'Rendimentos',
      'Despesas',
      'Sobra',
    ]],
    body: monthlySeries.map((row) => [
      row.label,
      formatCurrency(row.income),
      formatCurrency(
        row.investmentIncome,
      ),
      formatCurrency(row.expenses),
      formatCurrency(row.surplus),
    ]),
    theme: 'grid',
    styles: {
      fontSize: 7,
    },
  })

  doc.addPage('a4', 'landscape')
  doc.setFontSize(15)
  doc.text(
    'Movimentações financeiras do período',
    14,
    15,
  )

  autoTable(doc, {
    startY: 22,
    head: [[
      'Data',
      'Instituição',
      'Conta',
      'Categoria',
      'Descrição',
      'Valor',
    ]],
    body: transactions.map((item) => [
      formatDate(item.transaction_date),
      item.financial_accounts
        ?.institution ?? '',
      item.financial_accounts
        ?.account_name ?? '',
      item.categories?.name ?? '',
      item.normalized_description ||
        item.original_description ||
        '',
      formatCurrency(item.amount),
    ]),
    theme: 'grid',
    styles: {
      fontSize: 6.5,
    },
    columnStyles: {
      4: {
        cellWidth: 90,
      },
    },
  })

  doc.save(
    `relatorio-financeiro-${year}.pdf`,
  )
}
