import fs from 'node:fs'

const appPath = 'src/App.jsx'
const securityPath = 'src/services/securityService.js'
const challengePath = 'src/pages/MfaChallengePage.jsx'

for (const path of [appPath, securityPath, challengePath]) {
  if (!fs.existsSync(path)) {
    throw new Error(`Arquivo não encontrado: ${path}`)
  }
}

let app = fs.readFileSync(appPath, 'utf8')
let security = fs.readFileSync(securityPath, 'utf8')
let challenge = fs.readFileSync(challengePath, 'utf8')

const oldAuthChange = `    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setCheckingSession(false)
      },
    )`

const newAuthChange = `    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setCheckingSession(false)
        setCheckingMfa(Boolean(nextSession))
        setMfaRequired(Boolean(nextSession))
      },
    )`

if (app.includes(oldAuthChange)) {
  app = app.replace(oldAuthChange, newAuthChange)
}

const oldVerified = `  async function handleMfaVerified() {
    const { data, error } =
      await supabase.auth.getSession()

    if (error) {
      setFeedback({
        type: 'error',
        message: error.message,
      })
      return
    }

    setSession(data.session)
    setMfaRequired(false)
    setCheckingMfa(false)
  }`

const newVerified = `  async function handleMfaVerified() {
    setCheckingMfa(true)
    setMfaRequired(true)

    const {
      data: aalData,
      error: aalError,
    } = await supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()

    if (aalError) {
      setFeedback({
        type: 'error',
        message:
          'Falha ao confirmar o segundo fator: ' +
          aalError.message,
      })
      setCheckingMfa(false)
      return
    }

    if (aalData?.currentLevel !== 'aal2') {
      setFeedback({
        type: 'error',
        message:
          'A sessão ainda não foi elevada para AAL2. Tente novamente.',
      })
      setCheckingMfa(false)
      return
    }

    const { data, error } =
      await supabase.auth.getSession()

    if (error || !data.session) {
      setFeedback({
        type: 'error',
        message:
          error?.message ??
          'A sessão autenticada não foi encontrada.',
      })
      setCheckingMfa(false)
      return
    }

    setSession(data.session)
    setMfaRequired(false)
    setCheckingMfa(false)
  }`

if (app.includes(oldVerified)) {
  app = app.replace(oldVerified, newVerified)
}

const oldVerifyService = `  const { data, error } =
    await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: normalizedCode,
    })

  if (error) throw error

  const { error: refreshError } =
    await supabase.auth.refreshSession()

  if (refreshError) throw refreshError

  return data`

const newVerifyService = `  const { data, error } =
    await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: normalizedCode,
    })

  if (error) throw error

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const {
      data: aalData,
      error: aalError,
    } = await supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()

    if (aalError) throw aalError

    if (aalData?.currentLevel === 'aal2') {
      return {
        ...data,
        aal: aalData,
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 150)
    })
  }

  throw new Error(
    'O segundo fator foi validado, mas a sessão não chegou ao nível AAL2.',
  )`

if (security.includes(oldVerifyService)) {
  security = security.replace(oldVerifyService, newVerifyService)
}

const oldChallenge = `      await verifyTotpFactor(factorId, code)
      await onVerified()`

const newChallenge = `      const verification =
        await verifyTotpFactor(
          factorId,
          code,
        )

      await onVerified(verification)`

if (challenge.includes(oldChallenge)) {
  challenge = challenge.replace(oldChallenge, newChallenge)
}

fs.writeFileSync(appPath, app, 'utf8')
fs.writeFileSync(securityPath, security, 'utf8')
fs.writeFileSync(challengePath, challenge, 'utf8')

console.log('Correção MFA aplicada com sucesso.')
