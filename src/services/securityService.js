import { supabase } from '../lib/supabase'

function normalizeCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6)
}

export async function getMfaSecurityState() {
  const [
    { data: factorData, error: factorError },
    { data: aalData, error: aalError },
  ] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  if (factorError) throw factorError
  if (aalError) throw aalError

  const factors = [
    ...(factorData?.totp ?? []),
    ...(factorData?.phone ?? []),
  ]

  return {
    factors,
    verifiedFactors: factors.filter((factor) => factor.status === 'verified'),
    unverifiedFactors: factors.filter((factor) => factor.status !== 'verified'),
    currentLevel: aalData?.currentLevel ?? 'aal1',
    nextLevel: aalData?.nextLevel ?? 'aal1',
  }
}

export async function startTotpEnrollment(
  friendlyName = 'Financeiro Pessoal',
) {
  const { data: factors, error: listError } =
    await supabase.auth.mfa.listFactors()

  if (listError) throw listError

  const staleFactors = (factors?.totp ?? [])
    .filter((factor) => factor.status !== 'verified')

  for (const factor of staleFactors) {
    const { error } = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    })

    if (error) throw error
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: String(friendlyName)
      .trim()
      .slice(0, 80),
  })

  if (error) throw error
  return data
}

function decodeSessionAal(session) {
  try {
    const payload = String(session?.access_token ?? '').split('.')[1]
    if (!payload) return null

    const normalized = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=')

    return JSON.parse(window.atob(normalized))?.aal ?? null
  } catch {
    return null
  }
}

export async function verifyTotpFactor(
  factorId,
  code,
) {
  const normalizedCode = normalizeCode(code)

  if (!factorId) {
    throw new Error(
      'Fator de autenticação não informado.',
    )
  }

  if (normalizedCode.length !== 6) {
    throw new Error(
      'Informe o código de 6 dígitos do aplicativo autenticador.',
    )
  }

  const { data, error } =
    await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: normalizedCode,
    })

  if (error) throw error

  const challengeSession =
    data?.session ??
    (data?.access_token ? data : null)

  if (
    challengeSession?.access_token &&
    challengeSession?.refresh_token &&
    decodeSessionAal(challengeSession) === 'aal2'
  ) {
    const { data: setData, error: setError } =
      await supabase.auth.setSession({
        access_token: challengeSession.access_token,
        refresh_token: challengeSession.refresh_token,
      })

    if (setError) throw setError

    const storedSession =
      setData?.session ?? challengeSession

    return {
      ...data,
      session: storedSession,
      aal: {
        currentLevel: 'aal2',
        nextLevel: 'aal2',
      },
    }
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const {
      data: sessionData,
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) throw sessionError

    const session = sessionData?.session ?? null

    if (session?.access_token) {
      const {
        data: aalData,
        error: aalError,
      } = await supabase.auth.mfa
        .getAuthenticatorAssuranceLevel(
          session.access_token,
        )

      if (aalError) throw aalError

      if (
        aalData?.currentLevel === 'aal2' &&
        decodeSessionAal(session) === 'aal2'
      ) {
        return {
          ...data,
          session,
          aal: aalData,
        }
      }
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 180)
    })
  }

  const {
    data: refreshedData,
    error: refreshError,
  } = await supabase.auth.refreshSession()

  if (refreshError) throw refreshError

  const refreshedSession = refreshedData?.session ?? null
  const {
    data: finalAal,
    error: finalAalError,
  } = await supabase.auth.mfa
    .getAuthenticatorAssuranceLevel(
      refreshedSession?.access_token,
    )

  if (finalAalError) throw finalAalError

  if (
    finalAal?.currentLevel === 'aal2' &&
    decodeSessionAal(refreshedSession) === 'aal2'
  ) {
    return {
      ...data,
      session: refreshedSession,
      aal: finalAal,
    }
  }

  throw new Error(
    'O segundo fator foi validado, mas a sessão segura não foi atualizada. Entre novamente e repita a confirmação.',
  )
}

export async function removeMfaFactor(
  factorId,
) {
  if (!factorId) {
    throw new Error(
      'Fator de autenticação não informado.',
    )
  }

  const { data, error } =
    await supabase.auth.mfa.unenroll({
      factorId,
    })

  if (error) throw error

  const { error: refreshError } =
    await supabase.auth.refreshSession()

  if (refreshError) throw refreshError

  return data
}

export async function changePassword({
  currentPassword,
  newPassword,
}) {
  if (!currentPassword) {
    throw new Error('Informe a senha atual.')
  }

  if (!newPassword || newPassword.length < 12) {
    throw new Error(
      'A nova senha deve possuir pelo menos 12 caracteres.',
    )
  }

  if (!/[a-z]/.test(newPassword)) {
    throw new Error(
      'A nova senha deve conter uma letra minúscula.',
    )
  }

  if (!/[A-Z]/.test(newPassword)) {
    throw new Error(
      'A nova senha deve conter uma letra maiúscula.',
    )
  }

  if (!/\d/.test(newPassword)) {
    throw new Error(
      'A nova senha deve conter um número.',
    )
  }

  if (!/[^A-Za-z0-9]/.test(newPassword)) {
    throw new Error(
      'A nova senha deve conter um símbolo.',
    )
  }

  const { data, error } =
    await supabase.auth.updateUser({
      current_password: currentPassword,
      password: newPassword,
    })

  if (error) throw error
  return data
}

export async function signOutAllSessions() {
  const { error } = await supabase.auth.signOut({
    scope: 'global',
  })

  if (error) throw error
}
