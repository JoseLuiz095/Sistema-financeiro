import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENAI_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stance: {
      type: 'string',
      enum: [
        'DADOS_INSUFICIENTES',
        'SEM_POSICAO',
        'AUMENTAR_GRADUALMENTE',
        'MANTER',
        'NAO_AUMENTAR',
        'REDUZIR_CONCENTRACAO',
      ],
    },
    stanceLabel: { type: 'string' },
    confidence: { type: 'number' },
    headline: { type: 'string' },
    summary: { type: 'string' },
    scores: {
      type: 'object',
      additionalProperties: false,
      properties: {
        quality: { type: 'number' },
        valuation: { type: 'number' },
        momentum: { type: 'number' },
        risk: { type: 'number' },
      },
      required: ['quality', 'valuation', 'momentum', 'risk'],
    },
    portfolioAssessment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        weightPercent: { type: ['number', 'null'] },
        concentrationLevel: { type: 'string' },
        suggestedMaxWeightPercent: { type: ['number', 'null'] },
        assessment: { type: 'string' },
      },
      required: [
        'weightPercent',
        'concentrationLevel',
        'suggestedMaxWeightPercent',
        'assessment',
      ],
    },
    strengths: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    actionPlan: { type: 'array', items: { type: 'string' } },
    sourceNotes: { type: 'array', items: { type: 'string' } },
    disclaimer: { type: 'string' },
  },
  required: [
    'stance',
    'stanceLabel',
    'confidence',
    'headline',
    'summary',
    'scores',
    'portfolioAssessment',
    'strengths',
    'risks',
    'actionPlan',
    'sourceNotes',
    'disclaimer',
  ],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function getPublishableKey() {
  const currentKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')

  if (currentKeys) {
    try {
      const parsed = JSON.parse(currentKeys)
      if (parsed?.default) return parsed.default
    } catch {
      // Compatibilidade com projetos que ainda usam SUPABASE_ANON_KEY.
    }
  }

  return Deno.env.get('SUPABASE_ANON_KEY')
}

function normalizeTicker(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9^.-]/g, '')
    .slice(0, 16)
}

function normalizeAssetType(value: unknown) {
  const type = String(value ?? '').trim().toLowerCase()

  if (['fii', 'fiagro', 'fi-infra', 'fund'].includes(type)) return 'fii'
  if (type === 'etf') return 'etf'
  if (type === 'bdr') return 'bdr'
  if (type === 'unit') return 'unit'
  return 'stock'
}

function limitedText(value: unknown, maxLength = 1200) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null

  if (
    value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, 'raw')
  ) {
    return finiteNumber((value as { raw?: unknown }).raw)
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = finiteNumber(value)
    if (numeric !== null) return numeric
  }
  return null
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = finiteNumber(value)
    if (numeric !== null && numeric > 0) return numeric
  }
  return null
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = limitedText(value, 600)
    if (text) return text
  }
  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function sanitizeForPrompt(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return null

  if (typeof value === 'string') return limitedText(value, 1200)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((item) => sanitizeForPrompt(item, depth + 1))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, item]) => [
        key.slice(0, 80),
        sanitizeForPrompt(item, depth + 1),
      ])

    return Object.fromEntries(entries)
  }

  return null
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function getBrapiToken() {
  return (
    Deno.env.get('BRAPI_TOKEN') ||
    Deno.env.get('BRAPI_API_TOKEN') ||
    Deno.env.get('BRAPI_API_KEY') ||
    ''
  ).trim()
}

async function fetchJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 10000,
) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        'User-Agent': 'FinanceiroPessoal/2.0',
        ...headers,
      },
    },
    timeoutMs,
  )
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      limitedText(
        payload?.message ||
        payload?.error?.description ||
        payload?.error ||
        `HTTP ${response.status}`,
        300,
      ),
    )
  }

  return payload
}

function v2Data(response: any) {
  return response?.results?.[0]?.data ?? null
}

function legacyResult(response: any) {
  return response?.results?.[0] ?? null
}

function nonEmptyObject(value: unknown) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0,
  )
}

function mergeObjects(...objects: unknown[]) {
  const result: Record<string, unknown> = {}

  for (const object of objects) {
    if (!nonEmptyObject(object)) continue

    for (const [key, value] of Object.entries(object as Record<string, unknown>)) {
      if (value !== null && value !== undefined && value !== '') {
        result[key] = value
      }
    }
  }

  return result
}

