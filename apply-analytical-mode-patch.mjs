import fs from 'node:fs'

const appPath = 'src/App.jsx'

if (!fs.existsSync(appPath)) {
  throw new Error(
    `Arquivo não encontrado: ${appPath}. Execute na raiz do projeto.`,
  )
}

let source = fs.readFileSync(appPath, 'utf8')
const backupPath = `${appPath}.before-analytical-mode`

if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, source)
}

source = source.replace(
  /import\s*\{[\s\S]*?listAssets,[\s\S]*?listMarketQuotes,[\s\S]*?\}\s*from '\.\/services\/investmentService'\s*/m,
  '',
)

source = source.replace(
  /import\s*\{?[\s\S]*?calculateInvestmentPositions[\s\S]*?\}?\s*from '\.\/utils\/investmentCalculator'\s*/m,
  '',
)

source = source.replace(
  /import\s*\{[\s\S]*?listScheduledOccurrences,[\s\S]*?refreshScheduledOccurrences,[\s\S]*?\}\s*from '\.\/services\/scheduleService'\s*/m,
  '',
)

source = source.replace(
  /\n\s*listOpenFinanceInvestmentTransactions,?/,
  '',
)

for (const name of [
  'assets',
  'operations',
  'quotes',
  'incomes',
]) {
  const setter =
    `set${name[0].toUpperCase()}${name.slice(1)}`

  source = source.replace(
    new RegExp(
      `\\n\\s*const\\s*\\[\\s*${name}\\s*,\\s*${setter}\\s*\\]\\s*=\\s*useState\\(\\[\\]\\)`,
    ),
    '',
  )
}

source = source.replace(
  /\n\s*const\s*\[\s*importedInvestmentTransactions\s*,\s*setImportedInvestmentTransactions\s*,?\s*\]\s*=\s*useState\(\[\]\)/m,
  '',
)

for (const [name, setter] of [
  ['schedules', 'setSchedules'],
  ['occurrences', 'setOccurrences'],
]) {
  source = source.replace(
    new RegExp(
      `\\n\\s*const\\s*\\[\\s*${name}\\s*,\\s*${setter}\\s*\\]\\s*=\\s*useState\\(\\[\\]\\)`,
    ),
    '',
  )
}

for (const call of [
  'setAssets([])',
  'setOperations([])',
  'setQuotes([])',
  'setIncomes([])',
  'setImportedInvestmentTransactions([])',
  'setSchedules([])',
  'setOccurrences([])',
]) {
  source = source.replace(
    new RegExp(
      `\\n\\s*${call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    ),
    '',
  )
}

for (const row of [
  'assetRows',
  'operationRows',
  'quoteRows',
  'incomeRows',
  'importedInvestmentTransactionRows',
  'scheduleRows',
  'occurrenceRows',
]) {
  source = source.replace(
    new RegExp(`\\n\\s*${row},`),
    '',
  )
}

source = source.replace(
  /\n\s*try \{\s*await refreshScheduledOccurrences\(730\)[\s\S]*?\n\s*\}\s*\n/m,
  '\n',
)

for (const call of [
  'listAssets(),',
  'listInvestmentOperations(),',
  'listMarketQuotes(),',
  'listInvestmentIncome(),',
]) {
  source = source.replace(
    new RegExp(
      `\\n\\s*${call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    ),
    '',
  )
}

source = source.replace(
  /\n\s*listOpenFinanceInvestmentTransactions\(\)\s*\.catch\(\(error\) => \{[\s\S]*?\n\s*\}\),/m,
  '',
)

for (const functionName of [
  'listScheduledTransactions',
  'listScheduledOccurrences',
]) {
  source = source.replace(
    new RegExp(
      `\\n\\s*${functionName}\\(\\)\\s*\\.catch\\(\\(error\\) => \\{[\\s\\S]*?\\n\\s*\\}\\),`,
      'm',
    ),
    '',
  )
}

for (const assignment of [
  'setAssets(assetRows)',
  'setOperations(operationRows)',
  'setQuotes(quoteRows)',
  'setIncomes(incomeRows)',
  'setSchedules(scheduleRows)',
  'setOccurrences(occurrenceRows)',
]) {
  source = source.replace(
    new RegExp(
      `\\n\\s*${assignment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    ),
    '',
  )
}

source = source.replace(
  /\n\s*setImportedInvestmentTransactions\(\s*importedInvestmentTransactionRows,?\s*\)/m,
  '',
)

source = source.replace(
  /\n\s*const investmentResult = useMemo\([\s\S]*?\n\s*\)\n\n\s*function navigate/m,
  '\n\n  function navigate',
)

source = source.replace(
  /\n\s*investmentResult=\{\s*investmentResult\s*\}/g,
  '',
)

source = source.replace(
  /\n\s*scheduledOccurrences=\{\s*occurrences\s*\}/g,
  '',
)

const analyticsStart = source.indexOf(
  "{activePage === 'analytics' && (",
)
const moreStart = source.indexOf(
  "{activePage === 'more' && (",
)

if (
  analyticsStart !== -1 &&
  moreStart !== -1 &&
  moreStart > analyticsStart
) {
  let analyticsBlock = source.slice(
    analyticsStart,
    moreStart,
  )

  for (const [propName, propValue] of [
    ['accounts', 'accounts'],
    ['assets', 'assets'],
    ['operations', 'operations'],
    ['quotes', 'quotes'],
    ['incomes', 'incomes'],
    [
      'importedInvestmentTransactions',
      'importedInvestmentTransactions',
    ],
    ['onChanged', 'loadAllData'],
  ]) {
    analyticsBlock = analyticsBlock.replace(
      new RegExp(
        `\\n\\s*${propName}=\\{\\s*${propValue}\\s*\\}`,
        'g',
      ),
      '',
    )
  }

  source =
    source.slice(0, analyticsStart) +
    analyticsBlock +
    source.slice(moreStart)
}

const moreBlockStart = source.indexOf(
  "{activePage === 'more' && (",
)

if (moreBlockStart !== -1) {
  let moreBlock = source.slice(moreBlockStart)

  for (const [propName, propValue] of [
    ['transactions', 'transactions'],
    ['schedules', 'schedules'],
    ['occurrences', 'occurrences'],
  ]) {
    moreBlock = moreBlock.replace(
      new RegExp(
        `\\n\\s*${propName}=\\{\\s*${propValue}\\s*\\}`,
        'g',
      ),
      '',
    )
  }

  source =
    source.slice(0, moreBlockStart) +
    moreBlock
}

if (!source.includes('useMemo(')) {
  source = source.replace(
    "import { useEffect, useMemo, useState } from 'react'",
    "import { useEffect, useState } from 'react'",
  )
}

fs.writeFileSync(appPath, source, 'utf8')

console.log('App.jsx ajustado para o modo analítico.')
console.log('Consultas removidas do carregamento inicial:')
console.log('- assets')
console.log('- investment_operations')
console.log('- market_quotes')
console.log('- investment_income')
console.log('- open_finance_investment_transactions')
console.log(`Backup: ${backupPath}`)
