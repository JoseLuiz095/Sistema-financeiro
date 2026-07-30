import { normalizeText, today } from './format'

const CARD_TERMS = [
  'compra cartao',
  'cartao de credito',
  'cartao credito',
  'compra parcelada',
  'pagamento fatura',
  'fatura cartao',
]

const LOAN_TERMS = [
  'emprestimo',
  'financiamento',
  'credito pessoal',
  'consignado',
  'prestacao',
  'cheque especial',
  'credito rotativo',
]

function parseDate(value) {
  const text = String(value ?? '').slice(0, 10)
  const date = new Date(`${text}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  )
}

function daysBetween(left, right) {
  return Math.floor(
    (startOfDay(right) - startOfDay(left)) /
      (24 * 60 * 60 * 1000),
  )
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}`
}

function addMonthsToKey(key, amount) {
  const [year, month] = String(key).split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1, 12)
  return monthKeyFromDate(date)
}

function signedMonthDistance(fromDate, toDate) {
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
    toDate.getMonth() -
    fromDate.getMonth()
  )
}

function getTransactionText(transaction) {
  return normalizeText(
    [
      transaction?.original_description,
      transaction?.normalized_description,
      transaction?.counterparty,
      transaction?.source_data?.historico,
      transaction?.source_data?.descricao,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function getTransactionDescription(transaction) {
  return (
    transaction?.normalized_description ||
    transaction?.original_description ||
    transaction?.counterparty ||
    'Movimentação importada'
  )
}

function getInstitution(transaction) {
  return (
    transaction?.financial_accounts?.institution ||
    transaction?.financial_accounts?.account_name ||
    'Conta importada'
  )
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term))
}

function parseInstallment(text) {
  const match = String(text).match(
    /parcela\s+(\d{1,3})\s*(?:\/|\s)\s*(\d{1,3})/i,
  )

  if (!match) return null

  const current = Number(match[1])
  const total = Number(match[2])

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(total) ||
    current < 1 ||
    total < 2 ||
    current > total
  ) {
    return null
  }

  return { current, total }
}

function isOperationalIncome(transaction) {
  return [
    'INCOME',
    'REFUND',
  ].includes(transaction?.transaction_type)
}

function isExpense(transaction) {
  return Number(transaction?.amount) < 0 &&
    transaction?.transaction_type !== 'INVESTMENT_CONTRIBUTION' &&
    transaction?.transaction_type !== 'OWN_TRANSFER_OUT'
}

function buildActiveInstallment(transaction, now) {
  const text = getTransactionText(transaction)
  const installment = parseInstallment(text)
  const transactionDate = parseDate(transaction?.transaction_date)
  const monthlyAmount = Math.abs(Number(transaction?.amount ?? 0))

  if (
    !installment ||
    !transactionDate ||
    !Number.isFinite(monthlyAmount) ||
    monthlyAmount <= 0
  ) {
    return null
  }

  const monthsElapsed = Math.max(
    0,
    signedMonthDistance(transactionDate, now),
  )
  const estimatedCurrentInstallment = Math.min(
    installment.total,
    installment.current + monthsElapsed,
  )
  const remainingInstallments = Math.max(
    0,
    installment.total - estimatedCurrentInstallment,
  )

  if (remainingInstallments <= 0) return null

  return {
    id: transaction.id || transaction.record_hash,
    description: getTransactionDescription(transaction),
    institution: getInstitution(transaction),
    transactionDate: transaction.transaction_date,
    monthlyAmount,
    originalInstallment: installment.current,
    estimatedCurrentInstallment,
    totalInstallments: installment.total,
    remainingInstallments,
    estimatedOutstanding:
      monthlyAmount * remainingInstallments,
    projectedEndMonth: addMonthsToKey(
      monthKeyFromDate(now),
      remainingInstallments,
    ),
  }
}

