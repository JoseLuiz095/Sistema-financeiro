import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

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

  return error?.message || 'Nao foi possivel remover a conexao.'
}

export async function deleteOpenFinanceConnection(connectionId) {
  const { data, error } = await supabase.functions.invoke(
    'pluggy-delete-connection',
    {
      body: {
        connectionId,
      },
    },
  )

  if (error) {
    throw new Error(await extractFunctionError(error))
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Nao foi possivel remover a conexao.')
  }

  return data
}
