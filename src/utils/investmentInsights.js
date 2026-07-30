import { monthLabel, normalizeText } from './format'

const INVESTMENT_TRANSACTION_TYPES = new Set([
  'INVESTMENT_CONTRIBUTION',
  'INVESTMENT_REDEMPTION',
  'DIVIDEND',
  'INTEREST_ON_EQUITY',
  'FII_INCOME',
])

function numeric(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function inferLegacyAsset(description) {
  const original = String(description ?? '').toUpperCase()
  const normalized = normalizeText(original)
  const tickerMatches = original.match(/\b[A-Z]{4}\d{1,2}\b/g)
  const ticker = tickerMatches?.at(-1)

  if (ticker) {
    let type = ticker.endsWith('11') ? 'FII' : 'STOCK'
    if (normalized.includes('etf')) type = 'ETF'
    if (normalized.includes('acao')) type = 'STOCK'
    if (normalized.includes('fii')) type = 'FII'

    return { code: ticker, name: ticker, type }
  }

  const crypto = normalized.match(
    /(?:cripto|crypto)\s+(btc|eth|sol|usdt|usdc|bnb)/i,
  )
  if (crypto) {
    const code = crypto[1].toUpperCase()
    return { code, name: `Cripto ${code}`, type: 'CRYPTO' }
  }

  const patterns = [
    ['tesouro selic', 'Tesouro Selic', 'TREASURY'],
    ['tesouro ipca', 'Tesouro IPCA', 'TREASURY'],
    ['tesouro prefixado', 'Tesouro Prefixado', 'TREASURY'],
    ['cdb', 'CDB', 'FIXED_INCOME'],
    ['lci', 'LCI', 'FIXED_INCOME'],
    ['lca', 'LCA', 'FIXED_INCOME'],
  ]

  for (const [needle, label, type] of patterns) {
    if (normalized.includes(needle)) {
      return { code: label.toUpperCase().replace(/\s+/g, '-'), name: label, type }
    }
  }

  return null
}

function inferEvent(transaction) {
  const type = transaction.transaction_type
  if (type === 'INVESTMENT_CONTRIBUTION') return 'CONTRIBUTION'
  if (type === 'INVESTMENT_REDEMPTION') return 'REDEMPTION'
  if (
    type === 'DIVIDEND' ||
    type === 'INTEREST_ON_EQUITY' ||
    type === 'FII_INCOME'
  ) {
    return 'INCOME'
  }

  const text = normalizeText(
    `${transaction.original_description ?? ''} ${transaction.normalized_description ?? ''}`,
  )

  if (
    text.includes('credito evento b3') ||
    text.includes('dividendo') ||
    text.includes('provento') ||
    text.includes('rendimento')
  ) {
    return 'INCOME'
  }
  if (
    text.includes('taxa de custodia') ||
    text.includes('taxa investimento') ||
    text.includes('imposto investimento')
  ) {
    return null
  }

  if (
    text.includes('debito b3') ||
    text.includes('debito investimento') ||
    text.includes('aporte')
  ) {
    return 'CONTRIBUTION'
  }
  if (
    text.includes('credito resgate investimento') ||
    text.includes('resgate investimento') ||
    text.includes('venda parcial')
  ) {
    return 'REDEMPTION'
  }

  return null
}

export function getInvestmentTransactionMeta(transaction) {
  const stored = transaction?.source_data?.investment
  const event = stored?.event || inferEvent(transaction)

  if (!event && !INVESTMENT_TRANSACTION_TYPES.has(transaction.transaction_type)) {
    return null
  }

  const legacyAsset = inferLegacyAsset(
    transaction.original_description ||
      transaction.normalized_description,
  )
  const asset = stored?.code
    ? {
        code: stored.code,
        name: stored.name || stored.code,
        type: stored.type || 'OTHER',
      }
    : legacyAsset

  return {
    event,
    asset: asset || {
      code: 'OUTROS',
      name: 'Outros investimentos',
      type: 'OTHER',
    },
    estimatedFromStatement:
      stored?.estimatedFromStatement !== false,
  }
}

export function buildInvestmentInsights(transactions) {
  const movements = []
  const monthlyGroups = new Map()
  const annualGroups = new Map()
  const assetGroups = new Map()

  const summary = {
    contributions: 0,
    redemptions: 0,
    income: 0,
    netContributed: 0,
    cashReturn: 0,
    movementCount: 0,
    assetCount: 0,
  }

  for (const transaction of transactions) {
    const meta = getInvestmentTransactionMeta(transaction)
    if (!meta?.event) continue

    const amount = Math.abs(numeric(transaction.amount))
    if (amount <= 0) continue

    const month = String(transaction.transaction_date ?? '').slice(0, 7)
    const year = String(transaction.transaction_date ?? '').slice(0, 4)
    const assetKey = meta.asset.code || meta.asset.name

    const movement = {
      id: transaction.id,
      date: transaction.transaction_date,
      description:
        transaction.original_description ||
        transaction.normalized_description ||
        '-',
      event: meta.event,
      amount,
      asset: meta.asset,
      account: transaction.financial_accounts,
      estimatedFromStatement: meta.estimatedFromStatement,
    }
    movements.push(movement)

    if (!monthlyGroups.has(month)) {
      monthlyGroups.set(month, {
        month,
        contributions: 0,
        redemptions: 0,
        income: 0,
        netFlow: 0,
      })
    }
    if (!annualGroups.has(year)) {
      annualGroups.set(year, {
        year,
        contributions: 0,
        redemptions: 0,
        income: 0,
        netFlow: 0,
      })
    }
    if (!assetGroups.has(assetKey)) {
      assetGroups.set(assetKey, {
        code: meta.asset.code,
        name: meta.asset.name,
        type: meta.asset.type,
        contributions: 0,
        redemptions: 0,
        income: 0,
        estimatedBalance: 0,
        movementCount: 0,
      })
    }

    const monthly = monthlyGroups.get(month)
    const annual = annualGroups.get(year)
    const asset = assetGroups.get(assetKey)

    if (meta.event === 'CONTRIBUTION') {
      summary.contributions += amount
      monthly.contributions += amount
      annual.contributions += amount
      asset.contributions += amount
    } else if (meta.event === 'REDEMPTION') {
      summary.redemptions += amount
      monthly.redemptions += amount
      annual.redemptions += amount
      asset.redemptions += amount
    } else if (meta.event === 'INCOME') {
      summary.income += amount
      monthly.income += amount
      annual.income += amount
      asset.income += amount
    }

    asset.movementCount += 1
  }

  const monthly = Array.from(monthlyGroups.values())
    .filter((item) => item.month)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => ({
      ...item,
      label: monthLabel(item.month),
      netFlow:
        item.contributions - item.redemptions - item.income,
    }))

  const annual = Array.from(annualGroups.values())
    .filter((item) => item.year)
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((item) => ({
      ...item,
      netFlow:
        item.contributions - item.redemptions - item.income,
    }))

  const assets = Array.from(assetGroups.values())
    .map((item) => ({
      ...item,
      estimatedBalance: Math.max(
        item.contributions - item.redemptions,
        0,
      ),
    }))
    .sort((a, b) => b.estimatedBalance - a.estimatedBalance)

  summary.netContributed =
    summary.contributions - summary.redemptions
  summary.cashReturn =
    summary.redemptions + summary.income
  summary.movementCount = movements.length
  summary.assetCount = assets.length

  movements.sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  )

  return {
    summary,
    monthly,
    annual,
    assets,
    movements,
  }
}
