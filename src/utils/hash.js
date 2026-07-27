function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Text(text) {
  const data = new TextEncoder().encode(String(text))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export async function sha256File(file) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return toHex(digest)
}

export function randomToken(prefix = 'manual') {
  return `${prefix}:${crypto.randomUUID()}`
}
