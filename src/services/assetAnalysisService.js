import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

async function extractFunctionError(error) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json()
      return payload?.error || payload?.message || error.message
    } catch {
      return error.message
    }
  }

  if (error instanceof FunctionsRelayError) {
    return `Falha no relay da Edge Function: ${error.message}`
  }

  if (error instanceof FunctionsFetchError) {
    return `Falha de rede ao consultar o mercado: ${error.message}`
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
    },
  }
}

async function getBriefResearch({ ticker, assetType, assetSnapshot }) {
  const { data, error } = await supabase.functions.invoke(
    'asset-ai-analysis',
    {
      body: {
        action: 'research',
        ticker,
        assetType,
        assetSnapshot,
      },
    },
  )

  if (error) throw new Error(await extractFunctionError(error))
  if (!data?.success || !data?.research) {
    throw new Error(data?.error || 'A pesquisa breve não foi concluída.')
  }

  return data.research
}

export async function listMarketAssets() {
  const { data, error } = await supabase.functions.invoke(
    'market-analysis',
    { body: { action: 'catalog' } },
  )

  if (error) throw new Error(await extractFunctionError(error))

  if (!data?.success) {
    throw new Error(data?.error || 'A lista de ativos não foi carregada.')
  }

  return data.assets ?? []
}

export async function getAssetAnalysis(
  ticker,
  assumptions,
  assetType = 'stock',
) {
  const { data, error } = await supabase.functions.invoke(
    'market-analysis',
    {
      body: {
        action: 'overview',
        ticker,
        assumptions,
      },
    },
  )

  if (error) throw new Error(await extractFunctionError(error))
  if (!data?.success) {
    throw new Error(data?.error || 'A análise não foi concluída.')
  }

  try {
    const research = await getBriefResearch({
      ticker,
      assetType,
      assetSnapshot: {
        quote: data.quote,
        profile: data.profile,
        fundamentals: data.fundamentals,
        technical: data.technical,
        health: data.health,
        valuation: data.valuation,
        sentiment: data.sentiment,
        dataQuality: data.dataQuality,
      },
    })

    return mergeAnalysisWithResearch(data, research, assetType)
  } catch (researchError) {
    return {
      ...data,
      assetType,
      dataQuality: {
        ...data.dataQuality,
        warnings: uniqueMessages([
          ...(data.dataQuality?.warnings ?? []),
          `Pesquisa breve complementar indisponível: ${researchError.message}`,
        ]),
      },
    }
  }
}

export async function getAssetHistory(ticker, range = '1y') {
  const { data, error } = await supabase.functions.invoke(
    'market-analysis',
    {
      body: {
        action: 'history',
        ticker,
        range,
      },
    },
  )

  if (error) throw new Error(await extractFunctionError(error))
  if (!data?.success) {
    throw new Error(data?.error || 'O histórico não foi carregado.')
  }

  return data
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
  const { data, error } = await supabase.functions.invoke(
    'asset-ai-analysis',
    { body: payload },
  )

  if (error) throw new Error(await extractFunctionError(error))

  if (!data?.success) {
    throw new Error(
      data?.error || 'A análise personalizada com IA não foi concluída.',
    )
  }

  return data
}
