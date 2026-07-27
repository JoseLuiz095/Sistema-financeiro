import { useMemo, useState } from 'react'
import {
  ASSET_TYPES,
  INCOME_TYPES,
  OPERATION_TYPES,
  TRADE_TYPES,
  getAssetTypeLabel,
  getIncomeTypeLabel,
  getOperationTypeLabel,
} from '../constants/finance'
import {
  createAsset,
  createInvestmentIncome,
  createInvestmentOperation,
  deleteInvestmentIncome,
  deleteInvestmentOperation,
  upsertMarketQuote,
} from '../services/investmentService'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  parseBrazilianNumber,
  today,
} from '../utils/format'
import { randomToken } from '../utils/hash'

const initialAsset = {
  ticker: '',
  asset_name: '',
  asset_type: 'STOCK',
  market: 'B3',
  currency: 'BRL',
}

const initialOperation = {
  asset_id: '',
  account_id: '',
  operation_date: today(),
  operation_type: 'BUY',
  trade_type: 'NORMAL',
  quantity: '',
  unit_price: '',
  brokerage_fee: '0',
  exchange_fee: '0',
  taxes: '0',
  other_costs: '0',
  notes: '',
}

const initialQuote = {
  asset_id: '',
  quote_date: today(),
  close_price: '',
  source: 'Manual',
}

const initialIncome = {
  asset_id: '',
  account_id: '',
  payment_date: today(),
  income_type: 'DIVIDEND',
  quantity_reference: '',
  gross_value: '',
  withholding_tax: '0',
  notes: '',
}

