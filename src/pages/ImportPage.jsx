import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ACCOUNT_TYPES,
  TRANSACTION_TYPES,
} from '../constants/finance'
import { createAccount } from '../services/financeService'
import { importFinancialRows } from '../services/importService'
import { parseFinancialFile } from '../utils/csvParsers'
import { formatCurrency, formatDate } from '../utils/format'

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const PENDING_IMPORT_STEPS = [
  ['file', '1', 'Arquivo'],
  ['account', '2', 'Conta'],
  ['review', '3', 'Revisão'],
  ['done', '4', 'Concluir'],
]

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

  return (
    message ||
    'Não foi possível ler o extrato. Confirme se o arquivo está em OFX, QFX ou CSV.'
  )
}

function getStepIndex(step) {
  if (step === 'importing') return 2
  return PENDING_IMPORT_STEPS.findIndex(
    ([value]) => value === step,
  )
}

function isInvestmentRow(row) {
  return Boolean(
    row.investmentEvent ||
      row.investmentAsset ||
      row.incomeType ||
      row.transactionType ===
        'INVESTMENT_CONTRIBUTION' ||
      row.transactionType ===
        'INVESTMENT_REDEMPTION' ||
      row.transactionType === 'DIVIDEND' ||
      row.transactionType === 'FII_INCOME' ||
      row.transactionType === 'INTEREST_ON_EQUITY',
  )
}

