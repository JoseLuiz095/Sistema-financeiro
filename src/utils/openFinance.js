function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = finiteNumber(value)
    if (number !== null) return number
  }
  return null
}

function firstNonZeroNumber(...values) {
  for (const value of values) {
    const number = finiteNumber(value)
    if (number !== null && number !== 0) return number
  }
  return null
}

export function getConnectionDisplayName(connection) {
  return connection?.metadata?.display_name
    || connection?.institution_name
    || 'Instituição não identificada'
}

export function getInvestmentBalance(position) {
  const raw = position?.source_data?.raw ?? {}
  const netBalance = firstFiniteNumber(
    position?.net_balance,
    raw?.balance,
    raw?.netBalance,
    raw?.currentBalance,
  )
  const withdrawalAmount = firstFiniteNumber(
    position?.withdrawal_amount,
    raw?.amountWithdrawal,
    raw?.withdrawalAmount,
    raw?.availableAmount,
  )
  const grossAmount = firstFiniteNumber(
    position?.gross_amount,
    raw?.amount,
    raw?.grossAmount,
  )
  const unitValue = firstFiniteNumber(
    position?.unit_value,
    raw?.value,
    raw?.unitValue,
  )
  const quantity = firstFiniteNumber(
    position?.quantity,
    raw?.quantity,
    raw?.currentQuantity,
  )
  const calculatedGross = unitValue !== null && quantity !== null
    ? unitValue * quantity
    : null

  return firstNonZeroNumber(
    netBalance,
    withdrawalAmount,
    grossAmount,
    calculatedGross,
  ) ?? netBalance ?? withdrawalAmount ?? grossAmount ?? calculatedGross ?? 0
}

export function getInvestmentOriginalAmount(position) {
  const raw = position?.source_data?.raw ?? {}
  const originalAmount = firstFiniteNumber(
    position?.original_amount,
    raw?.amountOriginal,
    raw?.originalAmount,
    raw?.principalAmount,
  )
  if (originalAmount !== null && originalAmount !== 0) return originalAmount

  const balance = getInvestmentBalance(position)
  const profit = firstFiniteNumber(
    position?.profit_amount,
    raw?.amountProfit,
    raw?.profitAmount,
  )
  if (profit !== null && balance !== 0) return balance - profit

  return originalAmount ?? 0
}

export function getInvestmentProfit(position) {
  const raw = position?.source_data?.raw ?? {}
  const profit = firstFiniteNumber(
    position?.profit_amount,
    raw?.amountProfit,
    raw?.profitAmount,
  )
  if (profit !== null && profit !== 0) return profit

  const balance = getInvestmentBalance(position)
  const originalAmount = firstFiniteNumber(
    position?.original_amount,
    raw?.amountOriginal,
    raw?.originalAmount,
    raw?.principalAmount,
  )
  if (originalAmount !== null && balance !== 0) return balance - originalAmount

  return profit ?? 0
}