function compactResearchData({
  quote,
  profile,
  statistics,
  financial,
  legacy,
}: {
  quote: any
  profile: any
  statistics: any
  financial: any
  legacy: any
}) {
  const legacyProfile = legacy?.summaryProfile ?? legacy?.assetProfile ?? {}
  const legacyFinancial = legacy?.financialData ?? {}
  const legacyStatistics = legacy?.defaultKeyStatistics ?? {}

  return {
    symbol: firstText(quote?.symbol, legacy?.symbol),
    name: firstText(
      quote?.longName,
      quote?.shortName,
      legacy?.longName,
      legacy?.shortName,
    ),
    sector: firstText(
      profile?.sectorDisp,
      profile?.sector,
      legacyProfile?.sector,
      legacy?.sector,
    ),
    industry: firstText(
      profile?.industryDisp,
      profile?.industry,
      legacyProfile?.industry,
      legacy?.industry,
    ),
    description: firstText(
      profile?.longBusinessSummary,
      profile?.description,
      legacyProfile?.longBusinessSummary,
    ),
    currency: firstText(quote?.currency, legacy?.currency) || 'BRL',
    price: firstPositiveNumber(
      quote?.regularMarketPrice,
      financial?.currentPrice,
      legacy?.regularMarketPrice,
    ),
    change: firstNumber(
      quote?.regularMarketChange,
      legacy?.regularMarketChange,
    ),
    changePercent: firstNumber(
      quote?.regularMarketChangePercent,
      legacy?.regularMarketChangePercent,
    ),
    previousClose: firstPositiveNumber(
      quote?.regularMarketPreviousClose,
      quote?.previousClose,
      legacy?.regularMarketPreviousClose,
    ),
    open: firstPositiveNumber(
      quote?.regularMarketOpen,
      quote?.open,
      legacy?.regularMarketOpen,
    ),
    dayHigh: firstPositiveNumber(
      quote?.regularMarketDayHigh,
      quote?.dayHigh,
      legacy?.regularMarketDayHigh,
    ),
    dayLow: firstPositiveNumber(
      quote?.regularMarketDayLow,
      quote?.dayLow,
      legacy?.regularMarketDayLow,
    ),
    volume: firstPositiveNumber(
      quote?.regularMarketVolume,
      quote?.volume,
      legacy?.regularMarketVolume,
    ),
    marketCap: firstPositiveNumber(
      quote?.marketCap,
      statistics?.marketCap,
      legacy?.marketCap,
      legacyStatistics?.marketCap,
    ),
    fiftyTwoWeekHigh: firstPositiveNumber(
      quote?.fiftyTwoWeekHigh,
      statistics?.fiftyTwoWeekHigh,
      legacy?.fiftyTwoWeekHigh,
      legacyStatistics?.fiftyTwoWeekHigh,
    ),
    fiftyTwoWeekLow: firstPositiveNumber(
      quote?.fiftyTwoWeekLow,
      statistics?.fiftyTwoWeekLow,
      legacy?.fiftyTwoWeekLow,
      legacyStatistics?.fiftyTwoWeekLow,
    ),
    marketTime: firstText(
      quote?.regularMarketTime,
      legacy?.regularMarketTime,
    ),
    trailingPe: firstNumber(
      statistics?.trailingPE,
      statistics?.trailingPe,
      legacyStatistics?.trailingPE,
      legacy?.priceEarnings,
    ),
    priceToBook: firstNumber(
      statistics?.priceToBook,
      legacyStatistics?.priceToBook,
      legacy?.priceToBook,
    ),
    enterpriseToEbitda: firstNumber(
      statistics?.enterpriseToEbitda,
      financial?.enterpriseToEbitda,
      legacyStatistics?.enterpriseToEbitda,
      legacyFinancial?.enterpriseToEbitda,
    ),
    dividendYield: firstNumber(
      statistics?.dividendYield,
      statistics?.yield,
      legacyStatistics?.dividendYield,
      legacy?.dividendYield,
    ),
    beta: firstNumber(
      statistics?.beta,
      legacyStatistics?.beta,
      legacy?.beta,
    ),
    eps: firstNumber(
      statistics?.trailingEps,
      statistics?.earningsPerShare,
      legacyStatistics?.trailingEps,
    ),
    bookValuePerShare: firstNumber(
      statistics?.bookValue,
      legacyStatistics?.bookValue,
    ),
    roe: firstNumber(
      financial?.returnOnEquity,
      statistics?.returnOnEquity,
      legacyFinancial?.returnOnEquity,
    ),
    roa: firstNumber(
      financial?.returnOnAssets,
      statistics?.returnOnAssets,
      legacyFinancial?.returnOnAssets,
    ),
    grossMargin: firstNumber(
      financial?.grossMargins,
      legacyFinancial?.grossMargins,
    ),
    ebitdaMargin: firstNumber(
      financial?.ebitdaMargins,
      legacyFinancial?.ebitdaMargins,
    ),
    operatingMargin: firstNumber(
      financial?.operatingMargins,
      legacyFinancial?.operatingMargins,
    ),
    netMargin: firstNumber(
      financial?.profitMargins,
      financial?.netMargins,
      statistics?.profitMargins,
      legacyFinancial?.profitMargins,
      legacyStatistics?.profitMargins,
    ),
    revenueGrowth: firstNumber(
      financial?.revenueGrowthAnnual,
      financial?.revenueGrowth,
      legacyFinancial?.revenueGrowth,
    ),
    earningsGrowth: firstNumber(
      financial?.earningsGrowthAnnual,
      financial?.earningsGrowth,
      legacyFinancial?.earningsGrowth,
      legacyFinancial?.earningsQuarterlyGrowth,
    ),
    debtToEquity: firstNumber(
      financial?.debtToEquity,
      legacyFinancial?.debtToEquity,
    ),
    currentRatio: firstNumber(
      financial?.currentRatio,
      legacyFinancial?.currentRatio,
    ),
    quickRatio: firstNumber(
      financial?.quickRatio,
      legacyFinancial?.quickRatio,
    ),
    totalDebt: firstNumber(
      financial?.totalDebt,
      legacyFinancial?.totalDebt,
    ),
    totalCash: firstNumber(
      financial?.totalCash,
      legacyFinancial?.totalCash,
    ),
    freeCashflow: firstNumber(
      financial?.freeCashflow,
      legacyFinancial?.freeCashflow,
    ),
    operatingCashflow: firstNumber(
      financial?.operatingCashflow,
      legacyFinancial?.operatingCashflow,
    ),
    analystTargetMean: firstPositiveNumber(
      financial?.targetMeanPrice,
      legacyFinancial?.targetMeanPrice,
    ),
    analystTargetMedian: firstPositiveNumber(
      financial?.targetMedianPrice,
      legacyFinancial?.targetMedianPrice,
    ),
    analystCount: firstPositiveNumber(
      financial?.numberOfAnalystOpinions,
      legacyFinancial?.numberOfAnalystOpinions,
    ),
    recommendation: firstText(
      financial?.recommendationKey,
      financial?.recommendationMean,
      legacyFinancial?.recommendationKey,
    ),
  }
}

async function fetchBrapiResearch(ticker: string) {
  const token = getBrapiToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const symbol = encodeURIComponent(ticker)

  const paths = {
    quote: `/api/v2/stocks/quote?symbols=${symbol}`,
    profile: `/api/v2/stocks/profile?symbols=${symbol}`,
    statistics: `/api/v2/stocks/statistics?symbols=${symbol}&mode=current`,
    financial: `/api/v2/stocks/financial-data?symbols=${symbol}&mode=current`,
  }

  const entries = await Promise.allSettled(
    Object.entries(paths).map(async ([key, path]) => ({
      key,
      payload: await fetchJson(`https://brapi.dev${path}`, headers),
    })),
  )

  const raw: Record<string, unknown> = {}
  const endpointStatus: Array<Record<string, string>> = []

  entries.forEach((entry, index) => {
    const key = Object.keys(paths)[index]

    if (entry.status === 'fulfilled') {
      raw[key] = v2Data(entry.value.payload) ?? {}
      endpointStatus.push({ id: key, status: 'ok' })
    } else {
      endpointStatus.push({
        id: key,
        status: 'error',
        detail: limitedText(entry.reason?.message ?? entry.reason, 180),
      })
    }
  })

  let legacy: any = null
  const v2HasCore = nonEmptyObject(raw.quote) && (
    nonEmptyObject(raw.statistics) || nonEmptyObject(raw.financial)
  )

  if (!v2HasCore) {
    try {
      const modules = [
        'summaryProfile',
        'financialData',
        'defaultKeyStatistics',
      ].join(',')
      const legacyPayload = await fetchJson(
        `https://brapi.dev/api/quote/${symbol}` +
        `?dividends=true&modules=${encodeURIComponent(modules)}`,
        headers,
      )
      legacy = legacyResult(legacyPayload)
      endpointStatus.push({ id: 'legacy', status: legacy ? 'ok' : 'error' })
    } catch (error) {
      endpointStatus.push({
        id: 'legacy',
        status: 'error',
        detail: limitedText(error instanceof Error ? error.message : error, 180),
      })
    }
  }

  const data = compactResearchData({
    quote: raw.quote ?? {},
    profile: raw.profile ?? {},
    statistics: raw.statistics ?? {},
    financial: raw.financial ?? {},
    legacy,
  })

  const hasAnyData = Object.values(data).some((value) =>
    value !== null && value !== undefined && value !== '',
  )

  if (!hasAnyData || !data.price) {
    throw new Error(
      token
        ? 'A brapi não retornou cotação utilizável para o ativo.'
        : 'A brapi não retornou dados utilizáveis. Configure BRAPI_TOKEN para consultar ativos fora do ambiente de teste.',
    )
  }

  return {
    data,
    tokenConfigured: Boolean(token),
    endpointStatus,
    sourceUrl: 'https://brapi.dev/docs',
  }
}

