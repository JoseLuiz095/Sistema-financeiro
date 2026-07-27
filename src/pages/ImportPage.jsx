import { useMemo, useState } from 'react'
import { TRANSACTION_TYPES } from '../constants/finance'
import { importFinancialRows } from '../services/importService'
import { parseFinancialCsv } from '../utils/csvParsers'
import { formatCurrency, formatDate } from '../utils/format'

export default function ImportPage({ user, accounts, categories, onChanged, setFeedback }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [parsedFile, setParsedFile] = useState(null)
  const [rows, setRows] = useState([])
  const [reprocess, setReprocess] = useState(false)
  const [loading, setLoading] = useState(false)

  const totals = useMemo(() => rows.filter((row) => !row.ignored).reduce((acc, row) => {
    if (row.amount >= 0) acc.credits += row.amount
    else acc.debits += Math.abs(row.amount)
    if (row.needsReview) acc.review += 1
    return acc
  }, { credits: 0, debits: 0, review: 0 }), [rows])

  async function selectFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const result = await parseFinancialCsv(file)
      const categoryByName = new Map(categories.map((category) => [category.name, category.id]))
      const enriched = result.rows.map((row) => ({
        ...row,
        categoryId: categoryByName.get(row.categoryName) ?? '',
      }))
      setParsedFile(result)
      setRows(enriched)
      setFeedback({
        type: 'success',
        message: `${enriched.length} linha(s) reconhecida(s). Revise antes de confirmar.`,
      })
    } catch (error) {
      setFeedback({ type: 'error', message: `Falha ao ler CSV: ${error.message}` })
    } finally {
      setLoading(false)
    }
  }

  function updateRow(index, field, value) {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      if (field === 'transactionType') {
        const item = TRANSACTION_TYPES.find((type) => type.value === value)
        const absolute = Math.abs(Number(row.amount))
        return { ...row, transactionType: value, amount: absolute * (item?.direction ?? 1), needsReview: false }
      }
      return { ...row, [field]: value }
    }))
  }

  async function confirmImport() {
    if (!parsedFile) return
    if (!accountId) {
      setFeedback({ type: 'error', message: 'Selecione a conta do extrato.' })
      return
    }
    setLoading(true)
    try {
      const result = await importFinancialRows({
        userId: user.id,
        accountId,
        parsedFile,
        rows,
        categories,
        reprocess,
      })
      setFeedback({
        type: 'success',
        message: `Importação concluída: ${result.transactionCount} movimentações e ${result.incomeCount} proventos vinculados a ativos.`,
      })
      setParsedFile(null)
      setRows([])
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header"><h2>Importar extrato CSV</h2><p>A leitura ocorre no navegador. Formatos PicPay e Inter/B3 são identificados pelo cabeçalho.</p></div>
        <div className="import-controls">
          <label>Conta<select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.institution} - {account.account_name}</option>)}</select></label>
          <label>Arquivo CSV<input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
          <label className="checkbox-label"><input type="checkbox" checked={reprocess} onChange={(e) => setReprocess(e.target.checked)} /> Reprocessar arquivo já importado</label>
        </div>
      </section>

      {parsedFile && (
        <>
          <section className="summary-grid summary-grid-4">
            <article className="summary-card"><span>Layout identificado</span><strong>{parsedFile.layout}</strong></article>
            <article className="summary-card"><span>Créditos</span><strong>{formatCurrency(totals.credits)}</strong></article>
            <article className="summary-card"><span>Débitos</span><strong>{formatCurrency(totals.debits)}</strong></article>
            <article className="summary-card"><span>Revisões</span><strong>{totals.review}</strong></article>
          </section>

          <section className="panel">
            <div className="panel-header row-between"><div><h2>Pré-visualização</h2><p>Corrija tipo e categoria antes de gravar.</p></div><button className="primary-button" disabled={loading} onClick={confirmImport}>{loading ? 'Importando...' : 'Confirmar importação'}</button></div>
            <div className="table-wrapper import-table">
              <table>
                <thead><tr><th>Usar</th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th>Valor</th><th>Status</th></tr></thead>
                <tbody>{rows.map((row, index) => (
                  <tr key={row.recordHash} className={row.ignored ? 'row-disabled' : ''}>
                    <td><input type="checkbox" checked={!row.ignored} onChange={(e) => updateRow(index, 'ignored', !e.target.checked)} /></td>
                    <td>{formatDate(row.date)}<small>{row.time}</small></td>
                    <td>{row.description}<small>{row.ticker ? `Ativo: ${row.ticker}` : row.counterparty}</small></td>
                    <td><select value={row.transactionType} onChange={(e) => updateRow(index, 'transactionType', e.target.value)}>{TRANSACTION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></td>
                    <td><select value={row.categoryId} onChange={(e) => updateRow(index, 'categoryId', e.target.value)}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td>
                    <td className={row.amount >= 0 ? 'positive' : 'negative'}>{formatCurrency(row.amount)}</td>
                    <td>{row.needsReview ? <span className="badge warning">Revisar</span> : <span className="badge success">Pronto</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
