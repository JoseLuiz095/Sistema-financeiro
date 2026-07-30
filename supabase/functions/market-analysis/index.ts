import { createClient } from 'npm:@supabase/supabase-js@2'

const DEFAULT_ORIGINS = [
  'https://sistema-financeiro-8w1.pages.dev',
  'http://localhost:5173',
]

const CACHE_MINUTES = {
  overview: 15,
  history: 30,
  catalog: 360,
}

const BRAPI_FREE_TEST_TICKERS = new Set([
  'PETR4',
  'MGLU3',
  'VALE3',
  'ITUB4',
])

function getAllowedOrigins() {
  const configured = Deno.env.get('APP_ALLOWED_ORIGINS')

  if (!configured) return DEFAULT_ORIGINS

  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = getAllowedOrigins()
  const selected = allowed.includes(origin)
    ? origin
    : allowed[0]

  return {
    'Access-Control-Allow-Origin': selected,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function normalizeTicker(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9^.-]/g, '')
    .slice(0, 12)
}

function finite(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function last<T>(values: T[]) {
  return values.length > 0 ? values[values.length - 1] : null
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]) {
  const mean = average(values)
  if (mean === null || values.length < 2) return null

  const variance = values.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0,
  ) / values.length

  return Math.sqrt(variance)
}

function sma(values: number[], period: number) {
  if (values.length < period) return null
  return average(values.slice(-period))
}

function emaSeries(values: number[], period: number) {
  if (values.length < period) return []

  const multiplier = 2 / (period + 1)
  const seed = average(values.slice(0, period)) ?? values[period - 1]
  const result = new Array(period - 1).fill(null) as Array<number | null>
  let current = seed
  result.push(current)

  for (let index = period; index < values.length; index += 1) {
    current = ((values[index] - current) * multiplier) + current
    result.push(current)
  }

  return result
}

function ema(values: number[], period: number) {
  const series = emaSeries(values, period)
  const numeric = series.filter((value): value is number => value !== null)
  return last(numeric)
}

function rsi(values: number[], period = 14) {
  if (values.length <= period) return null

  let gains = 0
  let losses = 0

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1]
    gains += Math.max(change, 0)
    losses += Math.max(-change, 0)
  }

  let averageGain = gains / period
  let averageLoss = losses / period

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1]
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)

    averageGain = ((averageGain * (period - 1)) + gain) / period
    averageLoss = ((averageLoss * (period - 1)) + loss) / period
  }

  if (averageLoss === 0) return 100

  const relativeStrength = averageGain / averageLoss
  return 100 - (100 / (1 + relativeStrength))
}

function macd(values: number[]) {
  if (values.length < 35) {
    return {
      macd: null,
      signal: null,
      histogram: null,
    }
  }

  const fast = emaSeries(values, 12)
  const slow = emaSeries(values, 26)
  const line: number[] = []

  for (let index = 0; index < values.length; index += 1) {
    const fastValue = fast[index]
    const slowValue = slow[index]

    if (fastValue !== null && slowValue !== null && fastValue !== undefined && slowValue !== undefined) {
      line.push(fastValue - slowValue)
    }
  }

  const signal = ema(line, 9)
  const macdValue = last(line)

  return {
    macd: macdValue,
    signal,
    histogram:
      macdValue !== null && signal !== null
        ? macdValue - signal
        : null,
  }
}

function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
) {
  if (closes.length < period) return null

  const recentHighs = highs.slice(-period)
  const recentLows = lows.slice(-period)
  const highest = Math.max(...recentHighs)
  const lowest = Math.min(...recentLows)
  const close = last(closes)

  if (close === null || highest === lowest) return null
  return ((close - lowest) / (highest - lowest)) * 100
}

function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
) {
  if (closes.length <= period) return null

  const trueRanges: number[] = []

  for (let index = 1; index < closes.length; index += 1) {
    trueRanges.push(Math.max(
      highs[index] - lows[index],
      Math.abs(highs[index] - closes[index - 1]),
      Math.abs(lows[index] - closes[index - 1]),
    ))
  }

  let current = average(trueRanges.slice(0, period))
  if (current === null) return null

  for (let index = period; index < trueRanges.length; index += 1) {
    current = ((current * (period - 1)) + trueRanges[index]) / period
  }

  return current
}

function obv(closes: number[], volumes: number[]) {
  if (closes.length === 0) return null

  let current = 0

  for (let index = 1; index < closes.length; index += 1) {
    if (closes[index] > closes[index - 1]) current += volumes[index] ?? 0
    if (closes[index] < closes[index - 1]) current -= volumes[index] ?? 0
  }

  return current
}

function scoreMetric(
  value: number | null,
  thresholds: Array<[number, number]>,
  fallback = null as number | null,
) {
  if (value === null) return fallback

  for (const [threshold, score] of thresholds) {
    if (value >= threshold) return score
  }

  return 0
}

function inverseScoreMetric(
  value: number | null,
  thresholds: Array<[number, number]>,
  fallback = null as number | null,
) {
  if (value === null) return fallback

  for (const [threshold, score] of thresholds) {
    if (value <= threshold) return score
  }

  return 0
}

function weightedScore(items: Array<{
  value: number | null
  weight: number
  label: string
}>) {
  let score = 0
  let usedWeight = 0
  const details: Array<{
    label: string
    score: number | null
    weight: number
  }> = []

  for (const item of items) {
    details.push({
      label: item.label,
      score: item.value,
      weight: item.weight,
    })

    if (item.value === null) continue

    score += item.value * item.weight
    usedWeight += item.weight
  }

  return {
    score: usedWeight > 0
      ? clamp(score / usedWeight, 0, 100)
      : null,
    coverage: usedWeight,
    details,
  }
}

function technicalAnalysis(rows: any[]) {
  const clean = rows
    .map((row) => ({
      date: normalizeHistoricalDate(row.date),
      open: finite(row.open),
      high: finite(row.high),
      low: finite(row.low),
      close: finite(row.adjustedClose ?? row.close),
      volume: finite(row.volume) ?? 0,
    }))
    .filter((row) =>
      row.close !== null &&
      row.high !== null &&
      row.low !== null,
    )
    .sort((a, b) => Number(new Date(a.date)) - Number(new Date(b.date)))

  const closes = clean.map((row) => row.close as number)
  const highs = clean.map((row) => row.high as number)
  const lows = clean.map((row) => row.low as number)
  const volumes = clean.map((row) => row.volume)
  const currentPrice = last(closes)
  const macdValue = macd(closes)
  const sma9 = sma(closes, 9)
  const sma21 = sma(closes, 21)
  const sma50 = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const rsi14 = rsi(closes, 14)
  const stochastic14 = stochastic(highs, lows, closes, 14)
  const atr14 = atr(highs, lows, closes, 14)
  const recent20 = closes.slice(-20)
  const middleBand = average(recent20)
  const deviation = standardDeviation(recent20)
  const upperBand =
    middleBand !== null && deviation !== null
      ? middleBand + (2 * deviation)
      : null
  const lowerBand =
    middleBand !== null && deviation !== null
      ? middleBand - (2 * deviation)
      : null
  const support20 = lows.length >= 20
    ? Math.min(...lows.slice(-20))
    : null
  const resistance20 = highs.length >= 20
    ? Math.max(...highs.slice(-20))
    : null

  const signals: Array<{
    label: string
    value: string
    direction: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
    score: number
  }> = []

  function addSignal(
    label: string,
    positive: boolean | null,
    negative: boolean | null,
    positiveText: string,
    negativeText: string,
    neutralText: string,
    weight: number,
  ) {
    if (positive) {
      signals.push({
        label,
        value: positiveText,
        direction: 'POSITIVE',
        score: weight,
      })
      return
    }

    if (negative) {
      signals.push({
        label,
        value: negativeText,
        direction: 'NEGATIVE',
        score: -weight,
      })
      return
    }

    signals.push({
      label,
      value: neutralText,
      direction: 'NEUTRAL',
      score: 0,
    })
  }

  addSignal(
    'Tendencia curta',
    currentPrice !== null && sma21 !== null ? currentPrice > sma21 : null,
    currentPrice !== null && sma21 !== null ? currentPrice < sma21 : null,
    'Preco acima da MM21',
    'Preco abaixo da MM21',
    'Sem dados suficientes',
    12,
  )

  addSignal(
    'Cruzamento curto',
    sma9 !== null && sma21 !== null ? sma9 > sma21 : null,
    sma9 !== null && sma21 !== null ? sma9 < sma21 : null,
    'MM9 acima da MM21',
    'MM9 abaixo da MM21',
    'Medias equivalentes',
    10,
  )

  addSignal(
    'Tendencia estrutural',
    sma50 !== null && sma200 !== null ? sma50 > sma200 : null,
    sma50 !== null && sma200 !== null ? sma50 < sma200 : null,
    'MM50 acima da MM200',
    'MM50 abaixo da MM200',
    'Sem 200 pregoes',
    15,
  )

  addSignal(
    'MACD',
    macdValue.histogram !== null ? macdValue.histogram > 0 : null,
    macdValue.histogram !== null ? macdValue.histogram < 0 : null,
    'Momentum positivo',
    'Momentum negativo',
    'Momentum neutro',
    12,
  )

  if (rsi14 !== null) {
    if (rsi14 >= 70) {
      signals.push({
        label: 'RSI 14',
        value: 'Sobrecompra',
        direction: 'NEGATIVE',
        score: -7,
      })
    } else if (rsi14 <= 30) {
      signals.push({
        label: 'RSI 14',
        value: 'Sobrevenda',
        direction: 'POSITIVE',
        score: 7,
      })
    } else if (rsi14 >= 50) {
      signals.push({
        label: 'RSI 14',
        value: 'Forca compradora moderada',
        direction: 'POSITIVE',
        score: 7,
      })
    } else {
      signals.push({
        label: 'RSI 14',
        value: 'Forca vendedora moderada',
        direction: 'NEGATIVE',
        score: -7,
      })
    }
  }

  if (currentPrice !== null && upperBand !== null && lowerBand !== null) {
    if (currentPrice > upperBand) {
      signals.push({
        label: 'Bandas de Bollinger',
        value: 'Acima da banda superior',
        direction: 'NEGATIVE',
        score: -6,
      })
    } else if (currentPrice < lowerBand) {
      signals.push({
        label: 'Bandas de Bollinger',
        value: 'Abaixo da banda inferior',
        direction: 'POSITIVE',
        score: 6,
      })
    } else {
      signals.push({
        label: 'Bandas de Bollinger',
        value: 'Dentro das bandas',
        direction: 'NEUTRAL',
        score: 0,
      })
    }
  }

  const rawScore = signals.reduce((sum, signal) => sum + signal.score, 0)
  const maxScore = signals.reduce((sum, signal) => sum + Math.abs(signal.score), 0)
  const normalizedScore = maxScore > 0
    ? clamp(50 + ((rawScore / maxScore) * 50), 0, 100)
    : 50

  let label = 'Neutro'
  if (normalizedScore >= 75) label = 'Compra forte'
  else if (normalizedScore >= 60) label = 'Compra'
  else if (normalizedScore <= 25) label = 'Venda forte'
  else if (normalizedScore <= 40) label = 'Venda'

  return {
    score: normalizedScore,
    label,
    observations: clean.length,
    currentPrice,
    indicators: {
      sma9,
      sma21,
      sma50,
      sma200,
      ema12,
      ema26,
      rsi14,
      macd: macdValue.macd,
      macdSignal: macdValue.signal,
      macdHistogram: macdValue.histogram,
      stochastic14,
      atr14,
      atrPercent:
        atr14 !== null && currentPrice
          ? (atr14 / currentPrice) * 100
          : null,
      bollingerMiddle: middleBand,
      bollingerUpper: upperBand,
      bollingerLower: lowerBand,
      support20,
      resistance20,
      obv: obv(closes, volumes),
    },
    signals,
  }
}

