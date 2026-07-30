import Papa from 'papaparse'
import { normalizeText, parseBrazilianNumber } from './format'
import { sha256File } from './hash'

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

function slugifyAsset(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
}

function inferInvestmentAsset(description) {
  const original = String(description ?? '').toUpperCase()
  const normalized = normalizeText(original)
  const ticker = inferTicker(original)

  if (ticker) {
    let type = ticker.endsWith('11') ? 'FII' : 'STOCK'
    if (normalized.includes('etf')) type = 'ETF'
    if (normalized.includes('acao')) type = 'STOCK'
    if (normalized.includes('fii')) type = 'FII'

    return {
      code: ticker,
      name: ticker,
      type,
      market: 'B3',
    }
  }

  const cryptoMatch = normalized.match(/(?:cripto|crypto)\s+(btc|eth|sol|usdt|usdc|bnb)/i)
  if (cryptoMatch) {
    const code = cryptoMatch[1].toUpperCase()
    return { code, name: `Cripto ${code}`, type: 'CRYPTO', market: 'CRYPTO' }
  }

  const fixedIncomePatterns = [
    ['TESOURO SELIC', 'TREASURY'],
    ['TESOURO IPCA', 'TREASURY'],
    ['TESOURO PREFIXADO', 'TREASURY'],
    ['CDB', 'FIXED_INCOME'],
    ['LCI', 'FIXED_INCOME'],
    ['LCA', 'FIXED_INCOME'],
    ['DEBENTURE', 'FIXED_INCOME'],
  ]

  for (const [label, type] of fixedIncomePatterns) {
    if (!normalized.includes(normalizeText(label))) continue
    const detail = original
      .replace(/.*?(APORTE|RENDIMENTO|RESGATE|VENDA)\s+/i, '')
      .replace(/\|.*$/g, '')
      .trim() || label
    return {
      code: slugifyAsset(detail).slice(0, 40),
      name: detail,
      type,
      market: 'BR',
    }
  }

  return null
}

function createRecordHash(fileHash, index, date, amount) {
  return `${fileHash}:${index}:${date}:${Number(amount).toFixed(2)}`
}

function signAmount(type, rawAmount) {
  const absolute = Math.abs(rawAmount)
  const negativeTypes = new Set(['EXPENSE', 'OWN_TRANSFER_OUT', 'INVESTMENT_CONTRIBUTION'])
  return negativeTypes.has(type) ? -absolute : absolute
}

