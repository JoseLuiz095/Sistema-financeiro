import { supabase } from '../lib/supabase'

const SUPABASE_URL = String(
  import.meta.env.VITE_SUPABASE_URL ?? '',
).replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
)

const CACHE_TTL = {
  catalog: 30 * 60 * 1000,
  overview: 90 * 1000,
  research: 5 * 60 * 1000,
  history: 10 * 60 * 1000,
}

const memoryCache = new Map()
const inFlightRequests = new Map()

const PROTECTED_SESSION_TTL = 45 * 1000
let protectedSessionCache = {
  accessToken: '',
  expiresAt: 0,
}
let protectedSessionRequest = null

class ProtectedFunctionError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message)
    this.name = 'ProtectedFunctionError'
    this.status = status
    this.payload = payload
    this.code = payload?.code ?? null
  }
}

function createAuthError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

export function resetProtectedSessionCache() {
  protectedSessionCache = {
    accessToken: '',
    expiresAt: 0,
  }
  protectedSessionRequest = null
}

async function readSession({ forceRefresh = false } = {}) {
  const { data: currentData, error: currentError } =
    await supabase.auth.getSession()

  if (currentError) throw currentError

  let session = currentData?.session ?? null

  if (!session?.access_token) {
    throw createAuthError(
      'Sua sessão expirou. Entre novamente para continuar.',
      'session_not_found',
    )
  }

  if (forceRefresh) {
    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession()

    if (refreshError) throw refreshError
    session = refreshData?.session ?? session
  }

  return session
}

async function getProtectedAccessToken({ forceRefresh = false } = {}) {
  const now = Date.now()

  if (
    !forceRefresh &&
    protectedSessionCache.accessToken &&
    protectedSessionCache.expiresAt > now
  ) {
    return protectedSessionCache.accessToken
  }

  if (!forceRefresh && protectedSessionRequest) {
    return protectedSessionRequest
  }

  const request = (async () => {
    const session = await readSession({ forceRefresh })

    protectedSessionCache = {
      accessToken: session.access_token,
      expiresAt: Date.now() + PROTECTED_SESSION_TTL,
    }

    return session.access_token
  })().finally(() => {
    protectedSessionRequest = null
  })

  protectedSessionRequest = request
  return request
}

async function parseFunctionResponse(response) {
  const raw = await response.text()
  let payload = null

  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = { message: raw }
    }
  }

  if (!response.ok) {
    throw new ProtectedFunctionError(
      payload?.error ||
        payload?.message ||
        `A função respondeu com HTTP ${response.status}.`,
      {
        status: response.status,
        payload,
      },
    )
  }

  return payload
}

async function invokeWithExactToken(functionName, body, accessToken) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'A configuração do Supabase não foi encontrada no frontend.',
    )
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    },
  )

  return parseFunctionResponse(response)
}

async function invokeProtectedFunction(functionName, body) {
  try {
    let accessToken = await getProtectedAccessToken()

    try {
      const data = await invokeWithExactToken(
        functionName,
        body,
        accessToken,
      )
      return { data, error: null }
    } catch (error) {
      if (![401, 403].includes(Number(error?.status))) {
        throw error
      }

      resetProtectedSessionCache()
      accessToken = await getProtectedAccessToken({ forceRefresh: true })
      const data = await invokeWithExactToken(
        functionName,
        body,
        accessToken,
      )
      return { data, error: null }
    }
  } catch (error) {
    return { data: null, error }
  }
}

function stableKey(value) {
  if (!value || typeof value !== 'object') return String(value ?? '')
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = value[key]
        return result
      }, {}),
  )
}

async function cachedRequest(key, ttlMs, loader, { forceRefresh = false } = {}) {
  const now = Date.now()
  const cached = memoryCache.get(key)

  if (!forceRefresh && cached?.expiresAt > now) {
    return cached.value
  }

  if (!forceRefresh && inFlightRequests.has(key)) {
    return inFlightRequests.get(key)
  }

  const request = Promise.resolve()
    .then(loader)
    .then((value) => {
      memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => {
      inFlightRequests.delete(key)
    })

  inFlightRequests.set(key, request)
  return request
}

async function extractFunctionError(error) {
  if (error instanceof ProtectedFunctionError) {
    return (
      error.payload?.error ||
      error.payload?.message ||
      error.message
    )
  }

  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return 'Falha de rede ao consultar o mercado. Verifique sua conexão.'
  }

  return error?.message || 'Falha ao consultar a análise do ativo.'
}

function isFiniteNumber(value) {
  return value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
}

function hasPositiveNumber(value) {
  return isFiniteNumber(value) && Number(value) > 0
}

