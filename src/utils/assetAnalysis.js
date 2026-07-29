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

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value == null || value === '') continue

    const numeric = Number(value)

    if (Number.isFinite(numeric)) {
      return numeric
    }
  }

  return 0
}

export function getImportedPositionMarketValue(position) {
  return Math.max(
    0,
    firstFiniteNumber(
      position?.net_balance,
      position?.gross_amount,
      position?.withdrawal_amount,
      position?.original_amount,
    ),
  )
}

export function buildPortfolioContext({
  positions = [],
  ticker,
  adjustedPosition = null,
}) {
  const selectedTicker = normalizeTicker(ticker)
  const grouped = new Map()

  positions.forEach((position) => {
    const symbol = normalizeTicker(
      position?.investment_code || position?.investment_name,
    )

    if (!symbol) return

    const current = grouped.get(symbol) ?? {
      ticker: symbol,
      name: position?.investment_name || symbol,
      marketValue: 0,
      quantity: 0,
      positionCount: 0,
      institutions: new Set(),
    }

    current.marketValue += getImportedPositionMarketValue(position)
    current.quantity += Math.max(0, Number(position?.quantity ?? 0) || 0)
    current.positionCount += 1

    const institution =
      position?.open_finance_connections?.institution_name ||
      position?.institution_name

    if (institution) current.institutions.add(institution)
    grouped.set(symbol, current)
  })

  const selected = grouped.get(selectedTicker) ?? {
    ticker: selectedTicker,
    name: selectedTicker,
    marketValue: 0,
    quantity: 0,
    positionCount: 0,
    institutions: new Set(),
  }

  const importedSelectedValue = selected.marketValue
  const adjustedMarketValue = Number(adjustedPosition?.marketValue ?? 0)
  const selectedMarketValue = adjustedMarketValue > 0
    ? adjustedMarketValue
    : importedSelectedValue

  let totalMarketValue = [...grouped.values()].reduce(
    (total, item) => total + item.marketValue,
    0,
  )

  if (adjustedMarketValue > 0) {
    totalMarketValue = Math.max(
      0,
      totalMarketValue - importedSelectedValue + adjustedMarketValue,
    )
  }

  const holdings = [...grouped.values()].map((item) => ({
    ticker: item.ticker,
    name: item.name,
    marketValue:
      item.ticker === selectedTicker && adjustedMarketValue > 0
        ? adjustedMarketValue
        : item.marketValue,
  }))

  if (
    selectedTicker &&
    selectedMarketValue > 0 &&
    !holdings.some((item) => item.ticker === selectedTicker)
  ) {
    holdings.push({
      ticker: selectedTicker,
      name: selected.name || selectedTicker,
      marketValue: selectedMarketValue,
    })
  }

  const weightPercent = totalMarketValue > 0
    ? (selectedMarketValue / totalMarketValue) * 100
    : 0

  const topHoldings = holdings
    .filter((item) => item.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 5)
    .map((item) => ({
      ticker: item.ticker,
      name: item.name,
      marketValue: item.marketValue,
      weightPercent: totalMarketValue > 0
        ? (item.marketValue / totalMarketValue) * 100
        : 0,
    }))

  return {
    ticker: selectedTicker,
    hasPosition: selectedMarketValue > 0,
    totalMarketValue,
    selectedMarketValue,
    selectedWeightPercent: weightPercent,
    selectedQuantity:
      Number(adjustedPosition?.quantity ?? 0) > 0
        ? Number(adjustedPosition.quantity)
        : selected.quantity,
    selectedPositionCount: selected.positionCount,
    institutionNames: [...selected.institutions],
    holdingCount: holdings.filter((item) => item.marketValue > 0).length,
    topHoldings,
    resultPercent: Number.isFinite(Number(adjustedPosition?.resultPercent))
      ? Number(adjustedPosition.resultPercent)
      : null,
    hasHistoricalCost: Boolean(adjustedPosition?.hasHistoricalCost),
  }
}

export function compactPortfolioContextForAi(context) {
  return {
    ticker: context?.ticker ?? null,
    hasPosition: Boolean(context?.hasPosition),
    selectedWeightPercent: Number.isFinite(
      Number(context?.selectedWeightPercent),
    )
      ? Number(context.selectedWeightPercent)
      : 0,
    selectedPositionCount: Number(context?.selectedPositionCount ?? 0),
    holdingCount: Number(context?.holdingCount ?? 0),
    resultPercent: Number.isFinite(Number(context?.resultPercent))
      ? Number(context.resultPercent)
      : null,
    hasHistoricalCost: Boolean(context?.hasHistoricalCost),
    topHoldings: (context?.topHoldings ?? []).map((item) => ({
      ticker: item.ticker,
      weightPercent: Number(item.weightPercent ?? 0),
    })),
  }
}
