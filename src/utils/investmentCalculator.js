function numeric(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function fees(operation) {
  return numeric(operation.brokerage_fee)
    + numeric(operation.exchange_fee)
    + numeric(operation.taxes)
    + numeric(operation.other_costs)
}

export function calculateInvestmentPositions({
  assets,
  operations,
  quotes,
  incomes,
  cutoffDate = null,
}) {
  const validOperations = operations
    .filter((item) => !cutoffDate || item.operation_date <= cutoffDate)
    .slice()
    .sort((a, b) => {
      const dateCompare = String(a.operation_date).localeCompare(String(b.operation_date))
      if (dateCompare !== 0) return dateCompare
      return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    })

  const validQuotes = quotes.filter((item) => !cutoffDate || item.quote_date <= cutoffDate)
  const validIncomes = incomes.filter((item) => !cutoffDate || item.payment_date <= cutoffDate)

  const states = new Map()
  const realizedEvents = []

  for (const asset of assets) {
    states.set(asset.id, {
      asset,
      quantity: 0,
      costBasis: 0,
      cumulativeAcquisitionCost: 0,
      realized: 0,
      warnings: [],
    })
  }

  for (const operation of validOperations) {
    const state = states.get(operation.asset_id)
    if (!state) continue

    const quantity = numeric(operation.quantity)
    const unitPrice = numeric(operation.unit_price)
    const operationFees = fees(operation)
    const gross = quantity * unitPrice

    if (operation.operation_type === 'BUY' || operation.operation_type === 'TRANSFER_IN') {
      const acquisitionCost = gross + operationFees
      state.quantity += quantity
      state.costBasis += acquisitionCost
      state.cumulativeAcquisitionCost += acquisitionCost
      continue
    }

    if (operation.operation_type === 'BONUS') {
      state.quantity += quantity
      state.costBasis += operationFees
      state.cumulativeAcquisitionCost += operationFees
      continue
    }

    const averagePrice = state.quantity > 0 ? state.costBasis / state.quantity : 0
    const quantityUsed = Math.min(quantity, state.quantity)

    if (quantity > state.quantity + 0.00000001) {
      state.warnings.push(
        `Operação em ${operation.operation_date} tentou retirar ${quantity}, mas havia ${state.quantity}.`,
      )
    }

    if (operation.operation_type === 'SELL') {
      const netProceeds = gross - operationFees
      const soldCost = quantityUsed * averagePrice
      const realized = netProceeds - soldCost
      state.realized += realized
      state.quantity -= quantityUsed
      state.costBasis -= soldCost
      realizedEvents.push({
        operationId: operation.id,
        assetId: operation.asset_id,
        ticker: state.asset.ticker,
        date: operation.operation_date,
        month: String(operation.operation_date).slice(0, 7),
        tradeType: operation.trade_type,
        quantity: quantityUsed,
        proceeds: netProceeds,
        cost: soldCost,
        result: realized,
      })
    }

    if (operation.operation_type === 'TRANSFER_OUT') {
      const transferredCost = quantityUsed * averagePrice
      state.quantity -= quantityUsed
      state.costBasis -= transferredCost
    }

    if (Math.abs(state.quantity) < 0.00000001) {
      state.quantity = 0
      state.costBasis = 0
    }
  }

  const latestQuoteByAsset = new Map()
  for (const quote of validQuotes) {
    const current = latestQuoteByAsset.get(quote.asset_id)
    if (!current || quote.quote_date > current.quote_date) {
      latestQuoteByAsset.set(quote.asset_id, quote)
    }
  }

  const incomeByAsset = new Map()
  for (const income of validIncomes) {
    const current = incomeByAsset.get(income.asset_id) ?? { gross: 0, net: 0, withholding: 0 }
    current.gross += numeric(income.gross_value)
    current.net += numeric(income.net_value)
    current.withholding += numeric(income.withholding_tax)
    incomeByAsset.set(income.asset_id, current)
  }

  const positions = Array.from(states.values()).map((state) => {
    const quote = latestQuoteByAsset.get(state.asset.id)
    const income = incomeByAsset.get(state.asset.id) ?? { gross: 0, net: 0, withholding: 0 }
    const averagePrice = state.quantity > 0 ? state.costBasis / state.quantity : 0
    const currentPrice = numeric(quote?.close_price)
    const marketValue = state.quantity * currentPrice
    const unrealized = marketValue - state.costBasis
    const unrealizedPercent = state.costBasis > 0 ? (unrealized / state.costBasis) * 100 : 0
    const totalReturn = state.realized + unrealized + income.net
    const totalReturnPercent = state.cumulativeAcquisitionCost > 0
      ? (totalReturn / state.cumulativeAcquisitionCost) * 100
      : 0

    return {
      ...state,
      averagePrice,
      currentPrice,
      quoteDate: quote?.quote_date ?? null,
      marketValue,
      unrealized,
      unrealizedPercent,
      incomeGross: income.gross,
      incomeNet: income.net,
      withholdingTax: income.withholding,
      totalReturn,
      totalReturnPercent,
    }
  })

  const summary = positions.reduce(
    (accumulator, position) => {
      accumulator.costBasis += position.costBasis
      accumulator.marketValue += position.marketValue
      accumulator.unrealized += position.unrealized
      accumulator.realized += position.realized
      accumulator.incomeNet += position.incomeNet
      accumulator.totalReturn += position.totalReturn
      accumulator.cumulativeAcquisitionCost += position.cumulativeAcquisitionCost
      return accumulator
    },
    {
      costBasis: 0,
      marketValue: 0,
      unrealized: 0,
      realized: 0,
      incomeNet: 0,
      totalReturn: 0,
      cumulativeAcquisitionCost: 0,
    },
  )

  summary.totalReturnPercent = summary.cumulativeAcquisitionCost > 0
    ? (summary.totalReturn / summary.cumulativeAcquisitionCost) * 100
    : 0

  return { positions, summary, realizedEvents }
}
