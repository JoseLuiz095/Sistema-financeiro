import fs from 'node:fs'

const appPath = 'src/App.jsx'
const syncPath =
  'supabase/functions/pluggy-sync/index.ts'

if (!fs.existsSync(appPath)) {
  throw new Error(
    `Arquivo não encontrado: ${appPath}`,
  )
}

let app = fs.readFileSync(
  appPath,
  'utf8',
)

const hookImport =
  "import useIdleSessionGuard from './hooks/useIdleSessionGuard'"

if (!app.includes(hookImport)) {
  const anchor =
    "import { supabase } from './lib/supabase'"

  if (!app.includes(anchor)) {
    throw new Error(
      'Import do Supabase não encontrado em App.jsx.',
    )
  }

  app = app.replace(
    anchor,
    `${anchor}\n${hookImport}`,
  )
}

if (!app.includes('sessionGuardReady')) {
  const userAnchor =
    '  const user = session?.user ?? null'

  if (!app.includes(userAnchor)) {
    throw new Error(
      'Declaração do usuário não encontrada em App.jsx.',
    )
  }

  const guardCode = `${userAnchor}

  const {
    ready: sessionGuardReady,
  } = useIdleSessionGuard({
    session,
    setFeedback,
    timeoutMs: 15 * 60 * 1000,
  })`

  app = app.replace(
    userAnchor,
    guardCode,
  )
}

if (
  app.includes(
    'const canLoadPrivateData = Boolean(',
  )
) {
  app = app.replace(
    `  const canLoadPrivateData = Boolean(
    user &&`,
    `  const canLoadPrivateData = Boolean(
    user &&
    sessionGuardReady &&`,
  )
} else {
  app = app.replace(
    `  useEffect(() => {
    if (!user) {`,
    `  useEffect(() => {
    if (!user || !sessionGuardReady) {`,
  )

  app = app.replace(
    '  }, [user?.id])',
    '  }, [user?.id, sessionGuardReady])',
  )

  app = app.replace(
    '    if (!user) return',
    '    if (!user || !sessionGuardReady) return',
  )
}

fs.writeFileSync(
  appPath,
  app,
  'utf8',
)

if (fs.existsSync(syncPath)) {
  let sync = fs.readFileSync(
    syncPath,
    'utf8',
  )

  const ownershipLine =
    ".eq('user_id', user.id)"

  if (!sync.includes(ownershipLine)) {
    const connectionFilter = `.eq('id', connectionId)
      .eq('provider', 'PLUGGY')`

    if (sync.includes(connectionFilter)) {
      sync = sync.replace(
        connectionFilter,
        `${connectionFilter}
      .eq('user_id', user.id)`,
      )

      fs.writeFileSync(
        syncPath,
        sync,
        'utf8',
      )
    } else {
      console.warn(
        'Aviso: bloco de propriedade não localizado em pluggy-sync. Revise manualmente.',
      )
    }
  }
}

console.log(
  'Session Guard aplicado ao App.jsx.',
)
console.log(
  'Verificação explícita de user_id aplicada ao pluggy-sync quando localizada.',
)
