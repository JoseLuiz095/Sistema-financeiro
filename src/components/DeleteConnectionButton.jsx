import { useState } from 'react'
import { deleteOpenFinanceConnection } from '../services/openFinanceConnectionDeletionService'
import './DeleteConnectionButton.css'

export default function DeleteConnectionButton({
  connection,
  displayName,
  disabled = false,
  setFeedback,
  onDeleted,
}) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    const itemSuffix = String(
      connection?.provider_item_id ?? '',
    ).slice(-6)

    const confirmed = window.confirm(
      `Remover a conexão "${displayName}"?\n\n` +
      `Item final: ${itemSuffix}\n\n` +
      'Serão removidos somente os dados importados por esta conexão: ' +
      'contas, transações, cartões, faturas, dívidas, investimentos e logs.\n\n' +
      'Esta ação não poderá ser desfeita.',
    )

    if (!confirmed) {
      return
    }

    setDeleting(true)

    try {
      await deleteOpenFinanceConnection(
        connection.id,
      )

      setFeedback({
        type: 'success',
        message:
          `Conexão "${displayName}" removida com sucesso.`,
      })

      if (onDeleted) {
        await onDeleted()
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          `Falha ao remover a conexão: ${error.message}`,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      className="danger-button"
      disabled={disabled || deleting}
      onClick={handleDelete}
    >
      {deleting
        ? 'Removendo...'
        : 'Remover conexão'}
    </button>
  )
}