function sumCashDividendsLast12Months(dividends: any[]) {
  const cutoff = new Date()
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)

  return dividends.reduce((sum, item) => {
    const dateValue = item.paymentDate ?? item.lastDatePrior ?? item.approvedOn
    const date = dateValue ? new Date(dateValue) : null
    const rate = finite(item.rate)

    if (!date || Number.isNaN(date.getTime()) || date < cutoff || rate === null) {
      return sum
    }

    return sum + rate
  }, 0)
}

function sumAvailable(values: Array<number | null>) {
  const available = values.filter(
    (value): value is number => value !== null,
  )

  if (available.length === 0) return null
  return available.reduce((sum, value) => sum + value, 0)
}

function safeDivide(
  numerator: number | null,
  denominator: number | null,
) {
  if (
    numerator === null ||
    denominator === null ||
    denominator === 0
  ) {
    return null
  }

  return numerator / denominator
}

function pickFinite(
  source: any,
  keys: string[],
) {
  for (const key of keys) {
    const value = finite(source?.[key])
    if (value !== null) return value
  }

  return null
}

function statementDate(row: any) {
  const value = row?.endDate ?? row?.date ?? row?.referenceDate
  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function sortStatements(rows: any[]) {
  return [...rows]
    .filter((row) => row && typeof row === 'object')
    .sort((a, b) => statementDate(b) - statementDate(a))
}

function extractStatementRows(
  response: any,
  nestedKeys: string[] = [],
) {
  const direct = resultData(response)
  if (Array.isArray(direct)) return sortStatements(direct)

  for (const key of nestedKeys) {
    const candidate = direct?.[key] ?? response?.[key]
    if (Array.isArray(candidate)) return sortStatements(candidate)
  }

  return []
}

function calculateGrowth(
  rows: any[],
  keys: string[],
) {
  const sorted = sortStatements(rows)
  if (sorted.length < 2) return null

  const current = pickFinite(sorted[0], keys)
  const previous = pickFinite(sorted[1], keys)

  if (
    current === null ||
    previous === null ||
    previous === 0
  ) {
    return null
  }

  return (current - previous) / Math.abs(previous)
}

function calculateCagr(
  rows: any[],
  keys: string[],
  maximumPeriods = 4,
) {
  const sorted = sortStatements(rows).slice(0, maximumPeriods)
  if (sorted.length < 2) return null

  const newest = pickFinite(sorted[0], keys)
  const oldest = pickFinite(sorted[sorted.length - 1], keys)
  const years = sorted.length - 1

  if (
    newest === null ||
    oldest === null ||
    newest <= 0 ||
    oldest <= 0 ||
    years <= 0
  ) {
    return null
  }

  return (newest / oldest) ** (1 / years) - 1
}

function positiveRatio(
  rows: any[],
  keys: string[],
  maximumPeriods = 5,
) {
  const values = sortStatements(rows)
    .slice(0, maximumPeriods)
    .map((row) => pickFinite(row, keys))
    .filter((value): value is number => value !== null)

  if (values.length === 0) return null
  return values.filter((value) => value > 0).length / values.length
}

function sumRecentField(
  rows: any[],
  keys: string[],
  periods = 4,
) {
  const values = sortStatements(rows)
    .slice(0, periods)
    .map((row) => pickFinite(row, keys))

  if (
    values.length < periods ||
    values.some((value) => value === null)
  ) {
    return null
  }

  return (values as number[])
    .reduce((sum, value) => sum + value, 0)
}

function quarterlyYearOverYearGrowth(
  rows: any[],
  keys: string[],
) {
  const sorted = sortStatements(rows)
  if (sorted.length < 5) return null

  const current = pickFinite(sorted[0], keys)
  const previousYear = pickFinite(sorted[4], keys)

  if (
    current === null ||
    previousYear === null ||
    previousYear === 0
  ) {
    return null
  }

  return (current - previousYear) / Math.abs(previousYear)
}

function deriveFundamentals({
  statistics,
  financial,
  balanceAnnual,
  balanceQuarterly,
  incomeAnnual,
  incomeQuarterly,
  cashAnnual,
  cashQuarterly,
}: {
  statistics: any
  financial: any
  balanceAnnual: any[]
  balanceQuarterly: any[]
  incomeAnnual: any[]
  incomeQuarterly: any[]
  cashAnnual: any[]
  cashQuarterly: any[]
}) {
  const annualBalance = sortStatements(balanceAnnual)
  const quarterlyBalance = sortStatements(balanceQuarterly)
  const annualIncome = sortStatements(incomeAnnual)
  const quarterlyIncome = sortStatements(incomeQuarterly)
  const annualCashflow = sortStatements(cashAnnual)
  const quarterlyCashflow = sortStatements(cashQuarterly)

  const latestBalance =
    quarterlyBalance[0] ??
    annualBalance[0] ??
    {}
  const previousComparableBalance =
    quarterlyBalance[4] ??
    annualBalance[1] ??
    quarterlyBalance[1] ??
    {}
  const latestAnnualIncome = annualIncome[0] ?? {}
  const latestAnnualCashflow = annualCashflow[0] ?? {}

  const revenueKeys = [
    'totalRevenue',
    'netRevenue',
    'financialIntermediationRevenue',
    'revenue',
  ]
  const netIncomeKeys = [
    'netIncome',
    'cleanNetIncome',
    'netIncomeApplicableToCommonShares',
    'netIncomeFromContinuingOps',
  ]

  const totalRevenue =
    pickFinite(financial, ['totalRevenue']) ??
    sumRecentField(quarterlyIncome, revenueKeys) ??
    pickFinite(latestAnnualIncome, revenueKeys)

  const netIncome =
    pickFinite(statistics, ['netIncomeToCommon']) ??
    sumRecentField(quarterlyIncome, netIncomeKeys) ??
    pickFinite(latestAnnualIncome, netIncomeKeys)

  const equity = pickFinite(latestBalance, [
    'shareholdersEquity',
    'totalStockholderEquity',
    'controllerShareholdersEquity',
  ])
  const previousEquity = pickFinite(previousComparableBalance, [
    'shareholdersEquity',
    'totalStockholderEquity',
    'controllerShareholdersEquity',
  ])
  const totalAssets = pickFinite(latestBalance, ['totalAssets'])
  const previousAssets = pickFinite(previousComparableBalance, ['totalAssets'])
  const currentAssets = pickFinite(latestBalance, [
    'currentAssets',
    'totalCurrentAssets',
  ])
  const currentLiabilities = pickFinite(latestBalance, [
    'currentLiabilities',
    'totalCurrentLiabilities',
  ])
  const inventory = pickFinite(latestBalance, ['inventory']) ?? 0

  const totalDebt =
    pickFinite(financial, ['totalDebt']) ??
    sumAvailable([
      pickFinite(latestBalance, [
        'loansAndFinancing',
        'shortLongTermDebt',
      ]),
      pickFinite(latestBalance, [
        'longTermLoansAndFinancing',
        'longTermDebt',
      ]),
      pickFinite(latestBalance, ['debentures']),
      pickFinite(latestBalance, ['longTermDebentures']),
      pickFinite(latestBalance, ['leaseFinancing']),
      pickFinite(latestBalance, ['longTermLeaseFinancing']),
    ])

  const totalCash =
    pickFinite(financial, ['totalCash']) ??
    sumAvailable([
      pickFinite(latestBalance, ['cash']),
      pickFinite(latestBalance, ['shortTermInvestments']),
    ])

  const ebitda =
    pickFinite(financial, ['ebitda']) ??
    sumRecentField(quarterlyIncome, ['cleanEbitda', 'ebitda']) ??
    pickFinite(latestAnnualIncome, ['cleanEbitda', 'ebitda'])
  const ebit =
    sumRecentField(quarterlyIncome, [
      'cleanEbit',
      'ebit',
      'operatingIncome',
    ]) ??
    pickFinite(latestAnnualIncome, [
      'cleanEbit',
      'ebit',
      'operatingIncome',
    ])
  const interestExpense =
    sumRecentField(quarterlyIncome, [
      'interestExpense',
      'financialExpenses',
    ]) ??
    pickFinite(latestAnnualIncome, [
      'interestExpense',
      'financialExpenses',
    ])
  const grossProfit =
    sumRecentField(quarterlyIncome, ['grossProfit']) ??
    pickFinite(latestAnnualIncome, ['grossProfit'])
  const operatingIncome =
    sumRecentField(quarterlyIncome, [
      'operatingIncome',
      'cleanEbit',
      'ebit',
    ]) ??
    pickFinite(latestAnnualIncome, [
      'operatingIncome',
      'cleanEbit',
      'ebit',
    ])
  const freeCashflow =
    pickFinite(financial, ['freeCashflow']) ??
    sumRecentField(quarterlyCashflow, ['freeCashFlow']) ??
    pickFinite(latestAnnualCashflow, ['freeCashFlow'])
  const operatingCashflow =
    pickFinite(financial, ['operatingCashflow']) ??
    sumRecentField(quarterlyCashflow, [
      'operatingCashFlow',
      'cashGeneratedInOperations',
    ]) ??
    pickFinite(latestAnnualCashflow, [
      'operatingCashFlow',
      'cashGeneratedInOperations',
    ])

  const averageEquity =
    equity !== null && previousEquity !== null
      ? (equity + previousEquity) / 2
      : equity
  const averageAssets =
    totalAssets !== null && previousAssets !== null
      ? (totalAssets + previousAssets) / 2
      : totalAssets

  const revenueGrowth =
    pickFinite(financial, [
      'revenueGrowthAnnual',
      'revenueGrowth',
    ]) ??
    calculateGrowth(annualIncome, revenueKeys) ??
    quarterlyYearOverYearGrowth(quarterlyIncome, revenueKeys)

  const earningsGrowth =
    pickFinite(financial, [
      'earningsGrowthAnnual',
      'earningsGrowth',
    ]) ??
    calculateGrowth(annualIncome, netIncomeKeys) ??
    quarterlyYearOverYearGrowth(quarterlyIncome, netIncomeKeys)

  const debtToEquity =
    pickFinite(financial, ['debtToEquity']) ??
    safeDivide(totalDebt, equity)

  return {
    trailingPe: pickFinite(statistics, ['trailingPE']),
    priceToBook: pickFinite(statistics, ['priceToBook']),
    enterpriseToEbitda: pickFinite(statistics, ['enterpriseToEbitda']),
    dividendYield: pickFinite(statistics, ['dividendYield', 'yield']),
    beta: pickFinite(statistics, ['beta']),
    eps: pickFinite(statistics, [
      'trailingEps',
      'earningsPerShare',
    ]),
    bookValuePerShare: pickFinite(statistics, ['bookValue']),
    analystMean: pickFinite(financial, ['targetMeanPrice']),
    analystMedian: pickFinite(financial, ['targetMedianPrice']),
    analystCount: pickFinite(financial, ['numberOfAnalystOpinions']),
    roe:
      pickFinite(financial, ['returnOnEquity']) ??
      safeDivide(netIncome, averageEquity),
    roa:
      pickFinite(financial, ['returnOnAssets']) ??
      safeDivide(netIncome, averageAssets),
    grossMargin:
      pickFinite(financial, ['grossMargins']) ??
      safeDivide(grossProfit, totalRevenue),
    ebitdaMargin:
      pickFinite(financial, ['ebitdaMargins']) ??
      safeDivide(ebitda, totalRevenue),
    operatingMargin:
      pickFinite(financial, ['operatingMargins']) ??
      safeDivide(operatingIncome, totalRevenue),
    netMargin:
      pickFinite(financial, ['profitMargins']) ??
      pickFinite(statistics, ['profitMargins']) ??
      safeDivide(netIncome, totalRevenue),
    currentRatio:
      pickFinite(financial, ['currentRatio']) ??
      safeDivide(currentAssets, currentLiabilities),
    quickRatio:
      pickFinite(financial, ['quickRatio']) ??
      safeDivide(
        currentAssets === null
          ? null
          : currentAssets - inventory,
        currentLiabilities,
      ),
    debtToEquity,
    netDebtToEbitda: safeDivide(
      totalDebt === null || totalCash === null
        ? null
        : totalDebt - totalCash,
      ebitda,
    ),
    interestCoverage: safeDivide(
      ebit,
      interestExpense === null
        ? null
        : Math.abs(interestExpense),
    ),
    cashToDebt: safeDivide(totalCash, totalDebt),
    totalDebt,
    totalCash,
    totalAssets,
    equity,
    totalRevenue,
    netIncome,
    freeCashflow,
    operatingCashflow,
    freeCashflowMargin: safeDivide(freeCashflow, totalRevenue),
    cashConversion: safeDivide(operatingCashflow, netIncome),
    revenueGrowth,
    earningsGrowth,
    equityGrowth:
      calculateGrowth(annualBalance, [
        'shareholdersEquity',
        'totalStockholderEquity',
        'controllerShareholdersEquity',
      ]) ??
      quarterlyYearOverYearGrowth(quarterlyBalance, [
        'shareholdersEquity',
        'totalStockholderEquity',
        'controllerShareholdersEquity',
      ]),
    assetGrowth:
      calculateGrowth(annualBalance, ['totalAssets']) ??
      quarterlyYearOverYearGrowth(quarterlyBalance, ['totalAssets']),
    revenueCagr3y: calculateCagr(annualIncome, revenueKeys),
    earningsCagr3y: calculateCagr(annualIncome, netIncomeKeys),
    positiveProfitYears: positiveRatio(annualIncome, netIncomeKeys),
    positiveFreeCashflowYears: positiveRatio(
      annualCashflow,
      ['freeCashFlow'],
    ),
    statementYears: Math.max(
      annualBalance.length,
      annualIncome.length,
      annualCashflow.length,
    ),
    statementQuarters: Math.max(
      quarterlyBalance.length,
      quarterlyIncome.length,
      quarterlyCashflow.length,
    ),
  }
}

function buildHealthScore(
  fundamentals: any,
  profile: any,
) {
  const sector = String(profile?.sector ?? '')
  const financialSector = /finance|banco|seguro|servicos financeiros|financial/i.test(sector)

  const profitability = weightedScore([
    {
      label: 'ROE',
      value: scoreMetric(fundamentals.roe, [[0.25, 100], [0.18, 85], [0.12, 70], [0.06, 45], [0, 20]]),
      weight: financialSector ? 35 : 25,
    },
    {
      label: 'ROA',
      value: scoreMetric(fundamentals.roa, [[0.12, 100], [0.08, 85], [0.05, 70], [0.02, 45], [0, 20]]),
      weight: financialSector ? 25 : 15,
    },
    {
      label: 'Margem liquida',
      value: scoreMetric(fundamentals.netMargin, [[0.20, 100], [0.12, 80], [0.07, 65], [0.02, 40], [0, 20]]),
      weight: 25,
    },
    {
      label: 'Margem operacional',
      value: scoreMetric(fundamentals.operatingMargin, [[0.20, 100], [0.12, 80], [0.07, 65], [0.02, 40], [0, 20]]),
      weight: 20,
    },
    {
      label: 'Margem de caixa livre',
      value: scoreMetric(fundamentals.freeCashflowMargin, [[0.15, 100], [0.08, 80], [0.03, 60], [0, 35], [-0.05, 15]]),
      weight: financialSector ? 0 : 15,
    },
  ])

  const financialStrength = financialSector
    ? weightedScore([
        {
          label: 'Crescimento do patrimonio',
          value: scoreMetric(fundamentals.equityGrowth, [[0.15, 100], [0.08, 80], [0.03, 65], [0, 45], [-0.10, 20]]),
          weight: 50,
        },
        {
          label: 'Anos com lucro positivo',
          value: scoreMetric(fundamentals.positiveProfitYears, [[1, 100], [0.8, 80], [0.6, 60], [0.4, 35], [0, 10]]),
          weight: 50,
        },
      ])
    : weightedScore([
        {
          label: 'Divida / patrimonio',
          value: inverseScoreMetric(fundamentals.debtToEquity, [[0.30, 100], [0.60, 85], [1.00, 65], [1.50, 40], [2.50, 20]]),
          weight: 30,
        },
        {
          label: 'Divida liquida / EBITDA',
          value: inverseScoreMetric(fundamentals.netDebtToEbitda, [[0, 100], [1, 85], [2, 70], [3, 50], [4, 25]]),
          weight: 25,
        },
        {
          label: 'Cobertura de juros',
          value: scoreMetric(fundamentals.interestCoverage, [[8, 100], [5, 85], [3, 65], [1.5, 40], [1, 20]]),
          weight: 20,
        },
        {
          label: 'Liquidez corrente',
          value: scoreMetric(fundamentals.currentRatio, [[2, 100], [1.5, 85], [1.2, 70], [1, 50], [0.8, 25]]),
          weight: 15,
        },
        {
          label: 'Caixa / divida',
          value: scoreMetric(fundamentals.cashToDebt, [[1, 100], [0.6, 80], [0.35, 60], [0.2, 40], [0, 15]]),
          weight: 10,
        },
      ])

  const cashQuality = weightedScore([
    {
      label: 'Fluxo de caixa livre positivo',
      value: fundamentals.freeCashflow === null
        ? null
        : fundamentals.freeCashflow > 0 ? 90 : 10,
      weight: 30,
    },
    {
      label: 'Fluxo operacional positivo',
      value: fundamentals.operatingCashflow === null
        ? null
        : fundamentals.operatingCashflow > 0 ? 90 : 10,
      weight: 25,
    },
    {
      label: 'Conversao de lucro em caixa',
      value: scoreMetric(fundamentals.cashConversion, [[1.2, 100], [0.9, 80], [0.6, 60], [0.3, 35], [0, 15]]),
      weight: 25,
    },
    {
      label: 'Anos com caixa livre positivo',
      value: scoreMetric(fundamentals.positiveFreeCashflowYears, [[1, 100], [0.8, 80], [0.6, 60], [0.4, 35], [0, 10]]),
      weight: 20,
    },
  ])

  const growth = weightedScore([
    {
      label: 'Crescimento da receita',
      value: scoreMetric(fundamentals.revenueGrowth, [[0.15, 100], [0.08, 80], [0.03, 65], [0, 45], [-0.10, 20]]),
      weight: 25,
    },
    {
      label: 'Crescimento do lucro',
      value: scoreMetric(fundamentals.earningsGrowth, [[0.15, 100], [0.08, 80], [0.03, 65], [0, 45], [-0.10, 20]]),
      weight: 30,
    },
    {
      label: 'CAGR da receita',
      value: scoreMetric(fundamentals.revenueCagr3y, [[0.12, 100], [0.07, 80], [0.03, 65], [0, 45], [-0.08, 20]]),
      weight: 20,
    },
    {
      label: 'CAGR do lucro',
      value: scoreMetric(fundamentals.earningsCagr3y, [[0.12, 100], [0.07, 80], [0.03, 65], [0, 45], [-0.08, 20]]),
      weight: 25,
    },
  ])

  const categoryItems = financialSector
    ? [
        { label: 'Rentabilidade', score: profitability.score, weight: 40, coverage: profitability.coverage, details: profitability.details },
        { label: 'Capital e estabilidade', score: financialStrength.score, weight: 25, coverage: financialStrength.coverage, details: financialStrength.details },
        { label: 'Crescimento', score: growth.score, weight: 35, coverage: growth.coverage, details: growth.details },
      ]
    : [
        { label: 'Rentabilidade', score: profitability.score, weight: 30, coverage: profitability.coverage, details: profitability.details },
        { label: 'Solidez financeira', score: financialStrength.score, weight: 30, coverage: financialStrength.coverage, details: financialStrength.details },
        { label: 'Geracao de caixa', score: cashQuality.score, weight: 20, coverage: cashQuality.coverage, details: cashQuality.details },
        { label: 'Crescimento', score: growth.score, weight: 20, coverage: growth.coverage, details: growth.details },
      ]

  const aggregate = weightedScore(categoryItems.map((item) => ({
    label: item.label,
    value: item.score,
    weight: item.weight,
  })))

  const availableCategories = categoryItems.filter((item) => item.score !== null)
  const coverage = categoryItems.reduce(
    (sum, item) => sum + (item.score !== null ? item.weight : 0),
    0,
  )

  let label = 'Dados insuficientes'
  if (aggregate.score !== null && coverage >= 30) {
    if (aggregate.score >= 80) label = 'Muito boa'
    else if (aggregate.score >= 65) label = 'Boa'
    else if (aggregate.score >= 50) label = 'Regular'
    else if (aggregate.score >= 35) label = 'Fragil'
    else label = 'Muito fragil'
  }

  return {
    score: coverage >= 30 ? aggregate.score : null,
    label,
    coverage,
    sector,
    financialSector,
    categories: availableCategories,
    statementYears: fundamentals.statementYears,
    raw: fundamentals,
    limitations: financialSector
      ? [
          'Para bancos, a nota não inclui índice de Basileia, inadimplência ou cobertura de provisões quando a fonte não os fornece.',
        ]
      : [],
  }
}

function buildValuation(
  currentPrice: number | null,
  fundamentals: any,
  annualDividends: number,
  assumptions: any,
) {
  const requiredReturn = clamp(finite(assumptions?.requiredReturn) ?? 0.12, 0.06, 0.40)
  const perpetualGrowth = clamp(finite(assumptions?.perpetualGrowth) ?? 0.04, 0, requiredReturn - 0.005)
  const targetPe = clamp(finite(assumptions?.targetPe) ?? 10, 3, 40)
  const targetDividendYield = clamp(finite(assumptions?.targetDividendYield) ?? 0.06, 0.01, 0.30)
  const marginOfSafety = clamp(finite(assumptions?.marginOfSafety) ?? 0.20, 0, 0.60)
  const eps = finite(fundamentals?.eps)
  const bookValue = finite(fundamentals?.bookValuePerShare)
  const analystMean = finite(fundamentals?.analystMean)
  const analystMedian = finite(fundamentals?.analystMedian)

  const models: Array<{
    id: string
    label: string
    price: number
    weight: number
    explanation: string
  }> = []

  if (eps !== null && eps > 0 && bookValue !== null && bookValue > 0) {
    models.push({
      id: 'graham',
      label: 'Graham',
      price: Math.sqrt(22.5 * eps * bookValue),
      weight: 30,
      explanation: 'Raiz de 22,5 x LPA x VPA. Aplicavel apenas com lucro e patrimonio positivos.',
    })
  }

  if (eps !== null && eps > 0) {
    models.push({
      id: 'earnings',
      label: 'P/L alvo',
      price: eps * targetPe,
      weight: 30,
      explanation: 'Lucro por acao multiplicado pelo P/L alvo configurado.',
    })
  }

  if (annualDividends > 0 && requiredReturn > perpetualGrowth) {
    models.push({
      id: 'gordon',
      label: 'Gordon',
      price:
        (annualDividends * (1 + perpetualGrowth)) /
        (requiredReturn - perpetualGrowth),
      weight: 25,
      explanation: 'Dividendo projetado dividido pela diferenca entre retorno exigido e crescimento perpetuo.',
    })

    models.push({
      id: 'dividend-yield',
      label: 'Dividend yield alvo',
      price: annualDividends / targetDividendYield,
      weight: 15,
      explanation: 'Provento por acao dos ultimos 12 meses dividido pelo yield alvo.',
    })
  }

  const validModels = models
    .filter((model) => Number.isFinite(model.price) && model.price > 0)
    .sort((a, b) => a.price - b.price)

  const totalWeight = validModels.reduce((sum, model) => sum + model.weight, 0)
  const basePrice = totalWeight > 0
    ? validModels.reduce((sum, model) => sum + (model.price * model.weight), 0) / totalWeight
    : null

  const conservativePrice = validModels.length > 0
    ? validModels[Math.floor((validModels.length - 1) * 0.25)].price
    : null
  const optimisticPrice = validModels.length > 0
    ? validModels[Math.ceil((validModels.length - 1) * 0.75)].price
    : null
  const buyBelow = basePrice !== null
    ? basePrice * (1 - marginOfSafety)
    : null

  const confidence = clamp(
    (validModels.length / 4) * 70 +
    (eps !== null ? 10 : 0) +
    (bookValue !== null ? 10 : 0) +
    (annualDividends > 0 ? 10 : 0),
    0,
    100,
  )

  return {
    assumptions: {
      requiredReturn,
      perpetualGrowth,
      targetPe,
      targetDividendYield,
      marginOfSafety,
    },
    inputs: {
      eps,
      bookValue,
      annualDividends,
    },
    models: validModels,
    basePrice,
    conservativePrice,
    optimisticPrice,
    buyBelow,
    currentPrice,
    upsidePercent:
      currentPrice && basePrice !== null
        ? ((basePrice / currentPrice) - 1) * 100
        : null,
    marginOfSafetyPercent:
      currentPrice && basePrice !== null
        ? ((basePrice - currentPrice) / basePrice) * 100
        : null,
    analystReference: {
      mean: analystMean,
      median: analystMedian,
    },
    confidence,
    disclaimer:
      'Estimativa matematica, nao recomendacao. Resultados mudam conforme premissas, ciclo economico e qualidade dos dados.',
  }
}

function chartSeries(rows: any[]) {
  const clean = rows
    .map((row) => ({
      date: normalizeHistoricalDate(row.date),
      open: finite(row.open),
      high: finite(row.high),
      low: finite(row.low),
      close: finite(row.adjustedClose ?? row.close),
      volume: finite(row.volume) ?? 0,
    }))
    .filter((row) => row.close !== null)
    .sort((a, b) => Number(new Date(a.date)) - Number(new Date(b.date)))

  const closes = clean.map((row) => row.close as number)

  return clean.map((row, index) => {
    const slice = closes.slice(0, index + 1)
    return {
      ...row,
      sma21: sma(slice, 21),
      sma50: sma(slice, 50),
      sma200: sma(slice, 200),
    }
  })
}

function getPublishableKey() {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (keys) return JSON.parse(keys).default
  return Deno.env.get('SUPABASE_ANON_KEY')
}

function getSecretKey() {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) return JSON.parse(keys).default
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

function decodeJwtPayload(authorization: string) {
  try {
    const token = authorization.replace(/^Bearer\s+/i, '')
    const payload = token.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    )
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function resultData(response: any) {
  return response?.results?.[0]?.data ?? null
}

function resultRows(response: any) {
  const data = resultData(response)
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.historicalDataPrice)) {
    return data.historicalDataPrice
  }
  return []
}

