import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export async function listOpenFinanceConnections() {
  const { data, error } = await supabase
    .from('open_finance_connections')
    .select(`
      *,
      open_finance_accounts (
        id,
        account_type,
        account_name,
        current_balance,
        available_balance,
        currency,
        synced_at
      ),
      credit_cards (
        id,
        card_name,
        brand,
        last_four_digits,
        total_limit,
        used_limit,
        available_limit,
        currency,
        status,
        synced_at
      )
    `)
    .eq('provider', 'PLUGGY')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function listOpenFinanceSyncLogs(limit = 50) {
  const { data, error } = await supabase
    .from('open_finance_sync_logs')
    .select(`
      *,
      open_finance_connections (
        id,
        institution_name,
        provider,
        provider_item_id
      )
    `)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listCreditCardBills(limit = 50) {
  const { data, error } = await supabase
    .from('credit_card_bills')
    .select(`
      *,
      credit_cards (
        id,
        card_name,
        brand,
        last_four_digits,
        currency
      )
    `)
    .order('due_date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listPendingCardTransactions(limit = 100) {
  const { data, error } = await supabase
    .from('credit_card_transactions')
    .select(`
      *,
      credit_cards (
        id,
        card_name,
        brand,
        last_four_digits,
        currency
      )
    `)
    .eq('status', 'PENDING')
    .order('transaction_date', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

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
    return `Falha de rede ao chamar a Edge Function: ${error.message}`
  }

  return error?.message || 'Falha ao executar a sincronização.'
}

export async function syncPluggyConnection(
  connectionId,
  { dateFrom, dateTo } = {},
) {
  const body = { connectionId }

  if (dateFrom) body.dateFrom = dateFrom
  if (dateTo) body.dateTo = dateTo

  const { data, error } = await supabase.functions.invoke('pluggy-sync', {
    body,
  })

  if (error) {
    throw new Error(await extractFunctionError(error))
  }

  if (!data?.success) {
    throw new Error(data?.error || 'A sincronização não foi concluída.')
  }

  return data
}

export async function listOpenFinanceInvestmentPositions(limit = 1000) {
  const { data, error } = await supabase
    .from('open_finance_investment_positions')
    .select(`
      *,
      open_finance_connections (
        id,
        institution_name,
        provider,
        provider_item_id
      )
    `)
    .eq('is_current', true)
    .order('net_balance', { ascending: false, nullsFirst: false })
    .order('investment_name')
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listOpenFinanceInvestmentTransactions(limit = 5000) {
  const { data, error } = await supabase
    .from('open_finance_investment_transactions')
    .select(`
      *,
      open_finance_investment_positions (
        id,
        investment_name,
        investment_code,
        investment_type,
        investment_subtype,
        currency,
        connection_id
      )
    `)
    .order('transaction_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}
