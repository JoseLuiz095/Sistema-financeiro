export const DEFAULT_ANALYSIS_ASSUMPTIONS = {
  requiredReturn: 0.12,
  perpetualGrowth: 0.04,
  targetPe: 10,
  targetDividendYield: 0.06,
  marginOfSafety: 0.20,
}

export function normalizeTicker(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9^.-]/g, '')
    .slice(0, 12)
}

export function aggregateCostBasis(adjustments = []) {
  const summary = adjustments.reduce(
    (result, item) => {
      const quantity = Number(item.quantity ?? 0)
      const averageCost = Number(item.average_cost ?? 0)

      if (!Number.isFinite(quantity) || quantity <= 0) return result
      if (!Number.isFinite(averageCost) || averageCost < 0) return result

      result.quantity += quantity
      result.totalCost += quantity * averageCost
      return result
    },
    {
      quantity: 0,
      totalCost: 0,
    },
  )

  return {
    ...summary,
    averageCost:
      summary.quantity > 0
        ? summary.totalCost / summary.quantity
        : 0,
  }
}

export function calculateAdjustedPosition({
  adjustments = [],
  importedPosition = null,
  currentPrice = null,
}) {
  const cost = aggregateCostBasis(adjustments)
  const importedQuantity = Number(importedPosition?.quantity ?? 0)
  const effectiveQuantity = cost.quantity > 0
    ? cost.quantity
    : Number.isFinite(importedQuantity)
      ? importedQuantity
      : 0
  const price = Number(currentPrice ?? 0)
  const marketValue = effectiveQuantity > 0 && price > 0
    ? effectiveQuantity * price
    : Number(importedPosition?.net_balance ?? importedPosition?.gross_amount ?? 0)
  const totalCost = cost.totalCost
  const result = totalCost > 0
    ? marketValue - totalCost
    : null

  return {
    quantity: effectiveQuantity,
    averageCost: cost.averageCost,
    totalCost,
    marketValue,
    result,
    resultPercent:
      result !== null && totalCost > 0
        ? (result / totalCost) * 100
        : null,
    hasHistoricalCost: totalCost > 0,
  }
}

export function getTechnicalTone(label) {
  if (label === 'Compra forte' || label === 'Compra') return 'positive'
  if (label === 'Venda forte' || label === 'Venda') return 'negative'
  return 'neutral'
}

export function getHealthTone(score) {
  if (score == null) return 'neutral'
  if (score >= 65) return 'positive'
  if (score < 50) return 'negative'
  return 'neutral'
}

export function safePercentInput(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric / 100
}

export function percentToInput(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  return (numeric * 100).toFixed(2)
}
