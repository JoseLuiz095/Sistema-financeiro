import { useMemo, useState } from 'react'
import { PluggyConnect } from 'react-pluggy-connect'
import {
  createPluggyConnectToken,
  registerPluggyItem,
} from '../services/openFinanceService'

export default function ConnectBankButton({
  connection = null,
  setFeedback,
  onConnected,
  className = 'primary-button',
  disabled = false,
}) {
  const [connectToken, setConnectToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [connectStage, setConnectStage] = useState('')

  const isUpdate = Boolean(connection?.provider_item_id)

  const buttonLabel = useMemo(() => {
    if (loading) {
      return isUpdate
        ? 'Preparando renovação...'
        : 'Preparando conexão...'
    }

    return isUpdate
      ? 'Atualizar acesso'
      : 'Conectar instituição'
  }, [isUpdate, loading])

  async function openConnect() {
    setLoading(true)
    setConnectStage('TOKEN')

    try {
      const token = await createPluggyConnectToken({
        itemId: connection?.provider_item_id,
      })

      setConnectToken(token)
      setConnectStage('WIDGET')
    } catch (error) {
      setConnectStage('')
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSuccess(data) {
    setLoading(true)
    setConnectStage('REGISTERING')

    try {
      const itemId =
        data?.item?.id ??
        data?.id ??
        connection?.provider_item_id

      if (!itemId) {
        throw new Error(
          'A Pluggy não retornou o Item ID.',
        )
      }

      const savedConnection =
        await registerPluggyItem(itemId)

      setFeedback({
        type: 'success',
        message: isUpdate
          ? `${savedConnection.institution_name} teve o acesso atualizado para este usuário.`
          : `${savedConnection.institution_name} foi vinculada à sua conta com sucesso.`,
      })

      setConnectToken(null)
      setConnectStage('')

      if (onConnected) {
        await onConnected(savedConnection, {
          mode: isUpdate ? 'UPDATE' : 'CREATE',
          shouldSync: true,
        })
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
    } finally {
      setLoading(false)
      setConnectStage('')
    }
  }

  async function handleError(error) {
    const pendingItemId =
      error?.data?.item?.id ??
      error?.item?.id

    if (pendingItemId) {
      try {
        setLoading(true)
        setConnectStage('REGISTERING')

        const savedConnection =
          await registerPluggyItem(pendingItemId)

        setConnectToken(null)
        setFeedback({
          type: 'info',
          message:
            'A conexão foi vinculada, mas ainda depende de uma autorização no banco ou no aplicativo da instituição. Conclua a etapa solicitada e depois atualize o acesso.',
        })

        if (onConnected) {
          await onConnected(savedConnection, {
            mode: 'PENDING',
            shouldSync: false,
          })
        }

        return
      } catch (registerError) {
        setFeedback({
          type: 'error',
          message:
            registerError?.message ??
            error?.message ??
            'Não foi possível registrar a conexão pendente.',
        })
        return
      } finally {
        setLoading(false)
        setConnectStage('')
      }
    }

    setConnectStage('')
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
        className={className}
        disabled={loading || disabled}
        onClick={openConnect}
        aria-busy={loading}
        title={
          isUpdate
            ? 'Reabra o fluxo da Pluggy para renovar credenciais ou consentimento.'
            : 'Abra o Pluggy Connect dentro do sistema.'
        }
      >
        {buttonLabel}
      </button>

      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={false}
          forceOauthInBrowser
          onSuccess={handleSuccess}
          onError={handleError}
          onEvent={(payload) => {
            const event = String(payload?.event ?? '')

            if (event) {
              setConnectStage(event)
            }
          }}
          onClose={() => {
            setConnectToken(null)
            setConnectStage('')
          }}
        />
      )}

      {loading && connectStage === 'REGISTERING' && (
        <span className="connect-bank-inline-status" aria-live="polite">
          Vinculando a instituição ao usuário atual...
        </span>
      )}
    </>
  )
}
