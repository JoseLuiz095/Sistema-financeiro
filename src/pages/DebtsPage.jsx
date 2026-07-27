import { useEffect, useMemo, useState } from 'react'
import AppIcon from '../components/AppIcon'
import {
  listDebtCreditCardBills,
  listNegativeOpenFinanceAccounts,
  listOpenFinanceLoans,
} from '../services/openFinanceService'
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
  if (![fromYear, fromMonth, toYear, toMonth].every(Number.isFinite)) return 0
  return Math.max(0, (toYear - fromYear) * 12 + toMonth - fromMonth)
}

function getLoanInstitution(loan) {
  return loan.institution_name
    || loan.open_finance_connections?.institution_name
    || 'Instituição não identificada'
}

function getBillInstitution(bill) {
  return bill.credit_cards?.open_finance_connections?.institution_name
    || bill.credit_cards?.card_name
    || 'Instituição não identificada'
}

function getAccountInstitution(account) {
  return account.open_finance_connections?.institution_name
    || account.account_name
    || 'Instituição não identificada'
}

function getBillRemainingAmount(bill) {
  return Math.max(
    0,
    Number(bill.total_amount ?? 0) - Number(bill.paid_amount ?? 0),
  )
}

function getLoanOutstandingBalance(loan) {
  const outstanding = Number(loan.outstanding_balance)
  if (Number.isFinite(outstanding) && outstanding > 0) return outstanding

  const contracted = Number(loan.contract_amount)
  return Number.isFinite(contracted) && contracted > 0 ? contracted : 0
}

