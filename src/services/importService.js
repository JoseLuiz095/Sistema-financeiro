import { supabase } from '../lib/supabase'

async function chunkInsert(
  table,
  rows,
  {
    chunkSize = 500,
    onChunk = null,
    progressStart = 0,
    progressEnd = 100,
  } = {},
) {
  if (rows.length === 0) return

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw error

    const completed = Math.min(index + chunk.length, rows.length)
    const ratio = completed / rows.length
    onChunk?.({
      table,
      completed,
      total: rows.length,
      percent: Math.round(
        progressStart + (progressEnd - progressStart) * ratio,
      ),
    })
  }
}

export async function findImportByHash(userId, fileHash) {
  const { data, error } = await supabase
    .from('imports')
    .select('*')
    .eq('user_id', userId)
    .eq('file_hash', fileHash)
    .maybeSingle()
  if (error) throw error
  return data
}

async function createOrResetImport({
  userId,
  accountId,
  parsedFile,
  reprocess,
}) {
  const existing = await findImportByHash(
    userId,
    parsedFile.fileHash,
  )

  if (existing && !reprocess) {
    throw new Error(
      'Este arquivo já foi importado. Ative a opção de substituir a importação anterior para processá-lo novamente.',
    )
  }

  if (existing) {
    const { error: incomeDeleteError } = await supabase
      .from('investment_income')
      .delete()
      .eq('import_id', existing.id)
    if (incomeDeleteError) throw incomeDeleteError

    const { error: transactionDeleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('import_id', existing.id)
    if (transactionDeleteError) throw transactionDeleteError

    const { data, error } = await supabase
      .from('imports')
      .update({
        account_id: accountId,
        file_name: parsedFile.fileName,
        file_type: parsedFile.fileType,
        institution_detected: parsedFile.layout,
        total_records: 0,
        status: 'PROCESSING',
        error_message: null,
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const dates = parsedFile.rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort()

  const { data, error } = await supabase
    .from('imports')
    .insert({
      user_id: userId,
      account_id: accountId,
      file_name: parsedFile.fileName,
      file_hash: parsedFile.fileHash,
      file_type: parsedFile.fileType,
      institution_detected: parsedFile.layout,
      period_start: dates[0] ?? null,
      period_end: dates.at(-1) ?? null,
      total_records: 0,
      status: 'PROCESSING',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

function inferAssetTypeFromTicker(ticker) {
  if (ticker.endsWith('11')) return 'FII'
  if (ticker.endsWith('39') || ticker.endsWith('34')) {
    return 'BDR'
  }
  return 'STOCK'
}

async function ensureAssets(userId, rows) {
  const assetSeeds = new Map()

  for (const row of rows) {
    const asset = row.investmentAsset
    const ticker = String(
      asset?.code ?? row.ticker ?? '',
    )
      .trim()
      .toUpperCase()

    if (!ticker) continue

    assetSeeds.set(ticker, {
      user_id: userId,
      ticker,
      asset_name: asset?.name || ticker,
      asset_type:
        asset?.type || inferAssetTypeFromTicker(ticker),
      market: asset?.market || 'B3',
      currency: 'BRL',
      active: true,
    })
  }

  const seeds = Array.from(assetSeeds.values())
  if (seeds.length === 0) return new Map()

  const { error: upsertError } = await supabase
    .from('assets')
    .upsert(seeds, {
      onConflict: 'user_id,ticker,market',
    })
  if (upsertError) throw upsertError

  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('user_id', userId)
    .in(
      'ticker',
      seeds.map((item) => item.ticker),
    )
  if (error) throw error

  return new Map(
    (data ?? []).map((asset) => [asset.ticker, asset]),
  )
}

function buildSourceData(row, parsedFile) {
  return {
    ...(row.sourceData ?? {}),
    import: {
      fileName: parsedFile.fileName,
      fileType: parsedFile.fileType,
      layout: parsedFile.layout,
      rowIndex: row.rowIndex,
    },
    investment: row.investmentAsset
      ? {
          code: row.investmentAsset.code,
          name: row.investmentAsset.name,
          type: row.investmentAsset.type,
          market: row.investmentAsset.market,
          event: row.investmentEvent,
          estimatedFromStatement: true,
        }
      : null,
  }
}

export async function importFinancialRows({
  userId,
  accountId,
  parsedFile,
  rows,
  categories,
  reprocess = false,
  onProgress = null,
}) {
  const selectedRows = rows.filter((row) => !row.ignored)

  if (selectedRows.length === 0) {
    throw new Error(
      'Nenhuma movimentação foi selecionada para importação.',
    )
  }

  onProgress?.({
    percent: 3,
    stage: 'Preparando a importação',
  })

  const importRecord = await createOrResetImport({
    userId,
    accountId,
    parsedFile: {
      ...parsedFile,
      rows: selectedRows,
    },
    reprocess,
  })

  try {
    const categoryByName = new Map(
      categories.map((category) => [
        category.name,
        category,
      ]),
    )

    onProgress?.({
      percent: 8,
      stage: 'Identificando investimentos',
    })

    const assetByTicker = await ensureAssets(
      userId,
      selectedRows,
    )

    const transactionRows = selectedRows.map((row) => ({
      user_id: userId,
      account_id: accountId,
      import_id: importRecord.id,
      category_id:
        row.categoryId ||
        categoryByName.get(row.categoryName)?.id ||
        null,
      transaction_date: row.date,
      transaction_time: row.time || null,
      original_description: row.description,
      normalized_description: row.description,
      counterparty: row.counterparty || null,
      transaction_type: row.transactionType,
      amount: Number(row.amount),
      external_identifier: null,
      record_hash: row.recordHash,
      needs_review: Boolean(row.needsReview),
      reviewed: !row.needsReview,
      confidence: row.confidence ?? null,
      source_data: buildSourceData(row, parsedFile),
    }))

    await chunkInsert('transactions', transactionRows, {
      chunkSize: 500,
      progressStart: 10,
      progressEnd: 82,
      onChunk: ({ percent, completed, total }) =>
        onProgress?.({
          percent,
          stage: `Salvando movimentações (${completed.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')})`,
        }),
    })

    const incomeRows = selectedRows
      .filter((row) => {
        const ticker = String(
          row.investmentAsset?.code ?? row.ticker ?? '',
        ).toUpperCase()
        return (
          row.incomeType &&
          ticker &&
          assetByTicker.has(ticker)
        )
      })
      .map((row) => {
        const ticker = String(
          row.investmentAsset?.code ?? row.ticker,
        ).toUpperCase()
        return {
          user_id: userId,
          asset_id: assetByTicker.get(ticker).id,
          account_id: accountId,
          import_id: importRecord.id,
          payment_date: row.date,
          income_type: row.incomeType,
          quantity_reference:
            row.quantityReference || null,
          gross_value: Math.abs(Number(row.amount)),
          withholding_tax: 0,
          net_value: Math.abs(Number(row.amount)),
          notes: row.description,
          record_hash: `income:${row.recordHash}`,
          source_data: buildSourceData(row, parsedFile),
        }
      })

    if (incomeRows.length > 0) {
      await chunkInsert('investment_income', incomeRows, {
        chunkSize: 500,
        progressStart: 83,
        progressEnd: 95,
        onChunk: ({ percent, completed, total }) =>
          onProgress?.({
            percent,
            stage: `Vinculando rendimentos (${completed.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')})`,
          }),
      })
    }

    const investmentMovementCount = selectedRows.filter(
      (row) =>
        row.investmentEvent ||
        row.transactionType ===
          'INVESTMENT_CONTRIBUTION' ||
        row.transactionType ===
          'INVESTMENT_REDEMPTION' ||
        row.incomeType,
    ).length

    const { error: updateError } = await supabase
      .from('imports')
      .update({
        total_records: selectedRows.length,
        status: selectedRows.some((row) => row.needsReview)
          ? 'COMPLETED_WITH_WARNINGS'
          : 'COMPLETED',
        error_message: null,
      })
      .eq('id', importRecord.id)
    if (updateError) throw updateError

    onProgress?.({
      percent: 100,
      stage: 'Importação concluída',
    })

    return {
      importId: importRecord.id,
      transactionCount: transactionRows.length,
      incomeCount: incomeRows.length,
      investmentMovementCount,
    }
  } catch (error) {
    await supabase
      .from('imports')
      .update({
        status: 'ERROR',
        error_message: error.message,
      })
      .eq('id', importRecord.id)
    throw error
  }
}
