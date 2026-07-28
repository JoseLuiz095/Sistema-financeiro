import fs from 'node:fs'

const pagePath = 'src/pages/OpenFinancePage.jsx'
const servicePath = 'src/services/openFinanceService.js'
const cssPath = 'src/App.css'

for (const path of [pagePath, servicePath, cssPath]) {
  if (!fs.existsSync(path)) {
    throw new Error(`Arquivo não encontrado: ${path}. Execute este script na raiz do projeto.`)
  }
}

let page = fs.readFileSync(pagePath, 'utf8')
let service = fs.readFileSync(servicePath, 'utf8')
let css = fs.readFileSync(cssPath, 'utf8')

if (!page.includes('deleteOpenFinanceConnection,')) {
  page = page.replace(
    "import {\n  listCreditCardBills,",
    "import {\n  deleteOpenFinanceConnection,\n  listCreditCardBills,",
  )
}

if (!page.includes('const [deletingId, setDeletingId]')) {
  page = page.replace(
    "  const [renamingId, setRenamingId] = useState(null)",
    "  const [renamingId, setRenamingId] = useState(null)\n  const [deletingId, setDeletingId] = useState(null)",
  )
}

if (!page.includes('async function handleDeleteConnection(connection)')) {
  const handler = `
  async function handleDeleteConnection(connection) {
    const displayName = getConnectionDisplayName(connection)
    const itemSuffix = String(
      connection.provider_item_id ?? '',
    ).slice(-6)

    const confirmed = window.confirm(
      \`Remover a conexão "\${displayName}" (Item final \${itemSuffix})?\\n\\n\` +
      'Serão apagados somente os dados importados por esta conexão: contas, ' +
      'movimentações, cartões, faturas, dívidas, investimentos e logs.\\n\\n' +
      'Esta ação não poderá ser desfeita.',
    )

    if (!confirmed) return

    setDeletingId(connection.id)
    setLastResult(null)

    try {
      await deleteOpenFinanceConnection(connection.id)

      if (editingConnectionId === connection.id) {
        cancelRenaming()
      }

      setFeedback({
        type: 'success',
        message: \`Conexão \${displayName} removida com os dados vinculados.\`,
      })

      await loadData()

      if (onChanged) {
        await onChanged()
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: \`Falha ao remover a conexão: \${error.message}\`,
      })
    } finally {
      setDeletingId(null)
    }
  }

`
  page = page.replace('\n  return (\n', `\n${handler}  return (\n`)
}

page = page.replace(
  'disabled={syncingId === connection.id || renamingId === connection.id}',
  'disabled={syncingId === connection.id || renamingId === connection.id || deletingId === connection.id}',
)

page = page.replace(
  'disabled={syncingId === connection.id}\n                        onClick={() => startRenaming(connection)}',
  'disabled={syncingId === connection.id || deletingId === connection.id}\n                        onClick={() => startRenaming(connection)}',
)

if (!page.includes("onClick={() => handleDeleteConnection(connection)}")) {
  const renameBlock = `                    {!isEditing && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={syncingId === connection.id || deletingId === connection.id}
                        onClick={() => startRenaming(connection)}
                      >
                        Renomear conexão
                      </button>
                    )}`

  const deleteButton = `${renameBlock}
                    <button
                      type="button"
                      className="danger-button"
                      disabled={
                        syncingId === connection.id ||
                        renamingId === connection.id ||
                        deletingId === connection.id
                      }
                      onClick={() => handleDeleteConnection(connection)}
                    >
                      {deletingId === connection.id
                        ? 'Removendo...'
                        : 'Remover conexão'}
                    </button>`

  if (!page.includes(renameBlock)) {
    throw new Error(
      'Não foi possível localizar o bloco do botão "Renomear conexão" em OpenFinancePage.jsx.',
    )
  }

  page = page.replace(renameBlock, deleteButton)
}

if (!service.includes('export async function deleteOpenFinanceConnection')) {
  const deletionService = `
export async function deleteOpenFinanceConnection(
  connectionId,
) {
  const { data, error } =
    await supabase.functions.invoke(
      'pluggy-delete-connection',
      {
        body: {
          connectionId,
        },
      },
    )

  if (error) {
    throw new Error(
      await extractFunctionError(error),
    )
  }

  if (!data?.success) {
    throw new Error(
      data?.error ??
        'Não foi possível remover a conexão.',
    )
  }

  return data
}

`

  const marker = 'export async function createPluggyConnectToken()'

  if (!service.includes(marker)) {
    throw new Error(
      'Não foi possível localizar createPluggyConnectToken em openFinanceService.js.',
    )
  }

  service = service.replace(marker, `${deletionService}${marker}`)
}

if (!css.includes('.danger-button {')) {
  css += `

/* Remoção de conexão Open Finance */
.danger-button {
  min-height: 44px;
  padding: 9px 16px;
  border: 1px solid #c53b3b;
  border-radius: 11px;
  color: #a62323;
  background: #fff5f5;
  font-weight: 800;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}

.danger-button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #a62323;
  color: #ffffff;
  background: #b83232;
}

.connection-card-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.connection-card-actions > button {
  width: 100%;
}

@media (max-width: 760px) {
  .connection-card-actions {
    grid-template-columns: 1fr;
  }
}
`
}

fs.writeFileSync(pagePath, page, 'utf8')
fs.writeFileSync(servicePath, service, 'utf8')
fs.writeFileSync(cssPath, css, 'utf8')

console.log('Botão de exclusão aplicado com sucesso.')
console.log('Arquivos alterados:')
console.log(`- ${pagePath}`)
console.log(`- ${servicePath}`)
console.log(`- ${cssPath}`)
