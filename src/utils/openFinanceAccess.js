const DEFAULT_ALLOWED_EMAILS = [
  'joseluizacama@gmail.com',
]

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function parseAllowedEmails(value) {
  return String(value ?? '')
    .split(/[;,\n]/)
    .map(normalizeEmail)
    .filter(Boolean)
}

export function hasPremiumDataAccess(user) {
  const mode = String(
    import.meta.env.VITE_PREMIUM_DATA_ACCESS_MODE ??
      'ALLOWLIST',
  )
    .trim()
    .toUpperCase()

  if (mode === 'ALL') return true

  const allowedEmails = new Set([
    ...DEFAULT_ALLOWED_EMAILS,
    ...parseAllowedEmails(
      import.meta.env.VITE_PREMIUM_DATA_ALLOWED_EMAILS,
    ),
  ])

  return allowedEmails.has(normalizeEmail(user?.email))
}
