import { useEffect, useMemo, useState } from 'react'
import AppIcon from '../components/AppIcon'
import {
  listDebtCreditCardBills,
  listNegativeOpenFinanceAccounts,
  listOpenFinanceLoans,
} from '../services/openFinanceService'
import { buildImportedCreditInsights } from '../utils/debtInsights'
import { getConnectionDisplayName } from '../utils/openFinance'
import {
  formatCurrency,
  formatDate,
  formatPercent,
  monthLabel,
  today,
} from '../utils/format'

function currentMonthKey() {
  return today().slice(0, 7)
}

function addMonths(key, amount) {
  const [year, month] = String(key).split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1, 12)
  return date.toISOString().slice(0, 7)
}

function monthDistance(fromKey, toKey) {
  const [fromYear, fromMonth] = String(fromKey).split('-').map(Number)
  const [toYear, toMonth] = String(toKey).split('-').map(Number)

  if (
    ![fromYear, fromMonth, toYear, toMonth].every(
      Number.isFinite,
    )
  ) {
    return 0
  }

  return Math.max(
    0,
    (toYear - fromYear) * 12 +
      toMonth -
      fromMonth,
  )
}

function getLoanInstitution(loan) {
  const connectionName = getConnectionDisplayName(
    loan.open_finance_connections,
  )

  return connectionName !== 'Instituição não identificada'
    ? connectionName
    : loan.institution_name ||
        'Instituição não identificada'
}

function getBillInstitution(bill) {
  const connectionName = getConnectionDisplayName(
    bill.credit_cards?.open_finance_connections,
  )

  return connectionName !== 'Instituição não identificada'
    ? connectionName
    : bill.credit_cards?.card_name ||
        'Instituição não identificada'
}

function getAccountInstitution(account) {
  const connectionName = getConnectionDisplayName(
    account.open_finance_connections,
  )

  return connectionName !== 'Instituição não identificada'
    ? connectionName
    : account.account_name ||
        'Instituição não identificada'
}

function getBillRemainingAmount(bill) {
  return Math.max(
    0,
    Number(bill.total_amount ?? 0) -
      Number(bill.paid_amount ?? 0),
  )
}

function getLoanOutstandingBalance(loan) {
  const outstanding = Number(loan.outstanding_balance)
  if (Number.isFinite(outstanding) && outstanding > 0) {
    return outstanding
  }

  const contracted = Number(loan.contract_amount)
  return Number.isFinite(contracted) && contracted > 0
    ? contracted
    : 0
}

function getLoanDueInstallments(loan) {
  const value = Number(loan.due_installments ?? 0)
  return Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0
}

function getLoanMonthlyEstimate(loan) {
  const outstanding = getLoanOutstandingBalance(loan)
  const dueInstallments = getLoanDueInstallments(loan)

  if (outstanding <= 0) return 0
  if (dueInstallments > 0) {
    return outstanding / dueInstallments
  }

  const startKey = currentMonthKey()
  const dueKey = String(loan.due_date ?? '').slice(0, 7)
  const months = dueKey
    ? monthDistance(startKey, dueKey) + 1
    : 1

  return outstanding / Math.max(1, months)
}

function getLoanProjectionMonths(loan) {
  const dueInstallments = getLoanDueInstallments(loan)
  if (dueInstallments > 0) {
    return Math.min(dueInstallments, 120)
  }

  const startKey = currentMonthKey()
  const dueKey = String(loan.due_date ?? '').slice(0, 7)

  return dueKey
    ? Math.min(monthDistance(startKey, dueKey) + 1, 120)
    : 1
}

function getRatePercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.abs(number) <= 1 ? number * 100 : number
}

function getLoanStatusLabel(status) {
  const labels = {
    ACTIVE: 'Ativo',
    OVERDUE: 'Em atraso',
    SETTLED: 'Quitado',
    UNKNOWN: 'Não informado',
  }
  return labels[status] ?? status ?? 'Não informado'
}