function fillMissingObject(base = {}, supplement = {}, positiveFields = []) {
  const result = { ...base }
  const positiveSet = new Set(positiveFields)

  Object.entries(supplement ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return

    if (typeof value === 'number') {
      const currentIsValid = positiveSet.has(key)
        ? hasPositiveNumber(result[key])
        : isFiniteNumber(result[key])
      const incomingIsValid = positiveSet.has(key)
        ? hasPositiveNumber(value)
        : isFiniteNumber(value)

      if (!currentIsValid && incomingIsValid) result[key] = value
      return
    }

    if (!result[key]) result[key] = value
  })

  return result
}

function uniqueMessages(values = []) {
  return [...new Set(values.filter(Boolean).map((item) => String(item)))]
}

function mergeAnalysisWithResearch(base, research, assetType) {
  if (!research?.supplement) return base

  const supplement = research.supplement
  const quote = fillMissingObject(
    base.quote,
    supplement.quote,
    [
      'price',
      'previousClose',
      'open',
      'dayHigh',
      'dayLow',
      'volume',
      'marketCap',
      'fiftyTwoWeekHigh',
      'fiftyTwoWeekLow',
    ],
  )
  const profile = fillMissingObject(base.profile, supplement.profile)
  const fundamentals = fillMissingObject(
    base.fundamentals,
    supplement.fundamentals,
  )
  const currentHealthCoverage = Number(base.health?.coverage ?? 0)
  const researchHealthCoverage = Number(supplement.health?.coverage ?? 0)
  const semanticHealthReplacement =
    assetType === 'etf' &&
    String(supplement.health?.label ?? '').toLowerCase().includes('não aplicável')
  const health = (
    semanticHealthReplacement ||
    (
      (!isFiniteNumber(base.health?.score) || currentHealthCoverage < 30) &&
      researchHealthCoverage > currentHealthCoverage
    )
  )
    ? supplement.health
    : base.health
  const sentiment = (
    !base.sentiment?.available &&
    Number(supplement.sentiment?.articleCount ?? 0) > 0
  )
    ? supplement.sentiment
    : base.sentiment
  const valuation = {
    ...base.valuation,
    analystReference: fillMissingObject(
      base.valuation?.analystReference,
      supplement.analystReference,
      ['mean', 'median', 'count'],
    ),
  }
  const sourceErrors = (research.sources ?? [])
    .filter((source) => source.status === 'error')
    .map((source) => `${source.label}: ${source.detail}`)
  const missingFields = research.coverage?.missingFields ?? []
  const externalFields = research.externalFields ?? []
  const conflicts = research.conflicts ?? []
  const warnings = uniqueMessages([
    ...(base.dataQuality?.warnings ?? []),
    research.externalWarning,
    ...sourceErrors,
    conflicts.length > 0
      ? `${conflicts.length} divergência(s) relevante(s) encontrada(s) entre as fontes. O sistema preservou a fonte prioritária e reduziu a confiança da análise.`
      : null,
    research.coverage?.percent < 60
      ? `Cobertura efetiva da pesquisa breve em ${Number(research.coverage?.percent ?? 0).toFixed(0)}%. A IA não deve emitir indicação favorável enquanto os dados críticos estiverem incompletos.`
      : null,
    missingFields.length > 0
      ? `Campos ainda não localizados: ${missingFields.slice(0, 10).join(', ')}.`
      : null,
  ])

  return {
    ...base,
    assetType: research.assetType || assetType || 'stock',
    quote,
    profile,
    fundamentals,
    health,
    sentiment,
    valuation,
    liveResearch: research,
    dataQuality: {
      ...base.dataQuality,
      warnings,
      briefResearchUsed: true,
      briefResearchCoverage: research.coverage?.percent ?? null,
      briefResearchRawCoverage: research.coverage?.rawPercent ?? null,
      briefResearchGrade: research.coverage?.grade ?? null,
      briefResearchMissingFields: missingFields,
      briefResearchSources: research.sources ?? [],
      briefResearchRequestedAt: research.requestedAt ?? null,
      briefResearchExternalFallbackUsed: Boolean(research.externalFallbackUsed),
      briefResearchExternalFields: externalFields,
      briefResearchExternalSourceLabels: research.externalSourceLabels ?? [],
      briefResearchSourceReliability: research.sourceReliabilityPercent ?? null,
      briefResearchConflicts: conflicts,
      briefResearchExternalWarning: research.externalWarning ?? null,
      briefResearchDurationMs: research.performance?.durationMs ?? null,
      briefResearchCacheHit: Boolean(research.performance?.cacheHit),
      briefResearchReusedSnapshot: Boolean(research.performance?.reusedSnapshot),
    },
  }
}

async function getBriefResearch({
  ticker,
  assetType,
  assetSnapshot,
  forceRefresh = false,
}) {
  const normalizedTicker = String(ticker).trim().toUpperCase()
  const key = `research:${normalizedTicker}:${assetType || 'stock'}`

  return cachedRequest(
    key,
    CACHE_TTL.research,
    async () => {
      const { data, error } = await invokeProtectedFunction(
        'asset-ai-analysis',
        {
            action: 'research',
            ticker: normalizedTicker,
            assetType,
            assetSnapshot,
            forceRefresh,
          },
      )

      if (error) throw new Error(await extractFunctionError(error))
      if (!data?.success || !data?.research) {
        throw new Error(data?.error || 'A pesquisa breve não foi concluída.')
      }

      return data.research
    },
    { forceRefresh },
  )
}

