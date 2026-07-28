import { supabase } from '../lib/supabase'

export async function checkSessionGuard({
  guardToken = null,
  isActivity = false,
} = {}) {
  const { data, error } = await supabase.rpc(
    'check_my_session_guard',
    {
      p_guard_token: guardToken,
      p_is_activity: Boolean(isActivity),
    },
  )

  if (error) throw error

  if (!data || typeof data !== 'object') {
    throw new Error(
      'O servidor não retornou o estado da sessão.',
    )
  }

  return data
}

export async function revokeCurrentSessionGuard() {
  const { data, error } = await supabase.rpc(
    'revoke_my_session_guard',
  )

  if (error) throw error
  return data
}
