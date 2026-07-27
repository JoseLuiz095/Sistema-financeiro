import { monthKey, monthLabel } from './format'

const OPERATING_INCOME_TYPES = new Set(['INCOME', 'REFUND'])
const INVESTMENT_INCOME_TYPES = new Set(['DIVIDEND', 'INTEREST_ON_EQUITY', 'FII_INCOME'])

export function calculateFinancialSummary(transactions, periodStart = null, periodEnd = null) {
  const filtered = transactions.filter((item) => {
    if (periodStart && item.transaction_date < periodStart) return false
    if (periodEnd && item.transaction_date > periodEnd) return false
    return true
  })

  let operatingIncome = 0
  let investmentIncome = 0
  let expenses = 0
  let contributions = 0
  let redemptions = 0
  let transfers = 0

  for (const item of filtered) {
    const amount = Number(item.amount ?? 0)
    if (OPERATING_INCOME_TYPES.has(item.transaction_type)) operatingIncome += Math.max(amount, 0)
    if (INVESTMENT_INCOME_TYPES.has(item.transaction_type)) investmentIncome += Math.max(amount, 0)
    if (item.transaction_type === 'EXPENSE') expenses += Math.abs(amount)
    if (item.transaction_type === 'INVESTMENT_CONTRIBUTION') contributions += Math.abs(amount)
    if (item.transaction_type === 'INVESTMENT_REDEMPTION') redemptions += Math.max(amount, 0)
    if (item.transaction_type === 'OWN_TRANSFER_IN' || item.transaction_type === 'OWN_TRANSFER_OUT') {
      transfers += amount
    }
  }

  const totalIncome = operatingIncome + investmentIncome
  const surplus = totalIncome - expenses
  const savingsRate = totalIncome > 0 ? (surplus / totalIncome) * 100 : 0
  const committedRate = totalIncome > 0 ? (expenses / totalIncome) * 100 : 0

  return {
    operatingIncome,
    investmentIncome,
    totalIncome,
    expenses,
    surplus,
    savingsRate,
    committedRate,
    contributions,
    redemptions,
    transfers,
  }
}

export function buildMonthlyFinancialSeries(transactions, limit = 12) {
  const groups = new Map()

  for (const transaction of transactions) {
    const key = monthKey(transaction.transaction_date)
    if (!key) continue
    if (!groups.has(key)) {
      groups.set(key, {
        month: key,
        income: 0,
        investmentIncome: 0,
        expenses: 0,
        surplus: 0,
      })
    }

    const group = groups.get(key)
    const amount = Number(transaction.amount ?? 0)
    if (OPERATING_INCOME_TYPES.has(transaction.transaction_type)) group.income += Math.max(amount, 0)
    if (INVESTMENT_INCOME_TYPES.has(transaction.transaction_type)) {
      group.investmentIncome += Math.max(amount, 0)
    }
    if (transaction.transaction_type === 'EXPENSE') group.expenses += Math.abs(amount)
  }

  return Array.from(groups.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-limit)
    .map((item) => ({
      ...item,
      label: monthLabel(item.month),
      surplus: item.income + item.investmentIncome - item.expenses,
    }))
}

export function buildExpenseCategorySeries(transactions, periodStart = null, periodEnd = null) {
  const groups = new Map()

  for (const transaction of transactions) {
    if (transaction.transaction_type !== 'EXPENSE') continue
    if (periodStart && transaction.transaction_date < periodStart) continue
    if (periodEnd && transaction.transaction_date > periodEnd) continue
    const category = transaction.categories?.name ?? 'Sem categoria'
    groups.set(category, (groups.get(category) ?? 0) + Math.abs(Number(transaction.amount ?? 0)))
  }

  return Array.from(groups.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
}
