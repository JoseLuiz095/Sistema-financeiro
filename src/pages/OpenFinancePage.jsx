import { useEffect, useMemo, useState } from 'react'
import {
  listCreditCardBills,
  listOpenFinanceConnections,
  listOpenFinanceInvestmentPositions,
  listOpenFinanceInvestmentTransactions,
  listOpenFinanceSyncLogs,
  listPendingCardTransactions,
  renameOpenFinanceConnection,
  syncPluggyConnection,
} from '../services/openFinanceService'
import { formatCurrency, formatDate, today } from '../utils/format'
import { getConnectionDisplayName, getInvestmentBalance } from '../utils/openFinance'
import ConnectBankButton from '../components/ConnectBankButton'
import DeleteConnectionButton from '../components/DeleteConnectionButton'

function dateDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function getStatusLabel(status) {
  const labels = {
    NEVER: 'Nunca sincronizada',
    PENDING: 'Pendente',
    RUNNING: 'Em execução',
    SUCCESS: 'Sucesso',
    PARTIAL: 'Parcial',
    ERROR: 'Erro',
    ACTIVE: 'Ativa',
    PAUSED: 'Pausada',
    DISCONNECTED: 'Desconectada',
  }
  return labels[status] ?? status ?? '-'
}

export default function OpenFinancePage({ user, setFeedback, onChanged }) {
  const [connections, setConnections] = useState([])
  const [logs, setLogs] = useState([])
  const [bills, setBills] = useState([])
  const [pendingCardTransactions, setPendingCardTransactions] = useState([])
  const [investmentPositions, setInvestmentPositions] = useState([])
  const [investmentTransactions, setInvestmentTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState(null)
  const [dateFrom, setDateFrom] = useState(dateDaysAgo(90))
  const [dateTo, setDateTo] = useState(today())
  const [lastResult, setLastResult] = useState(null)
  const [editingConnectionId, setEditingConnectionId] = useState(null)
  const [connectionName, setConnectionName] = useState('')
  const [renamingId, setRenamingId] = useState(null)

  async function loadData() {
    setLoading(true)
    try {
      const [
        connectionRows,
        logRows,
        billRows,
        pendingRows,
        investmentPositionRows,
        investmentTransactionRows,
      ] = await Promise.all([
        listOpenFinanceConnections(),
        listOpenFinanceSyncLogs(),
        listCreditCardBills(),
        listPendingCardTransactions(),
        listOpenFinanceInvestmentPositions(),
        listOpenFinanceInvestmentTransactions(),
      ])

      setConnections(connectionRows)
      setLogs(logRows)
      setBills(billRows)
      setPendingCardTransactions(pendingRows)
      setInvestmentPositions(investmentPositionRows)
      setInvestmentTransactions(investmentTransactionRows)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Falha ao carregar o Open Finance: ${error.message}`,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const totals = useMemo(() => {
    return connections.reduce(
      (result, connection) => {
        const accounts = connection.open_finance_accounts ?? []
        const cards = connection.credit_cards ?? []
        result.accounts += accounts.filter((account) => account.account_type !== 'CREDIT_CARD').length
        result.cards += cards.length
        return result
      },
      { accounts: 0, cards: 0 },
    )
  }, [connections])

  const investmentBalance = useMemo(
    () => investmentPositions.reduce(
      (total, position) => total + getInvestmentBalance(position),
      0,
    ),
    [investmentPositions],
  )

  async function handleSync(connection) {
    if (!dateFrom || !dateTo) {
      setFeedback({ type: 'error', message: 'Informe o período da sincronização.' })
      return
    }

    if (dateFrom > dateTo) {
      setFeedback({ type: 'error', message: 'A data inicial não pode ser maior que a data final.' })
      return
    }

    setSyncingId(connection.id)
    setLastResult(null)

    try {
      const result = await syncPluggyConnection(connection.id, {
        dateFrom,
        dateTo,
      })

      const connectionLabel = getConnectionDisplayName(connection)

      setLastResult({
        institution: connectionLabel,
        ...result,
      })

      setFeedback({
        type: 'success',
        message: `Sincronização manual concluída para ${connectionLabel}.`,
      })

      await loadData()
      if (onChanged) await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
      await loadData()
    } finally {
      setSyncingId(null)
    }
  }

  function startRenaming(connection) {
    setEditingConnectionId(connection.id)
    setConnectionName(connection.metadata?.display_name ?? '')
  }

  function cancelRenaming() {
    setEditingConnectionId(null)
    setConnectionName('')
  }

  async function saveConnectionName(connection) {
    setRenamingId(connection.id)

    try {
      await renameOpenFinanceConnection(connection, connectionName)
      setFeedback({
        type: 'success',
        message: connectionName.trim()
          ? 'Nome da conexão atualizado.'
          : 'Nome personalizado removido.',
      })
      cancelRenaming()
      await loadData()
      if (onChanged) await onChanged()
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Falha ao renomear a conexão: ${error.message}`,
      })
    } finally {
      setRenamingId(null)
    }
  }

  return (
    <div className="page-stack">
      <section className="summary-grid summary-grid-4">
        <article className="summary-card">
          <span>Conexões Pluggy</span>
          <strong>{connections.length}</strong>
        </article>
        <article className="summary-card">
          <span>Contas encontradas</span>
          <strong>{totals.accounts}</strong>
        </article>
        <article className="summary-card">
          <span>Cartões encontrados</span>
          <strong>{totals.cards}</strong>
        </article>
        <article className="summary-card">
          <span>Investimentos encontrados</span>
          <strong>{investmentPositions.length}</strong>
        </article>
      </section>

      <section className="panel open-finance-user-panel">
        <div className="open-finance-user-header">
          <div className="panel-header">
            <span className="eyebrow">Espaço bancário individual</span>
            <h2>Meu Open Finance</h2>
            <p>
              Conecte seus bancos pelo fluxo incorporado da Pluggy. Cada Item criado fica vinculado exclusivamente ao usuário autenticado.
            </p>
          </div>

          <div className="open-finance-user-chip">
            <span>Usuário atual</span>
            <strong>{user?.email ?? '-'}</strong>
            <small>{connections.length} conexão(ões) vinculada(s)</small>
          </div>
        </div>

        <div className="open-finance-onboarding-grid">
          <article>
            <span>1</span>
            <div>
              <strong>Escolha a instituição</strong>
              <small>O Pluggy Connect abre dentro do sistema.</small>
            </div>
          </article>
          <article>
            <span>2</span>
            <div>
              <strong>Autorize seus dados</strong>
              <small>O banco pode abrir a janela oficial ou o aplicativo para consentimento.</small>
            </div>
          </article>
          <article>
            <span>3</span>
            <div>
              <strong>Sincronize</strong>
              <small>Contas, cartões, investimentos e dívidas ficam disponíveis somente nesta conta.</small>
            </div>
          </article>
        </div>

        <div className="info-callout">
          A leitura não movimenta dinheiro e não inicia pagamentos. O Client ID e o Client Secret da Pluggy permanecem somente nos Secrets das Edge Functions.
        </div>

        <div className="info-callout info-callout-secondary">
          Você não precisa criar credenciais da API Pluggy para cada usuário. O sistema usa uma aplicação Pluggy central, mas identifica cada conexão pelo usuário do Supabase e aplica isolamento por RLS.
        </div>

        <div className="inline-actions open-finance-primary-actions">
          <ConnectBankButton
            setFeedback={setFeedback}
            onConnected={async (savedConnection, context) => {
              if (context?.shouldSync) {
                await handleSync(savedConnection)
                return
              }

              await loadData()
              if (onChanged) await onChanged()
            }}
          />
        </div>

        <div className="open-finance-toolbar">
          <label>
            Data inicial
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            Data final
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={loadData} disabled={loading}>
            {loading ? 'Carregando...' : 'Recarregar tela'}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Conexões cadastradas</h2>
          <p>Use um nome personalizado para distinguir conta corrente, cartão e investimentos do mesmo banco.</p>
        </div>

        <div className="open-finance-connections">
          {connections.length === 0 ? (
            <div className="empty-cell">Nenhuma conexão Pluggy cadastrada.</div>
          ) : (
            connections.map((connection) => {
              const accounts = connection.open_finance_accounts ?? []
              const cards = connection.credit_cards ?? []
              const positions = (connection.open_finance_investment_positions ?? [])
                .filter((position) => position.is_current !== false)
              const positionBalance = positions.reduce(
                (total, position) => total + getInvestmentBalance(position),
                0,
              )
              const displayName = getConnectionDisplayName(connection)
              const hasCustomName = Boolean(connection.metadata?.display_name)
              const isEditing = editingConnectionId === connection.id

              return (
                <article className="open-finance-card" key={connection.id}>
                  <div className="open-finance-card-header">
                    <div>
                      <h3>{displayName}</h3>
                      <p>
                        {hasCustomName ? `${connection.institution_name} · ` : ''}
                        {connection.provider} · Item final {String(connection.provider_item_id).slice(-6)}
                      </p>
                    </div>
                    <span className={`status-badge status-${String(connection.sync_status).toLowerCase()}`}>
                      {getStatusLabel(connection.sync_status)}
                    </span>
                  </div>

                  {isEditing && (
                    <div className="connection-rename-form">
                      <label>
                        Nome personalizado
                        <input
                          type="text"
                          maxLength={80}
                          value={connectionName}
                          placeholder={`Ex.: Inter investimentos, Inter conta principal`}
                          onChange={(event) => setConnectionName(event.target.value)}
                          autoFocus
                        />
                      </label>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="primary-button"
                          disabled={renamingId === connection.id}
                          onClick={() => saveConnectionName(connection)}
                        >
                          {renamingId === connection.id ? 'Salvando...' : 'Salvar nome'}
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={renamingId === connection.id}
                          onClick={cancelRenaming}
                        >
                          Cancelar
                        </button>
                      </div>
                      <small>Deixe vazio e salve para voltar ao nome original da instituição.</small>
                    </div>
                  )}

                  <div className="open-finance-card-grid open-finance-card-grid-extended">
                    <div><span>Contas</span><strong>{accounts.filter((item) => item.account_type !== 'CREDIT_CARD').length}</strong></div>
                    <div><span>Cartões</span><strong>{cards.length}</strong></div>
                    <div><span>Posições</span><strong>{positions.length}</strong></div>
                    <div><span>Saldo investido</span><strong className="personal-private-value">{formatCurrency(positionBalance)}</strong></div>
                    <div><span>Última sincronização</span><strong>{formatDateTime(connection.last_sync_at)}</strong></div>
                    <div><span>Vínculo</span><strong>{connection.metadata?.isolated_by_user ? 'Usuário atual' : 'Conexão anterior'}</strong></div>
                  </div>

                  {connection.last_error && (
                    <div className="feedback error">{connection.last_error}</div>
                  )}

                <div className="inline-actions connection-card-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      syncingId === connection.id ||
                      renamingId === connection.id
                    }
                    onClick={() => handleSync(connection)}
                  >
                    {syncingId === connection.id
                      ? 'Sincronizando...'
                      : 'Sincronizar agora'}
                  </button>

                  <ConnectBankButton
                    connection={connection}
                    className="secondary-button"
                    disabled={
                      syncingId === connection.id ||
                      renamingId === connection.id
                    }
                    setFeedback={setFeedback}
                    onConnected={async (savedConnection, context) => {
                      if (context?.shouldSync) {
                        await handleSync(savedConnection)
                        return
                      }

                      await loadData()
                      if (onChanged) await onChanged()
                    }}
                  />

                  {!isEditing && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        syncingId === connection.id
                      }
                      onClick={() =>
                        startRenaming(connection)
                      }
                    >
                      Renomear conexão
                    </button>
                  )}

                  <DeleteConnectionButton
                    connection={connection}
                    displayName={displayName}
                    disabled={
                      syncingId === connection.id ||
                      renamingId === connection.id
                    }
                    setFeedback={setFeedback}
                    onDeleted={async () => {
                      if (
                        editingConnectionId ===
                        connection.id
                      ) {
                        cancelRenaming()
                      }

                      setLastResult(null)

                      await loadData()

                      if (onChanged) {
                        await onChanged()
                      }
                    }}
                  />
                </div>
                </article>
              )
            })
          )}
        </div>
      </section>

      {lastResult && (
        <section className="panel">
          <div className="panel-header">
            <h2>Resultado da última execução</h2>
            <p>{lastResult.institution}</p>
          </div>
          <div className="summary-grid summary-grid-4">
            <article className="summary-card"><span>Contas recebidas</span><strong>{lastResult.result?.accounts_received ?? 0}</strong></article>
            <article className="summary-card"><span>Movimentações bancárias</span><strong>{lastResult.result?.bank_transactions ?? 0}</strong></article>
            <article className="summary-card"><span>Compras do cartão</span><strong>{lastResult.result?.card_transactions ?? 0}</strong></article>
            <article className="summary-card"><span>Faturas</span><strong>{lastResult.result?.bills ?? 0}</strong></article>
            <article className="summary-card"><span>Posições de investimento</span><strong>{lastResult.result?.investments ?? 0}</strong></article>
            <article className="summary-card"><span>Movimentos de investimento</span><strong>{lastResult.result?.investment_transactions ?? 0}</strong></article>
            <article className="summary-card"><span>Empréstimos e créditos</span><strong>{lastResult.result?.loans ?? 0}</strong></article>
            <article className="summary-card"><span>Posições com valor</span><strong>{lastResult.investment_diagnostics?.with_value ?? 0}</strong></article>
            <article className="summary-card"><span>Saldo de investimentos recebido</span><strong className="personal-private-value">{formatCurrency(lastResult.investment_diagnostics?.net_balance_total ?? 0)}</strong></article>
            <article className="summary-card"><span>Valor bruto recebido</span><strong className="personal-private-value">{formatCurrency(lastResult.investment_diagnostics?.gross_amount_total ?? 0)}</strong></article>
          </div>
          {lastResult.notices?.length > 0 && (
            <div className="feedback info sync-notices">
              <strong>Avisos da sincronização</strong>
              <ul>
                {lastResult.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="panel compact-status-panel">
        <div>
          <strong>Última sincronização</strong>
          <span>{logs[0]?.finished_at ? formatDateTime(logs[0].finished_at) : '-'}</span>
        </div>
        <div>
          <strong>Movimentações de investimentos</strong>
          <span>{investmentTransactions.length}</span>
        </div>
        <div>
          <strong>Modo de atualização</strong>
          <span>Manual</span>
        </div>
      </section>

      <section className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Faturas importadas</h2>
            <p>Exibidas somente quando a instituição e o tipo de conexão fornecem esse produto.</p>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Cartão</th><th>Vencimento</th><th>Total</th><th>Pago</th><th>Status</th></tr>
              </thead>
              <tbody>
                {bills.length === 0 ? (
                  <tr><td colSpan="5" className="empty-cell">Nenhuma fatura retornada.</td></tr>
                ) : bills.map((bill) => (
                  <tr key={bill.id}>
                    <td>{bill.credit_cards?.card_name || '-'}</td>
                    <td>{formatDate(bill.due_date)}</td>
                    <td><span className="personal-private-value">{formatCurrency(bill.total_amount, bill.currency || 'BRL')}</span></td>
                    <td><span className="personal-private-value">{formatCurrency(bill.paid_amount, bill.currency || 'BRL')}</span></td>
                    <td><span className={`status-badge status-${String(bill.status).toLowerCase()}`}>{bill.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Movimentações pendentes do cartão</h2>
            <p>Podem representar compras de fatura aberta ou parcelas futuras fornecidas pela instituição.</p>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Data</th><th>Descrição</th><th>Parcela</th><th>Valor</th></tr>
              </thead>
              <tbody>
                {pendingCardTransactions.length === 0 ? (
                  <tr><td colSpan="4" className="empty-cell">Nenhuma movimentação pendente.</td></tr>
                ) : pendingCardTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.transaction_date)}</td>
                    <td>{transaction.original_description}<small>{transaction.credit_cards?.card_name || '-'}</small></td>
                    <td>{transaction.installment_number && transaction.installment_total ? `${transaction.installment_number}/${transaction.installment_total}` : '-'}</td>
                    <td><span className="personal-private-value">{formatCurrency(transaction.amount, transaction.currency || 'BRL')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Histórico das sincronizações manuais</h2>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Início</th><th>Instituição</th><th>Período</th><th>Status</th><th>Contas</th><th>Movimentos</th><th>Faturas</th><th>Investimentos</th><th>Dívidas</th><th>Erro</th></tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="10" className="empty-cell">Nenhuma sincronização registrada.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.started_at)}</td>
                  <td>{getConnectionDisplayName(log.open_finance_connections)}</td>
                  <td>{formatDate(log.period_from)} a {formatDate(log.period_to)}</td>
                  <td><span className={`status-badge status-${String(log.status).toLowerCase()}`}>{getStatusLabel(log.status)}</span></td>
                  <td>{log.accounts_received}</td>
                  <td>{Number(log.bank_transactions || 0) + Number(log.card_transactions || 0)}</td>
                  <td>{log.bills}</td>
                  <td>{log.investments ?? 0}</td>
                  <td>{log.loans ?? 0}</td>
                  <td>{log.error_message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
