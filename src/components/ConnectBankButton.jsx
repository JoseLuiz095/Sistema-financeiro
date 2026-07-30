import { useMemo, useState } from 'react'
import { PluggyConnect } from 'react-pluggy-connect'
import {
  createPluggyConnectSession,
  registerPluggyItem,
} from '../services/openFinanceService'

const FLOW_MEU_PLUGGY = 'MEU_PLUGGY'
const FLOW_BANKS = 'BANKS'

function normalizeFlow(value) {
  return value === FLOW_MEU_PLUGGY
    ? FLOW_MEU_PLUGGY
    : FLOW_BANKS
}

function getFriendlyConnectError(error, flow) {
  const message = String(error?.message ?? '').trim()

  if (flow === FLOW_MEU_PLUGGY) {
    if (/senha|password|credencial|login|autentica/i.test(message)) {
      return 'Não foi possível acessar o MeuPluggy. Confira seus dados de acesso e tente novamente.'
    }

    if (/connector|conector|indispon/i.test(message)) {
      return 'O acesso ao MeuPluggy está indisponível nesta aplicação. Tente novamente mais tarde.'
    }

    return message ||
      'Não foi possível conectar sua conta MeuPluggy agora. Tente novamente em alguns minutos.'
  }

  return message ||
    'Não foi possível abrir a conexão bancária. Tente novamente em alguns minutos.'
}

export default function ConnectBankButton({
  connection = null,
  flow = FLOW_BANKS,
  label = '',
  setFeedback,
  onConnected,
  className = 'primary-button',
  disabled = false,
}) {
  const [connectSession, setConnectSession] = useState(null)
  const [loading, setLoading] = useState(false)
  const [connectStage, setConnectStage] = useState('')

  const normalizedFlow = normalizeFlow(flow)
  const isUpdate = Boolean(connection?.provider_item_id)

  const buttonLabel = useMemo(() => {
    if (loading) {
      return isUpdate
        ? 'Preparando atualização...'
        : normalizedFlow === FLOW_MEU_PLUGGY
          ? 'Abrindo MeuPluggy...'
          : 'Preparando conexão...'
    }

    if (label) return label

    if (isUpdate) return 'Atualizar acesso'

    return normalizedFlow === FLOW_MEU_PLUGGY
      ? 'Entrar com MeuPluggy'
      : 'Escolher meus bancos'
  }, [isUpdate, label, loading, normalizedFlow])

  async function openConnect() {
    setLoading(true)
    setConnectStage('TOKEN')

    try {
      const session = await createPluggyConnectSession({
        itemId: connection?.provider_item_id,
        flow: normalizedFlow,
      })

      setConnectSession(session)
      setConnectStage('WIDGET')
    } catch (error) {
      setConnectStage('')
      setFeedback({
        type: 'error',
        message: getFriendlyConnectError(error, normalizedFlow),
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
          'A conexão foi concluída, mas não retornou uma identificação válida.',
        )
      }

      const savedConnection = await registerPluggyItem(itemId, {
        flow: normalizedFlow,
      })

      setFeedback({
        type: 'success',
        message: isUpdate
          ? `${savedConnection.institution_name} teve o acesso atualizado.`
          : `${savedConnection.institution_name} foi vinculada à sua conta com sucesso.`,
      })

      setConnectSession(null)
      setConnectStage('')

      if (onConnected) {
        await onConnected(savedConnection, {
          mode: isUpdate ? 'UPDATE' : 'CREATE',
          flow: normalizedFlow,
          shouldSync: true,
        })
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getFriendlyConnectError(error, normalizedFlow),
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

        const savedConnection = await registerPluggyItem(
          pendingItemId,
          { flow: normalizedFlow },
        )

        setConnectSession(null)
        setFeedback({
          type: 'info',
          message:
            'A conexão foi registrada, mas ainda depende de uma autorização no banco ou no aplicativo da instituição. Conclua a etapa solicitada e depois atualize o acesso.',
        })

        if (onConnected) {
          await onConnected(savedConnection, {
            mode: 'PENDING',
            flow: normalizedFlow,
            shouldSync: false,
          })
        }

        return
      } catch (registerError) {
        setFeedback({
          type: 'error',
          message: getFriendlyConnectError(
            registerError ?? error,
            normalizedFlow,
          ),
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
      message: getFriendlyConnectError(error, normalizedFlow),
    })
  }

  const widgetProps = {}

  if (connectSession?.selectedConnectorId) {
    widgetProps.selectedConnectorId =
      connectSession.selectedConnectorId
  }

  if (connectSession?.connectorIds?.length) {
    widgetProps.connectorIds = connectSession.connectorIds
  }

  if (normalizedFlow === FLOW_BANKS) {
    widgetProps.connectorTypes = [
      'PERSONAL_BANK',
      'BUSINESS_BANK',
      'INVESTMENT',
    ]
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
            ? 'Reabra o fluxo seguro para renovar o acesso desta conexão.'
            : normalizedFlow === FLOW_MEU_PLUGGY
              ? 'Abra diretamente o acesso do MeuPluggy.'
              : 'Escolha uma instituição financeira para conectar.'
        }
      >
        {buttonLabel}
      </button>

      {connectSession?.accessToken && (
        <PluggyConnect
          connectToken={connectSession.accessToken}
          includeSandbox={false}
          forceOauthInBrowser
          language="pt"
          {...widgetProps}
          onSuccess={handleSuccess}
          onError={handleError}
          onEvent={(payload) => {
            const event = String(payload?.event ?? '')

            if (event) {
              setConnectStage(event)
            }
          }}
          onClose={() => {
            setConnectSession(null)
            setConnectStage('')
          }}
        />
      )}

      {loading && connectStage === 'REGISTERING' && (
        <span
          className="connect-bank-inline-status"
          aria-live="polite"
        >
          Vinculando a conexão ao seu usuário...
        </span>
      )}
    </>
  )
}