function getBillStatusLabel(status) {
  const labels = {
    OPEN: 'Aberta',
    CLOSED: 'Fechada',
    PARTIAL: 'Parcial',
    OVERDUE: 'Vencida',
    PAID: 'Paga',
  }
  return labels[status] ?? status ?? '-'
}

function commitmentTone(value) {
  if (!Number.isFinite(value)) return ''
  if (value <= 20) return 'positive'
  if (value <= 35) return 'warning-text'
  return 'negative'
}

export default function DebtsPage({
  transactions = [],
  setFeedback,
}) {
  const [loans, setLoans] = useState([])
  const [bills, setBills] = useState([])
  const [negativeAccounts, setNegativeAccounts] =
    useState([])
  const [loading, setLoading] = useState(true)
  const [openFinanceUnavailable, setOpenFinanceUnavailable] =
    useState(false)

  async function loadData() {
    setLoading(true)
    setOpenFinanceUnavailable(false)

    try {
      const [
        loanRows,
        billRows,
        negativeAccountRows,
      ] = await Promise.all([
        listOpenFinanceLoans(),
        listDebtCreditCardBills(),
        listNegativeOpenFinanceAccounts(),
      ])

      setLoans(loanRows)
      setBills(
        billRows.filter(
          (bill) => getBillRemainingAmount(bill) > 0,
        ),
      )
      setNegativeAccounts(negativeAccountRows)
    } catch (error) {
      console.error('[DEBTS][OPEN_FINANCE]', error)
      setOpenFinanceUnavailable(true)
      setLoans([])
      setBills([])
      setNegativeAccounts([])

      setFeedback?.({
        type: 'info',
        message:
          'Os dados do extrato continuam disponíveis. As informações confirmadas pelas instituições não puderam ser atualizadas agora.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const imported = useMemo(
    () => buildImportedCreditInsights(transactions),
    [transactions],
  )

  const openFinanceTotals = useMemo(() => {
    const loanTotal = loans.reduce(
      (total, loan) =>
        total + getLoanOutstandingBalance(loan),
      0,
    )
    const billTotal = bills.reduce(
      (total, bill) =>
        total + getBillRemainingAmount(bill),
      0,
    )
    const negativeBalanceTotal =
      negativeAccounts.reduce(
        (total, account) =>
          total +
          Math.abs(
            Math.min(
              0,
              Number(account.current_balance ?? 0),
            ),
          ),
        0,
      )

    return {
      loanTotal,
      billTotal,
      negativeBalanceTotal,
      total:
        loanTotal +
        billTotal +
        negativeBalanceTotal,
    }
  }, [bills, loans, negativeAccounts])

  const institutions = useMemo(() => {
    const rows = new Map()

    function ensure(name) {
      if (!rows.has(name)) {
        rows.set(name, {
          name,
          loans: 0,
          bills: 0,
          negativeBalance: 0,
          contracts: 0,
          openBills: 0,
          overdue: 0,
        })
      }
      return rows.get(name)
    }

    loans.forEach((loan) => {
      const row = ensure(getLoanInstitution(loan))
      row.loans += getLoanOutstandingBalance(loan)
      row.contracts += 1
      if (
        loan.status === 'OVERDUE' ||
        Number(loan.past_due_installments ?? 0) > 0
      ) {
        row.overdue += 1
      }
    })

    bills.forEach((bill) => {
      const row = ensure(getBillInstitution(bill))
      row.bills += getBillRemainingAmount(bill)
      row.openBills += 1
      if (bill.status === 'OVERDUE') row.overdue += 1
    })

    negativeAccounts.forEach((account) => {
      const row = ensure(getAccountInstitution(account))
      row.negativeBalance += Math.abs(
        Math.min(
          0,
          Number(account.current_balance ?? 0),
        ),
      )
      row.overdue += 1
    })

    return [...rows.values()]
      .map((row) => ({
        ...row,
        total:
          row.loans +
          row.bills +
          row.negativeBalance,
      }))
      .sort((left, right) => right.total - left.total)
  }, [bills, loans, negativeAccounts])

  const monthlyProjection = useMemo(() => {
    const rows = new Map()
    const startKey = currentMonthKey()

    function ensure(key) {
      if (!rows.has(key)) {
        rows.set(key, {
          key,
          bills: 0,
          estimatedLoans: 0,
          negativeBalance: 0,
          importedInstallments: 0,
          total: 0,
        })
      }
      return rows.get(key)
    }

    imported.projection.forEach((month) => {
      ensure(month.key).importedInstallments +=
        month.importedInstallments
    })

    bills.forEach((bill) => {
      const key =
        String(bill.due_date ?? startKey).slice(0, 7) ||
        startKey
      ensure(key).bills += getBillRemainingAmount(bill)
    })

    negativeAccounts.forEach((account) => {
      ensure(startKey).negativeBalance += Math.abs(
        Math.min(
          0,
          Number(account.current_balance ?? 0),
        ),
      )
    })

    loans.forEach((loan) => {
      const monthlyEstimate = getLoanMonthlyEstimate(loan)
      const months = getLoanProjectionMonths(loan)
      const firstDueKey = String(
        loan.first_installment_due_date ?? '',
      ).slice(0, 7)
      const projectionStart =
        firstDueKey && firstDueKey > startKey
          ? firstDueKey
          : startKey

      for (let index = 0; index < months; index += 1) {
        ensure(
          addMonths(projectionStart, index),
        ).estimatedLoans += monthlyEstimate
      }
    })

    return [...rows.values()]
      .map((row) => ({
        ...row,
        total:
          row.bills +
          row.estimatedLoans +
          row.negativeBalance +
          row.importedInstallments,
      }))
      .sort((left, right) =>
        left.key.localeCompare(right.key),
      )
      .slice(0, 12)
  }, [bills, imported.projection, loans, negativeAccounts])

  const hasImportedCreditData =
    imported.activeInstallmentCount > 0 ||
    imported.cardSpend90 > 0 ||
    imported.averageMonthlyLoanSpend90 > 0
  const hasOpenFinanceData = openFinanceTotals.total > 0

  return (
    <div className="page-stack debts-page">
      <section className="section-intro section-intro-card">
        <div className="section-icon" aria-hidden="true">
          <AppIcon name="debt" size={24} />
        </div>
        <div>
          <span className="eyebrow">
            Crédito e compromissos
          </span>
          <h2>Crédito e dívidas em duas fontes</h2>
          <p>
            O extrato identifica compras parceladas e uso de cartão. O
            Open Finance, quando disponível, confirma faturas, contratos e
            saldos negativos diretamente com a instituição.
          </p>
        </div>
      </section>

      <section className="summary-grid summary-grid-4 debt-summary-grid">
        <article className="summary-card">
          <span>Dívida confirmada</span>
          <strong
            className={
              openFinanceTotals.total > 0
                ? 'negative'
                : 'positive'
            }
          >
            {formatCurrency(openFinanceTotals.total)}
          </strong>
          <small>Valor retornado pelas instituições.</small>
        </article>

        <article className="summary-card">
          <span>Parcelamentos estimados</span>
          <strong>
            {formatCurrency(imported.estimatedOutstanding)}
          </strong>
          <small>
            {imported.activeInstallmentCount} compromisso(s) ainda ativo(s)
            inferido(s) pelo extrato.
          </small>
        </article>

        <article className="summary-card">
          <span>Cartão nos últimos 30 dias</span>
          <strong>{formatCurrency(imported.cardSpend30)}</strong>
          <small>
            Média mensal de 90 dias: {' '}
            {formatCurrency(imported.averageMonthlyCardSpend90)}.
          </small>
        </article>

        <article className="summary-card">
          <span>Comprometimento estimado</span>
          <strong
            className={commitmentTone(
              imported.commitmentRatio,
            )}
          >
            {Number.isFinite(imported.commitmentRatio)
              ? formatPercent(imported.commitmentRatio)
              : '-'}
          </strong>
          <small>
            Parcelamentos e crédito recorrente sobre a renda média de 90
            dias.
          </small>
        </article>
      </section>

      <section className="panel debt-source-status-grid">
        <article>
          <AppIcon name="upload" size={20} />
          <div>
            <strong>Extrato importado</strong>
            <span>
              {transactions.length.toLocaleString('pt-BR')} movimentações
              analisadas; {imported.importedExpenseCount.toLocaleString('pt-BR')}
              {' '}despesas avaliadas.
            </span>
          </div>
          <span className="badge success">Disponível</span>
        </article>

        <article>
          <AppIcon name="bank" size={20} />
          <div>
            <strong>Dados confirmados pelo banco</strong>
            <span>
              {openFinanceUnavailable
                ? 'A atualização da instituição não respondeu.'
                : hasOpenFinanceData
                  ? 'Faturas, empréstimos ou saldo negativo recebidos.'
                  : 'Nenhuma dívida confirmada foi retornada.'}
            </span>
          </div>
          <span
            className={`badge ${
              hasOpenFinanceData ? 'success' : 'info'
            }`}
          >
            {hasOpenFinanceData ? 'Com dados' : 'Sem dados'}
          </span>
        </article>
      </section>

      <section className="panel debt-info-panel">
        <div className="debt-info-copy">
          <AppIcon name="shield" size={20} />
          <div>
            <strong>Valores estimados e confirmados não são misturados</strong>
            <span>
              Parcelamentos do extrato são projeções baseadas no texto
              “Parcela X/Y”. Contratos e faturas do Open Finance são exibidos
              separadamente como dados confirmados pela instituição.
            </span>
          </div>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={loadData}
          disabled={loading}
        >
          {loading
            ? 'Atualizando...'
            : 'Atualizar dados bancários'}
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Compromissos dos próximos meses</h2>
          <p>
            Soma visual de parcelamentos inferidos e obrigações confirmadas.
          </p>
        </div>

        {monthlyProjection.every((month) => month.total <= 0) ? (
          <div className="mobile-empty-state">
            Nenhum compromisso futuro foi identificado.
          </div>
        ) : (
          <div className="debt-month-grid">
            {monthlyProjection.map((month) => (
              <article className="debt-month-card" key={month.key}>
                <div className="debt-month-header">
                  <strong>{monthLabel(month.key)}</strong>
                  <span>{formatCurrency(month.total)}</span>
                </div>
                <div className="debt-month-lines">
                  <div>
                    <span>Parcelas do extrato</span>
                    <strong>
                      {formatCurrency(
                        month.importedInstallments,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Faturas confirmadas</span>
                    <strong>{formatCurrency(month.bills)}</strong>
                  </div>
                  <div>
                    <span>Empréstimos estimados</span>
                    <strong>
                      {formatCurrency(month.estimatedLoans)}
                    </strong>
                  </div>
                  <div>
                    <span>Saldo negativo atual</span>
                    <strong>
                      {formatCurrency(month.negativeBalance)}
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header row-between">
          <div>
            <span className="eyebrow">Estimativa pelo extrato</span>
            <h2>Parcelamentos ainda ativos</h2>
            <p>
              O sistema ajusta a parcela original pela data do lançamento e
              mostra somente compromissos que ainda podem estar em aberto.
            </p>
          </div>
          <span className="badge info">
            {imported.activeInstallmentCount} identificado(s)
          </span>
        </div>

        {imported.activeInstallments.length === 0 ? (
          <div className="mobile-empty-state">
            Nenhuma descrição no formato “Parcela X/Y” ainda ativa foi
            encontrada no extrato.
          </div>
        ) : (
          <div className="debt-installment-list">
            {imported.activeInstallments
              .slice(0, 60)
              .map((item) => (
                <article key={item.id}>
                  <div className="debt-installment-main">
                    <strong>{item.description}</strong>
                    <span>
                      {item.institution} · lançamento em {' '}
                      {formatDate(item.transactionDate)}
                    </span>
                  </div>
                  <div className="debt-installment-progress">
                    <span>
                      Estimada em {item.estimatedCurrentInstallment}/
                      {item.totalInstallments}
                    </span>
                    <strong>
                      {item.remainingInstallments} parcela(s) restante(s)
                    </strong>
                  </div>
                  <div className="debt-list-value">
                    <strong>
                      {formatCurrency(item.estimatedOutstanding)}
                    </strong>
                    <span>
                      {formatCurrency(item.monthlyAmount)} por mês
                    </span>
                  </div>
                </article>
              ))}
          </div>
        )}

        {imported.activeInstallments.length > 60 && (
          <div className="info-callout">
            Exibindo os 60 maiores compromissos. Os demais continuam incluídos
            nos totais e na projeção mensal.
          </div>
        )}
      </section>

      <section className="content-grid debt-imported-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Uso recente por conta</h2>
            <p>
              Compras com indicação de cartão nos últimos 90 dias.
            </p>
          </div>

          {imported.institutions.length === 0 ? (
            <div className="mobile-empty-state">
              Nenhuma compra recente em cartão foi identificada.
            </div>
          ) : (
            <div className="debt-simple-list">
              {imported.institutions.map((institution) => (
                <article key={institution.name}>
                  <div>
                    <strong>{institution.name}</strong>
                    <span>Movimentações do extrato</span>
                  </div>
                  <div className="debt-list-value">
                    <strong>
                      {formatCurrency(institution.cardSpend)}
                    </strong>
                    <span>últimos 90 dias</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Maiores gastos no cartão</h2>
            <p>Descrições com maior volume nos últimos 90 dias.</p>
          </div>

          {imported.topMerchants.length === 0 ? (
            <div className="mobile-empty-state">
              Nenhum estabelecimento foi identificado.
            </div>
          ) : (
            <div className="debt-simple-list">
              {imported.topMerchants.map((merchant) => (
                <article key={merchant.name}>
                  <div>
                    <strong>{merchant.name}</strong>
                    <span>Compra ou cobrança em cartão</span>
                  </div>
                  <div className="debt-list-value">
                    <strong>{formatCurrency(merchant.amount)}</strong>
                    <span>últimos 90 dias</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span className="eyebrow">Dados confirmados</span>
          <h2>Resumo por instituição</h2>
          <p>
            Esta área depende da instituição disponibilizar crédito e faturas
            pelo Open Finance.
          </p>
        </div>

        {institutions.length === 0 ? (
          <div className="mobile-empty-state">
            Nenhuma dívida confirmada foi retornada. Os dados estimados do
            extrato permanecem visíveis acima.
          </div>
        ) : (
          <div className="debt-institution-grid">
            {institutions.map((institution) => (
              <article
                className="debt-institution-card"
                key={institution.name}
              >
                <div className="debt-institution-header">
                  <div>
                    <span>Instituição</span>
                    <h3>{institution.name}</h3>
                  </div>
                  {institution.overdue > 0 && (
                    <span className="status-badge status-overdue">
                      {institution.overdue} pendência(s)
                    </span>
                  )}
                </div>

                <strong className="debt-institution-total">
                  {formatCurrency(institution.total)}
                </strong>

                <div className="debt-breakdown-grid">
                  <div>
                    <span>Empréstimos</span>
                    <strong>
                      {formatCurrency(institution.loans)}
                    </strong>
                  </div>
                  <div>
                    <span>Faturas</span>
                    <strong>
                      {formatCurrency(institution.bills)}
                    </strong>
                  </div>
                  <div>
                    <span>Saldo negativo</span>
                    <strong>
                      {formatCurrency(
                        institution.negativeBalance,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Contratos / faturas</span>
                    <strong>
                      {institution.contracts +
                        institution.openBills}
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Contratos de crédito confirmados</h2>
          <p>
            Dados recuperados diretamente das instituições quando o produto
            Loans estiver disponível.
          </p>
        </div>

        {loans.length === 0 ? (
          <div className="mobile-empty-state">
            Nenhum empréstimo confirmado foi disponibilizado.
          </div>
        ) : (
          <div className="debt-contract-list">
            {loans.map((loan) => {
              const rate = getRatePercent(loan.cet)
              const monthlyEstimate =
                getLoanMonthlyEstimate(loan)

              return (
                <article
                  className="debt-contract-card"
                  key={loan.id}
                >
                  <div className="debt-contract-header">
                    <div>
                      <span>{getLoanInstitution(loan)}</span>
                      <h3>
                        {loan.product_name ||
                          'Contrato de crédito'}
                      </h3>
                      <small>
                        {loan.contract_number
                          ? `Contrato ${loan.contract_number}`
                          : loan.loan_type || '-'}
                      </small>
                    </div>
                    <span
                      className={`status-badge status-${String(
                        loan.status,
                      ).toLowerCase()}`}
                    >
                      {getLoanStatusLabel(loan.status)}
                    </span>
                  </div>

                  <div className="debt-contract-values">
                    <div>
                      <span>Saldo devedor</span>
                      <strong>
                        {formatCurrency(
                          getLoanOutstandingBalance(loan),
                          loan.currency || 'BRL',
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Parcela mensal estimada</span>
                      <strong>
                        {formatCurrency(
                          monthlyEstimate,
                          loan.currency || 'BRL',
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Parcelas restantes</span>
                      <strong>
                        {loan.due_installments ?? '-'}
                      </strong>
                    </div>
                    <div>
                      <span>Parcelas em atraso</span>
                      <strong>
                        {loan.past_due_installments ?? 0}
                      </strong>
                    </div>
                    <div>
                      <span>Vencimento final</span>
                      <strong>{formatDate(loan.due_date)}</strong>
                    </div>
                    <div>
                      <span>CET anual</span>
                      <strong>
                        {rate === null
                          ? '-'
                          : formatPercent(rate)}
                      </strong>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Faturas confirmadas com saldo</h2>
            <p>
              Somente faturas retornadas como abertas, fechadas, parciais ou
              vencidas.
            </p>
          </div>
          {bills.length === 0 ? (
            <div className="mobile-empty-state">
              Nenhuma fatura confirmada com saldo restante.
            </div>
          ) : (
            <div className="debt-simple-list">
              {bills.map((bill) => (
                <article key={bill.id}>
                  <div>
                    <strong>{getBillInstitution(bill)}</strong>
                    <span>
                      {bill.credit_cards?.card_name || 'Cartão'} · vence {' '}
                      {formatDate(bill.due_date)}
                    </span>
                  </div>
                  <div className="debt-list-value">
                    <strong>
                      {formatCurrency(
                        getBillRemainingAmount(bill),
                        bill.currency || 'BRL',
                      )}
                    </strong>
                    <span>{getBillStatusLabel(bill.status)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Saldos negativos confirmados</h2>
            <p>
              Contas bancárias retornadas com saldo atual abaixo de zero.
            </p>
          </div>
          {negativeAccounts.length === 0 ? (
            <div className="mobile-empty-state">
              Nenhuma conta confirmou saldo negativo.
            </div>
          ) : (
            <div className="debt-simple-list">
              {negativeAccounts.map((account) => (
                <article key={account.id}>
                  <div>
                    <strong>{getAccountInstitution(account)}</strong>
                    <span>
                      {account.account_name || 'Conta bancária'}
                    </span>
                  </div>
                  <div className="debt-list-value">
                    <strong className="negative">
                      {formatCurrency(
                        Math.abs(
                          Number(account.current_balance ?? 0),
                        ),
                        account.currency || 'BRL',
                      )}
                    </strong>
                    <span>Saldo utilizado</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {!hasImportedCreditData && !hasOpenFinanceData && (
        <section className="panel empty-analysis-state">
          <AppIcon name="debt" size={30} />
          <h2>Nenhum dado de crédito foi identificado</h2>
          <p>
            Importe um extrato que contenha compras parceladas ou conecte uma
            instituição que compartilhe faturas e empréstimos.
          </p>
        </section>
      )}
    </div>
  )
}