function getLoanDueInstallments(loan) {
  const value = Number(loan.due_installments ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function getLoanMonthlyEstimate(loan) {
  const outstanding = getLoanOutstandingBalance(loan)
  const dueInstallments = getLoanDueInstallments(loan)

  if (outstanding <= 0) return 0
  if (dueInstallments > 0) return outstanding / dueInstallments

  const startKey = currentMonthKey()
  const dueKey = String(loan.due_date ?? '').slice(0, 7)
  const months = dueKey ? monthDistance(startKey, dueKey) + 1 : 1
  return outstanding / Math.max(1, months)
}

function getLoanProjectionMonths(loan) {
  const dueInstallments = getLoanDueInstallments(loan)
  if (dueInstallments > 0) return Math.min(dueInstallments, 120)

  const startKey = currentMonthKey()
  const dueKey = String(loan.due_date ?? '').slice(0, 7)
  return dueKey ? Math.min(monthDistance(startKey, dueKey) + 1, 120) : 1
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

export default function DebtsPage({ setFeedback }) {
  const [loans, setLoans] = useState([])
  const [bills, setBills] = useState([])
  const [negativeAccounts, setNegativeAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)

    try {
      const [loanRows, billRows, negativeAccountRows] = await Promise.all([
        listOpenFinanceLoans(),
        listDebtCreditCardBills(),
        listNegativeOpenFinanceAccounts(),
      ])

      setLoans(loanRows)
      setBills(billRows.filter((bill) => getBillRemainingAmount(bill) > 0))
      setNegativeAccounts(negativeAccountRows)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Falha ao carregar as dívidas: ${error.message}`,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const totals = useMemo(() => {
    const loanTotal = loans.reduce(
      (total, loan) => total + getLoanOutstandingBalance(loan),
      0,
    )

    const billTotal = bills.reduce(
      (total, bill) => total + getBillRemainingAmount(bill),
      0,
    )

    const negativeBalanceTotal = negativeAccounts.reduce(
      (total, account) => total + Math.abs(Math.min(0, Number(account.current_balance ?? 0))),
      0,
    )

    const institutions = new Set([
      ...loans.map(getLoanInstitution),
      ...bills.map(getBillInstitution),
      ...negativeAccounts.map(getAccountInstitution),
    ])

    return {
      loanTotal,
      billTotal,
      negativeBalanceTotal,
      total: loanTotal + billTotal + negativeBalanceTotal,
      institutionCount: institutions.size,
    }
  }, [loans, bills, negativeAccounts])

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
      if (loan.status === 'OVERDUE' || Number(loan.past_due_installments ?? 0) > 0) {
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
      row.negativeBalance += Math.abs(Math.min(0, Number(account.current_balance ?? 0)))
      row.overdue += 1
    })

    return [...rows.values()]
      .map((row) => ({
        ...row,
        total: row.loans + row.bills + row.negativeBalance,
      }))
      .sort((left, right) => right.total - left.total)
  }, [loans, bills, negativeAccounts])

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
          total: 0,
        })
      }
      return rows.get(key)
    }

    bills.forEach((bill) => {
      const key = String(bill.due_date ?? startKey).slice(0, 7) || startKey
      const row = ensure(key)
      row.bills += getBillRemainingAmount(bill)
    })

    negativeAccounts.forEach((account) => {
      const row = ensure(startKey)
      row.negativeBalance += Math.abs(Math.min(0, Number(account.current_balance ?? 0)))
    })

    loans.forEach((loan) => {
      const monthlyEstimate = getLoanMonthlyEstimate(loan)
      const months = getLoanProjectionMonths(loan)
      const firstDueKey = String(loan.first_installment_due_date ?? '').slice(0, 7)
      const projectionStart = firstDueKey && firstDueKey > startKey ? firstDueKey : startKey

      for (let index = 0; index < months; index += 1) {
        const row = ensure(addMonths(projectionStart, index))
        row.estimatedLoans += monthlyEstimate
      }
    })

    return [...rows.values()]
      .map((row) => ({
        ...row,
        total: row.bills + row.estimatedLoans + row.negativeBalance,
      }))
      .sort((left, right) => left.key.localeCompare(right.key))
      .slice(0, 12)
  }, [loans, bills, negativeAccounts])

  return (
    <div className="page-stack debts-page">
      <section className="section-intro section-intro-card">
        <div className="section-icon" aria-hidden="true">
          <AppIcon name="debt" size={24} />
        </div>
        <div>
          <span className="eyebrow">Consolidado de crédito</span>
          <h2>Dívidas por instituição</h2>
          <p>
            Consolidação de empréstimos, faturas não pagas e saldos bancários negativos
            retornados pelas conexões Open Finance.
          </p>
        </div>
      </section>

      <section className="summary-grid summary-grid-4 debt-summary-grid">
        <article className="summary-card">
          <span>Total identificado</span>
          <strong className={totals.total > 0 ? 'negative' : 'positive'}>
            {formatCurrency(totals.total)}
          </strong>
          <small>Não inclui produtos que a instituição não compartilhou.</small>
        </article>
        <article className="summary-card">
          <span>Empréstimos e financiamentos</span>
          <strong>{formatCurrency(totals.loanTotal)}</strong>
          <small>{loans.length} contrato(s) retornado(s).</small>
        </article>
        <article className="summary-card">
          <span>Faturas em aberto</span>
          <strong>{formatCurrency(totals.billTotal)}</strong>
          <small>{bills.length} fatura(s) com saldo restante.</small>
        </article>
        <article className="summary-card">
          <span>Instituições com dívida</span>
          <strong>{totals.institutionCount}</strong>
          <small>Saldo negativo: {formatCurrency(totals.negativeBalanceTotal)}.</small>
        </article>
      </section>

      <section className="panel debt-info-panel">
        <div className="debt-info-copy">
          <AppIcon name="shield" size={20} />
          <div>
            <strong>Como o valor mensal é calculado</strong>
            <span>
              Faturas usam o vencimento real. Em empréstimos sem o valor individual de cada
              parcela, o sistema divide o saldo devedor pela quantidade de parcelas restantes e
              identifica o resultado como estimativa.
            </span>
          </div>
        </div>
        <button type="button" className="secondary-button" onClick={loadData} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar dívidas'}
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Resumo por banco</h2>
          <p>Veja onde estão concentrados os valores identificados.</p>
        </div>

        {institutions.length === 0 ? (
          <div className="mobile-empty-state">
            Nenhuma dívida foi retornada pelas conexões atuais.
          </div>
        ) : (
          <div className="debt-institution-grid">
            {institutions.map((institution) => (
              <article className="debt-institution-card" key={institution.name}>
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
                  <div><span>Empréstimos</span><strong>{formatCurrency(institution.loans)}</strong></div>
                  <div><span>Faturas</span><strong>{formatCurrency(institution.bills)}</strong></div>
                  <div><span>Saldo negativo</span><strong>{formatCurrency(institution.negativeBalance)}</strong></div>
                  <div><span>Contratos / faturas</span><strong>{institution.contracts + institution.openBills}</strong></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Divisão pelos próximos meses</h2>
          <p>Faturas são valores reais; parcelas de empréstimos podem ser estimadas.</p>
        </div>

        {monthlyProjection.length === 0 ? (
          <div className="mobile-empty-state">Nenhuma projeção mensal disponível.</div>
        ) : (
          <div className="debt-month-grid">
            {monthlyProjection.map((month) => (
              <article className="debt-month-card" key={month.key}>
                <div className="debt-month-header">
                  <strong>{monthLabel(month.key)}</strong>
                  <span>{formatCurrency(month.total)}</span>
                </div>
                <div className="debt-month-lines">
                  <div><span>Faturas</span><strong>{formatCurrency(month.bills)}</strong></div>
                  <div><span>Empréstimos estimados</span><strong>{formatCurrency(month.estimatedLoans)}</strong></div>
                  <div><span>Saldo negativo atual</span><strong>{formatCurrency(month.negativeBalance)}</strong></div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Contratos de crédito</h2>
          <p>Dados recuperados pelo produto Loans quando disponível na instituição.</p>
        </div>

        {loans.length === 0 ? (
          <div className="mobile-empty-state">
            Nenhum empréstimo foi disponibilizado pelas conexões atuais.
          </div>
        ) : (
          <div className="debt-contract-list">
            {loans.map((loan) => {
              const rate = getRatePercent(loan.cet)
              const monthlyEstimate = getLoanMonthlyEstimate(loan)

              return (
                <article className="debt-contract-card" key={loan.id}>
                  <div className="debt-contract-header">
                    <div>
                      <span>{getLoanInstitution(loan)}</span>
                      <h3>{loan.product_name || 'Contrato de crédito'}</h3>
                      <small>{loan.contract_number ? `Contrato ${loan.contract_number}` : loan.loan_type || '-'}</small>
                    </div>
                    <span className={`status-badge status-${String(loan.status).toLowerCase()}`}>
                      {getLoanStatusLabel(loan.status)}
                    </span>
                  </div>

                  <div className="debt-contract-values">
                    <div><span>Saldo devedor</span><strong>{formatCurrency(getLoanOutstandingBalance(loan), loan.currency || 'BRL')}</strong></div>
                    <div><span>Parcela mensal estimada</span><strong>{formatCurrency(monthlyEstimate, loan.currency || 'BRL')}</strong></div>
                    <div><span>Parcelas restantes</span><strong>{loan.due_installments ?? '-'}</strong></div>
                    <div><span>Parcelas em atraso</span><strong>{loan.past_due_installments ?? 0}</strong></div>
                    <div><span>Vencimento final</span><strong>{formatDate(loan.due_date)}</strong></div>
                    <div><span>CET anual</span><strong>{rate === null ? '-' : formatPercent(rate)}</strong></div>
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
            <h2>Faturas com saldo</h2>
            <p>Somente faturas abertas, fechadas, parciais ou vencidas.</p>
          </div>
          {bills.length === 0 ? (
            <div className="mobile-empty-state">Nenhuma fatura com saldo restante.</div>
          ) : (
            <div className="debt-simple-list">
              {bills.map((bill) => (
                <article key={bill.id}>
                  <div>
                    <strong>{getBillInstitution(bill)}</strong>
                    <span>{bill.credit_cards?.card_name || 'Cartão'} · vence {formatDate(bill.due_date)}</span>
                  </div>
                  <div className="debt-list-value">
                    <strong>{formatCurrency(getBillRemainingAmount(bill), bill.currency || 'BRL')}</strong>
                    <span>{getBillStatusLabel(bill.status)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Saldos negativos</h2>
            <p>Contas bancárias que chegaram com saldo atual abaixo de zero.</p>
          </div>
          {negativeAccounts.length === 0 ? (
            <div className="mobile-empty-state">Nenhuma conta com saldo negativo.</div>
          ) : (
            <div className="debt-simple-list">
              {negativeAccounts.map((account) => (
                <article key={account.id}>
                  <div>
                    <strong>{getAccountInstitution(account)}</strong>
                    <span>{account.account_name || 'Conta bancária'}</span>
                  </div>
                  <div className="debt-list-value">
                    <strong className="negative">{formatCurrency(Math.abs(Number(account.current_balance ?? 0)), account.currency || 'BRL')}</strong>
                    <span>Saldo utilizado</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