export async function listMarketAssets({ forceRefresh = false } = {}) {
  return cachedRequest(
    'catalog:b3',
    CACHE_TTL.catalog,
    async () => {
      const { data, error } = await invokeProtectedFunction(
        'market-analysis',
        { action: 'catalog' },
      )

      if (error) throw new Error(await extractFunctionError(error))

      if (!data?.success) {
        throw new Error(data?.error || 'A lista de ativos não foi carregada.')
      }

      return data.assets ?? []
    },
    { forceRefresh },
  )
}

export async function getAssetAnalysis(
  ticker,
  assumptions,
  assetType = 'stock',
  { forceRefresh = false } = {},
) {
  const normalizedTicker = String(ticker).trim().toUpperCase()
  const key = `overview:${normalizedTicker}:${stableKey(assumptions)}`

  const data = await cachedRequest(
    key,
    CACHE_TTL.overview,
    async () => {
      const { data: response, error } = await invokeProtectedFunction(
        'market-analysis',
        {
          action: 'overview',
          ticker: normalizedTicker,
          assumptions,
        },
      )

      if (error) throw new Error(await extractFunctionError(error))
      if (!response?.success) {
        throw new Error(response?.error || 'A análise não foi concluída.')
      }

      return response
    },
    { forceRefresh },
  )

  return {
    ...data,
    assetType: data.assetType || assetType,
  }
}

export async function enrichAssetAnalysis({
  analysis,
  ticker,
  assetType = 'stock',
  forceRefresh = false,
}) {
  try {
    const research = await getBriefResearch({
      ticker,
      assetType,
      forceRefresh,
      assetSnapshot: {
        quote: analysis.quote,
        profile: analysis.profile,
        fundamentals: analysis.fundamentals,
        technical: analysis.technical,
        health: analysis.health,
        valuation: analysis.valuation,
        sentiment: analysis.sentiment,
        dataQuality: analysis.dataQuality,
      },
    })

    return mergeAnalysisWithResearch(analysis, research, assetType)
  } catch (researchError) {
    return {
      ...analysis,
      assetType,
      dataQuality: {
        ...analysis.dataQuality,
        warnings: uniqueMessages([
          ...(analysis.dataQuality?.warnings ?? []),
          `Pesquisa breve complementar indisponível: ${researchError.message}`,
        ]),
      },
    }
  }
}

export async function getAssetHistory(
  ticker,
  range = '1y',
  { forceRefresh = false } = {},
) {
  const normalizedTicker = String(ticker).trim().toUpperCase()
  const key = `history:${normalizedTicker}:${range}`

  return cachedRequest(
    key,
    CACHE_TTL.history,
    async () => {
      const { data, error } = await invokeProtectedFunction(
        'market-analysis',
        {
          action: 'history',
          ticker: normalizedTicker,
          range,
        },
      )

      if (error) throw new Error(await extractFunctionError(error))
      if (!data?.success) {
        throw new Error(data?.error || 'O histórico não foi carregado.')
      }

      return data
    },
    { forceRefresh },
  )
}

export async function getAssetAnalysisPreference(ticker) {
  const { data, error } = await supabase
    .from('asset_analysis_preferences')
    .select('*')
    .eq('ticker', String(ticker).trim().toUpperCase())
    .maybeSingle()

  if (error) throw error
  return data
}

export async function saveAssetAnalysisPreference(payload) {
  const normalized = {
    ...payload,
    ticker: String(payload.ticker).trim().toUpperCase(),
  }

  const { data, error } = await supabase
    .from('asset_analysis_preferences')
    .upsert(normalized, { onConflict: 'user_id,ticker' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function listCostBasisAdjustments(ticker) {
  const { data, error } = await supabase
    .from('investment_cost_basis_adjustments')
    .select('*')
    .eq('ticker', String(ticker).trim().toUpperCase())
    .eq('active', true)
    .order('reference_date', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function saveCostBasisAdjustment(payload) {
  const normalized = {
    ...payload,
    ticker: String(payload.ticker).trim().toUpperCase(),
  }

  const { data, error } = await supabase
    .from('investment_cost_basis_adjustments')
    .upsert(normalized, {
      onConflict: 'user_id,ticker,reference_date,adjustment_type',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteCostBasisAdjustment(id) {
  const { error } = await supabase
    .from('investment_cost_basis_adjustments')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function getAssetAiAnalysis(payload) {
  const { data, error } = await invokeProtectedFunction(
    'asset-ai-analysis',
    payload,
  )

  if (error) throw new Error(await extractFunctionError(error))

  if (!data?.success) {
    throw new Error(
      data?.error || 'A análise personalizada com IA não foi concluída.',
    )
  }

  return data
}