function yahooValue(value: any) {
  if (
    value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, 'raw')
  ) {
    return value.raw
  }
  return value
}

function yahooSymbol(ticker: string) {
  if (ticker.startsWith('^') || ticker.includes('.')) return ticker
  return `${ticker}.SA`
}

async function fetchYahooResearch(ticker: string) {
  const symbol = encodeURIComponent(yahooSymbol(ticker))
  const [chartResult, summaryResult] = await Promise.allSettled([
    fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
      '?interval=1d&range=1y&events=div%2Csplits&includeAdjustedClose=true',
    ),
    fetchJson(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}` +
      '?modules=price,assetProfile,summaryDetail,defaultKeyStatistics,financialData&formatted=false',
    ),
  ])

  const chart = chartResult.status === 'fulfilled'
    ? chartResult.value?.chart?.result?.[0]
    : null
  const meta = chart?.meta ?? {}
  const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : []
  const quoteRows = chart?.indicators?.quote?.[0] ?? {}
  const lastIndex = timestamps.length - 1

  const summary = summaryResult.status === 'fulfilled'
    ? summaryResult.value?.quoteSummary?.result?.[0]
    : null
  const price = summary?.price ?? {}
  const profile = summary?.assetProfile ?? {}
  const detail = summary?.summaryDetail ?? {}
  const statistics = summary?.defaultKeyStatistics ?? {}
  const financial = summary?.financialData ?? {}

  const data = {
    symbol: ticker,
    name: firstText(
      meta.longName,
      meta.shortName,
      price.longName,
      price.shortName,
    ),
    sector: firstText(profile.sector),
    industry: firstText(profile.industry),
    description: firstText(profile.longBusinessSummary),
    currency: firstText(meta.currency, price.currency) || 'BRL',
    price: firstPositiveNumber(
      meta.regularMarketPrice,
      yahooValue(price.regularMarketPrice),
      quoteRows.close?.[lastIndex],
    ),
    previousClose: firstPositiveNumber(
      meta.chartPreviousClose,
      meta.previousClose,
      yahooValue(detail.previousClose),
    ),
    open: firstPositiveNumber(
      meta.regularMarketOpen,
      yahooValue(detail.open),
      quoteRows.open?.[lastIndex],
    ),
    dayHigh: firstPositiveNumber(
      meta.regularMarketDayHigh,
      yahooValue(detail.dayHigh),
      quoteRows.high?.[lastIndex],
    ),
    dayLow: firstPositiveNumber(
      meta.regularMarketDayLow,
      yahooValue(detail.dayLow),
      quoteRows.low?.[lastIndex],
    ),
    volume: firstPositiveNumber(
      meta.regularMarketVolume,
      yahooValue(detail.volume),
      quoteRows.volume?.[lastIndex],
    ),
    marketCap: firstPositiveNumber(
      yahooValue(price.marketCap),
      yahooValue(detail.marketCap),
    ),
    fiftyTwoWeekHigh: firstPositiveNumber(
      yahooValue(detail.fiftyTwoWeekHigh),
    ),
    fiftyTwoWeekLow: firstPositiveNumber(
      yahooValue(detail.fiftyTwoWeekLow),
    ),
    marketTime: meta.regularMarketTime
      ? new Date(Number(meta.regularMarketTime) * 1000).toISOString()
      : null,
    trailingPe: firstNumber(
      yahooValue(detail.trailingPE),
      yahooValue(statistics.trailingPE),
    ),
    priceToBook: firstNumber(yahooValue(statistics.priceToBook)),
    enterpriseToEbitda: firstNumber(
      yahooValue(statistics.enterpriseToEbitda),
      yahooValue(financial.enterpriseToEbitda),
    ),
    dividendYield: firstNumber(yahooValue(detail.dividendYield)),
    beta: firstNumber(yahooValue(statistics.beta)),
    eps: firstNumber(yahooValue(statistics.trailingEps)),
    bookValuePerShare: firstNumber(yahooValue(statistics.bookValue)),
    roe: firstNumber(yahooValue(financial.returnOnEquity)),
    roa: firstNumber(yahooValue(financial.returnOnAssets)),
    grossMargin: firstNumber(yahooValue(financial.grossMargins)),
    ebitdaMargin: firstNumber(yahooValue(financial.ebitdaMargins)),
    operatingMargin: firstNumber(yahooValue(financial.operatingMargins)),
    netMargin: firstNumber(yahooValue(financial.profitMargins)),
    revenueGrowth: firstNumber(yahooValue(financial.revenueGrowth)),
    earningsGrowth: firstNumber(
      yahooValue(financial.earningsGrowth),
      yahooValue(financial.earningsQuarterlyGrowth),
    ),
    debtToEquity: firstNumber(yahooValue(financial.debtToEquity)),
    currentRatio: firstNumber(yahooValue(financial.currentRatio)),
    quickRatio: firstNumber(yahooValue(financial.quickRatio)),
    totalDebt: firstNumber(yahooValue(financial.totalDebt)),
    totalCash: firstNumber(yahooValue(financial.totalCash)),
    freeCashflow: firstNumber(yahooValue(financial.freeCashflow)),
    operatingCashflow: firstNumber(yahooValue(financial.operatingCashflow)),
    analystTargetMean: firstPositiveNumber(
      yahooValue(financial.targetMeanPrice),
    ),
    analystTargetMedian: firstPositiveNumber(
      yahooValue(financial.targetMedianPrice),
    ),
    analystCount: firstPositiveNumber(
      yahooValue(financial.numberOfAnalystOpinions),
    ),
    recommendation: firstText(financial.recommendationKey),
  }

  if (!data.price) {
    const errors = [chartResult, summaryResult]
      .filter((item) => item.status === 'rejected')
      .map((item: any) => limitedText(item.reason?.message ?? item.reason, 180))
      .filter(Boolean)

    throw new Error(
      errors.join(' | ') || 'Yahoo Finance não retornou cotação utilizável.',
    )
  }

  return {
    data,
    sourceUrl: 'https://finance.yahoo.com',
    partial: summaryResult.status === 'rejected',
  }
}

const POSITIVE_NUMBER_FIELDS = new Set([
  'price',
  'previousClose',
  'open',
  'dayHigh',
  'dayLow',
  'volume',
  'marketCap',
  'fiftyTwoWeekHigh',
  'fiftyTwoWeekLow',
  'analystTargetMean',
  'analystTargetMedian',
  'analystCount',
])

function mergeResearchData(...sources: Array<Record<string, unknown> | null>) {
  const keys = new Set(sources.flatMap((source) => Object.keys(source ?? {})))
  const result: Record<string, unknown> = {}

  for (const key of keys) {
    for (const source of sources) {
      const value = source?.[key]

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) continue
        if (POSITIVE_NUMBER_FIELDS.has(key) && value <= 0) continue
        result[key] = value
        break
      }

      if (value !== null && value !== undefined && value !== '') {
        result[key] = value
        break
      }
    }
  }

  return result
}

async function fetchSgsSeries(code: number, count: number) {
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}` +
    `/dados/ultimos/${count}?formato=json`
  const payload = await fetchJson(url)

  if (!Array.isArray(payload)) {
    throw new Error(`Série SGS ${code} indisponível.`)
  }

  return payload
}

async function fetchMacroResearch() {
  const [selicResult, ipcaResult] = await Promise.allSettled([
    fetchSgsSeries(1178, 1),
    fetchSgsSeries(433, 12),
  ])

  const selicRows = selicResult.status === 'fulfilled'
    ? selicResult.value
    : []
  const ipcaRows = ipcaResult.status === 'fulfilled'
    ? ipcaResult.value
    : []
  const selicLast = selicRows.at(-1)
  const ipcaMonthly = ipcaRows
    .map((item: Record<string, unknown>) => finiteNumber(item.valor))
    .filter((value: number | null): value is number => value !== null)
  const ipca12m = ipcaMonthly.length > 0
    ? (
        ipcaMonthly.reduce(
          (factor: number, value: number) => factor * (1 + value / 100),
          1,
        ) - 1
      ) * 100
    : null

  if (!selicLast && ipcaMonthly.length === 0) {
    throw new Error('As séries macroeconômicas não responderam.')
  }

  return {
    selicAnnualPercent: finiteNumber(selicLast?.valor),
    selicReferenceDate: firstText(selicLast?.data),
    ipca12MonthsPercent: ipca12m,
    ipcaLatestMonthPercent: ipcaMonthly.at(-1) ?? null,
    ipcaReferenceDate: firstText(ipcaRows.at(-1)?.data),
    sourceUrl: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs',
    partialErrors: [
      selicResult.status === 'rejected' ? 'Selic indisponível' : null,
      ipcaResult.status === 'rejected' ? 'IPCA indisponível' : null,
    ].filter(Boolean),
  }
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function xmlTag(block: string, tag: string) {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  )
  return match ? decodeXml(match[1]) : ''
}

function normalizedTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function lexicalSentiment(title: string) {
  const normalized = normalizedTitle(title)
  const positiveWords = [
    'alta', 'lucro', 'cresce', 'crescimento', 'recorde', 'ganho',
    'positivo', 'supera', 'melhora', 'expansao', 'dividendo', 'upgrade',
    'profit', 'growth', 'beats', 'strong', 'gain', 'buy',
  ]
  const negativeWords = [
    'queda', 'prejuizo', 'cai', 'perda', 'negativo', 'risco', 'corte',
    'investigacao', 'divida', 'rebaixamento', 'fraude', 'downgrade',
    'loss', 'decline', 'weak', 'fraud', 'lawsuit', 'sell',
  ]

  let score = 0
  positiveWords.forEach((word) => {
    if (normalized.includes(word)) score += 20
  })
  negativeWords.forEach((word) => {
    if (normalized.includes(word)) score -= 20
  })

  return clamp(score, -100, 100)
}

async function fetchGoogleNews(query: string) {
  const url =
    'https://news.google.com/rss/search?' +
    new URLSearchParams({
      q: query,
      hl: 'pt-BR',
      gl: 'BR',
      ceid: 'BR:pt-419',
    }).toString()
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml',
      'User-Agent': 'FinanceiroPessoal/2.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Google News respondeu HTTP ${response.status}.`)
  }

  const xml = await response.text()
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, 12)
    .map((match) => {
      const block = match[1]
      const title = limitedText(xmlTag(block, 'title'), 260)
      return {
        title,
        source: limitedText(xmlTag(block, 'source'), 100),
        publishedAt: limitedText(xmlTag(block, 'pubDate'), 80),
        link: limitedText(xmlTag(block, 'link'), 700),
        score: lexicalSentiment(title),
      }
    })
    .filter((item) => item.title)
}