function legacyResult(response: any) {
  return response?.results?.[0] ?? null
}

function legacyModule(
  response: any,
  key: string,
) {
  const result = legacyResult(response)
  return result?.[key] ?? null
}

function firstNonEmptyObject(...values: any[]) {
  for (const value of values) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      return value
    }
  }

  return {}
}

function firstNonEmptyRows(...values: any[][]) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value
    }
  }

  return []
}

function moduleRows(
  module: any,
  nestedKeys: string[] = [],
) {
  if (Array.isArray(module)) return sortStatements(module)

  for (const key of nestedKeys) {
    if (Array.isArray(module?.[key])) {
      return sortStatements(module[key])
    }
  }

  return []
}

function normalizeCatalogResponse(response: any) {
  const candidates = [
    response?.results,
    response?.stocks,
    response?.tickers,
    response?.data,
    response?.items,
  ].find(Array.isArray) ?? []

  const values = new Map<string, any>()

  for (const candidate of candidates) {
    const item = typeof candidate === 'string'
      ? { symbol: candidate, name: candidate }
      : candidate
    const symbol = normalizeTicker(
      item?.symbol ?? item?.stock ?? item?.ticker,
    )

    if (!symbol) continue

    values.set(symbol, {
      symbol,
      name:
        item?.name ??
        item?.longName ??
        item?.shortName ??
        symbol,
      type: item?.type ?? null,
      subType: item?.subType ?? item?.subtype ?? null,
      sector: item?.sector ?? null,
      subsector:
        item?.subsector ??
        item?.subSector ??
        item?.industry ??
        null,
      close: finite(item?.close ?? item?.regularMarketPrice),
      change: finite(item?.change ?? item?.regularMarketChangePercent),
      volume: finite(item?.volume ?? item?.regularMarketVolume),
      marketCap: finite(item?.marketCap ?? item?.market_cap),
      logo: item?.logo ?? item?.logourl ?? item?.logoUrl ?? null,
    })
  }

  return [...values.values()].sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  )
}

