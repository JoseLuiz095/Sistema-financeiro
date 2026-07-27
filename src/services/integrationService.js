import { supabase } from '../lib/supabase'

export function generateConnectionToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashConnectionToken(token) {
  const encoded = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function listBankConnections() {
  const { data, error } = await supabase
    .from('bank_connections')
    .select(`
      *,
      financial_accounts (id, institution, account_name)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createWebhookConnection({ userId, accountId, connectionName, institution }) {
  const token = generateConnectionToken()
  const tokenHash = await hashConnectionToken(token)

  const { data, error } = await supabase
    .from('bank_connections')
    .insert({
      user_id: userId,
      account_id: accountId,
      provider: 'CUSTOM_WEBHOOK',
      connection_name: connectionName,
      institution: institution || null,
      status: 'ACTIVE',
      webhook_token_hash: tokenHash,
      sync_enabled: true,
      settings: {
        format: 'NORMALIZED_TRANSACTIONS_V1',
      },
    })
    .select(`
      *,
      financial_accounts (id, institution, account_name)
    `)
    .single()

  if (error) throw error
  return { connection: data, token }
}

export async function updateBankConnection(id, payload) {
  const { data, error } = await supabase
    .from('bank_connections')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`
      *,
      financial_accounts (id, institution, account_name)
    `)
    .single()
  if (error) throw error
  return data
}

export async function deleteBankConnection(id) {
  const { error } = await supabase
    .from('bank_connections')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function listBankSyncLogs(limit = 100) {
  const { data, error } = await supabase
    .from('bank_sync_logs')
    .select(`
      *,
      bank_connections (id, connection_name, provider, institution)
    `)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export function getWebhookEndpoint() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${baseUrl}/functions/v1/bank-webhook`
}

export async function sendWebhookTest({ token, transaction }) {
  const response = await fetch(getWebhookEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-connection-token': token,
    },
    body: JSON.stringify({ transactions: [transaction] }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Falha HTTP ${response.status}.`)
  }
  return payload
}

export async function rotateWebhookToken(id) {
  const token = generateConnectionToken()
  const webhookTokenHash = await hashConnectionToken(token)
  const connection = await updateBankConnection(id, {
    webhook_token_hash: webhookTokenHash,
    status: 'ACTIVE',
    sync_enabled: true,
  })
  return { connection, token }
}
