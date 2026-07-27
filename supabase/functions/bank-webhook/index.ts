import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { PluggyConnect } from 'react-pluggy-connect'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-connection-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedTypes = new Set([
  'INCOME',
  'EXPENSE',
  'OWN_TRANSFER_IN',
  'OWN_TRANSFER_OUT',
  'INVESTMENT_CONTRIBUTION',
  'INVESTMENT_REDEMPTION',
  'DIVIDEND',
  'INTEREST_ON_EQUITY',
  'FII_INCOME',
  'REFUND',
  'REVERSAL',
  'ADJUSTMENT',
])

const negativeTypes = new Set([
  'EXPENSE',
  'OWN_TRANSFER_OUT',
  'INVESTMENT_CONTRIBUTION',
])

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getAdminKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy

  const rawSecretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (!rawSecretKeys) return null

  try {
    const parsed = JSON.parse(rawSecretKeys)
    return parsed.default ?? Object.values(parsed)[0] ?? null
  } catch {
    return null
  }
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') return value
  const normalized = String(value ?? '')
    .trim()
    .replace(/\u2212/g, '-')
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return Number(normalized)
}

function normalizeDate(value: unknown) {
  const text = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Data inválida: ${String(value ?? '')}. Use AAAA-MM-DD.`)
  }
  return text
}

function normalizeTime(value: unknown) {
  if (!value) return null
  const text = String(value).trim()
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return null
  return text.length === 5 ? `${text}:00` : text
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const adminKey = getAdminKey()

  if (!supabaseUrl || !adminKey) {
    return jsonResponse({ error: 'As credenciais administrativas da função não estão disponíveis.' }, 500)
  }

  const token = request.headers.get('x-connection-token')?.trim()
  if (!token || token.length < 32) {
    return jsonResponse({ error: 'Token de conexão ausente ou inválido.' }, 401)
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let logId: string | null = null
  let connection: Record<string, unknown> | null = null

  try {
    const tokenHash = await sha256(token)

    const { data: connectionRow, error: connectionError } = await admin
      .from('bank_connections')
      .select('*')
      .eq('webhook_token_hash', tokenHash)
      .eq('status', 'ACTIVE')
      .eq('sync_enabled', true)
      .maybeSingle()

    if (connectionError) throw connectionError
    if (!connectionRow) {
      return jsonResponse({ error: 'Conexão não encontrada, desativada ou com token expirado.' }, 401)
    }

    connection = connectionRow

    const { data: logRow, error: logError } = await admin
      .from('bank_sync_logs')
      .insert({
        user_id: connectionRow.user_id,
        connection_id: connectionRow.id,
        status: 'RUNNING',
        details: { source: 'BANK_WEBHOOK' },
      })
      .select('id')
      .single()

    if (logError) throw logError
    logId = logRow.id

    const body = await request.json()
    const incoming = Array.isArray(body?.transactions) ? body.transactions : []

    if (incoming.length === 0) {
      throw new Error('O corpo deve conter transactions com pelo menos um item.')
    }
    if (incoming.length > 500) {
      throw new Error('O limite por requisição é de 500 transações.')
    }

    const { data: categoryRows, error: categoryError } = await admin
      .from('categories')
      .select('id, name')
      .eq('user_id', connectionRow.user_id)
      .eq('active', true)

    if (categoryError) throw categoryError

    const categoryMap = new Map(
      (categoryRows ?? []).map((category) => [String(category.name).trim().toLowerCase(), category.id]),
    )

    const rows = []

    for (const [index, item] of incoming.entries()) {
      const type = String(item?.type ?? '').trim().toUpperCase()
      if (!allowedTypes.has(type)) {
        throw new Error(`Tipo inválido na posição ${index + 1}: ${type || '(vazio)'}.`)
      }

      const rawAmount = parseAmount(item?.amount)
      if (!Number.isFinite(rawAmount) || rawAmount === 0) {
        throw new Error(`Valor inválido na posição ${index + 1}.`)
      }

      const absoluteAmount = Math.abs(rawAmount)
      const amount = negativeTypes.has(type) ? -absoluteAmount : absoluteAmount
      const description = String(item?.description ?? '').trim()
      if (!description) {
        throw new Error(`Descrição ausente na posição ${index + 1}.`)
      }

      const transactionDate = normalizeDate(item?.date)
      const externalId = String(item?.external_id ?? '').trim()
      const baseForHash = externalId
        ? `${connectionRow.id}:${externalId}`
        : JSON.stringify({
            connection_id: connectionRow.id,
            date: transactionDate,
            time: normalizeTime(item?.time),
            description,
            counterparty: String(item?.counterparty ?? '').trim(),
            type,
            amount,
          })

      const recordHash = `api:${await sha256(baseForHash)}`
      const categoryName = String(item?.category_name ?? '').trim().toLowerCase()

      rows.push({
        user_id: connectionRow.user_id,
        account_id: connectionRow.account_id,
        category_id: categoryName ? categoryMap.get(categoryName) ?? null : null,
        transaction_date: transactionDate,
        transaction_time: normalizeTime(item?.time),
        original_description: description,
        normalized_description: description,
        counterparty: String(item?.counterparty ?? '').trim() || null,
        transaction_type: type,
        amount,
        external_identifier: externalId || null,
        record_hash: recordHash,
        needs_review: Boolean(item?.needs_review),
        reviewed: !Boolean(item?.needs_review),
        confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 100,
        source_data: {
          source: String(item?.source ?? 'BANK_WEBHOOK'),
          connection_id: connectionRow.id,
          received_at: new Date().toISOString(),
          original: item,
        },
      })
    }

    const { data: insertedRows, error: insertError } = await admin
      .from('transactions')
      .upsert(rows, {
        onConflict: 'user_id,record_hash',
        ignoreDuplicates: true,
      })
      .select('id')

    if (insertError) throw insertError

    const imported = insertedRows?.length ?? 0
    const skipped = rows.length - imported
    const finishedAt = new Date().toISOString()

    await admin
      .from('bank_connections')
      .update({
        last_sync_at: finishedAt,
        status: 'ACTIVE',
        updated_at: finishedAt,
      })
      .eq('id', connectionRow.id)

    await admin
      .from('bank_sync_logs')
      .update({
        finished_at: finishedAt,
        status: skipped > 0 ? 'WARNING' : 'SUCCESS',
        imported_records: imported,
        skipped_records: skipped,
        details: {
          source: 'BANK_WEBHOOK',
          message: skipped > 0 ? 'Alguns registros já existiam e foram ignorados.' : 'Sincronização concluída.',
        },
      })
      .eq('id', logId)

    return jsonResponse({ imported, skipped, received: rows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const finishedAt = new Date().toISOString()

    if (logId) {
      await admin
        .from('bank_sync_logs')
        .update({
          finished_at: finishedAt,
          status: 'ERROR',
          error_message: message,
          details: { source: 'BANK_WEBHOOK' },
        })
        .eq('id', logId)
    }

    if (connection?.id) {
      await admin
        .from('bank_connections')
        .update({
          status: 'ERROR',
          updated_at: finishedAt,
        })
        .eq('id', connection.id)
    }

    return jsonResponse({ error: message }, 400)
  }
})