function normalizeHistoricalDate(value: unknown) {
  if (typeof value === 'number') {
    const milliseconds = value < 1000000000000
      ? value * 1000
      : value
    return new Date(milliseconds).toISOString().slice(0, 10)
  }

  const date = new Date(String(value ?? ''))
  return Number.isNaN(date.getTime())
    ? String(value ?? '')
    : date.toISOString().slice(0, 10)
}

async function brapiGet(path: string, token: string | null) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`https://brapi.dev${path}`, {
    headers,
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      `brapi ${response.status}: ${body?.message ?? response.statusText}`,
    )
  }

  return body
}



function mergeDefinedObjects(...objects: any[]) {
  const result: Record<string, unknown> = {}

  for (const object of objects) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) continue

    for (const [key, value] of Object.entries(object)) {
      if (value !== null && value !== undefined && value !== '') {
        result[key] = value
      }
    }
  }

  return result
}

function yahooRaw(value: any) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, 'raw')
  ) {
    return value.raw
  }

  return value ?? null
}

function yahooSymbol(ticker: string) {
  if (ticker.startsWith('^') || ticker.includes('.')) return ticker
  return `${ticker}.SA`
}

async function externalJsonGet(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
      'User-Agent':
        'Mozilla/5.0 (compatible; FinanceiroPessoal/1.0; +https://sistema-financeiro-8w1.pages.dev)',
    },
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      `JSON externo ${response.status}: ${
        body?.chart?.error?.description ??
        body?.quoteSummary?.error?.description ??
        body?.message ??
        response.statusText
      }`,
    )
  }

  return body
}

