import { createClient } from 'npm:@supabase/supabase-js@2'

export async function requireAal2(req: Request) {
  const authorization = req.headers.get('Authorization') ?? ''
  const accessToken = authorization
    .replace(/^Bearer\s+/i, '')
    .trim()

  if (!accessToken) {
    return {
      ok: false as const,
      status: 401,
      message: 'Sessão não informada.',
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const publishableKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''

  const client = createClient(
    supabaseUrl,
    publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    },
  )

  const {
    data: userData,
    error: userError,
  } = await client.auth.getUser(accessToken)

  if (userError || !userData?.user) {
    return {
      ok: false as const,
      status: 401,
      message: 'Sua sessão expirou. Entre novamente.',
    }
  }

  const {
    data: aalData,
    error: aalError,
  } = await client.auth.mfa
    .getAuthenticatorAssuranceLevel(accessToken)

  if (aalError) {
    return {
      ok: false as const,
      status: 401,
      message: 'Não foi possível validar a segurança da sessão.',
    }
  }

  if (aalData?.currentLevel !== 'aal2') {
    return {
      ok: false as const,
      status: 403,
      message: 'Confirme o código do autenticador para continuar.',
    }
  }

  return {
    ok: true as const,
    user: userData.user,
    accessToken,
    aal: aalData,
    client,
  }
}