async function fetchGdeltNews(ticker: string, companyName: string) {
  const companyTerm = limitedText(companyName, 80).replace(/[()"']/g, ' ')
  const query = companyTerm && companyTerm !== ticker
    ? `(${ticker} OR \"${companyTerm}\")`
    : ticker
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?' +
    new URLSearchParams({
      query,
      mode: 'artlist',
      format: 'json',
      maxrecords: '30',
      sort: 'datedesc',
      timespan: '30d',
    }).toString()
  const payload = await fetchJson(url)
  const articles = Array.isArray(payload?.articles) ? payload.articles : []

  return articles.slice(0, 12).map((article: any) => ({
    title: limitedText(article?.title, 260),
    source: limitedText(article?.domain, 100),
    publishedAt: limitedText(article?.seendate ?? article?.date, 80),
    link: limitedText(article?.url, 700),
    score: firstNumber(article?.tone) !== null
      ? clamp(Number(article.tone) * 10, -100, 100)
      : lexicalSentiment(String(article?.title ?? '')),
  })).filter((item: any) => item.title)
}

async function fetchNewsResearch(ticker: string, companyName: string) {
  const queries = [
    `\"${ticker}\" ações when:30d`,
    companyName && companyName !== ticker
      ? `\"${limitedText(companyName, 80)}\" bolsa when:30d`
      : '',
    `${ticker} B3 resultados when:30d`,
  ].filter(Boolean)

  const googleResults = await Promise.allSettled(
    queries.map((query) => fetchGoogleNews(query)),
  )
  const collected = googleResults.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )

  if (collected.length < 3) {
    try {
      collected.push(...await fetchGdeltNews(ticker, companyName))
    } catch {
      // Notícias são fonte auxiliar; a falha não interrompe a análise.
    }
  }

  const unique = new Map<string, any>()
  collected.forEach((item) => {
    const key = normalizedTitle(item.title)
    if (key && !unique.has(key)) unique.set(key, item)
  })

  const items = [...unique.values()].slice(0, 12)
  const score = items.length > 0
    ? items.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / items.length
    : null
  const label = score === null
    ? 'Sem cobertura de notícias'
    : score >= 35
      ? 'Muito positivo'
      : score >= 12
        ? 'Positivo'
        : score <= -35
          ? 'Muito negativo'
          : score <= -12
            ? 'Negativo'
            : 'Neutro'

  return {
    items,
    score,
    label,
    articleCount: items.length,
    positiveArticles: items.filter((item) => Number(item.score) >= 12).length,
    neutralArticles: items.filter((item) => Math.abs(Number(item.score)) < 12).length,
    negativeArticles: items.filter((item) => Number(item.score) <= -12).length,
    periodDays: 30,
  }
}

function meaningful(value: unknown, positive = false) {
  const numeric = finiteNumber(value)
  if (numeric !== null) return positive ? numeric > 0 : true
  return Boolean(limitedText(value, 30))
}

function weightedCoverage(
  fields: Array<{ label: string; value: unknown; weight: number; positive?: boolean }>,
) {
  const total = fields.reduce((sum, field) => sum + field.weight, 0)
  const available = fields.reduce(
    (sum, field) => sum + (
      meaningful(field.value, Boolean(field.positive)) ? field.weight : 0
    ),
    0,
  )

  return {
    percent: total > 0 ? (available / total) * 100 : 0,
    missing: fields
      .filter((field) => !meaningful(field.value, Boolean(field.positive)))
      .map((field) => field.label),
  }
}

function buildCoverage(
  assetType: string,
  market: Record<string, unknown>,
  currentAnalysis: Record<string, any>,
  news: Record<string, any> | null,
) {
  const marketCoverage = weightedCoverage([
    { label: 'cotação atual', value: market.price, weight: 20, positive: true },
    { label: 'fechamento anterior', value: market.previousClose, weight: 10, positive: true },
    { label: 'abertura', value: market.open, weight: 8, positive: true },
    { label: 'máxima do dia', value: market.dayHigh, weight: 8, positive: true },
    { label: 'mínima do dia', value: market.dayLow, weight: 8, positive: true },
    { label: 'volume', value: market.volume, weight: 12, positive: true },
    { label: 'valor de mercado', value: market.marketCap, weight: 12, positive: true },
    { label: 'máxima de 52 semanas', value: market.fiftyTwoWeekHigh, weight: 11, positive: true },
    { label: 'mínima de 52 semanas', value: market.fiftyTwoWeekLow, weight: 11, positive: true },
  ])

  const stockFields = [
    { label: 'P/L', value: market.trailingPe, weight: 10 },
    { label: 'P/VP', value: market.priceToBook, weight: 10 },
    { label: 'EV/EBITDA', value: market.enterpriseToEbitda, weight: 8 },
    { label: 'dividend yield', value: market.dividendYield, weight: 8 },
    { label: 'ROE', value: market.roe, weight: 12 },
    { label: 'ROA', value: market.roa, weight: 8 },
    { label: 'margem líquida', value: market.netMargin, weight: 10 },
    { label: 'crescimento da receita', value: market.revenueGrowth, weight: 8 },
    { label: 'crescimento do lucro', value: market.earningsGrowth, weight: 8 },
    { label: 'dívida/patrimônio', value: market.debtToEquity, weight: 8 },
    { label: 'fluxo de caixa livre', value: market.freeCashflow, weight: 8 },
  ]
  const fiiFields = [
    { label: 'P/VP', value: market.priceToBook, weight: 30 },
    { label: 'dividend yield', value: market.dividendYield, weight: 30 },
    { label: 'liquidez/volume', value: market.volume, weight: 20, positive: true },
    { label: 'valor de mercado', value: market.marketCap, weight: 20, positive: true },
  ]
  const etfFields = [
    { label: 'liquidez/volume', value: market.volume, weight: 35, positive: true },
    { label: 'valor de mercado', value: market.marketCap, weight: 25, positive: true },
    { label: 'máxima de 52 semanas', value: market.fiftyTwoWeekHigh, weight: 20, positive: true },
    { label: 'mínima de 52 semanas', value: market.fiftyTwoWeekLow, weight: 20, positive: true },
  ]
  const fundamentalsCoverage = weightedCoverage(
    assetType === 'fii'
      ? fiiFields
      : assetType === 'etf'
        ? etfFields
        : stockFields,
  )

  const technicalObservations = firstNumber(
    currentAnalysis?.technical?.observations,
    currentAnalysis?.dataQuality?.technicalObservations,
  ) ?? 0
  const technicalFields = [
    {
      label: 'pontuação técnica',
      value: currentAnalysis?.technical?.score,
      weight: 45,
    },
    {
      label: 'histórico suficiente',
      value: technicalObservations >= 60 ? technicalObservations : null,
      weight: 35,
      positive: true,
    },
    {
      label: 'indicadores técnicos',
      value: Object.values(currentAnalysis?.technical?.indicators ?? {})
        .filter((value) => finiteNumber(value) !== null).length >= 4
        ? 1
        : null,
      weight: 20,
      positive: true,
    },
  ]
  const technicalCoverage = weightedCoverage(technicalFields)
  const newsCoverage = news?.articleCount > 0 ? 100 : 0
  const percent = clamp(
    (marketCoverage.percent * 0.30) +
    (fundamentalsCoverage.percent * 0.40) +
    (technicalCoverage.percent * 0.25) +
    (newsCoverage * 0.05),
    0,
    100,
  )
  const grade = percent >= 80
    ? 'Alta'
    : percent >= 60
      ? 'Moderada'
      : percent >= 40
        ? 'Baixa'
        : 'Muito baixa'
  const criticalMissing = !meaningful(market.price, true) || (
    fundamentalsCoverage.percent < 25 && technicalCoverage.percent < 60
  )

  return {
    percent,
    grade,
    recommendationAllowed: percent >= 60 && !criticalMissing,
    criticalMissing,
    groups: {
      market: marketCoverage.percent,
      fundamentals: fundamentalsCoverage.percent,
      technical: technicalCoverage.percent,
      news: newsCoverage,
    },
    missingFields: [...new Set([
      ...marketCoverage.missing,
      ...fundamentalsCoverage.missing,
      ...technicalCoverage.missing,
    ])].slice(0, 18),
  }
}

function scoreFromThresholds(
  value: unknown,
  thresholds: Array<[number, number]>,
) {
  const numeric = finiteNumber(value)
  if (numeric === null) return null

  for (const [threshold, score] of thresholds) {
    if (numeric >= threshold) return score
  }
  return 0
}

function inverseScoreFromThresholds(
  value: unknown,
  thresholds: Array<[number, number]>,
) {
  const numeric = finiteNumber(value)
  if (numeric === null) return null

  for (const [threshold, score] of thresholds) {
    if (numeric <= threshold) return score
  }
  return 0
}

function weightedScore(
  items: Array<{ label: string; value: number | null; weight: number }>,
) {
  let total = 0
  let used = 0

  items.forEach((item) => {
    if (item.value === null) return
    total += item.value * item.weight
    used += item.weight
  })

  return {
    score: used > 0 ? clamp(total / used, 0, 100) : null,
    coverage: used,
    details: items.map((item) => ({
      label: item.label,
      score: item.value,
      weight: item.weight,
    })),
  }
}

function healthLabel(score: number | null, coverage: number) {
  if (score === null || coverage < 30) return 'Dados insuficientes'
  if (score >= 80) return 'Muito boa'
  if (score >= 65) return 'Boa'
  if (score >= 50) return 'Regular'
  if (score >= 35) return 'Frágil'
  return 'Muito frágil'
}

function buildHealthSupplement(assetType: string, market: Record<string, unknown>) {
  if (assetType === 'etf') {
    return {
      score: null,
      label: 'Não aplicável ao ETF',
      coverage: 0,
      categories: [],
      limitations: [
        'ETFs devem ser avaliados por índice, composição, taxa, liquidez e tracking error, não pela saúde de uma empresa.',
      ],
    }
  }

  if (assetType === 'fii') {
    const valuation = weightedScore([
      {
        label: 'P/VP',
        value: inverseScoreFromThresholds(market.priceToBook, [
          [0.85, 90], [1.00, 75], [1.15, 55], [1.35, 30],
        ]),
        weight: 45,
      },
      {
        label: 'Dividend yield',
        value: scoreFromThresholds(market.dividendYield, [
          [0.12, 95], [0.09, 80], [0.07, 65], [0.05, 45], [0, 20],
        ]),
        weight: 55,
      },
    ])
    const liquidity = weightedScore([
      {
        label: 'Volume',
        value: scoreFromThresholds(market.volume, [
          [5_000_000, 95], [1_000_000, 80], [250_000, 60], [50_000, 40], [1, 20],
        ]),
        weight: 100,
      },
    ])
    const categories = [
      { label: 'Valuation e renda', score: valuation.score, weight: 70, coverage: valuation.coverage, details: valuation.details },
      { label: 'Liquidez', score: liquidity.score, weight: 30, coverage: liquidity.coverage, details: liquidity.details },
    ]
    const aggregate = weightedScore(categories.map((item) => ({
      label: item.label,
      value: item.score,
      weight: item.weight,
    })))
    const coverage = categories.reduce(
      (sum, item) => sum + (item.score !== null ? item.weight : 0),
      0,
    )

    return {
      score: coverage >= 30 ? aggregate.score : null,
      label: healthLabel(aggregate.score, coverage),
      coverage,
      categories: categories.filter((item) => item.score !== null),
      limitations: [
        'A pesquisa breve não inclui vacância, concentração de locatários, prazo dos contratos e qualidade dos imóveis.',
      ],
    }
  }

  const profitability = weightedScore([
    {
      label: 'ROE',
      value: scoreFromThresholds(market.roe, [
        [0.25, 100], [0.18, 85], [0.12, 70], [0.06, 45], [0, 20],
      ]),
      weight: 35,
    },
    {
      label: 'ROA',
      value: scoreFromThresholds(market.roa, [
        [0.12, 100], [0.08, 85], [0.05, 70], [0.02, 45], [0, 20],
      ]),
      weight: 20,
    },
    {
      label: 'Margem líquida',
      value: scoreFromThresholds(market.netMargin, [
        [0.20, 100], [0.12, 80], [0.07, 65], [0.02, 40], [0, 20],
      ]),
      weight: 25,
    },
    {
      label: 'Margem operacional',
      value: scoreFromThresholds(market.operatingMargin, [
        [0.20, 100], [0.12, 80], [0.07, 65], [0.02, 40], [0, 20],
      ]),
      weight: 20,
    },
  ])
  const strength = weightedScore([
    {
      label: 'Dívida / patrimônio',
      value: inverseScoreFromThresholds(market.debtToEquity, [
        [0.30, 100], [0.60, 85], [1.00, 65], [1.50, 40], [2.50, 20],
      ]),
      weight: 35,
    },
    {
      label: 'Liquidez corrente',
      value: scoreFromThresholds(market.currentRatio, [
        [2, 100], [1.5, 85], [1.2, 70], [1, 50], [0.8, 25],
      ]),
      weight: 25,
    },
    {
      label: 'Caixa livre',
      value: finiteNumber(market.freeCashflow) === null
        ? null
        : Number(market.freeCashflow) > 0 ? 90 : 10,
      weight: 40,
    },
  ])
  const growth = weightedScore([
    {
      label: 'Crescimento da receita',
      value: scoreFromThresholds(market.revenueGrowth, [
        [0.15, 100], [0.08, 80], [0.03, 65], [0, 45], [-0.10, 20],
      ]),
      weight: 45,
    },
    {
      label: 'Crescimento do lucro',
      value: scoreFromThresholds(market.earningsGrowth, [
        [0.15, 100], [0.08, 80], [0.03, 65], [0, 45], [-0.10, 20],
      ]),
      weight: 55,
    },
  ])
  const categories = [
    { label: 'Rentabilidade', score: profitability.score, weight: 40, coverage: profitability.coverage, details: profitability.details },
    { label: 'Solidez financeira', score: strength.score, weight: 35, coverage: strength.coverage, details: strength.details },
    { label: 'Crescimento', score: growth.score, weight: 25, coverage: growth.coverage, details: growth.details },
  ]
  const aggregate = weightedScore(categories.map((item) => ({
    label: item.label,
    value: item.score,
    weight: item.weight,
  })))
  const coverage = categories.reduce(
    (sum, item) => sum + (item.score !== null ? item.weight : 0),
    0,
  )

  return {
    score: coverage >= 30 ? aggregate.score : null,
    label: healthLabel(aggregate.score, coverage),
    coverage,
    categories: categories.filter((item) => item.score !== null),
    limitations: [],
  }
}

function buildSupplement(
  assetType: string,
  market: Record<string, unknown>,
  news: Record<string, any> | null,
) {
  return {
    quote: {
      price: market.price ?? null,
      change: market.change ?? null,
      changePercent: market.changePercent ?? null,
      previousClose: market.previousClose ?? null,
      open: market.open ?? null,
      dayHigh: market.dayHigh ?? null,
      dayLow: market.dayLow ?? null,
      volume: market.volume ?? null,
      marketCap: market.marketCap ?? null,
      fiftyTwoWeekHigh: market.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: market.fiftyTwoWeekLow ?? null,
      marketTime: market.marketTime ?? null,
      currency: market.currency ?? 'BRL',
      longName: market.name ?? null,
    },
    profile: {
      sector: market.sector ?? null,
      industry: market.industry ?? null,
      summary: market.description ?? null,
    },
    fundamentals: {
      trailingPe: market.trailingPe ?? null,
      priceToBook: market.priceToBook ?? null,
      enterpriseToEbitda: market.enterpriseToEbitda ?? null,
      dividendYield: market.dividendYield ?? null,
      beta: market.beta ?? null,
      eps: market.eps ?? null,
      bookValuePerShare: market.bookValuePerShare ?? null,
      roe: market.roe ?? null,
      roa: market.roa ?? null,
      grossMargin: market.grossMargin ?? null,
      ebitdaMargin: market.ebitdaMargin ?? null,
      operatingMargin: market.operatingMargin ?? null,
      netMargin: market.netMargin ?? null,
      currentRatio: market.currentRatio ?? null,
      quickRatio: market.quickRatio ?? null,
      debtToEquity: market.debtToEquity ?? null,
      totalDebt: market.totalDebt ?? null,
      totalCash: market.totalCash ?? null,
      freeCashflow: market.freeCashflow ?? null,
      operatingCashflow: market.operatingCashflow ?? null,
      revenueGrowth: market.revenueGrowth ?? null,
      earningsGrowth: market.earningsGrowth ?? null,
    },
    health: buildHealthSupplement(assetType, market),
    sentiment: {
      available: Boolean(news?.articleCount),
      score: news?.score ?? null,
      label: news?.label ?? 'Sem cobertura de notícias',
      periodDays: 30,
      articles: news?.items ?? [],
      articleCount: news?.articleCount ?? 0,
      positiveArticles: news?.positiveArticles ?? 0,
      neutralArticles: news?.neutralArticles ?? 0,
      negativeArticles: news?.negativeArticles ?? 0,
      source: 'PESQUISA_BREVE_MULTIFONTES',
      disclaimer:
        'Sentimento estimado por manchetes públicas recentes. Notícias são sinal auxiliar e não substituem fundamentos.',
    },
    analystReference: {
      mean: market.analystTargetMean ?? null,
      median: market.analystTargetMedian ?? null,
      count: market.analystCount ?? null,
    },
  }
}

function sourceResult(
  id: string,
  label: string,
  result: PromiseSettledResult<unknown>,
  successDetail: string,
) {
  if (result.status === 'fulfilled') {
    return { id, label, status: 'ok', detail: successDetail }
  }

  return {
    id,
    label,
    status: 'error',
    detail: limitedText(
      result.reason instanceof Error ? result.reason.message : result.reason,
      240,
    ) || 'Fonte temporariamente indisponível.',
  }
}

async function buildResearchPackage({
  ticker,
  companyName,
  assetType,
  currentAnalysis,
}: {
  ticker: string
  companyName: string
  assetType: string
  currentAnalysis: Record<string, any>
}) {
  const [brapiResult, yahooResult, macroResult, newsResult] =
    await Promise.allSettled([
      fetchBrapiResearch(ticker),
      fetchYahooResearch(ticker),
      fetchMacroResearch(),
      fetchNewsResearch(ticker, companyName),
    ])

  const brapi = brapiResult.status === 'fulfilled' ? brapiResult.value : null
  const yahoo = yahooResult.status === 'fulfilled' ? yahooResult.value : null
  const macro = macroResult.status === 'fulfilled' ? macroResult.value : null
  const news = newsResult.status === 'fulfilled' ? newsResult.value : null
  const snapshotMarket = mergeResearchData(
    currentAnalysis?.quote ?? {},
    currentAnalysis?.fundamentals ?? {},
  )
  const market = mergeResearchData(
    brapi?.data ?? null,
    yahoo?.data ?? null,
    snapshotMarket,
  )
  const coverage = buildCoverage(assetType, market, currentAnalysis, news)
  const sources = [
    sourceResult(
      'brapi',
      'brapi',
      brapiResult,
      `Cotação e fundamentos consultados${
        brapi?.tokenConfigured ? ' com token.' : ' sem token dedicado.'
      }`,
    ),
    sourceResult(
      'yahoo',
      'Yahoo Finance JSON experimental',
      yahooResult,
      yahoo?.partial
        ? 'Cotação consultada; fundamentos externos vieram parcialmente.'
        : 'Cotação e fundamentos complementares consultados.',
    ),
    sourceResult(
      'bcb',
      'Banco Central do Brasil',
      macroResult,
      'Selic e IPCA consultados diretamente nas séries SGS.',
    ),
    sourceResult(
      'news',
      'Notícias públicas recentes',
      newsResult,
      `${news?.items?.length ?? 0} manchete(s) localizada(s) para contexto.`,
    ),
  ]

  return {
    requestedAt: new Date().toISOString(),
    assetType,
    market,
    macro,
    news: news?.items ?? [],
    sentiment: news,
    coverage,
    sources,
    supplement: buildSupplement(assetType, market, news),
    persisted: false,
  }
}

function concentrationLevel(weight: number, hasPosition: boolean) {
  if (!hasPosition || weight <= 0) return 'Sem posição'
  if (weight >= 25) return 'Muito alta'
  if (weight >= 15) return 'Alta'
  if (weight >= 8) return 'Moderada'
  return 'Baixa'
}

function extractOpenAiText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text

  const output = Array.isArray(payload.output) ? payload.output : []

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []

    for (const part of content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        return part.text
      }

      if (part?.type === 'refusal' && typeof part.refusal === 'string') {
        throw new Error(part.refusal)
      }
    }
  }

  return ''
}