function yahooChartPayload(body: any, ticker: string) {
  const result = body?.chart?.result?.[0]
  if (!result) return null

  const meta = result.meta ?? {}
  const timestamps = Array.isArray(result.timestamp)
    ? result.timestamp
    : []
  const quoteValues = result.indicators?.quote?.[0] ?? {}
  const adjustedValues =
    result.indicators?.adjclose?.[0]?.adjclose ?? []

  const rows = timestamps
    .map((timestamp: number, index: number) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: finite(quoteValues.open?.[index]),
      high: finite(quoteValues.high?.[index]),
      low: finite(quoteValues.low?.[index]),
      close: finite(quoteValues.close?.[index]),
      adjustedClose:
        finite(adjustedValues?.[index]) ??
        finite(quoteValues.close?.[index]),
      volume: finite(quoteValues.volume?.[index]) ?? 0,
    }))
    .filter((row: any) => row.close !== null)

  const previousClose = finite(
    meta.chartPreviousClose ?? meta.previousClose,
  )
  const price =
    finite(meta.regularMarketPrice) ??
    finite(last(rows)?.adjustedClose) ??
    finite(last(rows)?.close)
  const change =
    price !== null && previousClose !== null
      ? price - previousClose
      : null
  const changePercent =
    change !== null && previousClose
      ? (change / previousClose) * 100
      : null

  const dividendEvents = Object.values(
    result.events?.dividends ?? {},
  ).map((item: any) => ({
    paymentDate: item?.date
      ? new Date(Number(item.date) * 1000).toISOString()
      : null,
    rate: finite(item?.amount),
  }))

  return {
    quote: {
      symbol: ticker,
      shortName:
        meta.shortName ?? meta.symbol ?? ticker,
      longName:
        meta.longName ?? meta.shortName ?? ticker,
      currency: meta.currency ?? 'BRL',
      regularMarketPrice: price,
      regularMarketPreviousClose: previousClose,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketOpen: finite(meta.regularMarketOpen),
      regularMarketDayHigh: finite(meta.regularMarketDayHigh),
      regularMarketDayLow: finite(meta.regularMarketDayLow),
      regularMarketVolume: finite(meta.regularMarketVolume),
      regularMarketTime: meta.regularMarketTime
        ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
        : null,
      exchangeName: meta.exchangeName ?? null,
      timezone: meta.exchangeTimezoneName ?? null,
    },
    historyRows: rows,
    cashDividends: dividendEvents,
  }
}

function yahooSummaryPayload(body: any) {
  const result = body?.quoteSummary?.result?.[0]
  if (!result) return null

  const price = result.price ?? {}
  const profile = result.assetProfile ?? {}
  const summary = result.summaryDetail ?? {}
  const statistics = result.defaultKeyStatistics ?? {}
  const financial = result.financialData ?? {}

  return {
    quote: {
      shortName: price.shortName ?? null,
      longName: price.longName ?? null,
      currency: price.currency ?? null,
      regularMarketPrice: finite(yahooRaw(price.regularMarketPrice)),
      regularMarketPreviousClose: finite(
        yahooRaw(summary.previousClose),
      ),
      regularMarketOpen: finite(yahooRaw(summary.open)),
      regularMarketDayHigh: finite(yahooRaw(summary.dayHigh)),
      regularMarketDayLow: finite(yahooRaw(summary.dayLow)),
      regularMarketVolume: finite(yahooRaw(summary.volume)),
      marketCap: finite(
        yahooRaw(price.marketCap) ?? yahooRaw(summary.marketCap),
      ),
      fiftyTwoWeekHigh: finite(yahooRaw(summary.fiftyTwoWeekHigh)),
      fiftyTwoWeekLow: finite(yahooRaw(summary.fiftyTwoWeekLow)),
    },
    profile: {
      sector: profile.sector ?? null,
      industry: profile.industry ?? null,
      longBusinessSummary: profile.longBusinessSummary ?? null,
      website: profile.website ?? null,
      fullTimeEmployees: finite(profile.fullTimeEmployees),
    },
    statistics: {
      trailingPE: finite(yahooRaw(summary.trailingPE)),
      forwardPE: finite(yahooRaw(statistics.forwardPE)),
      priceToBook: finite(yahooRaw(statistics.priceToBook)),
      beta: finite(yahooRaw(statistics.beta)),
      bookValue: finite(yahooRaw(statistics.bookValue)),
      trailingEps: finite(yahooRaw(statistics.trailingEps)),
      forwardEps: finite(yahooRaw(statistics.forwardEps)),
      sharesOutstanding: finite(yahooRaw(statistics.sharesOutstanding)),
      enterpriseValue: finite(yahooRaw(statistics.enterpriseValue)),
      marketCap: finite(
        yahooRaw(price.marketCap) ?? yahooRaw(summary.marketCap),
      ),
      dividendYield: finite(yahooRaw(summary.dividendYield)),
      dividendRate: finite(yahooRaw(summary.dividendRate)),
      payoutRatio: finite(yahooRaw(summary.payoutRatio)),
      fiftyTwoWeekHigh: finite(yahooRaw(summary.fiftyTwoWeekHigh)),
      fiftyTwoWeekLow: finite(yahooRaw(summary.fiftyTwoWeekLow)),
    },
    financial: {
      currentPrice: finite(yahooRaw(financial.currentPrice)),
      targetMeanPrice: finite(yahooRaw(financial.targetMeanPrice)),
      targetMedianPrice: finite(yahooRaw(financial.targetMedianPrice)),
      returnOnEquity: finite(yahooRaw(financial.returnOnEquity)),
      returnOnAssets: finite(yahooRaw(financial.returnOnAssets)),
      grossMargins: finite(yahooRaw(financial.grossMargins)),
      operatingMargins: finite(yahooRaw(financial.operatingMargins)),
      profitMargins: finite(yahooRaw(financial.profitMargins)),
      debtToEquity: finite(yahooRaw(financial.debtToEquity)),
      currentRatio: finite(yahooRaw(financial.currentRatio)),
      quickRatio: finite(yahooRaw(financial.quickRatio)),
      revenueGrowth: finite(yahooRaw(financial.revenueGrowth)),
      earningsGrowth: finite(yahooRaw(financial.earningsGrowth)),
      earningsQuarterlyGrowth: finite(
        yahooRaw(financial.earningsQuarterlyGrowth),
      ),
      totalCash: finite(yahooRaw(financial.totalCash)),
      totalDebt: finite(yahooRaw(financial.totalDebt)),
      totalRevenue: finite(yahooRaw(financial.totalRevenue)),
      ebitda: finite(yahooRaw(financial.ebitda)),
      operatingCashflow: finite(yahooRaw(financial.operatingCashflow)),
      freeCashflow: finite(yahooRaw(financial.freeCashflow)),
      revenuePerShare: finite(yahooRaw(financial.revenuePerShare)),
    },
  }
}

