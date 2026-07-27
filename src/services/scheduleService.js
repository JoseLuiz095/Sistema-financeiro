import { supabase } from '../lib/supabase'

export async function refreshScheduledOccurrences(horizonDays = 365) {
  const { data, error } = await supabase.rpc('refresh_my_scheduled_occurrences', {
    p_horizon_days: horizonDays,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export async function listScheduledTransactions() {
  const { data, error } = await supabase
    .from('scheduled_transactions')
    .select(`
      *,
      financial_accounts (id, institution, account_name),
      categories (id, name, category_type)
    `)
    .order('active', { ascending: false })
    .order('start_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createScheduledTransaction(payload) {
  const { data, error } = await supabase
    .from('scheduled_transactions')
    .insert(payload)
    .select(`
      *,
      financial_accounts (id, institution, account_name),
      categories (id, name, category_type)
    `)
    .single()
  if (error) throw error
  return data
}

export async function updateScheduledTransaction(id, payload) {
  const { data, error } = await supabase
    .from('scheduled_transactions')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`
      *,
      financial_accounts (id, institution, account_name),
      categories (id, name, category_type)
    `)
    .single()
  if (error) throw error
  return data
}

export async function deleteScheduledTransaction(id) {
  const { error } = await supabase
    .from('scheduled_transactions')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function listScheduledOccurrences(limit = 3000) {
  const { data, error } = await supabase
    .from('scheduled_occurrences')
    .select(`
      *,
      scheduled_transactions (
        id,
        title,
        description,
        counterparty,
        transaction_type,
        recurrence_type,
        recurrence_interval,
        auto_post,
        active,
        financial_accounts (id, institution, account_name),
        categories (id, name, category_type)
      )
    `)
    .order('due_date', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function settleScheduledOccurrence(id, paymentDate) {
  const { data, error } = await supabase.rpc('settle_scheduled_occurrence', {
    p_occurrence_id: id,
    p_payment_date: paymentDate || null,
  })
  if (error) throw error
  return data
}

export async function updateOccurrenceStatus(id, status) {
  const { data, error } = await supabase
    .from('scheduled_occurrences')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
