import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACCOUNT_TYPES,
  TRANSACTION_TYPES,
} from '../constants/finance'
import { createAccount } from '../services/financeService'
import { importFinancialRows } from '../services/importService'
import { parseFinancialFile } from '../utils/csvParsers'
import { formatCurrency, formatDate } from '../utils/format'

const initialAccountForm = {
  institution: '',
  accountName: '',
  accountType: 'CHECKING',
}

function getFriendlyImportError(error) {
  const message = String(error?.message ?? '').trim()

  if (/formato não suportado/i.test(message)) return message
  if (/nenhuma movimentação/i.test(message)) return message
  if (/já foi importado/i.test(message)) return message

  return message ||
    'Não foi possível ler o extrato. Confirme se o arquivo está em OFX, QFX ou CSV.'
}

export default function ImportPage({
  user,
  accounts,
  categories,
  onChanged,
  setFeedback,
}) {
  const fileInputRef = useRef(null)
  const [accountId, setAccountId] = useState(
    accounts[0]?.id ?? '',
  )
  const [parsedFile, setParsedFile] = useState(null)
  const [rows, setRows] = useState([])
  const [reprocess, setReprocess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(
    accounts.length === 0,
  )
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountForm, setAccountForm] = useState(
    initialAccountForm,
  )

  useEffect(() => {
    if (!accountId && accounts[0]?.id) {
      setAccountId(accounts[0].id)
    }
  }, [accountId, accounts])

  const totals = useMemo(
    () =>
      rows
        .filter((row) => !row.ignored)
        .reduce(
          (acc, row) => {
            if (row.amount >= 0) acc.credits += row.amount
            else acc.debits += Math.abs(row.amount)
            if (row.needsReview) acc.review += 1
            return acc
          },
          { credits: 0, debits: 0, review: 0 },
        ),
    [rows],
  )

  async function processFile(file) {
    if (!file) return

    setLoading(true)
    setParsedFile(null)
    setRows([])

    try {
      const result = await parseFinancialFile(file)
      const categoryByName = new Map(
        categories.map((category) => [
          category.name,
          category.id,
        ]),
      )
      const enriched = result.rows.map((row) => ({
        ...row,
        categoryId:
          categoryByName.get(row.categoryName) ?? '',
      }))

      setParsedFile(result)
      setRows(enriched)

      if (
        accounts.length === 0 &&
        result.institution &&
        !accountForm.institution
      ) {
        setAccountForm({
          institution: result.institution,
          accountName: 'Conta principal',
          accountType: 'CHECKING',
        })
        setShowAccountForm(true)
      }

      setFeedback({
        type: 'success',
        message: `${enriched.length} movimentação(ões) reconhecida(s). Revise e confirme a importação.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: getFriendlyImportError(error),
      })
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function selectFile(event) {
    await processFile(event.target.files?.[0])
  }

  async function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    await processFile(event.dataTransfer.files?.[0])
  }

  function updateRow(index, field, value) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row

        if (field === 'transactionType') {
          const item = TRANSACTION_TYPES.find(
            (type) => type.value === value,
          )
          const absolute = Math.abs(Number(row.amount))

          return {
            ...row,
            transactionType: value,
            amount: absolute * (item?.direction ?? 1),
            needsReview: false,
          }
        }

        return { ...row, [field]: value }
      }),
    )
  }

  async function saveQuickAccount(event) {
    event.preventDefault()

    const institution = accountForm.institution.trim()
    const accountName = accountForm.accountName.trim()

    if (!institution || !accountName) {
      setFeedback({
        type: 'error',
        message: 'Informe a instituição e o nome da conta.',
      })
      return
    }

    setSavingAccount(true)

    try {
      const createdAccount = await createAccount({
        user_id: user.id,
        institution,
        account_name: accountName,
        account_type: accountForm.accountType,
        agency: null,
        account_number: null,
        initial_balance: 0,
        active: true,
      })

      setAccountId(createdAccount.id)
      setShowAccountForm(false)
      setFeedback({
        type: 'success',
        message: 'Conta criada. Agora confirme a importação do extrato.',
      })
      await onChanged()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error?.message ||
          'Não foi possível criar a conta agora.',
      })
    } finally {
      setSavingAccount(false)
    }
  }

  async function confirmImport() {
    if (!parsedFile) return

    if (!accountId) {
      setShowAccountForm(true)
      setFeedback({
        type: 'error',
        message:
          'Crie ou selecione a conta correspondente ao extrato.',
      })
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
      setFeedback({
        type: 'error',
        message: getFriendlyImportError(error),
      })
    } finally {
      setLoading(false)
    }
  }

  function downloadCsvTemplate() {
    const content = [
      'data;descricao;valor',
      '30/07/2026;Salário;2500,00',
      '30/07/2026;Supermercado;-180,50',
    ].join('\n')
    const blob = new Blob([`\uFEFF${content}`], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = 'modelo-extrato-financeiro.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-stack import-page">
      <section className="panel import-start-panel">
        <div className="panel-header">
          <span className="eyebrow">Importação simples</span>
          <h2>Envie o extrato do seu banco</h2>
          <p>
            Prefira OFX ou QFX. CSV também é aceito. A leitura acontece
            neste dispositivo e o arquivo original não é enviado ao servidor.
          </p>
        </div>

        <div className="import-method-grid">
          <button
            type="button"
            className={`import-drop-zone ${
              dragging ? 'is-dragging' : ''
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            disabled={loading}
          >
            <span className="import-drop-icon" aria-hidden="true">
              ↑
            </span>
            <strong>
              {loading
                ? 'Lendo extrato...'
                : 'Selecionar ou arrastar extrato'}
            </strong>
            <span>Formatos aceitos: OFX, QFX e CSV</span>
            <small>Limite recomendado: até 10 MB</small>
          </button>

          <input
            ref={fileInputRef}
            className="visually-hidden-file-input"
            type="file"
            accept=".ofx,.qfx,.csv,text/csv,application/x-ofx,application/vnd.intu.qfx"
            onChange={selectFile}
          />

          <div className="import-help-card">
            <strong>Como obter o arquivo?</strong>
            <ol>
              <li>Abra o aplicativo ou internet banking.</li>
              <li>Acesse Extrato e escolha o período.</li>
              <li>Exporte em OFX, QFX ou CSV.</li>
            </ol>
            <button
              type="button"
              className="secondary-button"
              onClick={downloadCsvTemplate}
            >
              Baixar modelo CSV
            </button>
          </div>
        </div>

        <div className="import-security-note">
          <strong>Privacidade:</strong>
          <span>
            senhas bancárias nunca são solicitadas. Somente as linhas que
            você revisar e confirmar serão armazenadas no seu usuário.
          </span>
        </div>
      </section>

      <section className="panel import-account-panel">
        <div className="panel-header row-between">
          <div>
            <h2>Conta de destino</h2>
            <p>Escolha onde essas movimentações serão organizadas.</p>
          </div>
          {accounts.length > 0 && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowAccountForm((current) => !current)}
            >
              {showAccountForm ? 'Cancelar' : 'Criar outra conta'}
            </button>
          )}
        </div>

        {accounts.length > 0 && !showAccountForm && (
          <div className="import-controls import-controls-simple">
            <label>
              Conta
              <select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">Selecione</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.institution} - {account.account_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={reprocess}
                onChange={(event) =>
                  setReprocess(event.target.checked)
                }
              />
              Substituir uma importação anterior deste mesmo arquivo
            </label>
          </div>
        )}

        {(showAccountForm || accounts.length === 0) && (
          <form
            className="form import-quick-account-form"
            onSubmit={saveQuickAccount}
          >
            <div className="three-columns">
              <label>
                Instituição
                <input
                  value={accountForm.institution}
                  onChange={(event) =>
                    setAccountForm({
                      ...accountForm,
                      institution: event.target.value,
                    })
                  }
                  placeholder="Ex.: Inter, Sicoob ou PicPay"
                  required
                />
              </label>
              <label>
                Nome da conta
                <input
                  value={accountForm.accountName}
                  onChange={(event) =>
                    setAccountForm({
                      ...accountForm,
                      accountName: event.target.value,
                    })
                  }
                  placeholder="Ex.: Conta principal"
                  required
                />
              </label>
              <label>
                Tipo
                <select
                  value={accountForm.accountType}
                  onChange={(event) =>
                    setAccountForm({
                      ...accountForm,
                      accountType: event.target.value,
                    })
                  }
                >
                  {ACCOUNT_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="primary-button"
              disabled={savingAccount}
            >
              {savingAccount ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>
        )}
      </section>

      {parsedFile && (
        <>
          <section className="summary-grid summary-grid-4">
            <article className="summary-card">
              <span>Formato identificado</span>
              <strong>{parsedFile.layout}</strong>
            </article>
            <article className="summary-card">
              <span>Créditos</span>
              <strong>{formatCurrency(totals.credits)}</strong>
            </article>
            <article className="summary-card">
              <span>Débitos</span>
              <strong>{formatCurrency(totals.debits)}</strong>
            </article>
            <article className="summary-card">
              <span>Revisões</span>
              <strong>{totals.review}</strong>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header row-between">
              <div>
                <h2>Revise antes de salvar</h2>
                <p>
                  Altere tipo, categoria ou desmarque movimentações que
                  não deseja importar.
                </p>
              </div>
              <button
                className="primary-button"
                disabled={loading}
                onClick={confirmImport}
              >
                {loading ? 'Importando...' : 'Confirmar importação'}
              </button>
            </div>

            <div className="table-wrapper import-table import-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>Usar</th>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.recordHash}
                      className={row.ignored ? 'row-disabled' : ''}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={!row.ignored}
                          onChange={(event) =>
                            updateRow(
                              index,
                              'ignored',
                              !event.target.checked,
                            )
                          }
                        />
                      </td>
                      <td>
                        {formatDate(row.date)}
                        <small>{row.time}</small>
                      </td>
                      <td>
                        {row.description}
                        <small>
                          {row.ticker
                            ? `Ativo: ${row.ticker}`
                            : row.counterparty}
                        </small>
                      </td>
                      <td>
                        <select
                          value={row.transactionType}
                          onChange={(event) =>
                            updateRow(
                              index,
                              'transactionType',
                              event.target.value,
                            )
                          }
                        >
                          {TRANSACTION_TYPES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={row.categoryId}
                          onChange={(event) =>
                            updateRow(
                              index,
                              'categoryId',
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Sem categoria</option>
                          {categories.map((category) => (
                            <option
                              key={category.id}
                              value={category.id}
                            >
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className={
                          row.amount >= 0 ? 'positive' : 'negative'
                        }
                      >
                        {formatCurrency(row.amount)}
                      </td>
                      <td>
                        {row.needsReview ? (
                          <span className="badge warning">Revisar</span>
                        ) : (
                          <span className="badge success">Pronto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-mobile-list">
              {rows.map((row, index) => (
                <article
                  key={`mobile-${row.recordHash}`}
                  className={`import-mobile-card ${
                    row.ignored ? 'row-disabled' : ''
                  }`}
                >
                  <div className="import-mobile-card-header">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!row.ignored}
                        onChange={(event) =>
                          updateRow(
                            index,
                            'ignored',
                            !event.target.checked,
                          )
                        }
                      />
                      Importar
                    </label>
                    <strong
                      className={
                        row.amount >= 0 ? 'positive' : 'negative'
                      }
                    >
                      {formatCurrency(row.amount)}
                    </strong>
                  </div>
                  <span className="import-mobile-date">
                    {formatDate(row.date)} {row.time || ''}
                  </span>
                  <p>{row.description}</p>
                  <label>
                    Tipo
                    <select
                      value={row.transactionType}
                      onChange={(event) =>
                        updateRow(
                          index,
                          'transactionType',
                          event.target.value,
                        )
                      }
                    >
                      {TRANSACTION_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Categoria
                    <select
                      value={row.categoryId}
                      onChange={(event) =>
                        updateRow(
                          index,
                          'categoryId',
                          event.target.value,
                        )
                      }
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
