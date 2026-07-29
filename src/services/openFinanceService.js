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
      ),
      open_finance_investment_positions (
        id,
        investment_name,
        net_balance,
        gross_amount,
        withdrawal_amount,
        original_amount,
        profit_amount,
        is_current,
        currency,
        source_data,
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
        provider_item_id,
        metadata
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
        provider_item_id,
        metadata
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

export async function listOpenFinanceLoans(limit = 1000) {
  const { data, error } = await supabase
    .from('open_finance_loans')
    .select(`
      *,
      open_finance_connections (
        id,
        institution_name,
        provider,
        provider_item_id,
        metadata
      )
    `)
    .eq('is_current', true)
    .order('outstanding_balance', { ascending: false, nullsFirst: false })
    .order('product_name')
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listDebtCreditCardBills(limit = 1000) {
  const { data, error } = await supabase
    .from('credit_card_bills')
    .select(`
      *,
      credit_cards (
        id,
        card_name,
        brand,
        last_four_digits,
        currency,
        open_finance_connections (
          id,
          institution_name,
          provider_item_id,
          metadata
        )
      )
    `)
    .in('status', ['OPEN', 'CLOSED', 'PARTIAL', 'OVERDUE'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function listNegativeOpenFinanceAccounts(limit = 1000) {
  const { data, error } = await supabase
    .from('open_finance_accounts')
    .select(`
      *,
      open_finance_connections (
        id,
        institution_name,
        provider_item_id,
        metadata
      )
    `)
    .lt('current_balance', 0)
    .eq('status', 'ACTIVE')
    .order('current_balance', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function renameOpenFinanceConnection(connection, displayName) {
  const normalizedName = String(displayName ?? '').trim().slice(0, 80)
  const metadata = { ...(connection?.metadata ?? {}) }

  if (normalizedName) {
    metadata.display_name = normalizedName
  } else {
    delete metadata.display_name
  }

  const { data, error } = await supabase
    .from('open_finance_connections')
    .update({ metadata })
    .eq('id', connection.id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function createPluggyConnectToken({ itemId } = {}) {
  const { data, error } =
    await supabase.functions.invoke(
      'pluggy-connect',
      {
        body: {
          action: 'create-token',
          ...(itemId ? { itemId } : {}),
        },
      },
    )

  if (error) {
    throw new Error(
      await extractFunctionError(error),
    )
  }

  if (!data?.success || !data?.accessToken) {
    throw new Error(
      data?.error ??
        'Não foi possível criar o Connect Token.',
    )
  }

  return data.accessToken
}

export async function registerPluggyItem(
  itemId,
) {
  const { data, error } =
    await supabase.functions.invoke(
      'pluggy-connect',
      {
        body: {
          action: 'register-item',
          itemId,
        },
      },
    )

  if (error) {
    throw new Error(
      await extractFunctionError(error),
    )
  }

  if (!data?.success) {
    throw new Error(
      data?.error ??
        'Não foi possível registrar a conexão.',
    )
  }

  return data.connection
}
