import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { deleteOpenFinanceConnection } from '../services/openFinanceConnectionDeletionService'
import './DeleteConnectionButton.css'

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

export default function DeleteConnectionButton({
  connection,
  displayName,
  disabled = false,
  setFeedback,
  onDeleted,
}) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !deleting) {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, deleting])

  async function confirmDeletion() {
    setDeleting(true)

    try {
      const response = await deleteOpenFinanceConnection(connection.id)
      const result = response.result ?? {}
      const cascaded = result.cascaded_records ?? {}
      const totalRemoved =
        Number(result.core_transactions_deleted ?? 0) +
        Object.values(cascaded).reduce(
          (total, value) => total + Number(value ?? 0),
          0,
        )

      setFeedback({
        type: 'success',
        message:
          `${displayName} foi removida. ` +
          `${totalRemoved} registro(s) importado(s) foram limpos.`,
      })

      setOpen(false)

      if (onDeleted) {
        await onDeleted(response)
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Falha ao remover a conexao: ${error.message}`,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="danger-button connection-delete-button"
        disabled={disabled || deleting}
        onClick={() => setOpen(true)}
      >
        <TrashIcon />
        Remover conexao
      </button>

      {open && createPortal(
        <div
          className="connection-delete-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) {
              setOpen(false)
            }
          }}
        >
          <section
            className="connection-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-delete-title"
          >
            <div className="connection-delete-icon" aria-hidden="true">
              <TrashIcon />
            </div>

            <div>
              <span className="connection-delete-kicker">Acao irreversivel</span>
              <h2 id="connection-delete-title">Remover {displayName}?</h2>
              <p>
                A conexao sera removida da Pluggy e do sistema. Os dados
                importados exclusivamente por ela tambem serao apagados.
              </p>
            </div>

            <div className="connection-delete-warning">
              <strong>Dados removidos desta conexao</strong>
              <ul>
                <li>contas Open Finance e movimentacoes bancarias importadas;</li>
                <li>cartoes, faturas, compras e parcelas associadas;</li>
                <li>emprestimos, dividas e saldos negativos associados;</li>
                <li>posicoes e movimentacoes de investimentos;</li>
                <li>historico de sincronizacoes.</li>
              </ul>
            </div>

            <p className="connection-delete-preserved">
              Lancamentos manuais, categorias e outras conexoes nao serao
              removidos. Uma conta financeira gerada pela integracao somente
              sera apagada quando estiver sem qualquer outro uso.
            </p>

            <div className="connection-delete-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={deleting}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button danger-button-solid"
                disabled={deleting}
                onClick={confirmDeletion}
              >
                <TrashIcon />
                {deleting ? 'Removendo...' : 'Remover definitivamente'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
