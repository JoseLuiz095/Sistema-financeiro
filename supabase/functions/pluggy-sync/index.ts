import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function createJsonResponse(
  body: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getPublishableKey() {
  const currentKeys = Deno.env.get(
    'SUPABASE_PUBLISHABLE_KEYS',
  )

  if (currentKeys) {
    const parsed = JSON.parse(currentKeys)
    return parsed.default
  }

  return Deno.env.get('SUPABASE_ANON_KEY')
}

function getSecretKey() {
  const currentKeys = Deno.env.get(
    'SUPABASE_SECRET_KEYS',
  )

  if (currentKeys) {
    const parsed = JSON.parse(currentKeys)
    return parsed.default
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

function getDateDaysAgo(days: number) {
  const date = new Date()

  date.setUTCDate(date.getUTCDate() - days)

  return date.toISOString().slice(0, 10)
}

function getCurrentDate() {
  return new Date().toISOString().slice(0, 10)
}

function getBrazilianDate(value: string) {
  const date = new Date(value)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(
    (part) => part.type === 'year',
  )?.value

  const month = parts.find(
    (part) => part.type === 'month',
  )?.value

  const day = parts.find(
    (part) => part.type === 'day',
  )?.value

  return `${year}-${month}-${day}`
}

function getBrazilianTime(value: string) {
  const date = new Date(value)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const hour = parts.find(
    (part) => part.type === 'hour',
  )?.value

  const minute = parts.find(
    (part) => part.type === 'minute',
  )?.value

  const second = parts.find(
    (part) => part.type === 'second',
  )?.value

  return `${hour}:${minute}:${second}`
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function splitAccountNumber(value: unknown) {
  const accountNumber = String(value ?? '').trim()

  if (!accountNumber.includes('/')) {
    return {
      agency: null,
      number: accountNumber || null,
    }
  }

  const parts = accountNumber.split('/')

  return {
    agency: parts.shift()?.trim() || null,
    number: parts.join('/').trim() || null,
  }
}

function mapOpenFinanceAccountType(account: any) {
  if (account.type === 'CREDIT') {
    return 'CREDIT_CARD'
  }

  switch (account.subtype) {
    case 'CHECKING_ACCOUNT':
      return 'CHECKING'

    case 'SAVINGS_ACCOUNT':
      return 'SAVINGS'

    case 'PAYMENT_ACCOUNT':
      return 'PAYMENT'

    default:
      return 'OTHER'
  }
}

function mapFinancialAccountType(account: any) {
  switch (account.subtype) {
    case 'CHECKING_ACCOUNT':
      return 'CHECKING'

    case 'SAVINGS_ACCOUNT':
      return 'SAVINGS'

    case 'PAYMENT_ACCOUNT':
      return 'DIGITAL_WALLET'

    default:
      return 'OTHER'
  }
}

function inferBankTransactionType(transaction: any) {
  const description = normalizeText(
    transaction.descriptionRaw ??
      transaction.description,
  )

  const operationType = normalizeText(
    transaction.operationType,
  )

  if (
    description.includes('DIVIDENDO') ||
    description.includes('DIVIDENDOS')
  ) {
    return 'DIVIDEND'
  }

  if (
    description.includes('JCP') ||
    description.includes(
      'JUROS SOBRE CAPITAL PROPRIO',
    )
  ) {
    return 'INTEREST_ON_EQUITY'
  }

  if (
    description.includes('RENDIMENTO') &&
    /[A-Z]{4}11/.test(description)
  ) {
    return 'FII_INCOME'
  }

  if (
    operationType.includes(
      'RESGATE_APLIC_FINANCEIRA',
    ) ||
    description.includes('RESGATE INVESTIMENTO') ||
    description.includes('DINHEIRO RESGATADO')
  ) {
    return 'INVESTMENT_REDEMPTION'
  }

  if (
    description.includes('DEBITO B3') ||
    description.includes('NOTA BOV') ||
    description.includes('APLICACAO INVESTIMENTO') ||
    description.includes('APORTE INVESTIMENTO')
  ) {
    return 'INVESTMENT_CONTRIBUTION'
  }

  if (transaction.type === 'CREDIT') {
    return 'INCOME'
  }

  return 'EXPENSE'
}

function normalizeBankAmount(transaction: any) {
  const amount = Math.abs(
    Number(transaction.amount ?? 0),
  )

  return transaction.type === 'CREDIT'
    ? amount
    : -amount
}

function bankTransactionNeedsReview(
  transaction: any,
  transactionType: string,
) {
  const description = normalizeText(
    transaction.descriptionRaw ??
      transaction.description,
  )

  if (
    transactionType === 'INVESTMENT_CONTRIBUTION' ||
    transactionType === 'INVESTMENT_REDEMPTION'
  ) {
    return true
  }

  return (
    description.includes('PIX') ||
    description.includes('TED') ||
    description.includes('TRANSFERENCIA')
  )
}

function getCounterparty(transaction: any) {
  return (
    transaction.paymentData?.receiver?.name ??
    transaction.paymentData?.payer?.name ??
    transaction.merchant?.name ??
    transaction.merchant?.businessName ??
    null
  )
}

function inferCardTransactionKind(transaction: any) {
  const description = normalizeText(
    transaction.descriptionRaw ??
      transaction.description,
  )

  const amount = Number(transaction.amount ?? 0)

  if (
    description.includes('ESTORNO') ||
    description.includes('REFUND') ||
    description.includes('REEMBOLSO')
  ) {
    return 'REFUND'
  }

  if (
    amount < 0 &&
    (
      description.includes('PAGAMENTO') ||
      description.includes('PGTO FATURA') ||
      description.includes('PAGAMENTO FATURA')
    )
  ) {
    return 'PAYMENT'
  }

  if (
    description.includes('TARIFA') ||
    description.includes('ANUIDADE')
  ) {
    return 'FEE'
  }

  if (amount > 0) {
    return 'PURCHASE'
  }

  return 'OTHER'
}

function mapCardStatus(account: any) {
  const allowedStatuses = [
    'ACTIVE',
    'BLOCKED',
    'CANCELLED',
    'EXPIRED',
  ]

  const status = String(
    account.creditData?.status ?? 'ACTIVE',
  ).toUpperCase()

  return allowedStatuses.includes(status)
    ? status
    : 'ACTIVE'
}

function mapTransactionStatus(transaction: any) {
  return transaction.status === 'PENDING'
    ? 'PENDING'
    : 'POSTED'
}

function safeIsoDate(value: unknown) {
  if (!value) return null

  const date = new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

function firstDayOfMonth(value: unknown) {
  const date = safeIsoDate(value)
  return date ? `${date.slice(0, 7)}-01` : null
}

function sumBillPayments(bill: any) {
  const payments = Array.isArray(bill?.payments)
    ? bill.payments
    : []

  return payments.reduce(
    (total: number, payment: any) =>
      total + Math.abs(Number(payment?.amount ?? 0)),
    0,
  )
}

function getBillPaidAt(bill: any) {
  const dates = (Array.isArray(bill?.payments)
    ? bill.payments
    : [])
    .map((payment: any) => payment?.paymentDate)
    .filter(Boolean)
    .map((value: string) => new Date(value))
    .filter((value: Date) => !Number.isNaN(value.getTime()))
    .sort((left: Date, right: Date) => right.getTime() - left.getTime())

  return dates[0]?.toISOString() ?? null
}

function inferBillStatus(bill: any) {
  const totalAmount = Math.abs(Number(bill?.totalAmount ?? 0))
  const paidAmount = sumBillPayments(bill)
  const dueDate = safeIsoDate(bill?.dueDate)
  const closingDate = safeIsoDate(bill?.billClosingDate)
  const today = getCurrentDate()

  if (totalAmount > 0 && paidAmount >= totalAmount) {
    return 'PAID'
  }

  if (paidAmount > 0) {
    return 'PARTIAL'
  }

  if (dueDate && dueDate < today) {
    return 'OVERDUE'
  }

  if (closingDate) {
    return 'CLOSED'
  }

  return 'OPEN'
}

function extractInstallmentNumber(transaction: any) {
  return Number(
    transaction?.creditCardMetadata?.installmentNumber ??
      transaction?.installmentNumber ??
      0,
  ) || null
}

function extractInstallmentTotal(transaction: any) {
  return Number(
    transaction?.creditCardMetadata?.totalInstallments ??
      transaction?.totalInstallments ??
      0,
  ) || null
}

async function getPluggyApiKey() {
  const clientId = Deno.env
    .get('PLUGGY_CLIENT_ID')
    ?.trim()

  const clientSecret = Deno.env
    .get('PLUGGY_CLIENT_SECRET')
    ?.trim()

  console.log(
    JSON.stringify({
      pluggySecrets: {
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
      },
    }),
  )

  const missingSecrets: string[] = []

  if (!clientId) {
    missingSecrets.push('PLUGGY_CLIENT_ID')
  }

  if (!clientSecret) {
    missingSecrets.push('PLUGGY_CLIENT_SECRET')
  }

  if (missingSecrets.length > 0) {
    throw new Error(
      `Secrets não configurados no Supabase: ${missingSecrets.join(', ')}.`,
    )
  }

  const response = await fetch(
    'https://api.pluggy.ai/auth',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
      }),
    },
  )

  let responseBody: any = null

  try {
    responseBody = await response.json()
  } catch {
    responseBody = null
  }

  if (!response.ok) {
    throw new Error(
      `Falha ao autenticar na Pluggy: ${
        responseBody?.message ??
        responseBody?.error ??
        response.statusText ??
        `HTTP ${response.status}`
      }`,
    )
  }

  const apiKey =
    responseBody?.apiKey ??
    responseBody?.accessToken

  if (!apiKey) {
    throw new Error(
      'A Pluggy autenticou a aplicação, mas não retornou uma API Key.',
    )
  }

  return apiKey
}

async function pluggyGet(
  pathOrUrl: string,
  apiKey: string,
) {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `https://api.pluggy.ai${pathOrUrl}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-API-KEY': apiKey,
    },
  })

  const responseBody = await response.json()

  if (!response.ok) {
    throw new Error(
      `Erro na Pluggy ${response.status}: ${
        responseBody?.message ??
        response.statusText
      }`,
    )
  }

  return responseBody
}

async function listPluggyTransactions(
  accountId: string,
  apiKey: string,
  dateFrom: string,
  dateTo: string,
) {
  const initialUrl = new URL(
    'https://api.pluggy.ai/v2/transactions',
  )

  initialUrl.searchParams.set(
    'accountId',
    accountId,
  )

  initialUrl.searchParams.set(
    'dateFrom',
    dateFrom,
  )

  initialUrl.searchParams.set(
    'dateTo',
    dateTo,
  )

  const transactions: any[] = []
  let currentUrl: string | null =
    initialUrl.toString()

  while (currentUrl) {
    const responseBody = await pluggyGet(
      currentUrl,
      apiKey,
    )

    const currentResults = Array.isArray(
      responseBody.results,
    )
      ? responseBody.results
      : []

    transactions.push(...currentResults)

    if (!responseBody.next) {
      currentUrl = null
      continue
    }

    if (
      String(responseBody.next).startsWith(
        'http',
      )
    ) {
      currentUrl = responseBody.next
      continue
    }

    if (
      String(responseBody.next).startsWith(
        '?',
      )
    ) {
      currentUrl =
        `https://api.pluggy.ai/v2/transactions` +
        responseBody.next

      continue
    }

    currentUrl =
      `https://api.pluggy.ai` +
      responseBody.next
  }

  return transactions
}

