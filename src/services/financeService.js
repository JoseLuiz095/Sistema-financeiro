import { supabase } from '../lib/supabase'
import { DEFAULT_CATEGORIES } from '../constants/finance'

export async function listAccounts() {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createAccount(payload) {
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function ensureDefaultCategories(userId) {
  const rows = DEFAULT_CATEGORIES.map((category) => ({
    ...category,
    user_id: userId,
    active: true,
  }))

  const { error } = await supabase
    .from('categories')
    .upsert(rows, {
      onConflict: 'user_id,name,category_type',
      ignoreDuplicates: true,
    })
  if (error) throw error
}

export async function listCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('active', true)
    .order('category_type')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createCategory(payload) {
  const { data, error } = await supabase
    .from('categories')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listTransactions(limit = 5000) {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      financial_accounts (id, institution, account_name),
      categories (id, name, category_type)
    `)
    .order('transaction_date', { ascending: false })
    .order('transaction_time', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function createTransaction(payload) {
  const { data, error } = await supabase
    .from('transactions')
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

export async function updateTransaction(id, payload) {
  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
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

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}
