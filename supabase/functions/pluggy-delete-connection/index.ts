import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getPublishableKey() {
  const currentKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')

  if (currentKeys) {
    const parsed = JSON.parse(currentKeys)
    return parsed.default
  }

  return Deno.env.get('SUPABASE_ANON_KEY')
}

async function getPluggyApiKey() {
  const clientId = Deno.env.get('PLUGGY_CLIENT_ID')?.trim()
  const clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET')?.trim()

  if (!clientId || !clientSecret) {
    throw new Error(
      'PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET nao configurado.',
    )
  }

  const response = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clientId, clientSecret }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      `Falha ao autenticar na Pluggy: ${
        payload?.message ?? payload?.error ?? response.statusText
      }`,
    )
  }

  const apiKey = payload?.apiKey ?? payload?.accessToken

  if (!apiKey) {
    throw new Error('A Pluggy nao retornou uma API Key.')
  }

  return apiKey
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Metodo nao permitido.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publishableKey = getPublishableKey()
    const authorization = request.headers.get('Authorization')

    if (!supabaseUrl || !publishableKey) {
      return jsonResponse(
        { error: 'Variaveis internas do Supabase nao disponiveis.' },
        500,
      )
    }

    if (!authorization) {
      return jsonResponse({ error: 'Usuario nao autenticado.' }, 401)
    }

    const supabaseUser = createClient(supabaseUrl, publishableKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Sessao invalida ou expirada.' }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const connectionId = String(body?.connectionId ?? '').trim()

    if (!connectionId) {
      return jsonResponse({ error: 'connectionId nao informado.' }, 400)
    }

    const { data: connection, error: connectionError } = await supabaseUser
      .from('open_finance_connections')
      .select(
        'id, user_id, provider, provider_item_id, institution_name, metadata',
      )
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .eq('provider', 'PLUGGY')
      .single()

    if (connectionError || !connection) {
      return jsonResponse(
        { error: 'Conexao Pluggy nao encontrada para o usuario autenticado.' },
        404,
      )
    }

    const apiKey = await getPluggyApiKey()

    const pluggyResponse = await fetch(
      `https://api.pluggy.ai/items/${encodeURIComponent(
        connection.provider_item_id,
      )}`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': apiKey,
        },
      },
    )

    const pluggyPayload = await pluggyResponse.json().catch(() => null)

    // 404 significa que o Item ja havia sido removido na Pluggy.
    // Nesse caso, a limpeza local ainda deve prosseguir.
    if (!pluggyResponse.ok && pluggyResponse.status !== 404) {
      return jsonResponse(
        {
          error: `A Pluggy nao permitiu remover o Item: ${
            pluggyPayload?.message ??
            pluggyPayload?.error ??
            pluggyResponse.statusText ??
            `HTTP ${pluggyResponse.status}`
          }`,
        },
        502,
      )
    }

    const { data: cleanupResult, error: cleanupError } =
      await supabaseUser.rpc('delete_my_open_finance_connection', {
        p_connection_id: connection.id,
      })

    if (cleanupError) {
      throw new Error(
        `O Item foi removido da Pluggy, mas a limpeza local falhou: ${cleanupError.message}`,
      )
    }

    return jsonResponse({
      success: true,
      message: `${connection.institution_name} foi removida com seus dados importados.`,
      result: cleanupResult,
      pluggy: {
        status: pluggyResponse.status,
        already_missing: pluggyResponse.status === 404,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro desconhecido.'

    console.error('Erro ao remover conexao Pluggy:', error)

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    )
  }
})