function classifyInter(history, description, numericValue) {
  const text = normalizeText(`${history} ${description}`)

  if (
    text.includes('credito resgate investimento') ||
    text.includes('resgate investimento') ||
    text.includes('venda parcial') ||
    text.includes('venda investimento')
  ) {
    return {
      type: 'INVESTMENT_REDEMPTION',
      category: null,
      incomeType: null,
      investmentEvent: 'REDEMPTION',
    }
  }

  if (text.includes('credito evento b3') || text.includes('credito b3 btb')) {
    if (text.includes('dividend') || text.includes('provento')) {
      return {
        type: 'DIVIDEND',
        category: 'Dividendos e proventos',
        incomeType: 'DIVIDEND',
        investmentEvent: 'INCOME',
      }
    }
    if (text.includes('rendimento')) {
      return {
        type: 'FII_INCOME',
        category: 'Dividendos e proventos',
        incomeType: 'FII_INCOME',
        investmentEvent: 'INCOME',
      }
    }
    if (text.includes('aluguel')) {
      return {
        type: 'INCOME',
        category: 'Rendimentos financeiros',
        incomeType: 'RENTAL',
        investmentEvent: 'INCOME',
      }
    }
    return {
      type: 'INCOME',
      category: 'Rendimentos financeiros',
      incomeType: 'OTHER',
      investmentEvent: 'INCOME',
    }
  }

  if (
    text.includes('taxa de custodia') ||
    text.includes('taxa investimento') ||
    text.includes('imposto investimento')
  ) {
    return {
      type: 'EXPENSE',
      category: 'Impostos e taxas',
      incomeType: null,
    }
  }

  if (
    text.includes('debito b3') ||
    text.includes('nota bov') ||
    text.includes('debito investimento')
  ) {
    return {
      type: 'INVESTMENT_CONTRIBUTION',
      category: null,
      incomeType: null,
      investmentEvent: 'CONTRIBUTION',
    }
  }

  if (text.includes('transferencia entrada')) {
    return { type: 'OWN_TRANSFER_IN', category: null, incomeType: null }
  }
  if (text.includes('transferencia saida')) {
    return { type: 'OWN_TRANSFER_OUT', category: null, incomeType: null }
  }
  if (text.includes('pix recebido') || text.includes('credito salario')) {
    return { type: 'INCOME', category: 'Renda extra', incomeType: null }
  }
  if (
    text.includes('pix enviado') ||
    text.includes('pagamento efetuado') ||
    text.includes('compra cartao') ||
    text.includes('compra parcelada') ||
    text.includes('pagamento')
  ) {
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
    let investmentAsset = null
    let investmentEvent = null

    if (layout === 'INTER_B3') {
      const history = getValue(row, 'historico')
      const detail = getValue(row, 'descricao')
      date = parseDate(getValue(row, 'data_lancamento', 'data'))
      description = [history, detail].filter(Boolean).join(' - ')
      counterparty = detail
      rawAmount = parseBrazilianNumber(getValue(row, 'valor'))
      classification = classifyInter(history, detail, rawAmount)
      investmentAsset = inferInvestmentAsset(detail)
      ticker = investmentAsset?.code ?? inferTicker(detail)
      incomeType = classification.incomeType ?? null
      investmentEvent = classification.investmentEvent ?? null
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
    const rowHash = createRecordHash(
      fileHash,
      index,
      date,
      signedAmount,
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
      investmentAsset,
      investmentEvent,
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

function getOfxTag(block, tagName) {
  const expression = new RegExp(
    `<${tagName}>([^<\\r\\n]*)`,
    'i',
  )
  return String(block ?? '').match(expression)?.[1]?.trim() ?? ''
}

function parseOfxDate(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length < 8) return null

  const year = digits.slice(0, 4)
  const month = digits.slice(4, 6)
  const day = digits.slice(6, 8)
  const date = `${year}-${month}-${day}`

  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null

  return date
}

function parseOfxTime(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length < 14) return null

  return `${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`
}

function decodeOfxText(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function inferOfxClassification(transactionType, amount, description) {
  const normalizedType = normalizeText(transactionType)
  const normalizedDescription = normalizeText(description)

  if (
    normalizedType.includes('xfer') ||
    normalizedDescription.includes('transferencia entre contas')
  ) {
    return {
      type: amount < 0
        ? 'OWN_TRANSFER_OUT'
        : 'OWN_TRANSFER_IN',
      category: null,
      needsReview: true,
    }
  }

  if (
    normalizedDescription.includes('estorno') ||
    normalizedDescription.includes('reembolso')
  ) {
    return {
      type: amount >= 0 ? 'REFUND' : 'EXPENSE',
      category: amount >= 0 ? 'Reembolso' : 'Outras despesas',
      needsReview: true,
    }
  }

  return {
    type: amount < 0 ? 'EXPENSE' : 'INCOME',
    category: amount < 0 ? 'Outras despesas' : 'Renda extra',
    needsReview: true,
  }
}

function getOfxTransactionBlocks(text) {
  const blocks = []
  const expression = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>))/gi
  let match

  while ((match = expression.exec(text)) !== null) {
    blocks.push(match[1])
  }

  return blocks
}

export async function parseFinancialOfx(file) {
  const text = (await file.text()).replace(/^\uFEFF/, '')
  const upperText = text.toUpperCase()

  if (!upperText.includes('<OFX') && !upperText.includes('<STMTTRN>')) {
    throw new Error('O arquivo não possui uma estrutura OFX reconhecida.')
  }

  const blocks = getOfxTransactionBlocks(text)
  if (blocks.length === 0) {
    throw new Error('Nenhuma movimentação foi encontrada no arquivo OFX.')
  }

  const fileHash = await sha256File(file)
  const institution = decodeOfxText(
    getOfxTag(text, 'ORG') ||
      getOfxTag(text, 'BANKID') ||
      'Instituição financeira',
  )
  const accountReference = decodeOfxText(
    getOfxTag(text, 'ACCTID'),
  )
  const rows = []

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    const postedAt = getOfxTag(block, 'DTPOSTED')
    const date = parseOfxDate(postedAt)
    const time = parseOfxTime(postedAt)
    const amount = Number(
      getOfxTag(block, 'TRNAMT').replace(',', '.'),
    )
    const transactionType = getOfxTag(block, 'TRNTYPE')
    const fitId = getOfxTag(block, 'FITID')
    const name = decodeOfxText(getOfxTag(block, 'NAME'))
    const memo = decodeOfxText(getOfxTag(block, 'MEMO'))
    const checkNumber = decodeOfxText(
      getOfxTag(block, 'CHECKNUM'),
    )
    const description = [name, memo, checkNumber]
      .filter(Boolean)
      .filter((value, valueIndex, values) =>
        values.indexOf(value) === valueIndex,
      )
      .join(' - ')

    if (
      !date ||
      !description ||
      !Number.isFinite(amount) ||
      amount === 0
    ) {
      continue
    }

    const classification = inferOfxClassification(
      transactionType,
      amount,
      description,
    )
    const signedAmount = signAmount(
      classification.type,
      amount,
    )
    const recordHash = createRecordHash(
      fileHash,
      fitId || index,
      date,
      signedAmount,
    )

    rows.push({
      rowIndex: index + 1,
      date,
      time,
      description,
      counterparty: name || memo || null,
      transactionType: classification.type,
      categoryName: classification.category,
      amount: signedAmount,
      needsReview: Boolean(classification.needsReview),
      confidence: 75,
      ticker: null,
      incomeType: null,
      quantityReference: null,
      investmentAsset: null,
      investmentEvent: null,
      recordHash,
      sourceData: {
        format: 'OFX',
        transactionType,
        fitId: fitId || null,
        name: name || null,
        memo: memo || null,
        checkNumber: checkNumber || null,
        accountReference: accountReference
          ? accountReference.slice(-6)
          : null,
      },
      ignored: false,
    })
  }

  if (rows.length === 0) {
    throw new Error(
      'O arquivo foi aberto, mas não contém movimentações válidas para importação.',
    )
  }

  return {
    fileName: file.name,
    fileHash,
    fileType: 'OFX',
    layout: `OFX - ${institution}`,
    institution,
    accountReference: accountReference
      ? accountReference.slice(-6)
      : null,
    delimiter: null,
    rows,
    parserErrors: [],
  }
}

export async function parseFinancialFile(file) {
  const extension = String(file?.name ?? '')
    .split('.')
    .at(-1)
    ?.toLowerCase()

  if (extension === 'ofx' || extension === 'qfx') {
    return parseFinancialOfx(file)
  }

  if (extension === 'csv') {
    return parseFinancialCsv(file)
  }

  throw new Error(
    'Formato não suportado. Exporte o extrato em OFX, QFX ou CSV.',
  )
}