export function buildImportedCreditInsights(
  transactions = [],
  { referenceDate = today() } = {},
) {
  const now = parseDate(referenceDate) ?? new Date()
  const activeInstallments = []
  const cardByInstitution = new Map()
  const merchantTotals = new Map()

  let cardSpend30 = 0
  let cardSpend90 = 0
  let loanLikeSpend90 = 0
  let income90 = 0
  let importedExpenseCount = 0

  for (const transaction of transactions) {
    const transactionDate = parseDate(
      transaction?.transaction_date,
    )
    const amount = Number(transaction?.amount ?? 0)
    const text = getTransactionText(transaction)
    const ageDays = transactionDate
      ? daysBetween(transactionDate, now)
      : Number.POSITIVE_INFINITY
    const cardRelated = includesAny(text, CARD_TERMS)
    const loanRelated = includesAny(text, LOAN_TERMS)

    if (isExpense(transaction)) {
      importedExpenseCount += 1
    }

    if (
      transactionDate &&
      ageDays >= 0 &&
      ageDays <= 90 &&
      isOperationalIncome(transaction) &&
      amount > 0
    ) {
      income90 += amount
    }

    if (
      transactionDate &&
      ageDays >= 0 &&
      ageDays <= 90 &&
      amount < 0 &&
      cardRelated
    ) {
      const absoluteAmount = Math.abs(amount)
      cardSpend90 += absoluteAmount
      if (ageDays <= 30) cardSpend30 += absoluteAmount

      const institution = getInstitution(transaction)
      cardByInstitution.set(
        institution,
        (cardByInstitution.get(institution) ?? 0) +
          absoluteAmount,
      )

      const merchant =
        transaction?.counterparty ||
        getTransactionDescription(transaction)
      merchantTotals.set(
        merchant,
        (merchantTotals.get(merchant) ?? 0) +
          absoluteAmount,
      )
    }

    if (
      transactionDate &&
      ageDays >= 0 &&
      ageDays <= 90 &&
      amount < 0 &&
      loanRelated
    ) {
      loanLikeSpend90 += Math.abs(amount)
    }

    const activePlan = buildActiveInstallment(
      transaction,
      now,
    )
    if (activePlan) activeInstallments.push(activePlan)
  }

  activeInstallments.sort(
    (left, right) =>
      right.estimatedOutstanding -
      left.estimatedOutstanding,
  )

  const estimatedOutstanding = activeInstallments.reduce(
    (total, item) =>
      total + item.estimatedOutstanding,
    0,
  )
  const estimatedMonthlyInstallments =
    activeInstallments.reduce(
      (total, item) => total + item.monthlyAmount,
      0,
    )
  const averageMonthlyIncome90 = income90 / 3
  const averageMonthlyCardSpend90 = cardSpend90 / 3
  const averageMonthlyLoanSpend90 = loanLikeSpend90 / 3
  const commitmentRatio =
    averageMonthlyIncome90 > 0
      ? ((estimatedMonthlyInstallments +
          averageMonthlyLoanSpend90) /
          averageMonthlyIncome90) *
        100
      : null

  const projection = Array.from({ length: 12 }, (_, index) => {
    const key = addMonthsToKey(
      monthKeyFromDate(now),
      index + 1,
    )
    const installments = activeInstallments.reduce(
      (total, item) =>
        index < item.remainingInstallments
          ? total + item.monthlyAmount
          : total,
      0,
    )

    return {
      key,
      importedInstallments: installments,
    }
  })

  const institutions = [...cardByInstitution.entries()]
    .map(([name, cardSpend]) => ({
      name,
      cardSpend,
    }))
    .sort((left, right) => right.cardSpend - left.cardSpend)

  const topMerchants = [...merchantTotals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 8)

  return {
    activeInstallments,
    activeInstallmentCount: activeInstallments.length,
    estimatedOutstanding,
    estimatedMonthlyInstallments,
    cardSpend30,
    cardSpend90,
    averageMonthlyCardSpend90,
    averageMonthlyIncome90,
    averageMonthlyLoanSpend90,
    commitmentRatio,
    importedExpenseCount,
    institutions,
    topMerchants,
    projection,
  }
}