async function loadYahooJsonFallback(
  ticker: string,
  range = '2y',
) {
  const symbol = encodeURIComponent(yahooSymbol(ticker))
  const warnings: string[] = []
  let chart: any = null
  let summary: any = null

  try {
    const chartBody = await externalJsonGet(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${encodeURIComponent(range)}&events=div%2Csplits&includeAdjustedClose=true`,
    )
    chart = yahooChartPayload(chartBody, ticker)
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Histórico JSON alternativo: ${error.message}`
        : 'Falha ao consultar o histórico JSON alternativo.',
    )
  }

  try {
    const summaryBody = await externalJsonGet(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price,assetProfile,summaryDetail,defaultKeyStatistics,financialData&formatted=false`,
    )
    summary = yahooSummaryPayload(summaryBody)
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Fundamentos JSON alternativos: ${error.message}`
        : 'Falha ao consultar fundamentos JSON alternativos.',
    )
  }

  return {
    quote: mergeDefinedObjects(chart?.quote, summary?.quote),
    profile: summary?.profile ?? {},
    statistics: summary?.statistics ?? {},
    financial: summary?.financial ?? {},
    historyRows: chart?.historyRows ?? [],
    cashDividends: chart?.cashDividends ?? [],
    warnings,
  }
}

function titleSentiment(title: string) {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  const positiveWords = [
    'alta', 'lucro', 'cresce', 'crescimento', 'recorde', 'ganho',
    'positivo', 'supera', 'melhora', 'expansao', 'dividendo', 'compra',
    'bullish', 'upgrade', 'profit', 'growth', 'beats', 'strong', 'gain',
  ]
  const negativeWords = [
    'queda', 'prejuizo', 'cai', 'perda', 'negativo', 'risco', 'corte',
    'investigacao', 'divida', 'rebaixamento', 'venda', 'bearish',
    'downgrade', 'loss', 'decline', 'weak', 'fraud', 'lawsuit',
  ]

  let score = 0
  positiveWords.forEach((word) => {
    if (normalized.includes(word)) score += 1
  })
  negativeWords.forEach((word) => {
    if (normalized.includes(word)) score -= 1
  })

  return score
}

