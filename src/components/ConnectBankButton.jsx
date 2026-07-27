import { useState } from 'react'
import { PluggyConnect } from 'react-pluggy-connect'
import {
  createPluggyConnectToken,
  registerPluggyItem,
} from '../services/openFinanceService'

export default function ConnectBankButton({
  setFeedback,
  onConnected,
}) {
  const [connectToken, setConnectToken] =
    useState(null)

  const [loading, setLoading] =
    useState(false)

  async function openConnect() {
    setLoading(true)

    try {
      const token =
        await createPluggyConnectToken()

      setConnectToken(token)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSuccess(data) {
    try {
      const itemId =
        data?.item?.id ??
        data?.id

      if (!itemId) {
        throw new Error(
          'A Pluggy não retornou o Item ID.',
        )
      }

      const connection =
        await registerPluggyItem(itemId)

      setFeedback({
        type: 'success',
        message:
          `${connection.institution_name} foi conectada com sucesso.`,
      })

      setConnectToken(null)

      if (onConnected) {
        await onConnected(connection)
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    }
  }

  function handleError(error) {
    setFeedback({
      type: 'error',
      message:
        error?.message ??
        'Não foi possível conectar a instituição.',
    })
  }

  return (
    <>
      <button
        type="button"
        className="primary-button"
        disabled={loading}
        onClick={openConnect}
      >
        {loading
          ? 'Preparando conexão...'
          : 'Conectar instituição'}
      </button>

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={false}
          forceOauthInBrowser
          onSuccess={handleSuccess}
          onError={handleError}
          onClose={() =>
            setConnectToken(null)
          }
        />
      )}
    </>
  )
}