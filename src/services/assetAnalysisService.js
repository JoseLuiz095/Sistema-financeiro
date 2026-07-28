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

  return error?.message || 'Falha ao consultar a analise do ativo.'
}


export async function listMarketAssets() {
  const { data, error } = await supabase.functions.invoke(
    'market-analysis',
    {
      body: {
        action: 'catalog',
      },
    },
  )

  if (error) {
    throw new Error(await extractFunctionError(error))
  }

  if (!data?.success) {
    throw new Error(
      data?.error || 'A lista de ativos não foi carregada.',
    )
  }

  return data.assets ?? []
}

export async function getAssetAnalysis(
  ticker,
  assumptions,
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

  if (error) {
    throw new Error(await extractFunctionError(error))
  }

  if (!data?.success) {
    throw new Error(data?.error || 'A analise nao foi concluida.')
  }

  return data
}

export async function getAssetHistory(
  ticker,
  range = '1y',
) {
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

  if (error) {
    throw new Error(await extractFunctionError(error))
  }

  if (!data?.success) {
    throw new Error(data?.error || 'O historico nao foi carregado.')
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
    .upsert(normalized, {
      onConflict: 'user_id,ticker',
    })
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
