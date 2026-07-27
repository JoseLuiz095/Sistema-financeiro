import { supabase } from '../lib/supabase'

export async function listAssets() {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('active', true)
    .order('ticker')
  if (error) throw error
  return data ?? []
}

export async function createAsset(payload) {
  const normalized = {
    ...payload,
    ticker: payload.ticker.trim().toUpperCase(),
    market: (payload.market || 'B3').trim().toUpperCase(),
  }
  const { data, error } = await supabase
    .from('assets')
    .upsert(normalized, { onConflict: 'user_id,ticker,market' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listInvestmentOperations(limit = 10000) {
  const { data, error } = await supabase
    .from('investment_operations')
    .select('*, assets(id,ticker,asset_name,asset_type), financial_accounts(id,institution,account_name)')
    .order('operation_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function createInvestmentOperation(payload) {
  const { data, error } = await supabase
    .from('investment_operations')
    .insert(payload)
    .select('*, assets(id,ticker,asset_name,asset_type), financial_accounts(id,institution,account_name)')
    .single()
  if (error) throw error
  return data
}

export async function deleteInvestmentOperation(id) {
  const { error } = await supabase.from('investment_operations').delete().eq('id', id)
  if (error) throw error
}

export async function listMarketQuotes(limit = 20000) {
  const { data, error } = await supabase
    .from('market_quotes')
    .select('*, assets(id,ticker,asset_name,asset_type)')
    .order('quote_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function upsertMarketQuote(payload) {
  const { data, error } = await supabase
    .from('market_quotes')
    .upsert(payload, { onConflict: 'user_id,asset_id,quote_date' })
    .select('*, assets(id,ticker,asset_name,asset_type)')
    .single()
  if (error) throw error
  return data
}

export async function listInvestmentIncome(limit = 10000) {
  const { data, error } = await supabase
    .from('investment_income')
    .select('*, assets(id,ticker,asset_name,asset_type), financial_accounts(id,institution,account_name)')
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function createInvestmentIncome(payload) {
  const { data, error } = await supabase
    .from('investment_income')
    .insert(payload)
    .select('*, assets(id,ticker,asset_name,asset_type), financial_accounts(id,institution,account_name)')
    .single()
  if (error) throw error
  return data
}

export async function deleteInvestmentIncome(id) {
  const { error } = await supabase.from('investment_income').delete().eq('id', id)
  if (error) throw error
}