async function loadGdeltSentiment(
  admin: any,
  ticker: string,
  companyName: string,
) {
  const cacheKey = `sentiment:v1:${ticker}`
  const cached = await getCache(admin, cacheKey)
  if (cached) return cached

  const companyTerm = String(companyName || '')
    .replace(/[()"']/g, ' ')
    .trim()
    .slice(0, 80)
  const query = companyTerm && companyTerm !== ticker
    ? `(${ticker} OR \"${companyTerm}\")`
    : ticker
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?' +
    new URLSearchParams({
      query,
      mode: 'artlist',
      format: 'json',
      maxrecords: '75',
      sort: 'datedesc',
      timespan: '30d',
    }).toString()

  try {
    const body = await externalJsonGet(url)
    const articles = Array.isArray(body?.articles)
      ? body.articles
      : []
    let weightedTotal = 0
    let weightTotal = 0
    let positive = 0
    let negative = 0
    let neutral = 0

    const normalizedArticles = articles.map((article: any) => {
      const dateValue =
        article?.seendate ?? article?.date ?? null
      const seenAt = dateValue
        ? new Date(dateValue)
        : null
      const daysOld =
        seenAt && !Number.isNaN(seenAt.getTime())
          ? Math.max(0, (Date.now() - seenAt.getTime()) / 86400000)
          : 15
      const recencyWeight = Math.exp(-daysOld / 10)
      const toneValue = finite(article?.tone)
      const lexical = titleSentiment(String(article?.title ?? ''))
      const rawScore = toneValue !== null
        ? clamp(toneValue * 10, -100, 100)
        : clamp(lexical * 20, -100, 100)

      weightedTotal += rawScore * recencyWeight
      weightTotal += recencyWeight

      if (rawScore >= 15) positive += 1
      else if (rawScore <= -15) negative += 1
      else neutral += 1

      return {
        title: article?.title ?? 'Notícia sem título',
        url: article?.url ?? null,
        domain: article?.domain ?? null,
        seenAt: dateValue,
        score: rawScore,
      }
    })

    const score = weightTotal > 0
      ? clamp(weightedTotal / weightTotal, -100, 100)
      : 0
    const label = score >= 40
      ? 'Muito positivo'
      : score >= 15
        ? 'Positivo'
        : score <= -40
          ? 'Muito negativo'
          : score <= -15
            ? 'Negativo'
            : 'Neutro'

    const payload = {
      available: normalizedArticles.length > 0,
      score,
      label,
      periodDays: 30,
      articles: normalizedArticles.slice(0, 12),
      articleCount: normalizedArticles.length,
      positiveArticles: positive,
      neutralArticles: neutral,
      negativeArticles: negative,
      source: 'GDELT_JSON',
      disclaimer:
        'Sentimento estimado por notícias públicas. Pode haver ruído, duplicidade, atraso e associação imprecisa ao ticker.',
    }

    await setCache(admin, cacheKey, payload, 30)
    return payload
  } catch (error) {
    return {
      available: false,
      score: null,
      label: 'Sem dados',
      periodDays: 30,
      articles: [],
      articleCount: 0,
      positiveArticles: 0,
      neutralArticles: 0,
      negativeArticles: 0,
      source: 'GDELT_JSON',
      disclaimer:
        'A fonte externa de sentimento não respondeu. O resultado técnico continua disponível.',
      error: error instanceof Error ? error.message : 'Falha no sentimento.',
    }
  }
}

async function getCache(
  admin: any,
  cacheKey: string,
) {
  const { data } = await admin
    .from('market_analysis_cache')
    .select('payload, expires_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return data?.payload ?? null
}

async function setCache(
  admin: any,
  cacheKey: string,
  payload: unknown,
  minutes: number,
) {
  const expiresAt = new Date(Date.now() + (minutes * 60 * 1000)).toISOString()

  await admin
    .from('market_analysis_cache')
    .upsert({
      cache_key: cacheKey,
      payload,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'cache_key',
    })
}

async function loadMarketCatalog(
  admin: any,
  brapiToken: string | null,
) {
  const cacheKey = 'catalog:v3:all-b3'
  const cached = await getCache(admin, cacheKey)
  if (cached) return cached

  const values = new Map<string, any>()
  let page = 1
  let requestedAt = new Date().toISOString()

  while (page <= 10) {
    const response = await brapiGet(
      `/api/v2/tickers?limit=2000&page=${page}&sortBy=symbol&sortOrder=asc`,
      brapiToken,
    )

    requestedAt = response?.requestedAt ?? requestedAt
    const rows = normalizeCatalogResponse(response)

    rows.forEach((item) => {
      values.set(item.symbol, item)
    })

    const pagination =
      response?.pagination ??
      response?.meta ??
      {}
    const totalPages = finite(
      pagination?.totalPages ??
      pagination?.pages,
    )

    if (
      rows.length < 2000 ||
      (totalPages !== null && page >= totalPages)
    ) {
      break
    }

    page += 1
  }

  const payload = {
    assets: [...values.values()].sort((a, b) =>
      a.symbol.localeCompare(b.symbol),
    ),
    requestedAt,
  }

  if (payload.assets.length > 0) {
    await setCache(
      admin,
      cacheKey,
      payload,
      CACHE_MINUTES.catalog,
    )
  }

  return payload
}

async function loadOverviewRaw(
  admin: any,
  ticker: string,
  brapiToken: string | null,
) {
  const cacheKey = `overview:v4:${ticker}`
  const cached = await getCache(admin, cacheKey)
  if (cached) return cached

  const symbol = encodeURIComponent(ticker)
  const paths = {
    quote: `/api/v2/stocks/quote?symbols=${symbol}`,
    profile: `/api/v2/stocks/profile?symbols=${symbol}`,
    statistics: `/api/v2/stocks/statistics?symbols=${symbol}&mode=current`,
    financial: `/api/v2/stocks/financial-data?symbols=${symbol}&mode=current`,
    dividends: `/api/v2/stocks/dividends?symbols=${symbol}`,
    history: `/api/v2/stocks/historical?symbols=${symbol}&range=1y&interval=1d&sortOrder=asc`,
    coverage: `/api/v2/tickers/coverage?symbols=${symbol}`,
    balanceAnnual: `/api/v2/stocks/balance-sheet?symbols=${symbol}&period=annual`,
    balanceQuarterly: `/api/v2/stocks/balance-sheet?symbols=${symbol}&period=quarterly`,
    incomeAnnual: `/api/v2/stocks/income-statement?symbols=${symbol}&period=annual`,
    incomeQuarterly: `/api/v2/stocks/income-statement?symbols=${symbol}&period=quarterly`,
    cashAnnual: `/api/v2/stocks/cash-flow?symbols=${symbol}&period=annual`,
    cashQuarterly: `/api/v2/stocks/cash-flow?symbols=${symbol}&period=quarterly`,
  }

  const entries = await Promise.allSettled(
    Object.entries(paths).map(async ([key, path]) => [
      key,
      await brapiGet(path, brapiToken),
    ] as const),
  )

  const raw: Record<string, unknown> = {}
  const warnings: string[] = []
  const sources: Record<string, string> = {}

  for (const entry of entries) {
    if (entry.status === 'fulfilled') {
      raw[entry.value[0]] = entry.value[1]
      sources[entry.value[0]] = 'v2'
    } else {
      warnings.push(entry.reason?.message ?? 'Falha em uma fonte de dados.')
    }
  }

  const v2Financial = resultData(raw.financial)
  const v2Statistics = resultData(raw.statistics)
  const needsLegacyFallback =
    !resultData(raw.quote)?.regularMarketPrice ||
    [
      v2Financial?.returnOnEquity,
      v2Financial?.returnOnAssets,
      v2Statistics?.trailingPE,
      v2Statistics?.priceToBook,
    ].filter((value) => finite(value) !== null).length < 2

  if (needsLegacyFallback) {
    try {
      raw.legacy = await brapiGet(
        `/api/quote/${symbol}?range=1y&interval=1d&dividends=true&modules=summaryProfile,defaultKeyStatistics,financialData,balanceSheetHistory,balanceSheetHistoryQuarterly,incomeStatementHistory,incomeStatementHistoryQuarterly,cashflowHistory,cashflowHistoryQuarterly`,
        brapiToken,
      )
      sources.legacy = 'legacy-modules'
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Fallback de fundamentos: ${error.message}`
          : 'Falha no fallback de fundamentos.',
      )
    }
  }

  const brapiQuoteAvailable = Boolean(
    resultData(raw.quote)?.regularMarketPrice ??
    legacyResult(raw.legacy)?.regularMarketPrice,
  )
  const brapiHistoryAvailable =
    resultRows(raw.history).length > 0 ||
    Boolean(legacyResult(raw.legacy)?.historicalDataPrice?.length)
  const brapiFinancialSnapshot = firstNonEmptyObject(
    resultData(raw.financial),
    legacyModule(raw.legacy, 'financialData'),
  )
  const brapiStatisticsSnapshot = firstNonEmptyObject(
    resultData(raw.statistics),
    legacyModule(raw.legacy, 'defaultKeyStatistics'),
  )
  const brapiFundamentalCount = [
    brapiFinancialSnapshot?.returnOnEquity,
    brapiFinancialSnapshot?.returnOnAssets,
    brapiFinancialSnapshot?.profitMargins,
    brapiFinancialSnapshot?.debtToEquity,
    brapiStatisticsSnapshot?.trailingPE,
    brapiStatisticsSnapshot?.priceToBook,
    brapiStatisticsSnapshot?.bookValue,
    brapiStatisticsSnapshot?.trailingEps,
  ].filter((value) => finite(value) !== null).length

  if (
    !brapiQuoteAvailable ||
    !brapiHistoryAvailable ||
    brapiFundamentalCount < 4
  ) {
    const external = await loadYahooJsonFallback(ticker, '2y')

    raw.externalQuote = external.quote
    raw.externalProfile = external.profile
    raw.externalStatistics = external.statistics
    raw.externalFinancial = external.financial
    raw.externalHistory = external.historyRows
    raw.externalDividends = external.cashDividends
    warnings.push(...external.warnings)

    if (finite(external.quote?.regularMarketPrice) !== null) {
      sources.quoteFallback = 'YAHOO_JSON_EXPERIMENTAL'
    }
    if (external.historyRows.length > 0) {
      sources.historyFallback = 'YAHOO_JSON_EXPERIMENTAL'
    }
    if (
      Object.keys(external.statistics).length > 0 ||
      Object.keys(external.financial).length > 0
    ) {
      sources.fundamentalsFallback = 'YAHOO_JSON_EXPERIMENTAL'
    }

    if (
      finite(external.quote?.regularMarketPrice) !== null ||
      external.historyRows.length > 0
    ) {
      warnings.unshift(
        'Dados complementares obtidos por JSON externo experimental. Eles podem sofrer atraso, indisponibilidade ou divergência em relação à bolsa e à instituição de origem.',
      )
    }
  }

  const payload = {
    raw,
    warnings: [...new Set(warnings)],
    sources,
    requestedAt: new Date().toISOString(),
    tokenConfigured: Boolean(brapiToken),
    externalFallbackUsed: Object.values(sources).some(
      (source) => String(source).includes('YAHOO_JSON'),
    ),
  }

  const quoteAvailable = Boolean(
    resultData(raw.quote)?.regularMarketPrice ??
    legacyResult(raw.legacy)?.regularMarketPrice ??
    raw.externalQuote?.regularMarketPrice,
  )

  if (quoteAvailable) {
    await setCache(
      admin,
      cacheKey,
      payload,
      CACHE_MINUTES.overview,
    )
  }

  return payload
}

async function loadHistoryRaw(
  admin: any,
  ticker: string,
  range: string,
  brapiToken: string | null,
) {
  const allowedRanges = new Set([
    '1mo',
    '3mo',
    '6mo',
    '1y',
    '2y',
    '5y',
    '10y',
    'max',
  ])
  const selectedRange = allowedRanges.has(range) ? range : '1y'
  const cacheKey = `history:${ticker}:${selectedRange}`
  const cached = await getCache(admin, cacheKey)
  if (cached) return cached

  let payload: any = null

  try {
    const response = await brapiGet(
      `/api/v2/stocks/historical?symbols=${encodeURIComponent(ticker)}&range=${selectedRange}&interval=1d`,
      brapiToken,
    )
    const series = chartSeries(resultRows(response))

    if (series.length > 0) {
      payload = {
        ticker,
        range: selectedRange,
        series,
        requestedAt: response?.requestedAt ?? new Date().toISOString(),
        source: 'BRAPI',
        externalFallbackUsed: false,
      }
    }
  } catch {
    payload = null
  }

  if (!payload) {
    const external = await loadYahooJsonFallback(ticker, selectedRange)
    const series = chartSeries(external.historyRows)

    if (series.length === 0) {
      throw new Error(
        'Nenhuma fonte retornou histórico suficiente para o ativo.',
      )
    }

    payload = {
      ticker,
      range: selectedRange,
      series,
      requestedAt: new Date().toISOString(),
      source: 'YAHOO_JSON_EXPERIMENTAL',
      externalFallbackUsed: true,
      warning:
        'Histórico obtido por JSON externo experimental. Pode haver atraso, lacunas ou ajustes diferentes da fonte principal.',
    }
  }

  await setCache(admin, cacheKey, payload, CACHE_MINUTES.history)
  return payload
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(request),
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, {
      error: 'Metodo nao permitido.',
    }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = getPublishableKey()
  const secretKey = getSecretKey()
  const brapiToken = Deno.env.get('BRAPI_TOKEN') ?? null
  const authorization = request.headers.get('Authorization') ?? ''

  if (!supabaseUrl || !publishableKey || !secretKey || !authorization) {
    return jsonResponse(request, {
      error: 'Configuracao interna ou autenticacao ausente.',
    }, 401)
  }

  const supabaseUser = createClient(
    supabaseUrl,
    publishableKey,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
      },
    },
  )

  const admin = createClient(
    supabaseUrl,
    secretKey,
    {
      auth: {
        persistSession: false,
      },
    },
  )

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser()

  if (userError || !user) {
    return jsonResponse(request, {
      error: 'Sessao invalida ou expirada.',
    }, 401)
  }

  const jwt = decodeJwtPayload(authorization)
  if (jwt?.aal && jwt.aal !== 'aal2') {
    return jsonResponse(request, {
      error: 'Confirme o codigo do autenticador para acessar a analise de ativos.',
    }, 403)
  }

  try {
    const body = await request.json()
    const requestedAction = String(body?.action ?? 'overview')
    const action = ['catalog', 'history', 'overview'].includes(requestedAction)
      ? requestedAction
      : 'overview'

    if (action === 'catalog') {
      const catalog = await loadMarketCatalog(
        admin,
        brapiToken,
      )

      return jsonResponse(request, {
        success: true,
        ...catalog,
        tokenConfigured: Boolean(brapiToken),
      })
    }

    const ticker = normalizeTicker(body?.ticker)

    if (!ticker || ticker.length < 4) {
      return jsonResponse(request, {
        error: 'Ticker invalido.',
      }, 400)
    }

    if (action === 'history') {
      const history = await loadHistoryRaw(
        admin,
        ticker,
        String(body?.range ?? '1y'),
        brapiToken,
      )

      return jsonResponse(request, {
        success: true,
        ...history,
      })
    }

    const overview = await loadOverviewRaw(
      admin,
      ticker,
      brapiToken,
    )

    const raw = overview.raw as Record<string, any>
    const legacy = legacyResult(raw.legacy) ?? {}

    const quote = mergeDefinedObjects(
      legacy,
      raw.externalQuote,
      resultData(raw.quote),
    )
    const profile = mergeDefinedObjects(
      legacy,
      legacyModule(raw.legacy, 'summaryProfile'),
      raw.externalProfile,
      resultData(raw.profile),
    )
    const statistics = mergeDefinedObjects(
      legacyModule(raw.legacy, 'defaultKeyStatistics'),
      raw.externalStatistics,
      resultData(raw.statistics),
    )
    const financial = mergeDefinedObjects(
      legacyModule(raw.legacy, 'financialData'),
      raw.externalFinancial,
      resultData(raw.financial),
    )
    const dividendsData = firstNonEmptyObject(
      resultData(raw.dividends),
      legacy?.dividendsData,
    )

    const historyRows = firstNonEmptyRows(
      resultRows(raw.history),
      raw.externalHistory,
      Array.isArray(legacy?.historicalDataPrice)
        ? legacy.historicalDataPrice
        : [],
    )

    const balanceAnnual = firstNonEmptyRows(
      extractStatementRows(raw.balanceAnnual),
      moduleRows(
        legacyModule(raw.legacy, 'balanceSheetHistory'),
        ['balanceSheetStatements', 'statements'],
      ),
    )
    const balanceQuarterly = firstNonEmptyRows(
      extractStatementRows(raw.balanceQuarterly),
      moduleRows(
        legacyModule(raw.legacy, 'balanceSheetHistoryQuarterly'),
        ['balanceSheetStatements', 'statements'],
      ),
    )
    const incomeAnnual = firstNonEmptyRows(
      extractStatementRows(raw.incomeAnnual),
      moduleRows(
        legacyModule(raw.legacy, 'incomeStatementHistory'),
        ['incomeStatementHistory', 'incomeStatementStatements', 'statements'],
      ),
    )
    const incomeQuarterly = firstNonEmptyRows(
      extractStatementRows(raw.incomeQuarterly),
      moduleRows(
        legacyModule(raw.legacy, 'incomeStatementHistoryQuarterly'),
        ['incomeStatementHistory', 'incomeStatementStatements', 'statements'],
      ),
    )
    const cashAnnual = firstNonEmptyRows(
      extractStatementRows(raw.cashAnnual),
      moduleRows(
        legacyModule(raw.legacy, 'cashflowHistory'),
        ['cashflowStatements', 'cashFlowStatements', 'statements'],
      ),
    )
    const cashQuarterly = firstNonEmptyRows(
      extractStatementRows(raw.cashQuarterly),
      moduleRows(
        legacyModule(raw.legacy, 'cashflowHistoryQuarterly'),
        ['cashflowStatements', 'cashFlowStatements', 'statements'],
      ),
    )

    const cashDividends = Array.isArray(dividendsData?.cashDividends)
      ? dividendsData.cashDividends
      : Array.isArray(raw.externalDividends)
        ? raw.externalDividends
        : Array.isArray(legacy?.dividendsData?.cashDividends)
          ? legacy.dividendsData.cashDividends
          : []
    const annualDividends = sumCashDividendsLast12Months(cashDividends)
    const currentPrice = finite(
      quote?.regularMarketPrice ??
      financial?.currentPrice,
    )

    if (currentPrice === null) {
      return jsonResponse(request, {
        error:
          'A fonte principal e o JSON externo alternativo não retornaram a cotação do ativo.',
        warnings: overview.warnings,
      }, 422)
    }

    const fundamentals = deriveFundamentals({
      statistics,
      financial,
      balanceAnnual,
      balanceQuarterly,
      incomeAnnual,
      incomeQuarterly,
      cashAnnual,
      cashQuarterly,
    })
    const health = buildHealthScore(
      fundamentals,
      profile,
    )
    const technical = technicalAnalysis(historyRows)
    const valuation = buildValuation(
      currentPrice,
      fundamentals,
      annualDividends,
      body?.assumptions ?? {},
    )
    const sentiment = await loadGdeltSentiment(
      admin,
      ticker,
      quote?.longName ?? profile?.name ?? ticker,
    )

    const fundamentalValues = Object.entries(fundamentals)
      .filter(([key, value]) =>
        key !== 'statementYears' &&
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value)),
      )
      .map(([key]) => key)

    const dataWarnings = [...overview.warnings]

    if (!overview.tokenConfigured && !BRAPI_FREE_TEST_TICKERS.has(ticker)) {
      dataWarnings.unshift(
        `A brapi não disponibilizou ${ticker} sem acesso contratado. O sistema tentou completar cotação, histórico e alguns fundamentos por JSON externo experimental.`,
      )
    }

    if (overview.externalFallbackUsed) {
      dataWarnings.unshift(
        'Parte da análise veio de fonte JSON externa não oficial e pode não coincidir exatamente com a bolsa, corretora ou outros portais.',
      )
    }

    if (health.financialSector) {
      dataWarnings.push(...health.limitations)
    }

    if (fundamentalValues.length < 8) {
      dataWarnings.push(
        'Poucos indicadores fundamentalistas foram retornados. A análise técnica continua válida para o histórico disponível, mas saúde e preço justo terão confiança reduzida.',
      )
    }

    return jsonResponse(request, {
      success: true,
      ticker,
      quote: {
        symbol:
          quote?.symbol ??
          legacy?.symbol ??
          ticker,
        shortName:
          quote?.shortName ??
          profile?.name ??
          legacy?.shortName ??
          ticker,
        longName:
          quote?.longName ??
          profile?.name ??
          legacy?.longName ??
          ticker,
        currency:
          quote?.currency ??
          legacy?.currency ??
          'BRL',
        price: currentPrice,
        change: finite(quote?.regularMarketChange),
        changePercent: finite(quote?.regularMarketChangePercent),
        open: finite(quote?.regularMarketOpen),
        previousClose: finite(quote?.regularMarketPreviousClose),
        dayHigh: finite(quote?.regularMarketDayHigh),
        dayLow: finite(quote?.regularMarketDayLow),
        volume: finite(quote?.regularMarketVolume),
        marketCap: finite(
          quote?.marketCap ??
          statistics?.marketCap ??
          legacy?.marketCap,
        ),
        fiftyTwoWeekHigh: finite(quote?.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: finite(quote?.fiftyTwoWeekLow),
        logoUrl:
          quote?.logourl ??
          profile?.logoUrl ??
          legacy?.logourl ??
          null,
        marketTime: quote?.regularMarketTime ?? null,
      },
      profile: {
        sector:
          profile?.sectorDisp ??
          profile?.sector ??
          null,
        industry:
          profile?.industryDisp ??
          profile?.industry ??
          null,
        summary:
          profile?.longBusinessSummary ??
          profile?.description ??
          null,
        website: profile?.website ?? null,
        employees: finite(profile?.fullTimeEmployees),
        cnpj: profile?.cnpj ?? null,
      },
      fundamentals: {
        ...fundamentals,
        annualDividends,
      },
      technical,
      sentiment,
      health,
      valuation,
      dataQuality: {
        warnings: [...new Set(dataWarnings)],
        requestedAt: overview.requestedAt,
        technicalObservations: technical.observations,
        valuationConfidence: valuation.confidence,
        healthCoverage: health.coverage,
        fundamentalIndicatorsAvailable: fundamentalValues.length,
        statementYears: fundamentals.statementYears,
        statementQuarters: fundamentals.statementQuarters,
        tokenConfigured: overview.tokenConfigured,
        externalFallbackUsed: overview.externalFallbackUsed,
        sourceMode: overview.externalFallbackUsed
          ? 'JSON_EXTERNO_EXPERIMENTAL'
          : 'BRAPI',
        externalDataNotice: overview.externalFallbackUsed
          ? 'Alguns dados foram buscados fora da brapi por JSON externo experimental. Eles podem apresentar atraso, lacunas ou divergências.'
          : null,
        sources: overview.sources,
        coverage: resultData(raw.coverage) ?? raw.coverage ?? null,
      },
    })
  } catch (error) {
    return jsonResponse(request, {
      error: error instanceof Error
        ? error.message
        : 'Falha inesperada na analise.',
    }, 500)
  }
})
