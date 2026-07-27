import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve('src/pages/OpenFinancePage.jsx')

if (!fs.existsSync(target)) {
  throw new Error(`Arquivo nao encontrado: ${target}`)
}

let source = fs.readFileSync(target, 'utf8')
const backup = `${target}.before-delete-connection`

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, source)
}

const importLine =
  "import DeleteConnectionButton from '../components/DeleteConnectionButton'"

if (!source.includes(importLine)) {
  const connectImport =
    "import ConnectBankButton from '../components/ConnectBankButton'"

  if (!source.includes(connectImport)) {
    throw new Error(
      'Import de ConnectBankButton nao encontrado. Aplique a alteracao manual descrita no README.',
    )
  }

  source = source.replace(
    connectImport,
    `${connectImport}\n${importLine}`,
  )
}

if (!source.includes('<DeleteConnectionButton')) {
  const anchor = `                    {!isEditing && (\n                      <button\n                        type="button"\n                        className="secondary-button"\n                        disabled={syncingId === connection.id}\n                        onClick={() => startRenaming(connection)}\n                      >\n                        Renomear conexão\n                      </button>\n                    )}`

  if (!source.includes(anchor)) {
    throw new Error(
      'Bloco de Renomear conexao nao encontrado. Aplique a alteracao manual descrita no README.',
    )
  }

  const deletionBlock = `${anchor}\n                    <DeleteConnectionButton\n                      connection={connection}\n                      displayName={displayName}\n                      disabled={\n                        syncingId === connection.id ||\n                        renamingId === connection.id\n                      }\n                      setFeedback={setFeedback}\n                      onDeleted={async () => {\n                        if (editingConnectionId === connection.id) {\n                          cancelRenaming()\n                        }\n\n                        setLastResult(null)\n                        await loadData()\n\n                        if (onChanged) {\n                          await onChanged()\n                        }\n                      }}\n                    />`

  source = source.replace(anchor, deletionBlock)
}

fs.writeFileSync(target, source)

console.log('OpenFinancePage.jsx atualizado com sucesso.')
console.log(`Backup criado em: ${backup}`)
