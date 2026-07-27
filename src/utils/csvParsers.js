import Papa from 'papaparse'
import { normalizeText, parseBrazilianNumber } from './format'
import { sha256File, sha256Text } from './hash'

function normalizeHeader(value) {
  return normalizeText(value).replace(/\s+/g, '_')
}

function findHeaderLine(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeText(lines[index])
    const isInter = normalized.includes('data lancamento')
      && normalized.includes('historico')
      && normalized.includes('descricao')
      && normalized.includes('valor')
    const isPicPay = normalized.includes('data')
      && normalized.includes('hora')
      && normalized.includes('tipo')
      && normalized.includes('origem destino')
      && normalized.includes('valor')
    if (isInter || isPicPay) return index
  }
  return 0
}

function detectDelimiter(line) {
  const candidates = [',', ';', '\t', '|']
  return candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter
}

function parseDate(value) {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  return null
}

function getValue(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return String(row[key]).trim()
  }
  return ''
}

function inferTicker(description) {
  const matches = String(description ?? '').toUpperCase().match(/\b[A-Z]{4}\d{1,2}\b/g)
  return matches?.at(-1) ?? null
}

function inferQuantityReference(description, ticker) {
  if (!ticker) return null
  const regex = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s+${ticker}`, 'i')
  const match = String(description ?? '').match(regex)
  return match ? parseBrazilianNumber(match[1]) : null
}

function signAmount(type, rawAmount) {
  const absolute = Math.abs(rawAmount)
  const negativeTypes = new Set(['EXPENSE', 'OWN_TRANSFER_OUT', 'INVESTMENT_CONTRIBUTION'])
  return negativeTypes.has(type) ? -absolute : absolute
}

function classifyInter(history, description, numericValue) {
  const text = normalizeText(`${history} ${description}`)
  if (text.includes('credito evento b3') || text.includes('credito b3 btb')) {
    if (text.includes('dividend')) {
      return { type: 'DIVIDEND', category: 'Dividendos e proventos', incomeType: 'DIVIDEND' }
    }
    if (text.includes('rendimento')) {
      return { type: 'FII_INCOME', category: 'Dividendos e proventos', incomeType: 'FII_INCOME' }
    }
    if (text.includes('aluguel')) {
      return { type: 'INCOME', category: 'Rendimentos financeiros', incomeType: 'RENTAL' }
    }
    return { type: 'INCOME', category: 'Rendimentos financeiros', incomeType: 'OTHER' }
  }
  if (text.includes('debito b3') || text.includes('nota bov')) {
    return { type: 'INVESTMENT_CONTRIBUTION', category: null, incomeType: null }
  }
  if (text.includes('pix recebido')) {
    return { type: 'INCOME', category: 'Renda extra', incomeType: null }
  }
  if (text.includes('pix enviado') || text.includes('pagamento efetuado')) {
    return { type: 'EXPENSE', category: 'Outras despesas', incomeType: null }
  }
  return {
    type: numericValue < 0 ? 'EXPENSE' : 'INCOME',
    category: numericValue < 0 ? 'Outras despesas' : 'Renda extra',
    incomeType: null,
    needsReview: true,
  }
}

function classifyPicPay(typeText, destination, numericValue) {
  const text = normalizeText(`${typeText} ${destination}`)
  if (text.includes('pix recebido')) {
    return { type: 'INCOME', category: 'Renda extra' }
  }
  if (text.includes('pix enviado')) {
    return { type: 'EXPENSE', category: 'Outras despesas' }
  }
  if (text.includes('dinheiro resgatado') || text.includes('resgatado do cofrinho')) {
    return { type: 'INVESTMENT_REDEMPTION', category: null }
  }
  if (text.includes('dinheiro guardado') || text.includes('adicionado ao cofrinho')) {
    return { type: 'INVESTMENT_CONTRIBUTION', category: null }
  }
  return {
    type: numericValue < 0 ? 'EXPENSE' : 'INCOME',
    category: numericValue < 0 ? 'Outras despesas' : 'Renda extra',
    needsReview: true,
  }
}

function detectLayout(headers) {
  const normalized = headers.map(normalizeHeader)
  if (normalized.includes('data_lancamento') && normalized.includes('historico')) return 'INTER_B3'
  if (normalized.includes('hora') && normalized.includes('origem_destino')) return 'PICPAY'
  return 'GENERIC'
}

export async function parseFinancialCsv(file) {
  const text = (await file.text()).replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const headerIndex = findHeaderLine(lines)
  const headerLine = lines[headerIndex] ?? ''
  const delimiter = detectDelimiter(headerLine)
  const content = lines.slice(headerIndex).join('\n')

  const parsed = Papa.parse(content, {
    header: true,
    delimiter,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  })

  if (parsed.errors?.length && !parsed.data?.length) {
    throw new Error(parsed.errors[0].message)
  }

  const headers = parsed.meta.fields ?? []
  const layout = detectLayout(headers)
  const fileHash = await sha256File(file)
  const rows = []

  for (let index = 0; index < parsed.data.length; index += 1) {
    const row = parsed.data[index]
    let date
    let time = null
    let description
    let counterparty
    let rawAmount
    let classification
    let ticker = null
    let incomeType = null
    let quantityReference = null

    if (layout === 'INTER_B3') {
      const history = getValue(row, 'historico')
      const detail = getValue(row, 'descricao')
      date = parseDate(getValue(row, 'data_lancamento', 'data'))
      description = [history, detail].filter(Boolean).join(' - ')
      counterparty = detail
      rawAmount = parseBrazilianNumber(getValue(row, 'valor'))
      classification = classifyInter(history, detail, rawAmount)
      ticker = inferTicker(detail)
      incomeType = classification.incomeType ?? null
      quantityReference = inferQuantityReference(detail, ticker)
    } else if (layout === 'PICPAY') {
      const typeText = getValue(row, 'tipo')
      const destination = getValue(row, 'origem_destino', 'origem_/_destino')
      date = parseDate(getValue(row, 'data'))
      time = getValue(row, 'hora') || null
      description = [typeText, destination].filter(Boolean).join(' - ')
      counterparty = destination
      rawAmount = parseBrazilianNumber(getValue(row, 'valor'))
      classification = classifyPicPay(typeText, destination, rawAmount)
    } else {
      date = parseDate(getValue(row, 'data', 'data_lancamento'))
      description = getValue(row, 'descricao', 'historico', 'tipo')
      counterparty = getValue(row, 'origem_destino', 'contraparte')
      rawAmount = parseBrazilianNumber(getValue(row, 'valor', 'amount'))
      classification = {
        type: rawAmount < 0 ? 'EXPENSE' : 'INCOME',
        category: rawAmount < 0 ? 'Outras despesas' : 'Renda extra',
        needsReview: true,
      }
    }

    if (!date || !description || !Number.isFinite(rawAmount) || rawAmount === 0) continue

    const signedAmount = signAmount(classification.type, rawAmount)
    const rowHash = await sha256Text(
      `${fileHash}|${index}|${date}|${time ?? ''}|${description}|${signedAmount}`,
    )

    rows.push({
      rowIndex: index + 1,
      date,
      time,
      description,
      counterparty,
      transactionType: classification.type,
      categoryName: classification.category,
      amount: signedAmount,
      needsReview: Boolean(classification.needsReview),
      confidence: classification.needsReview ? 60 : 95,
      ticker,
      incomeType,
      quantityReference,
      recordHash: rowHash,
      sourceData: row,
      ignored: false,
    })
  }

  return {
    fileName: file.name,
    fileHash,
    fileType: 'CSV',
    layout,
    delimiter,
    rows,
    parserErrors: parsed.errors ?? [],
  }
}
