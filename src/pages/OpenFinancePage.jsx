import { useEffect, useMemo, useState } from 'react'
import {
  listCreditCardBills,
  listOpenFinanceConnections,
  listOpenFinanceInvestmentPositions,
  listOpenFinanceInvestmentTransactions,
  listOpenFinanceSyncLogs,
  listPendingCardTransactions,
  syncPluggyConnection,
} from '../services/openFinanceService'
import { formatCurrency, formatDate, today } from '../utils/format'
import ConnectBankButton from '../components/ConnectBankButton'

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

export default function OpenFinancePage({ setFeedback, onChanged }) {
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
      (total, position) => total + Number(position.net_balance ?? 0),
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

      setLastResult({
        institution: connection.institution_name,
        ...result,
      })

      setFeedback({
        type: 'success',
        message: `Sincronização manual concluída para ${connection.institution_name}.`,
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
          <small>{formatCurrency(investmentBalance)}</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Open Finance</h2>

          <p>
            Conecte uma instituição e atualize os dados manualmente quando necessário.
          </p>
        </div>

        <div className="info-callout">
          A leitura manual não movimenta dinheiro e não inicia pagamentos. As credenciais da Pluggy continuam protegidas nos Secrets da Edge Function.
        </div>

        <div className="inline-actions">
          <ConnectBankButton
            setFeedback={setFeedback}
            onConnected={async () => {
              await loadData()

              if (onChanged) {
                await onChanged()
              }
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
          <p>Por enquanto, as conexões continuam sendo cadastradas manualmente no banco para testes controlados.</p>
        </div>

        <div className="open-finance-connections">
          {connections.length === 0 ? (
            <div className="empty-cell">Nenhuma conexão Pluggy cadastrada.</div>
          ) : (
            connections.map((connection) => {
              const accounts = connection.open_finance_accounts ?? []
              const cards = connection.credit_cards ?? []

              return (
                <article className="open-finance-card" key={connection.id}>
                  <div className="open-finance-card-header">
                    <div>
                      <h3>{connection.institution_name}</h3>
                      <p>
                        {connection.provider} · Item final {String(connection.provider_item_id).slice(-6)}
                      </p>
                    </div>
                    <span className={`status-badge status-${String(connection.sync_status).toLowerCase()}`}>
                      {getStatusLabel(connection.sync_status)}
                    </span>
                  </div>

                  <div className="open-finance-card-grid">
                    <div><span>Contas</span><strong>{accounts.filter((item) => item.account_type !== 'CREDIT_CARD').length}</strong></div>
                    <div><span>Cartões</span><strong>{cards.length}</strong></div>
                    <div><span>Última sincronização</span><strong>{formatDateTime(connection.last_sync_at)}</strong></div>
                    <div><span>Modo</span><strong>Manual</strong></div>
                  </div>

                  {connection.last_error && (
                    <div className="feedback error">{connection.last_error}</div>
                  )}

                  <div className="inline-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={syncingId === connection.id}
                      onClick={() => handleSync(connection)}
                    >
                      {syncingId === connection.id ? 'Sincronizando...' : 'Sincronizar agora'}
                    </button>
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
          </div>
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
                    <td>{formatCurrency(bill.total_amount, bill.currency || 'BRL')}</td>
                    <td>{formatCurrency(bill.paid_amount, bill.currency || 'BRL')}</td>
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
                    <td>{formatCurrency(transaction.amount, transaction.currency || 'BRL')}</td>
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
              <tr><th>Início</th><th>Instituição</th><th>Período</th><th>Status</th><th>Contas</th><th>Movimentos</th><th>Faturas</th><th>Investimentos</th><th>Erro</th></tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="9" className="empty-cell">Nenhuma sincronização registrada.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.started_at)}</td>
                  <td>{log.open_finance_connections?.institution_name || '-'}</td>
                  <td>{formatDate(log.period_from)} a {formatDate(log.period_to)}</td>
                  <td><span className={`status-badge status-${String(log.status).toLowerCase()}`}>{getStatusLabel(log.status)}</span></td>
                  <td>{log.accounts_received}</td>
                  <td>{Number(log.bank_transactions || 0) + Number(log.card_transactions || 0)}</td>
                  <td>{log.bills}</td>
                  <td>{log.investments ?? 0}</td>
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