function clampScore(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(100, Math.max(0, numeric))
}

function deterministicInsufficientAnalysis({
  coverage,
  portfolio,
}: {
  coverage: Record<string, any>
  portfolio: Record<string, any>
}) {
  const weight = Number(portfolio?.selectedWeightPercent ?? 0)
  const hasPosition = Boolean(portfolio?.hasPosition)
  const concentration = concentrationLevel(
    Number.isFinite(weight) ? weight : 0,
    hasPosition,
  )
  const missing = Array.isArray(coverage?.missingFields)
    ? coverage.missingFields.slice(0, 8)
    : []

  return {
    stance: 'DADOS_INSUFICIENTES',
    stanceLabel: 'Aguardar mais dados',
    confidence: clampScore(Math.min(coverage?.percent ?? 0, 35)),
    headline: 'A cobertura atual não permite uma indicação confiável.',
    summary:
      'O sistema localizou a posição na carteira, mas não reuniu dados públicos suficientes para comparar qualidade, valuation e risco sem aumentar a chance de erro.',
    scores: {
      quality: 0,
      valuation: 0,
      momentum: 0,
      risk: 0,
    },
    portfolioAssessment: {
      weightPercent: Number.isFinite(weight) ? weight : 0,
      concentrationLevel: concentration,
      suggestedMaxWeightPercent: null,
      assessment: hasPosition
        ? `O peso atual é ${Number.isFinite(weight) ? weight.toFixed(2) : '0,00'}%, mas a decisão de aumentar ou reduzir fica suspensa até melhorar a cobertura dos dados.`
        : 'O ativo ainda não possui posição identificada. A entrada não deve ser classificada enquanto a cobertura estiver insuficiente.',
    },
    strengths: [],
    risks: [
      'Tomar decisão com poucos fundamentos pode produzir falsa precisão.',
      'Dados ausentes ou valores zerados não devem ser interpretados como indicadores reais.',
    ],
    actionPlan: [
      'Confirmar o BRAPI_TOKEN e o acesso aos endpoints fundamentalistas.',
      'Repetir a pesquisa após a atualização das fontes.',
      missing.length > 0
        ? `Priorizar os campos ausentes: ${missing.join(', ')}.`
        : 'Conferir os diagnósticos das fontes antes de nova análise.',
    ],
    sourceNotes: [
      `Cobertura calculada: ${Number(coverage?.percent ?? 0).toFixed(0)}%.`,
      'A OpenAI não foi chamada para emitir indicação com cobertura abaixo do limite mínimo.',
    ],
    disclaimer:
      'Resultado de estudo. Não constitui recomendação de investimento nem promessa de retorno.',
    model: null,
  }
}