export default function ImportPage({
  user,
  accounts,
  categories,
  onChanged,
  onNavigate,
  setFeedback,
}) {
  const fileInputRef = useRef(null)
  const reviewRef = useRef(null)
  const mountedRef = useRef(true)
  const [step, setStep] = useState('file')
  const [accountId, setAccountId] = useState(
    accounts[0]?.id ?? '',
  )
  const [parsedFile, setParsedFile] = useState(null)
  const [rows, setRows] = useState([])
  const [reprocess, setReprocess] = useState(true)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(
    accounts.length === 0,
  )
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountForm, setAccountForm] = useState(
    initialAccountForm,
  )
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [progress, setProgress] = useState({
    percent: 0,
    stage: '',
  })
  const [result, setResult] = useState(null)
  const [panelRefreshState, setPanelRefreshState] =
    useState('idle')
  const [completedAt, setCompletedAt] = useState(null)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!accountId && accounts[0]?.id) {
      setAccountId(accounts[0].id)
    }
  }, [accountId, accounts])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          if (row.ignored) {
            acc.ignored += 1
            return acc
          }

          acc.selected += 1
          if (row.amount >= 0) acc.credits += row.amount
          else acc.debits += Math.abs(row.amount)
          if (row.needsReview) acc.review += 1
          if (isInvestmentRow(row)) {
            acc.investments += 1
          }
          return acc
        },
        {
          selected: 0,
          ignored: 0,
          credits: 0,
          debits: 0,
          review: 0,
          investments: 0,
        },
      ),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return rows
      .map((row, index) => ({ ...row, originalIndex: index }))
      .filter((row) => {
        if (filter === 'review' && !row.needsReview) return false
        if (filter === 'investment' && !isInvestmentRow(row)) {
          return false
        }
        if (filter === 'ignored' && !row.ignored) return false

        if (!normalizedSearch) return true

        return [
          row.description,
          row.counterparty,
          row.ticker,
          row.investmentAsset?.name,
          row.transactionType,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(normalizedSearch),
          )
      })
  }, [filter, rows, search])

  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / pageSize),
  )

  useEffect(() => {
    setPage(1)
  }, [filter, pageSize, search])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  async function processFile(file) {
    if (!file) return

    setLoading(true)
    setParsedFile(null)
    setRows([])
    setResult(null)
    setProgress({
      percent: 5,
      stage: 'Lendo o arquivo no seu dispositivo',
    })

    try {
      await new Promise((resolve) =>
        window.setTimeout(resolve, 20),
      )
      const parsed = await parseFinancialFile(file)
      const categoryByName = new Map(
        categories.map((category) => [
          category.name,
          category.id,
        ]),
      )
      const enriched = parsed.rows.map((row) => ({
        ...row,
        categoryId:
          categoryByName.get(row.categoryName) ?? '',
      }))

      setParsedFile(parsed)
      setRows(enriched)
      setProgress({ percent: 100, stage: 'Arquivo analisado' })

      if (
        accounts.length === 0 &&
        parsed.institution &&
        !accountForm.institution
      ) {
        setAccountForm({
          institution: parsed.institution,
          accountName: 'Conta principal',
          accountType: 'CHECKING',
        })
        setShowAccountForm(true)
      }

      setStep('account')
      setFeedback({
        type: 'success',
        message: `${enriched.length.toLocaleString('pt-BR')} movimentações foram reconhecidas. Agora escolha a conta de destino.`,
      })
    } catch (error) {
      setProgress({ percent: 0, stage: '' })
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
    setRows((current) => {
      const next = [...current]
      const row = current[index]
      if (!row) return current

      if (field === 'transactionType') {
        const item = TRANSACTION_TYPES.find(
          (type) => type.value === value,
        )
        const absolute = Math.abs(Number(row.amount))

        next[index] = {
          ...row,
          transactionType: value,
          amount: absolute * (item?.direction ?? 1),
          needsReview: false,
        }
      } else {
        next[index] = { ...row, [field]: value }
      }

      return next
    })
  }

  function setVisibleRowsIgnored(ignored) {
    const indexes = new Set(
      filteredRows.map((row) => row.originalIndex),
    )
    setRows((current) =>
      current.map((row, index) =>
        indexes.has(index) ? { ...row, ignored } : row,
      ),
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
        message: 'Conta criada e selecionada.',
      })
      await onChanged(true)
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

  function continueToReview() {
    if (!accountId) {
      setShowAccountForm(true)
      setFeedback({
        type: 'error',
        message:
          'Crie ou selecione a conta correspondente ao extrato.',
      })
      return
    }

    setStep('review')
    window.setTimeout(() => {
      reviewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 50)
  }

  async function confirmImport() {
    if (!parsedFile || !accountId) return

    setLoading(true)
    setStep('importing')
    setProgress({
      percent: 1,
      stage: 'Iniciando a importação',
    })

    try {
      const importResult = await importFinancialRows({
        userId: user.id,
        accountId,
        parsedFile,
        rows,
        categories,
        reprocess,
        onProgress: setProgress,
      })

      setProgress({
        percent: 100,
        stage: 'Importação concluída',
      })
      setResult(importResult)
      setCompletedAt(new Date())
      setStep('done')
      setPanelRefreshState('refreshing')
      setFeedback({
        type: 'success',
        message: `Importação concluída com ${importResult.transactionCount.toLocaleString('pt-BR')} movimentações e ${importResult.investmentMovementCount.toLocaleString('pt-BR')} registros relacionados a investimentos.`,
      })

      Promise.resolve()
        .then(() => onChanged(true))
        .then(() => {
          if (mountedRef.current) {
            setPanelRefreshState('ready')
          }
        })
        .catch((refreshError) => {
          console.error('[IMPORT][REFRESH_PANELS]', refreshError)
          if (mountedRef.current) {
            setPanelRefreshState('warning')
          }
        })
    } catch (error) {
      setStep('review')
      setFeedback({
        type: 'error',
        message: getFriendlyImportError(error),
      })
    } finally {
      setLoading(false)
    }
  }

  function restartImport() {
    setStep('file')
    setParsedFile(null)
    setRows([])
    setResult(null)
    setSearch('')
    setFilter('all')
    setPage(1)
    setProgress({ percent: 0, stage: '' })
    setPanelRefreshState('idle')
    setCompletedAt(null)
    setReprocess(true)
  }

  function downloadCsvTemplate() {
    const content = [
      'data;descricao;valor',
      '30/07/2026;Salário;2500,00',
      '30/07/2026;Supermercado;-180,50',
      '30/07/2026;APORTE ACAO PETR4;-500,00',
      '30/07/2026;DIVIDENDO PETR4;35,00',
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

  const currentStepIndex = getStepIndex(step)

  return (
    <div className="page-stack import-page import-wizard-page">
      <section className="panel import-wizard-header">
        <div className="panel-header">
          <span className="eyebrow">Importação guiada</span>
          <h2>Atualize seus dados em quatro etapas</h2>
          <p>
            O sistema lê o arquivo, organiza as movimentações e mostra um
            resumo antes de gravar. Arquivos grandes são exibidos em páginas
            para não travar o navegador.
          </p>
        </div>

        <ol className="import-stepper" aria-label="Etapas da importação">
          {PENDING_IMPORT_STEPS.map(
            ([value, number, label], index) => (
              <li
                key={value}
                className={
                  index < currentStepIndex
                    ? 'completed'
                    : index === currentStepIndex
                      ? 'active'
                      : ''
                }
              >
                <span>{index < currentStepIndex ? '✓' : number}</span>
                <strong>{label}</strong>
              </li>
            ),
          )}
        </ol>
      </section>

      {step === 'file' && (
        <section className="panel import-start-panel">
          <div className="panel-header">
            <h2>1. Selecione o extrato</h2>
            <p>
              Prefira OFX ou QFX. CSV também é aceito. A leitura do arquivo
              acontece neste dispositivo.
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
                  ? progress.stage || 'Lendo extrato...'
                  : 'Selecionar ou arrastar extrato'}
              </strong>
              <span>Formatos aceitos: OFX, QFX e CSV</span>
              <small>Arquivos extensos são processados sem listar tudo de uma vez.</small>
            </button>

            <input
              ref={fileInputRef}
              className="visually-hidden-file-input"
              type="file"
              accept=".ofx,.qfx,.csv,text/csv,application/x-ofx,application/vnd.intu.qfx"
              onChange={selectFile}
            />

            <div className="import-help-card">
              <strong>Sequência recomendada</strong>
              <ol>
                <li>Exporte o extrato no aplicativo do banco.</li>
                <li>Escolha a conta de destino no sistema.</li>
                <li>Revise somente os itens sinalizados.</li>
                <li>Confirme e abra as análises.</li>
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
              o arquivo original não é armazenado. Somente as movimentações
              confirmadas são gravadas no seu usuário.
            </span>
          </div>
        </section>
      )}

      {step === 'account' && parsedFile && (
        <section className="panel import-account-panel">
          <div className="panel-header row-between">
            <div>
              <span className="eyebrow">Arquivo reconhecido</span>
              <h2>2. Escolha a conta de destino</h2>
              <p>
                {parsedFile.fileName} · {rows.length.toLocaleString('pt-BR')} movimentações · {parsedFile.layout}
              </p>
            </div>
            
          </div>

          {accounts.length > 0 && !showAccountForm && (
            <div className="import-controls import-controls-simple">
              <label>
                Conta
                <select
                  value={accountId}
                  onChange={(event) =>
                    setAccountId(event.target.value)
                  }
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

          <div className="import-step-actions">
            {accounts.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowAccountForm((current) => !current)
                }
              >
                {showAccountForm ? 'Cancelar nova conta' : 'Criar outra conta'}
              </button>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
              type="button"
              className="secondary-button import-back-button"
              onClick={restartImport}
            >
              ← Voltar
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={continueToReview}
              disabled={!accountId}
            >
              Continuar para revisão
            </button>
            </div>
            
          </div>
        </section>
      )}

      {(step === 'review' || step === 'importing') && parsedFile && (
        <div ref={reviewRef} className="page-stack">
          <section className="summary-grid import-summary-grid">
            <article className="summary-card">
              <span>Selecionadas</span>
              <strong>{totals.selected.toLocaleString('pt-BR')}</strong>
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
              <span>Investimentos</span>
              <strong>{totals.investments.toLocaleString('pt-BR')}</strong>
            </article>
            <article className="summary-card">
              <span>Precisam de revisão</span>
              <strong>{totals.review.toLocaleString('pt-BR')}</strong>
            </article>
          </section>

          {step === 'importing' ? (
            <section className="panel import-progress-panel">
              <div className="import-progress-icon" aria-hidden="true">↻</div>
              <h2>Importando o extrato</h2>
              <p>{progress.stage}</p>
              <div
                className="import-progress-track"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={progress.percent}
              >
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <strong>{progress.percent}%</strong>
              <small>
                Não feche esta página até a conclusão. A gravação ocorre em lotes para reduzir travamentos.
              </small>
            </section>
          ) : (
            <section className="panel import-review-panel">
              <div className="panel-header row-between">
                <div>
                  <span className="eyebrow">Revisão paginada</span>
                  <h2>3. Confira o resumo e os itens sinalizados</h2>
                  <p>
                    Não é necessário percorrer as {rows.length.toLocaleString('pt-BR')} linhas. Use os filtros e revise somente o necessário.
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-button import-back-button"
                  onClick={() => setStep('account')}
                >
                  ← Voltar
                </button>
              </div>

              <div className="import-review-toolbar">
                <label className="import-search-field">
                  Buscar
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Descrição, ativo ou tipo"
                  />
                </label>
                <label>
                  Mostrar
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">Todas</option>
                    <option value="review">Somente revisar</option>
                    <option value="investment">Investimentos</option>
                    <option value="ignored">Ignoradas</option>
                  </select>
                </label>
                <label>
                  Por página
                  <select
                    value={pageSize}
                    onChange={(event) =>
                      setPageSize(Number(event.target.value))
                    }
                  >
                    {PAGE_SIZE_OPTIONS.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="import-bulk-actions">
                <span>
                  {filteredRows.length.toLocaleString('pt-BR')} resultado(s)
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setVisibleRowsIgnored(false)}
                >
                  Incluir resultados
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setVisibleRowsIgnored(true)}
                >
                  Ignorar resultados
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
                    {visibleRows.map((row) => (
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
                                row.originalIndex,
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
                            {row.investmentAsset
                              ? `Investimento: ${row.investmentAsset.name}`
                              : row.ticker
                                ? `Ativo: ${row.ticker}`
                                : row.counterparty}
                          </small>
                        </td>
                        <td>
                          <select
                            value={row.transactionType}
                            onChange={(event) =>
                              updateRow(
                                row.originalIndex,
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
                                row.originalIndex,
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
                        </td>
                        <td className={row.amount >= 0 ? 'positive' : 'negative'}>
                          {formatCurrency(row.amount)}
                        </td>
                        <td>
                          {isInvestmentRow(row) ? (
                            <span className="badge info">Investimento</span>
                          ) : row.needsReview ? (
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
                {visibleRows.map((row) => (
                  <article
                    key={`mobile-${row.recordHash}`}
                    className={`import-mobile-card ${row.ignored ? 'row-disabled' : ''}`}
                  >
                    <div className="import-mobile-card-header">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={!row.ignored}
                          onChange={(event) =>
                            updateRow(
                              row.originalIndex,
                              'ignored',
                              !event.target.checked,
                            )
                          }
                        />
                        Importar
                      </label>
                      <strong className={row.amount >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(row.amount)}
                      </strong>
                    </div>
                    <span className="import-mobile-date">
                      {formatDate(row.date)} {row.time || ''}
                    </span>
                    <p>{row.description}</p>
                    {isInvestmentRow(row) && (
                      <span className="badge info">Investimento identificado</span>
                    )}
                    <label>
                      Tipo
                      <select
                        value={row.transactionType}
                        onChange={(event) =>
                          updateRow(
                            row.originalIndex,
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
                            row.originalIndex,
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

              <div className="import-pagination">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {page} de {pageCount}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Próxima
                </button>
              </div>

              <div className="import-confirm-bar">
                <div>
                  <strong>{totals.selected.toLocaleString('pt-BR')} movimentações serão gravadas</strong>
                  <span>
                    Inclui {totals.investments.toLocaleString('pt-BR')} registro(s) de investimento.
                  </span>
                </div>
                <button
                  className="primary-button"
                  disabled={loading || totals.selected === 0}
                  onClick={confirmImport}
                >
                  Confirmar importação
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {step === 'done' && result && (
        <section className="panel import-success-panel">
          <div className="import-success-icon" aria-hidden="true">✓</div>
          <span className="eyebrow">Importação finalizada</span>
          <h2>Seus dados já estão disponíveis</h2>
          <p>
            {result.transactionCount.toLocaleString('pt-BR')} movimentações foram adicionadas. O sistema identificou {result.investmentMovementCount.toLocaleString('pt-BR')} registros relacionados a investimentos.
          </p>

          <div
            className={`import-refresh-status import-refresh-${panelRefreshState}`}
            aria-live="polite"
          >
            <strong>
              {panelRefreshState === 'refreshing'
                ? 'Importação confirmada. Atualizando os painéis em segundo plano...'
                : panelRefreshState === 'warning'
                  ? 'Importação confirmada. Use Atualizar dados no topo caso algum painel ainda não tenha recarregado.'
                  : 'Importação confirmada e painéis atualizados.'}
            </strong>
            {completedAt && (
              <span>
                Finalizada às {completedAt.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}.
              </span>
            )}
          </div>

          <div className="summary-grid import-result-grid">
            <article className="summary-card">
              <span>Movimentações</span>
              <strong>{result.transactionCount.toLocaleString('pt-BR')}</strong>
            </article>
            <article className="summary-card">
              <span>Investimentos</span>
              <strong>{result.investmentMovementCount.toLocaleString('pt-BR')}</strong>
            </article>
            <article className="summary-card">
              <span>Proventos vinculados</span>
              <strong>{result.incomeCount.toLocaleString('pt-BR')}</strong>
            </article>
          </div>

          <div className="import-success-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => onNavigate?.('analytics', 'overview')}
            >
              Ver visão financeira
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onNavigate?.('analytics', 'investments')}
            >
              Ver análise de investimentos
            </button>
            <button
              type="button"
              className="secondary-button import-back-button"
              onClick={restartImport}
            >
              Importar outro arquivo
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