async function listPluggyBills(
  accountId: string,
  apiKey: string,
) {
  const url =
    `https://api.pluggy.ai/bills?accountId=${encodeURIComponent(accountId)}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-API-KEY': apiKey,
    },
  })

  const responseBody =
    await response.json().catch(() => null)

  // Nem toda instituicao ou tipo de conexao fornece faturas.
  // A ausencia desse produto nao deve invalidar contas e transacoes.
  if ([400, 404, 422].includes(response.status)) {
    return []
  }

  if (!response.ok) {
    throw new Error(
      `Erro ao consultar faturas na Pluggy ${response.status}: ${
        responseBody?.message ??
        response.statusText
      }`,
    )
  }

  if (Array.isArray(responseBody?.results)) {
    return responseBody.results
  }

  if (Array.isArray(responseBody)) {
    return responseBody
  }

  return []
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeInvestmentTransactionType(value: unknown) {
  const allowed = [
    'BUY',
    'SELL',
    'TAX',
    'TRANSFER',
    'INTEREST',
    'AMORTIZATION',
  ]

  const normalized = String(value ?? '').toUpperCase()
  return allowed.includes(normalized) ? normalized : 'OTHER'
}

function buildInvestmentTransactionKey(
  investmentId: string,
  transaction: any,
  index: number,
) {
  const stableId =
    transaction?.id ??
    transaction?.providerId

  if (stableId) {
    return `pluggy:${stableId}`
  }

  return [
    'pluggy',
    investmentId,
    transaction?.type ?? 'OTHER',
    safeIsoDate(transaction?.date) ?? '',
    safeIsoDate(transaction?.tradeDate) ?? '',
    transaction?.quantity ?? '',
    transaction?.value ?? '',
    transaction?.amount ?? '',
    index,
  ].join(':')
}

async function listPluggyInvestments(
  itemId: string,
  apiKey: string,
) {
  const pageSize = 500
  const investments: any[] = []
  let page = 1

  while (true) {
    const url = new URL(
      'https://api.pluggy.ai/investments',
    )

    url.searchParams.set('itemId', itemId)
    url.searchParams.set('pageSize', String(pageSize))
    url.searchParams.set('page', String(page))

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseBody =
      await response.json().catch(() => null)

    // A conexao pode nao oferecer o produto INVESTMENTS.
    if ([400, 404, 422].includes(response.status)) {
      return []
    }

    if (!response.ok) {
      throw new Error(
        `Erro ao consultar investimentos na Pluggy ${response.status}: ${
          responseBody?.message ?? response.statusText
        }`,
      )
    }

    const results = Array.isArray(responseBody?.results)
      ? responseBody.results
      : Array.isArray(responseBody)
        ? responseBody
        : []

    investments.push(...results)

    const totalPages = Number(
      responseBody?.totalPages ?? 0,
    )

    if (
      results.length < pageSize ||
      (totalPages > 0 && page >= totalPages)
    ) {
      break
    }

    page += 1
  }

  return investments
}

async function listPluggyInvestmentTransactions(
  investmentId: string,
  apiKey: string,
) {
  const pageSize = 500
  const transactions: any[] = []
  let page = 1

  while (true) {
    const url = new URL(
      `https://api.pluggy.ai/investments/${encodeURIComponent(
        investmentId,
      )}/transactions`,
    )

    url.searchParams.set('pageSize', String(pageSize))
    url.searchParams.set('page', String(page))

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseBody =
      await response.json().catch(() => null)

    // Nem todas as instituicoes fornecem historico de operacoes.
    if ([400, 404, 422].includes(response.status)) {
      return []
    }

    if (!response.ok) {
      throw new Error(
        `Erro ao consultar movimentacoes do investimento na Pluggy ${response.status}: ${
          responseBody?.message ?? response.statusText
        }`,
      )
    }

    const results = Array.isArray(responseBody?.results)
      ? responseBody.results
      : Array.isArray(responseBody)
        ? responseBody
        : []

    transactions.push(...results)

    const totalPages = Number(
      responseBody?.totalPages ?? 0,
    )

    if (
      results.length < pageSize ||
      (totalPages > 0 && page >= totalPages)
    ) {
      break
    }

    page += 1
  }

  return transactions
}

async function upsertInChunks(
  supabaseAdmin: any,
  table: string,
  rows: any[],
  onConflict: string,
) {
  const chunkSize = 200

  for (
    let index = 0;
    index < rows.length;
    index += chunkSize
  ) {
    const chunk = rows.slice(
      index,
      index + chunkSize,
    )

    const { error } = await supabaseAdmin
      .from(table)
      .upsert(chunk, {
        onConflict,
      })

    if (error) {
      throw new Error(
        `Erro ao gravar ${table}: ${error.message}`,
      )
    }
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (request.method !== 'POST') {
    return createJsonResponse(
      {
        error: 'Método não permitido.',
      },
      405,
    )
  }

  const supabaseUrl =
    Deno.env.get('SUPABASE_URL')

  const publishableKey =
    getPublishableKey()

  const secretKey =
    getSecretKey()

  if (
    !supabaseUrl ||
    !publishableKey ||
    !secretKey
  ) {
    return createJsonResponse(
      {
        error:
          'Variáveis internas do Supabase não disponíveis.',
      },
      500,
    )
  }

  const authorization =
    request.headers.get('Authorization')

  if (!authorization) {
    return createJsonResponse(
      {
        error:
          'Usuário não autenticado.',
      },
      401,
    )
  }

  const supabaseUser = createClient(
    supabaseUrl,
    publishableKey,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
      },
    },
  )

  const supabaseAdmin = createClient(
    supabaseUrl,
    secretKey,
    {
      auth: {
        persistSession: false,
      },
    },
  )

  let connectionId: string | null = null
  let syncLogId: string | null = null

  try {
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser()

    if (userError || !user) {
      return createJsonResponse(
        {
          error:
            'Sessão inválida ou expirada.',
        },
        401,
      )
    }

    const body = await request.json()

    connectionId = body.connectionId

    const dateFrom =
      body.dateFrom ??
      getDateDaysAgo(90)

    const dateTo =
      body.dateTo ??
      getCurrentDate()

    if (!connectionId) {
      return createJsonResponse(
        {
          error:
            'connectionId não informado.',
        },
        400,
      )
    }

    const {
      data: connection,
      error: connectionError,
    } = await supabaseUser
      .from('open_finance_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('provider', 'PLUGGY')
      .single()

    if (connectionError || !connection) {
      return createJsonResponse(
        {
          error:
            'Conexão não encontrada para o usuário autenticado.',
        },
        404,
      )
    }

    if (dateFrom > dateTo) {
      return createJsonResponse(
        {
          error: 'A data inicial não pode ser maior que a data final.',
        },
        400,
      )
    }

    await supabaseAdmin
      .from('open_finance_connections')
      .update({
        sync_status: 'RUNNING',
        last_error: null,
      })
      .eq('id', connection.id)

    const {
      data: syncLog,
      error: syncLogError,
    } = await supabaseAdmin
      .from('open_finance_sync_logs')
      .insert({
        user_id: user.id,
        connection_id: connection.id,
        status: 'RUNNING',
        period_from: dateFrom,
        period_to: dateTo,
        details: {
          mode: 'MANUAL',
          provider: 'PLUGGY',
        },
      })
      .select('id')
      .single()

    if (syncLogError) {
      throw new Error(
        `Erro ao iniciar log da sincronização: ${syncLogError.message}`,
      )
    }

    syncLogId = syncLog.id

    const apiKey =
      await getPluggyApiKey()

    const accountsResponse =
      await pluggyGet(
        `/accounts?itemId=${encodeURIComponent(
          connection.provider_item_id,
        )}`,
        apiKey,
      )

    const accounts = Array.isArray(
      accountsResponse.results,
    )
      ? accountsResponse.results
      : Array.isArray(accountsResponse)
        ? accountsResponse
        : []

    if (accounts.length === 0) {
      throw new Error(
        'A autenticação na Pluggy funcionou, mas o Item não retornou contas.',
      )
    }

    let bankAccountsCount = 0
    let creditCardsCount = 0
    let bankTransactionsCount = 0
    let cardTransactionsCount = 0
    let billsCount = 0
    let pendingCardTransactionsCount = 0
    let investmentsCount = 0
    let investmentTransactionsCount = 0

    for (const account of accounts) {
      const transactions =
        await listPluggyTransactions(
          account.id,
          apiKey,
          dateFrom,
          dateTo,
        )

      const {
        agency,
        number,
      } = splitAccountNumber(
        account.number,
      )

      const {
        data: existingOpenFinanceAccount,
        error:
          existingOpenFinanceAccountError,
      } = await supabaseAdmin
        .from('open_finance_accounts')
        .select(
          'id, financial_account_id',
        )
        .eq(
          'connection_id',
          connection.id,
        )
        .eq(
          'provider_account_id',
          account.id,
        )
        .maybeSingle()

      if (
        existingOpenFinanceAccountError
      ) {
        throw new Error(
          existingOpenFinanceAccountError.message,
        )
      }

      let financialAccountId =
        existingOpenFinanceAccount
          ?.financial_account_id ??
        null

      if (
        account.type === 'BANK' &&
        !financialAccountId
      ) {
        const normalizedTotal =
          transactions.reduce(
            (total: number, transaction: any) =>
              total +
              normalizeBankAmount(
                transaction,
              ),
            0,
          )

        const currentBalance =
          Number(account.balance ?? 0)

        const calculatedInitialBalance =
          currentBalance -
          normalizedTotal

        const accountName =
          account.marketingName ??
          account.name ??
          'Conta Open Finance'

        let financialAccountQuery =
          supabaseAdmin
            .from('financial_accounts')
            .select('id')
            .eq('user_id', user.id)
            .eq(
              'institution',
              connection.institution_name,
            )

        financialAccountQuery = number
          ? financialAccountQuery.eq(
              'account_number',
              number,
            )
          : financialAccountQuery.eq(
              'account_name',
              accountName,
            )

        const {
          data: reusableFinancialAccount,
          error: reusableAccountError,
        } = await financialAccountQuery
          .limit(1)
          .maybeSingle()

        if (reusableAccountError) {
          throw new Error(
            `Erro ao localizar conta financeira existente: ${reusableAccountError.message}`,
          )
        }

        if (reusableFinancialAccount) {
          financialAccountId =
            reusableFinancialAccount.id
        } else {
          const {
            data: financialAccount,
            error: financialAccountError,
          } = await supabaseAdmin
            .from('financial_accounts')
            .insert({
              user_id: user.id,
              institution:
                connection.institution_name,
              account_name: accountName,
              account_type:
                mapFinancialAccountType(
                  account,
                ),
              agency,
              account_number: number,
              initial_balance:
                calculatedInitialBalance,
              active: true,
            })
            .select('id')
            .single()

          if (financialAccountError) {
            throw new Error(
              `Erro ao criar conta financeira: ${financialAccountError.message}`,
            )
          }

          financialAccountId =
            financialAccount.id
        }
      }

      const {
        data: openFinanceAccount,
        error: openFinanceAccountError,
      } = await supabaseAdmin
        .from('open_finance_accounts')
        .upsert(
          {
            user_id: user.id,
            connection_id:
              connection.id,
            financial_account_id:
              financialAccountId,
            provider_account_id:
              account.id,
            account_type:
              mapOpenFinanceAccountType(
                account,
              ),
            account_subtype:
              account.subtype ?? null,
            account_name:
              account.marketingName ??
              account.name ??
              null,
            agency,
            account_number: number,
            currency:
              account.currencyCode ??
              'BRL',
            current_balance:
              account.balance ?? null,
            available_balance:
              account.balance ?? null,
            overdraft_limit:
              account.bankData
                ?.overdraftContractedLimit ??
              null,
            status: 'ACTIVE',
            source_data: account,
            synced_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              'connection_id,provider_account_id',
          },
        )
        .select(
          'id, financial_account_id',
        )
        .single()

      if (openFinanceAccountError) {
        throw new Error(
          `Erro ao gravar conta Open Finance: ${openFinanceAccountError.message}`,
        )
      }

      if (account.type === 'BANK') {
        bankAccountsCount += 1

        const rows = transactions
          .filter(
            (transaction: any) =>
              Number(transaction.amount) !==
              0,
          )
          .map(
            (transaction: any) => {
              const transactionType =
                inferBankTransactionType(
                  transaction,
                )

              const stableIdentifier =
                transaction.providerId ??
                transaction.id

              return {
                user_id: user.id,
                account_id:
                  financialAccountId,
                import_id: null,
                category_id: null,

                transaction_date:
                  getBrazilianDate(
                    transaction.date,
                  ),

                transaction_time:
                  getBrazilianTime(
                    transaction.date,
                  ),

                original_description:
                  transaction
                    .descriptionRaw ??
                  transaction.description ??
                  'Movimentação Open Finance',

                normalized_description:
                  transaction.description ??
                  null,

                counterparty:
                  getCounterparty(
                    transaction,
                  ),

                transaction_type:
                  transactionType,

                amount:
                  normalizeBankAmount(
                    transaction,
                  ),

                external_identifier:
                  stableIdentifier,

                record_hash:
                  `pluggy:${account.id}:${stableIdentifier}`,

                needs_review:
                  bankTransactionNeedsReview(
                    transaction,
                    transactionType,
                  ),

                reviewed: false,
                confidence: 75,

                source_data: {
                  provider: 'PLUGGY',
                  item_id:
                    connection.provider_item_id,
                  account_id:
                    account.id,
                  provider_id:
                    transaction.providerId ??
                    null,
                  raw: transaction,
                },
              }
            },
          )

        await upsertInChunks(
          supabaseAdmin,
          'transactions',
          rows,
          'user_id,record_hash',
        )

        bankTransactionsCount +=
          rows.length
      }

      if (account.type === 'CREDIT') {
        creditCardsCount += 1

        const closeDate =
          account.creditData
            ?.balanceCloseDate

        const dueDate =
          account.creditData
            ?.balanceDueDate

        const closingDay = closeDate
          ? Number(
              String(closeDate).slice(
                8,
                10,
              ),
            )
          : null

        const dueDay = dueDate
          ? Number(
              String(dueDate).slice(
                8,
                10,
              ),
            )
          : null

        const {
          data: creditCard,
          error: creditCardError,
        } = await supabaseAdmin
          .from('credit_cards')
          .upsert(
            {
              user_id: user.id,
              connection_id:
                connection.id,
              open_finance_account_id:
                openFinanceAccount.id,
              financial_account_id:
                null,
              provider_card_id:
                account.id,
              card_name:
                account.marketingName ??
                account.name ??
                'Cartão Open Finance',
              brand:
                account.creditData
                  ?.brand ??
                null,
              last_four_digits:
                account.number ?? null,
              closing_day:
                closingDay,
              due_day:
                dueDay,
              total_limit:
                account.creditData
                  ?.creditLimit ??
                null,
              used_limit:
                account.balance ??
                null,
              available_limit:
                account.creditData
                  ?.availableCreditLimit ??
                null,
              currency:
                account.currencyCode ??
                'BRL',
              status:
                mapCardStatus(account),
              source_data: account,
              synced_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                'connection_id,provider_card_id',
            },
          )
          .select('id')
          .single()

        if (creditCardError) {
          throw new Error(
            `Erro ao gravar cartão: ${creditCardError.message}`,
          )
        }

        const pluggyBills =
          await listPluggyBills(
            account.id,
            apiKey,
          )

        const billIdMap = new Map<string, string>()

        for (const bill of pluggyBills) {
          const providerBillId = String(
            bill.id ?? '',
          ).trim()

          if (!providerBillId) {
            continue
          }

          const paidAmount =
            sumBillPayments(bill)

          const {
            data: savedBill,
            error: savedBillError,
          } = await supabaseAdmin
            .from('credit_card_bills')
            .upsert(
              {
                user_id: user.id,
                credit_card_id:
                  creditCard.id,
                provider_bill_id:
                  providerBillId,
                record_key:
                  `pluggy:${providerBillId}`,
                reference_month:
                  firstDayOfMonth(
                    bill.dueDate,
                  ),
                opening_date: null,
                closing_date:
                  safeIsoDate(
                    bill.billClosingDate,
                  ),
                due_date:
                  safeIsoDate(
                    bill.dueDate,
                  ),
                paid_at:
                  getBillPaidAt(bill),
                total_amount: Math.abs(
                  Number(
                    bill.totalAmount ?? 0,
                  ),
                ),
                minimum_amount:
                  bill.minimumPaymentAmount ??
                  null,
                paid_amount:
                  paidAmount,
                status:
                  inferBillStatus(bill),
                currency:
                  bill.totalAmountCurrencyCode ??
                  account.currencyCode ??
                  'BRL',
                source_data: {
                  provider: 'PLUGGY',
                  raw: bill,
                },
                synced_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  'credit_card_id,record_key',
              },
            )
            .select('id, provider_bill_id')
            .single()

          if (savedBillError) {
            throw new Error(
              `Erro ao gravar fatura: ${savedBillError.message}`,
            )
          }

          billIdMap.set(
            providerBillId,
            savedBill.id,
          )
        }

        billsCount += billIdMap.size

        const cardRows = transactions
          .filter(
            (transaction: any) =>
              Number(transaction.amount) !==
              0,
          )
          .map(
            (transaction: any) => {
              const stableIdentifier =
                transaction.providerId ??
                transaction.id

              const transactionKind =
                inferCardTransactionKind(
                  transaction,
                )

              return {
                user_id: user.id,
                credit_card_id:
                  creditCard.id,
                bill_id:
                  transaction.billId
                    ? billIdMap.get(
                        String(transaction.billId),
                      ) ?? null
                    : null,
                category_id: null,
                linked_transaction_id:
                  null,

                provider_transaction_id:
                  transaction.id,

                record_key:
                  `pluggy:${stableIdentifier}`,

                transaction_date:
                  getBrazilianDate(
                    transaction.date,
                  ),

                transaction_time:
                  getBrazilianTime(
                    transaction.date,
                  ),

                posted_date:
                  getBrazilianDate(
                    transaction.date,
                  ),

                original_description:
                  transaction
                    .descriptionRaw ??
                  transaction.description ??
                  'Movimentação do cartão',

                normalized_description:
                  transaction.description ??
                  null,

                merchant:
                  transaction.merchant
                    ?.name ??
                  transaction.merchant
                    ?.businessName ??
                  null,

                authorization_code:
                  transaction
                    .creditCardMetadata
                    ?.authorizationCode ??
                  null,

                transaction_kind:
                  transactionKind,

                amount: Number(
                  transaction.amount,
                ),

                currency:
                  transaction.currencyCode ??
                  'BRL',

                original_amount:
                  transaction
                    .amountInAccountCurrency ??
                  null,

                original_currency: null,

                installment_number:
                  extractInstallmentNumber(
                    transaction,
                  ),

                installment_total:
                  extractInstallmentTotal(
                    transaction,
                  ),

                status:
                  mapTransactionStatus(
                    transaction,
                  ),

                needs_review:
                  transactionKind ===
                  'OTHER',

                reviewed: false,

                source_data: {
                  provider: 'PLUGGY',
                  item_id:
                    connection.provider_item_id,
                  account_id:
                    account.id,
                  provider_id:
                    transaction.providerId ??
                    null,
                  raw: transaction,
                },

                synced_at:
                  new Date().toISOString(),
              }
            },
          )

        await upsertInChunks(
          supabaseAdmin,
          'credit_card_transactions',
          cardRows,
          'credit_card_id,record_key',
        )

        cardTransactionsCount +=
          cardRows.length

        pendingCardTransactionsCount +=
          cardRows.filter(
            (row: any) =>
              row.status === 'PENDING',
          ).length
      }
    }

    const pluggyInvestments =
      await listPluggyInvestments(
        connection.provider_item_id,
        apiKey,
      )

    const { error: stalePositionsError } =
      await supabaseAdmin
        .from('open_finance_investment_positions')
        .update({
          is_current: false,
          updated_at: new Date().toISOString(),
        })
        .eq('connection_id', connection.id)

    if (stalePositionsError) {
      throw new Error(
        `Erro ao preparar posicoes de investimento: ${stalePositionsError.message}`,
      )
    }

    for (const investment of pluggyInvestments) {
      const providerInvestmentId = String(
        investment?.id ?? '',
      ).trim()

      if (!providerInvestmentId) {
        continue
      }

      const {
        data: savedPosition,
        error: savedPositionError,
      } = await supabaseAdmin
        .from('open_finance_investment_positions')
        .upsert(
          {
            user_id: user.id,
            connection_id: connection.id,
            provider_investment_id:
              providerInvestmentId,
            provider_item_id:
              investment?.itemId ??
              connection.provider_item_id,
            provider_id:
              investment?.providerId ?? null,
            investment_name:
              investment?.name ??
              investment?.code ??
              'Investimento Open Finance',
            investment_code:
              investment?.code ?? null,
            isin: investment?.isin ?? null,
            investment_number:
              investment?.number ?? null,
            owner_name:
              investment?.owner ?? null,
            investment_type:
              investment?.type ?? 'OTHER',
            investment_subtype:
              investment?.subtype ?? null,
            status:
              investment?.status ?? null,
            is_current: true,
            currency:
              investment?.currencyCode ?? 'BRL',
            reference_date:
              safeIsoDate(investment?.date),
            unit_value:
              nullableNumber(investment?.value),
            quantity:
              nullableNumber(investment?.quantity),
            gross_amount:
              nullableNumber(investment?.amount),
            net_balance:
              nullableNumber(investment?.balance),
            original_amount:
              nullableNumber(
                investment?.amountOriginal,
              ),
            profit_amount:
              nullableNumber(
                investment?.amountProfit,
              ),
            withdrawal_amount:
              nullableNumber(
                investment?.amountWithdrawal,
              ),
            income_taxes:
              nullableNumber(investment?.taxes),
            financial_taxes:
              nullableNumber(investment?.taxes2),
            due_date:
              safeIsoDate(investment?.dueDate),
            issuer:
              investment?.issuer ?? null,
            issue_date:
              safeIsoDate(investment?.issueDate),
            rate:
              nullableNumber(investment?.rate),
            rate_type:
              investment?.rateType ?? null,
            fixed_annual_rate:
              nullableNumber(
                investment?.fixedAnnualRate,
              ),
            last_month_rate:
              nullableNumber(
                investment?.lastMonthRate,
              ),
            last_twelve_months_rate:
              nullableNumber(
                investment?.lastTwelveMonthsRate,
              ),
            annual_rate:
              nullableNumber(
                investment?.annualRate,
              ),
            institution_name:
              investment?.institution?.name ??
              connection.institution_name,
            institution_number:
              investment?.institution?.number ?? null,
            source_data: {
              provider: 'PLUGGY',
              raw: investment,
            },
            synced_at:
              new Date().toISOString(),
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              'connection_id,provider_investment_id',
          },
        )
        .select('id')
        .single()

      if (savedPositionError) {
        throw new Error(
          `Erro ao gravar posicao de investimento: ${savedPositionError.message}`,
        )
      }

      investmentsCount += 1

      const pluggyInvestmentTransactions =
        await listPluggyInvestmentTransactions(
          providerInvestmentId,
          apiKey,
        )

      const investmentRows =
        pluggyInvestmentTransactions.map(
          (transaction: any, index: number) => ({
            user_id: user.id,
            connection_id: connection.id,
            position_id: savedPosition.id,
            provider_transaction_id:
              transaction?.id ??
              transaction?.providerId ??
              null,
            record_key:
              buildInvestmentTransactionKey(
                providerInvestmentId,
                transaction,
                index,
              ),
            transaction_date:
              safeIsoDate(transaction?.date),
            trade_date:
              safeIsoDate(transaction?.tradeDate),
            transaction_type:
              normalizeInvestmentTransactionType(
                transaction?.type,
              ),
            description:
              transaction?.description ?? null,
            quantity:
              nullableNumber(transaction?.quantity),
            unit_value:
              nullableNumber(transaction?.value),
            gross_amount:
              nullableNumber(transaction?.amount),
            net_amount:
              nullableNumber(transaction?.netAmount),
            brokerage_number:
              transaction?.brokerageNumber ?? null,
            expenses:
              transaction?.expenses ?? {},
            source_data: {
              provider: 'PLUGGY',
              raw: transaction,
            },
            synced_at:
              new Date().toISOString(),
            updated_at:
              new Date().toISOString(),
          }),
        )

      await upsertInChunks(
        supabaseAdmin,
        'open_finance_investment_transactions',
        investmentRows,
        'position_id,record_key',
      )

      investmentTransactionsCount +=
        investmentRows.length
    }

    const finishedAt =
      new Date().toISOString()

    await supabaseAdmin
      .from('open_finance_connections')
      .update({
        sync_status: 'SUCCESS',
        last_sync_at: finishedAt,
        next_sync_at: null,
        last_error: null,
        metadata: {
          ...(connection.metadata ?? {}),
          sync_mode: 'MANUAL',
          automatic_sync_enabled: false,
          last_period_from: dateFrom,
          last_period_to: dateTo,
        },
      })
      .eq('id', connection.id)

    if (syncLogId) {
      await supabaseAdmin
        .from('open_finance_sync_logs')
        .update({
          finished_at: finishedAt,
          status: 'SUCCESS',
          accounts_received:
            accounts.length,
          bank_accounts:
            bankAccountsCount,
          credit_cards:
            creditCardsCount,
          bank_transactions:
            bankTransactionsCount,
          card_transactions:
            cardTransactionsCount,
          bills: billsCount,
          pending_card_transactions:
            pendingCardTransactionsCount,
          investments:
            investmentsCount,
          investment_transactions:
            investmentTransactionsCount,
          details: {
            mode: 'MANUAL',
            provider: 'PLUGGY',
            message:
              'Sincronização manual concluída.',
          },
        })
        .eq('id', syncLogId)
    }

    return createJsonResponse({
      success: true,
      message:
        'Sincronização concluída.',
      period: {
        dateFrom,
        dateTo,
      },
      result: {
        accounts_received:
          accounts.length,
        bank_accounts:
          bankAccountsCount,
        credit_cards:
          creditCardsCount,
        bank_transactions:
          bankTransactionsCount,
        card_transactions:
          cardTransactionsCount,
        bills:
          billsCount,
        pending_card_transactions:
          pendingCardTransactionsCount,
        investments:
          investmentsCount,
        investment_transactions:
          investmentTransactionsCount,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido.'

    if (connectionId) {
      await supabaseAdmin
        .from(
          'open_finance_connections',
        )
        .update({
          sync_status: 'ERROR',
          last_error: message,
          next_sync_at: null,
        })
        .eq('id', connectionId)
    }

    if (syncLogId) {
      await supabaseAdmin
        .from('open_finance_sync_logs')
        .update({
          finished_at:
            new Date().toISOString(),
          status: 'ERROR',
          error_message: message,
          details: {
            mode: 'MANUAL',
            provider: 'PLUGGY',
          },
        })
        .eq('id', syncLogId)
    }

    console.error(
      'Erro na sincronização Pluggy:',
      error,
    )

    return createJsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    )
  }
})