async function requestOpenAiAnalysis(context: Record<string, unknown>) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  const model = Deno.env.get('OPENAI_MODEL')?.trim() || 'gpt-5-mini'

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada nos secrets do Supabase.')
  }

  const instructions = `
Você é um analista de apoio à decisão para investimentos brasileiros.
Responda exclusivamente em português do Brasil e use somente os dados estruturados fornecidos.
Não invente fatos, preços, balanços, indicadores ou notícias.
Valores ausentes, nulos ou zero marcados como indisponíveis não são dados reais.
Use a cobertura informada como teto de confiança. A confiança nunca pode superar dataCoverage.percent.
Considere o tipo do ativo: ações/BDRs/Units usam fundamentos empresariais; FIIs usam principalmente P/VP, dividendos e liquidez; ETFs não devem receber avaliação de saúde empresarial.
Considere o perfil e principalmente a proporção real do ativo na carteira.
Não emita ordem definitiva de compra ou venda, não prometa retorno e não trate a análise como aconselhamento fiduciário.
AUMENTAR_GRADUALMENTE só pode ser usado quando dataCoverage.percent >= 70 e a cobertura de fundamentos >= 50.
Quando a cobertura for baixa, use DADOS_INSUFICIENTES ou uma postura de espera, explicando os campos faltantes.
No score de risco, 100 significa risco elevado.
Todos os percentuais de saída usam pontos percentuais: 10 representa 10%, não 0,10.
Produza pontos curtos, verificáveis e úteis para decisão.
`.trim()

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input: JSON.stringify(context),
        max_output_tokens: 2200,
        text: {
          format: {
            type: 'json_schema',
            name: 'asset_portfolio_analysis',
            strict: true,
            schema: OPENAI_RESPONSE_SCHEMA,
          },
        },
      }),
    },
    45000,
  )
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      limitedText(
        payload?.error?.message ||
        payload?.message ||
        `OpenAI respondeu HTTP ${response.status}.`,
        500,
      ),
    )
  }

  const outputText = extractOpenAiText(payload ?? {})
  if (!outputText) throw new Error('A OpenAI não retornou texto analisável.')

  let parsed: Record<string, any>
  try {
    parsed = JSON.parse(outputText)
  } catch {
    throw new Error('A OpenAI retornou uma estrutura inválida.')
  }

  const scores = (parsed.scores ?? {}) as Record<string, unknown>

  return {
    ...parsed,
    confidence: clampScore(parsed.confidence),
    scores: {
      quality: clampScore(scores.quality),
      valuation: clampScore(scores.valuation),
      momentum: clampScore(scores.momentum),
      risk: clampScore(scores.risk),
    },
    model,
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método não permitido.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publishableKey = getPublishableKey()
    const authorization = request.headers.get('Authorization')

    if (!supabaseUrl || !publishableKey) {
      return jsonResponse(
        { success: false, error: 'Variáveis internas do Supabase não disponíveis.' },
        500,
      )
    }

    if (!authorization) {
      return jsonResponse({ success: false, error: 'Usuário não autenticado.' }, 401)
    }

    const supabaseUser = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Sessão inválida ou expirada.' }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action ?? 'analyze').toLowerCase()
    const ticker = normalizeTicker(body?.ticker)
    const assetType = normalizeAssetType(body?.assetType)
    const riskProfile = ['conservative', 'moderate', 'aggressive'].includes(
      String(body?.riskProfile),
    )
      ? String(body.riskProfile)
      : 'moderate'
    const assetSnapshot = sanitizeForPrompt(body?.assetSnapshot ?? {}) as
      Record<string, any>
    const portfolioContext = sanitizeForPrompt(body?.portfolioContext ?? {}) as
      Record<string, any>

    if (!ticker) {
      return jsonResponse({ success: false, error: 'Ticker não informado.' }, 400)
    }

    const companyName = firstText(
      assetSnapshot?.quote?.longName,
      assetSnapshot?.profile?.name,
      assetSnapshot?.profile?.summary,
      ticker,
    ) || ticker
    const research = await buildResearchPackage({
      ticker,
      companyName,
      assetType,
      currentAnalysis: assetSnapshot,
    })

    if (action === 'research') {
      return jsonResponse({ success: true, research })
    }

    const actualWeight = Number(portfolioContext?.selectedWeightPercent ?? 0)
    const hasPosition = Boolean(portfolioContext?.hasPosition)
    const actualConcentration = concentrationLevel(
      Number.isFinite(actualWeight) ? actualWeight : 0,
      hasPosition,
    )
    const portfolio = {
      ...portfolioContext,
      selectedWeightPercent: Number.isFinite(actualWeight) ? actualWeight : 0,
      concentrationLevelCalculated: actualConcentration,
    }

    let aiAnalysis: Record<string, any>

    if (!research.coverage.recommendationAllowed) {
      aiAnalysis = deterministicInsufficientAnalysis({
        coverage: research.coverage,
        portfolio,
      })
    } else {
      const aiContext = {
        requestedAt: research.requestedAt,
        ticker,
        assetType,
        riskProfile,
        portfolio,
        currentAnalysis: assetSnapshot,
        liveResearch: {
          market: research.market,
          macro: research.macro,
          recentNews: research.news,
          sources: research.sources,
        },
        dataCoverage: research.coverage,
        constraints: {
          noDatabasePersistence: true,
          briefResearch: true,
          portfolioAmountsOmittedFromAi: true,
          doNotTreatMissingOrZeroAsFacts: true,
        },
      }
      aiAnalysis = await requestOpenAiAnalysis(aiContext)
      aiAnalysis.confidence = Math.min(
        clampScore(aiAnalysis.confidence),
        clampScore(research.coverage.percent),
      )

      if (
        aiAnalysis.stance === 'AUMENTAR_GRADUALMENTE' &&
        (
          research.coverage.percent < 70 ||
          research.coverage.groups.fundamentals < 50
        )
      ) {
        aiAnalysis.stance = hasPosition ? 'MANTER' : 'SEM_POSICAO'
        aiAnalysis.stanceLabel = hasPosition
          ? 'Manter e aguardar mais dados'
          : 'Estudar sem iniciar posição'
        aiAnalysis.sourceNotes = [
          ...(aiAnalysis.sourceNotes ?? []),
          'A postura de aumento foi bloqueada porque a cobertura não atingiu o mínimo de segurança.',
        ]
      }
    }

    const portfolioAssessment = (
      aiAnalysis.portfolioAssessment ?? {}
    ) as Record<string, unknown>

    return jsonResponse({
      success: true,
      analysis: {
        ...aiAnalysis,
        portfolioAssessment: {
          ...portfolioAssessment,
          weightPercent: Number.isFinite(actualWeight) ? actualWeight : 0,
          concentrationLevel: actualConcentration,
        },
      },
      research,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'
    console.error('Erro na análise multi-fontes com IA:', error)

    return jsonResponse({ success: false, error: message }, 500)
  }
})