function numeric(value) {
  const parsed = parseBrazilianNumber(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getImportedInvestmentTypeLabel(type, subtype) {
  const subtypeLabels = {
    STOCK: 'Ação',
    BDR: 'BDR',
    REAL_ESTATE_FUND: 'FII',
    ETF: 'ETF',
    CDB: 'CDB',
    LCI: 'LCI',
    LCA: 'LCA',
    TREASURY: 'Tesouro Direto',
    DEBENTURES: 'Debênture',
    RETIREMENT: 'Previdência',
    PGBL: 'PGBL',
    VGBL: 'VGBL',
    INVESTMENT_FUND: 'Fundo de investimento',
    STOCK_FUND: 'Fundo de ações',
    MULTIMARKET_FUND: 'Fundo multimercado',
    FIXED_INCOME_FUND: 'Fundo de renda fixa',
  }

  if (subtypeLabels[subtype]) return subtypeLabels[subtype]

  const typeLabels = {
    FIXED_INCOME: 'Renda fixa',
    MUTUAL_FUND: 'Fundo',
    EQUITY: 'Renda variável',
    ETF: 'ETF',
    SECURITY: 'Previdência',
    COE: 'COE',
    OTHER: 'Outro',
  }

  return typeLabels[type] ?? subtype ?? type ?? 'Outro'
}

function getImportedTransactionTypeLabel(type) {
  const labels = {
    BUY: 'Aplicação / compra',
    SELL: 'Resgate / venda',
    TAX: 'Tributo',
    TRANSFER: 'Transferência',
    INTEREST: 'Rendimento',
    AMORTIZATION: 'Amortização',
    OTHER: 'Outro',
  }

  return labels[type] ?? type ?? '-'
}

export default function InvestmentsPage({
  user,
  accounts,
  assets,
  operations,
  quotes,
  incomes,
  investmentResult,
  importedPositions = [],
  importedTransactions = [],
  onChanged,
  setFeedback,
}) {
  const [section, setSection] = useState('positions')
  const [assetForm, setAssetForm] = useState(initialAsset)
  const [operationForm, setOperationForm] = useState({
    ...initialOperation,
    asset_id: assets[0]?.id ?? '',
    account_id: accounts.find((account) => account.account_type === 'BROKERAGE')?.id ?? accounts[0]?.id ?? '',
  })
  const [quoteForm, setQuoteForm] = useState({ ...initialQuote, asset_id: assets[0]?.id ?? '' })
  const [incomeForm, setIncomeForm] = useState({
    ...initialIncome,
    asset_id: assets[0]?.id ?? '',
    account_id: accounts[0]?.id ?? '',
  })
  const [saving, setSaving] = useState(false)

  const positions = useMemo(
    () => investmentResult.positions
      .filter((position) => position.quantity > 0 || position.realized !== 0 || position.incomeNet !== 0)
      .sort((a, b) => b.marketValue - a.marketValue),
    [investmentResult],
  )

  const importedSummary = useMemo(() => {
    return importedPositions.reduce(
      (summary, position) => {
        summary.netBalance += Number(position.net_balance ?? 0)
        summary.originalAmount += Number(position.original_amount ?? 0)
        summary.profit += Number(position.profit_amount ?? 0)
        return summary
      },
      {
        netBalance: 0,
        originalAmount: 0,
        profit: 0,
      },
    )
  }, [importedPositions])

  async function saveAsset(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await createAsset({
        user_id: user.id,
        ticker: assetForm.ticker,
        asset_name: assetForm.asset_name.trim() || assetForm.ticker.trim().toUpperCase(),
        asset_type: assetForm.asset_type,
        market: assetForm.market,
        currency: assetForm.currency,
        active: true,
      })
      setAssetForm(initialAsset)
      setFeedback({ type: 'success', message: 'Ativo cadastrado.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveOperation(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const quantity = numeric(operationForm.quantity)
      const unitPrice = numeric(operationForm.unit_price)
      const brokerage = numeric(operationForm.brokerage_fee)
      const exchange = numeric(operationForm.exchange_fee)
      const taxes = numeric(operationForm.taxes)
      const other = numeric(operationForm.other_costs)
      const gross = quantity * unitPrice
      const totalFees = brokerage + exchange + taxes + other
      const isExit = operationForm.operation_type === 'SELL'
      const net = isExit ? gross - totalFees : gross + totalFees

      if (!operationForm.asset_id) throw new Error('Selecione o ativo.')
      if (quantity <= 0) throw new Error('Informe uma quantidade maior que zero.')
      if (unitPrice < 0) throw new Error('Preço inválido.')

      await createInvestmentOperation({
        user_id: user.id,
        asset_id: operationForm.asset_id,
        account_id: operationForm.account_id || null,
        operation_date: operationForm.operation_date,
        operation_type: operationForm.operation_type,
        trade_type: operationForm.trade_type,
        quantity,
        unit_price: unitPrice,
        brokerage_fee: brokerage,
        exchange_fee: exchange,
        taxes,
        other_costs: other,
        gross_value: gross,
        net_value: net,
        notes: operationForm.notes.trim() || null,
        record_hash: randomToken('manual-operation'),
        source_data: { source: 'MANUAL' },
      })
      setOperationForm({
        ...initialOperation,
        asset_id: operationForm.asset_id,
        account_id: operationForm.account_id,
      })
      setFeedback({ type: 'success', message: 'Operação registrada e posição recalculada.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveQuote(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const closePrice = numeric(quoteForm.close_price)
      if (!quoteForm.asset_id || closePrice <= 0) throw new Error('Selecione o ativo e informe uma cotação válida.')
      await upsertMarketQuote({
        user_id: user.id,
        asset_id: quoteForm.asset_id,
        quote_date: quoteForm.quote_date,
        close_price: closePrice,
        source: quoteForm.source.trim() || 'Manual',
      })
      setQuoteForm({ ...quoteForm, close_price: '' })
      setFeedback({ type: 'success', message: 'Cotação atualizada.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function saveIncome(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const gross = numeric(incomeForm.gross_value)
      const withholding = numeric(incomeForm.withholding_tax)
      if (!incomeForm.asset_id || gross <= 0) throw new Error('Selecione o ativo e informe o valor do provento.')
      if (withholding > gross) throw new Error('O imposto retido não pode superar o valor bruto.')
      await createInvestmentIncome({
        user_id: user.id,
        asset_id: incomeForm.asset_id,
        account_id: incomeForm.account_id || null,
        payment_date: incomeForm.payment_date,
        income_type: incomeForm.income_type,
        quantity_reference: incomeForm.quantity_reference ? numeric(incomeForm.quantity_reference) : null,
        gross_value: gross,
        withholding_tax: withholding,
        net_value: gross - withholding,
        notes: incomeForm.notes.trim() || null,
        record_hash: randomToken('manual-income'),
        source_data: { source: 'MANUAL' },
      })
      setIncomeForm({ ...initialIncome, asset_id: incomeForm.asset_id, account_id: incomeForm.account_id })
      setFeedback({ type: 'success', message: 'Provento registrado.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function removeOperation(id) {
    if (!window.confirm('Excluir esta operação? A posição e o preço médio serão recalculados.')) return
    try {
      await deleteInvestmentOperation(id)
      setFeedback({ type: 'success', message: 'Operação excluída.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  async function removeIncome(id) {
    if (!window.confirm('Excluir este provento?')) return
    try {
      await deleteInvestmentIncome(id)
      setFeedback({ type: 'success', message: 'Provento excluído.' })
      await onChanged()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  return (
    <div className="page-stack">
      <nav className="sub-nav">
        {[
          ['positions', 'Posições calculadas'],
          ['imported', 'Open Finance'],
          ['operations', 'Operações'],
          ['assets', 'Ativos'],
          ['quotes', 'Cotações'],
          ['income', 'Proventos'],
        ].map(([value, label]) => (
          <button type="button" key={value} className={section === value ? 'active' : ''} onClick={() => setSection(value)}>{label}</button>
        ))}
      </nav>

      {section === 'positions' && (
        <>
          <section className="summary-grid summary-grid-4">
            <article className="summary-card"><span>Custo atual</span><strong>{formatCurrency(investmentResult.summary.costBasis)}</strong></article>
            <article className="summary-card"><span>Valor de mercado</span><strong>{formatCurrency(investmentResult.summary.marketValue)}</strong></article>
            <article className="summary-card"><span>Resultado total</span><strong className={investmentResult.summary.totalReturn >= 0 ? 'positive' : 'negative'}>{formatCurrency(investmentResult.summary.totalReturn)}</strong></article>
            <article className="summary-card"><span>Rentabilidade total</span><strong>{formatPercent(investmentResult.summary.totalReturnPercent)}</strong></article>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Posição por ativo</h2><p>O preço médio é recalculado a partir de todas as operações registradas.</p></div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Ativo</th><th>Tipo</th><th>Quantidade</th><th>Preço médio</th><th>Última cotação</th><th>Custo</th><th>Valor atual</th><th>Valorização</th><th>Realizado</th><th>Proventos</th><th>Retorno total</th></tr></thead>
                <tbody>{positions.length === 0 ? <tr><td colSpan="11" className="empty-cell">Cadastre ativos, operações e cotações.</td></tr> : positions.map((position) => (
                  <tr key={position.asset.id}>
                    <td><strong>{position.asset.ticker}</strong><small>{position.asset.asset_name}</small></td>
                    <td>{getAssetTypeLabel(position.asset.asset_type)}</td>
                    <td>{formatNumber(position.quantity)}</td>
                    <td>{formatCurrency(position.averagePrice)}</td>
                    <td>{formatCurrency(position.currentPrice)}<small>{formatDate(position.quoteDate)}</small></td>
                    <td>{formatCurrency(position.costBasis)}</td>
                    <td>{formatCurrency(position.marketValue)}</td>
                    <td className={position.unrealized >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.unrealized)}<small>{formatPercent(position.unrealizedPercent)}</small></td>
                    <td className={position.realized >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.realized)}</td>
                    <td>{formatCurrency(position.incomeNet)}</td>
                    <td className={position.totalReturn >= 0 ? 'positive' : 'negative'}>{formatCurrency(position.totalReturn)}<small>{formatPercent(position.totalReturnPercent)}</small></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {section === 'imported' && (
        <div className="page-stack">
          <div className="info-callout">
            Estas posições são um retrato importado da instituição. Elas não alteram as operações manuais nem o preço médio fiscal calculado pelo sistema.
          </div>

          <section className="summary-grid summary-grid-4">
            <article className="summary-card"><span>Posições importadas</span><strong>{importedPositions.length}</strong></article>
            <article className="summary-card"><span>Saldo líquido informado</span><strong>{formatCurrency(importedSummary.netBalance)}</strong></article>
            <article className="summary-card"><span>Valor originalmente aplicado</span><strong>{formatCurrency(importedSummary.originalAmount)}</strong></article>
            <article className="summary-card"><span>Lucro informado</span><strong className={importedSummary.profit >= 0 ? 'positive' : 'negative'}>{formatCurrency(importedSummary.profit)}</strong></article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Posições recebidas pelo Open Finance</h2>
              <p>A disponibilidade varia conforme a instituição e o produto autorizado.</p>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Instituição</th><th>Investimento</th><th>Tipo</th><th>Quantidade</th><th>Valor unitário</th><th>Aplicado</th><th>Saldo líquido</th><th>Resultado</th><th>Referência</th><th>Vencimento</th></tr>
                </thead>
                <tbody>
                  {importedPositions.length === 0 ? (
                    <tr><td colSpan="10" className="empty-cell">Nenhuma posição de investimento foi retornada pela conexão atual.</td></tr>
                  ) : importedPositions.map((position) => (
                    <tr key={position.id}>
                      <td>{position.open_finance_connections?.institution_name || position.institution_name || '-'}</td>
                      <td><strong>{position.investment_code || position.investment_name}</strong><small>{position.investment_code ? position.investment_name : position.issuer}</small></td>
                      <td>{getImportedInvestmentTypeLabel(position.investment_type, position.investment_subtype)}</td>
                      <td>{position.quantity == null ? '-' : formatNumber(position.quantity)}</td>
                      <td>{position.unit_value == null ? '-' : formatCurrency(position.unit_value, position.currency)}</td>
                      <td>{position.original_amount == null ? '-' : formatCurrency(position.original_amount, position.currency)}</td>
                      <td>{formatCurrency(position.net_balance, position.currency)}</td>
                      <td className={Number(position.profit_amount ?? 0) >= 0 ? 'positive' : 'negative'}>{position.profit_amount == null ? '-' : formatCurrency(position.profit_amount, position.currency)}</td>
                      <td>{formatDate(position.reference_date)}</td>
                      <td>{formatDate(position.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Movimentações de investimentos importadas</h2>
              <p>Aplicações, resgates, rendimentos e amortizações fornecidos pela instituição.</p>
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Data</th><th>Liquidação</th><th>Investimento</th><th>Tipo</th><th>Quantidade</th><th>Valor unitário</th><th>Valor bruto</th><th>Valor líquido</th><th>Descrição</th></tr></thead>
                <tbody>
                  {importedTransactions.length === 0 ? (
                    <tr><td colSpan="9" className="empty-cell">Nenhuma movimentação histórica foi retornada.</td></tr>
                  ) : importedTransactions.map((transaction) => {
                    const position = transaction.open_finance_investment_positions
                    const currency = position?.currency || 'BRL'
                    return (
                      <tr key={transaction.id}>
                        <td>{formatDate(transaction.transaction_date)}</td>
                        <td>{formatDate(transaction.trade_date)}</td>
                        <td><strong>{position?.investment_code || position?.investment_name || '-'}</strong><small>{position?.investment_code ? position?.investment_name : ''}</small></td>
                        <td>{getImportedTransactionTypeLabel(transaction.transaction_type)}</td>
                        <td>{transaction.quantity == null ? '-' : formatNumber(transaction.quantity)}</td>
                        <td>{transaction.unit_value == null ? '-' : formatCurrency(transaction.unit_value, currency)}</td>
                        <td>{transaction.gross_amount == null ? '-' : formatCurrency(transaction.gross_amount, currency)}</td>
                        <td>{transaction.net_amount == null ? '-' : formatCurrency(transaction.net_amount, currency)}</td>
                        <td>{transaction.description || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {section === 'assets' && (
        <div className="content-grid">
          <section className="panel">
            <div className="panel-header"><h2>Novo ativo</h2></div>
            <form className="form" onSubmit={saveAsset}>
              <label>Código / ticker<input value={assetForm.ticker} onChange={(e) => setAssetForm({ ...assetForm, ticker: e.target.value.toUpperCase() })} placeholder="PETR4" required /></label>
              <label>Nome<input value={assetForm.asset_name} onChange={(e) => setAssetForm({ ...assetForm, asset_name: e.target.value })} placeholder="Petrobras PN" /></label>
              <label>Tipo<select value={assetForm.asset_type} onChange={(e) => setAssetForm({ ...assetForm, asset_type: e.target.value })}>{ASSET_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <div className="two-columns">
                <label>Mercado<input value={assetForm.market} onChange={(e) => setAssetForm({ ...assetForm, market: e.target.value.toUpperCase() })} /></label>
                <label>Moeda<input value={assetForm.currency} onChange={(e) => setAssetForm({ ...assetForm, currency: e.target.value.toUpperCase() })} /></label>
              </div>
              <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar ativo'}</button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-header"><h2>Ativos cadastrados</h2></div>
            <div className="cards-list">{assets.map((asset) => <article className="list-card" key={asset.id}><div><strong>{asset.ticker}</strong><span>{asset.asset_name}</span></div><span className="badge info">{getAssetTypeLabel(asset.asset_type)}</span></article>)}</div>
          </section>
        </div>
      )}

      {section === 'operations' && (
        <div className="page-stack">
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header"><h2>Registrar operação</h2><p>Compras e vendas alteram quantidade, custo médio e resultado realizado.</p></div>
              <form className="form" onSubmit={saveOperation}>
                <label>Ativo<select value={operationForm.asset_id} onChange={(e) => setOperationForm({ ...operationForm, asset_id: e.target.value })} required><option value="">Selecione</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.ticker} - {asset.asset_name}</option>)}</select></label>
                <label>Conta / corretora<select value={operationForm.account_id} onChange={(e) => setOperationForm({ ...operationForm, account_id: e.target.value })}><option value="">Sem vínculo</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.institution} - {account.account_name}</option>)}</select></label>
                <div className="two-columns">
                  <label>Data<input type="date" value={operationForm.operation_date} onChange={(e) => setOperationForm({ ...operationForm, operation_date: e.target.value })} required /></label>
                  <label>Operação<select value={operationForm.operation_type} onChange={(e) => setOperationForm({ ...operationForm, operation_type: e.target.value })}>{OPERATION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                </div>
                <label>Modalidade<select value={operationForm.trade_type} onChange={(e) => setOperationForm({ ...operationForm, trade_type: e.target.value })}>{TRADE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <div className="two-columns">
                  <label>Quantidade<input inputMode="decimal" value={operationForm.quantity} onChange={(e) => setOperationForm({ ...operationForm, quantity: e.target.value })} required /></label>
                  <label>Preço unitário<input inputMode="decimal" value={operationForm.unit_price} onChange={(e) => setOperationForm({ ...operationForm, unit_price: e.target.value })} required /></label>
                </div>
                <div className="two-columns">
                  <label>Corretagem<input value={operationForm.brokerage_fee} onChange={(e) => setOperationForm({ ...operationForm, brokerage_fee: e.target.value })} /></label>
                  <label>Emolumentos<input value={operationForm.exchange_fee} onChange={(e) => setOperationForm({ ...operationForm, exchange_fee: e.target.value })} /></label>
                </div>
                <div className="two-columns">
                  <label>Tributos<input value={operationForm.taxes} onChange={(e) => setOperationForm({ ...operationForm, taxes: e.target.value })} /></label>
                  <label>Outros custos<input value={operationForm.other_costs} onChange={(e) => setOperationForm({ ...operationForm, other_costs: e.target.value })} /></label>
                </div>
                <label>Observação<input value={operationForm.notes} onChange={(e) => setOperationForm({ ...operationForm, notes: e.target.value })} /></label>
                <button className="primary-button" disabled={saving || assets.length === 0}>{saving ? 'Salvando...' : 'Registrar operação'}</button>
              </form>
            </section>
            <section className="panel">
              <div className="panel-header"><h2>Como o cálculo funciona</h2></div>
              <div className="explanation-list">
                <p><strong>Compra:</strong> soma quantidade e custo, incluindo taxas.</p>
                <p><strong>Venda:</strong> usa o preço médio anterior para calcular lucro ou prejuízo realizado.</p>
                <p><strong>Bonificação:</strong> aumenta a quantidade sem adicionar preço de compra, exceto custos informados.</p>
                <p><strong>Transferência:</strong> movimenta a quantidade sem gerar lucro realizado.</p>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-header"><h2>Histórico de operações</h2></div>
            <div className="table-wrapper"><table><thead><tr><th>Data</th><th>Ativo</th><th>Operação</th><th>Modalidade</th><th>Quantidade</th><th>Preço</th><th>Valor líquido</th><th></th></tr></thead><tbody>{operations.length === 0 ? <tr><td colSpan="8" className="empty-cell">Nenhuma operação.</td></tr> : operations.map((operation) => <tr key={operation.id}><td>{formatDate(operation.operation_date)}</td><td><strong>{operation.assets?.ticker}</strong></td><td>{getOperationTypeLabel(operation.operation_type)}</td><td>{operation.trade_type}</td><td>{formatNumber(operation.quantity)}</td><td>{formatCurrency(operation.unit_price)}</td><td>{formatCurrency(operation.net_value)}</td><td><button className="danger-link" type="button" onClick={() => removeOperation(operation.id)}>Excluir</button></td></tr>)}</tbody></table></div>
          </section>
        </div>
      )}

      {section === 'quotes' && (
        <div className="page-stack">
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header"><h2>Atualizar cotação</h2><p>No MVP, a cotação pode ser informada manualmente ou importada futuramente.</p></div>
              <form className="form" onSubmit={saveQuote}>
                <label>Ativo<select value={quoteForm.asset_id} onChange={(e) => setQuoteForm({ ...quoteForm, asset_id: e.target.value })} required><option value="">Selecione</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.ticker}</option>)}</select></label>
                <label>Data<input type="date" value={quoteForm.quote_date} onChange={(e) => setQuoteForm({ ...quoteForm, quote_date: e.target.value })} required /></label>
                <label>Preço de fechamento<input value={quoteForm.close_price} onChange={(e) => setQuoteForm({ ...quoteForm, close_price: e.target.value })} required /></label>
                <label>Origem<input value={quoteForm.source} onChange={(e) => setQuoteForm({ ...quoteForm, source: e.target.value })} /></label>
                <button className="primary-button" disabled={saving || assets.length === 0}>{saving ? 'Salvando...' : 'Salvar cotação'}</button>
              </form>
            </section>
            <section className="panel">
              <div className="panel-header"><h2>Últimas cotações registradas</h2></div>
              <div className="cards-list">{quotes.slice(0, 30).map((quote) => <article className="list-card" key={quote.id}><div><strong>{quote.assets?.ticker}</strong><span>{formatDate(quote.quote_date)} · {quote.source}</span></div><strong>{formatCurrency(quote.close_price)}</strong></article>)}</div>
            </section>
          </div>
        </div>
      )}

      {section === 'income' && (
        <div className="page-stack">
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header"><h2>Registrar provento</h2></div>
              <form className="form" onSubmit={saveIncome}>
                <label>Ativo<select value={incomeForm.asset_id} onChange={(e) => setIncomeForm({ ...incomeForm, asset_id: e.target.value })} required><option value="">Selecione</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.ticker}</option>)}</select></label>
                <label>Conta de recebimento<select value={incomeForm.account_id} onChange={(e) => setIncomeForm({ ...incomeForm, account_id: e.target.value })}><option value="">Sem vínculo</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.institution} - {account.account_name}</option>)}</select></label>
                <div className="two-columns"><label>Data<input type="date" value={incomeForm.payment_date} onChange={(e) => setIncomeForm({ ...incomeForm, payment_date: e.target.value })} required /></label><label>Tipo<select value={incomeForm.income_type} onChange={(e) => setIncomeForm({ ...incomeForm, income_type: e.target.value })}>{INCOME_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
                <label>Quantidade de referência<input value={incomeForm.quantity_reference} onChange={(e) => setIncomeForm({ ...incomeForm, quantity_reference: e.target.value })} /></label>
                <div className="two-columns"><label>Valor bruto<input value={incomeForm.gross_value} onChange={(e) => setIncomeForm({ ...incomeForm, gross_value: e.target.value })} required /></label><label>Imposto retido<input value={incomeForm.withholding_tax} onChange={(e) => setIncomeForm({ ...incomeForm, withholding_tax: e.target.value })} /></label></div>
                <label>Observação<input value={incomeForm.notes} onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })} /></label>
                <button className="primary-button" disabled={saving || assets.length === 0}>{saving ? 'Salvando...' : 'Registrar provento'}</button>
              </form>
            </section>
            <section className="panel">
              <div className="panel-header"><h2>Resumo de proventos</h2></div>
              <div className="metric-list"><div><span>Registros</span><strong>{incomes.length}</strong></div><div><span>Valor líquido acumulado</span><strong>{formatCurrency(incomes.reduce((sum, item) => sum + Number(item.net_value), 0))}</strong></div></div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-header"><h2>Histórico de proventos</h2></div>
            <div className="table-wrapper"><table><thead><tr><th>Data</th><th>Ativo</th><th>Tipo</th><th>Bruto</th><th>IRRF</th><th>Líquido</th><th></th></tr></thead><tbody>{incomes.length === 0 ? <tr><td colSpan="7" className="empty-cell">Nenhum provento.</td></tr> : incomes.map((income) => <tr key={income.id}><td>{formatDate(income.payment_date)}</td><td><strong>{income.assets?.ticker}</strong></td><td>{getIncomeTypeLabel(income.income_type)}</td><td>{formatCurrency(income.gross_value)}</td><td>{formatCurrency(income.withholding_tax)}</td><td>{formatCurrency(income.net_value)}</td><td><button className="danger-link" type="button" onClick={() => removeIncome(income.id)}>Excluir</button></td></tr>)}</tbody></table></div>
          </section>
        </div>
      )}
    </div>
  )
}
