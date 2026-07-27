export function formatCurrency(value, currency = 'BRL') {
  const number = Number(value ?? 0)
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency,
  })
}

export function formatNumber(value, maximumFractionDigits = 8) {
  const number = Number(value ?? 0)
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
}

export function formatPercent(value) {
  const number = Number(value ?? 0)
  return `${number.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

export function formatDate(value) {
  if (!value) return '-'
  const datePart = String(value).slice(0, 10)
  const [year, month, day] = datePart.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

export function parseBrazilianNumber(value) {
  if (typeof value === 'number') return value
  const normalized = String(value ?? '')
    .trim()
    .replace(/\u2212/g, '-')
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return Number(normalized)
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function currentYear() {
  return new Date().getFullYear()
}

export function monthKey(dateValue) {
  return String(dateValue ?? '').slice(0, 7)
}

export function monthLabel(key) {
  const [year, month] = key.split('-')
  if (!year || !month) return key
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  })
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
