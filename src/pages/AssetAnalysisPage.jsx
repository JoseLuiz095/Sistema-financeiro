import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react'
import Feedback from '../components/Feedback'
import {
  deleteCostBasisAdjustment,
  getAssetAnalysis,
  getAssetAnalysisPreference,
  getAssetHistory,
  listCostBasisAdjustments,
  saveAssetAnalysisPreference,
  saveCostBasisAdjustment,
} from '../services/assetAnalysisService'
import {
  aggregateCostBasis,
  calculateAdjustedPosition,
  DEFAULT_ANALYSIS_ASSUMPTIONS,
  getHealthTone,
  getTechnicalTone,
  normalizeTicker,
  percentToInput,
  safePercentInput,
} from '../utils/assetAnalysis'
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  today,
} from '../utils/format'
import './asset-analysis.css'

const AssetHistoryChart = lazy(
  () => import('./AssetHistoryChart'),
)

const RANGE_OPTIONS = [
  ['1mo', '1 mes'],
  ['3mo', '3 meses'],
  ['6mo', '6 meses'],
  ['1y', '1 ano'],
  ['2y', '2 anos'],
  ['5y', '5 anos'],
  ['10y', '10 anos'],
]

const ASSET_PRIVACY_STORAGE_KEY =
  'financeiro:asset-analysis-values-visible'

function EyeIcon({ visible }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
      {!visible && <path d="m3 3 18 18" />}
    </svg>
  )
}

function privateCurrency(
  value,
  currency,
  valuesVisible,
) {
  return valuesVisible
    ? currencyValue(value, currency)
    : '••••••'
}

function privateNumber(
  value,
  valuesVisible,
) {
  return valuesVisible
    ? formatNumber(value)
    : '••••••'
}

function privatePercent(
  value,
  valuesVisible,
) {
  return valuesVisible
    ? formatPercent(value)
    : '••••••'
}

function metricValue(value, type = 'number') {
  if (value == null || !Number.isFinite(Number(value))) return '-'
  if (type === 'currency') return formatCurrency(value)
  if (type === 'percent') return formatPercent(Number(value) * 100)
  if (type === 'percent-points') return formatPercent(value)
  if (type === 'multiple') return `${Number(value).toFixed(2)}x`
  return formatNumber(value)
}

function currencyValue(value, currency = 'BRL') {
  if (value == null || !Number.isFinite(Number(value))) return '-'
  return formatCurrency(value, currency)
}

function scoreLabel(score) {
  if (score == null) return 'Sem dados'
  return `${Number(score).toFixed(0)}/100`
}

function DataQuality({ analysis }) {
  const warnings = analysis?.dataQuality?.warnings ?? []

  return (
    <section className="asset-data-quality">
      <span>
        Dados consultados em{' '}
        {analysis?.dataQuality?.requestedAt
          ? new Date(analysis.dataQuality.requestedAt).toLocaleString('pt-BR')
          : '-'}
      </span>
      <span>
        {analysis?.dataQuality?.technicalObservations ?? 0} pregoes usados na analise tecnica
      </span>
      {warnings.length > 0 && (
        <details>
          <summary>{warnings.length} aviso(s) da fonte de dados</summary>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

export default function AssetAnalysisPage({
  user,
  assets = [],
  importedPositions = [],
  setFeedback: setGlobalFeedback,
}) {
  const tickerOptions = useMemo(() => {
    const values = new Map()

    assets.forEach((asset) => {
      const ticker = normalizeTicker(asset.ticker)
      if (ticker) {
        values.set(ticker, {
          ticker,
          label: `${ticker} - ${asset.asset_name || ticker}`,
        })
      }
    })

    importedPositions.forEach((position) => {
      const ticker = normalizeTicker(
        position.investment_code || position.investment_name,
      )

      if (ticker && !values.has(ticker)) {
        values.set(ticker, {
          ticker,
          label: `${ticker} - ${position.investment_name || ticker}`,
        })
      }
    })

    return [...values.values()].sort((a, b) =>
      a.ticker.localeCompare(b.ticker),
    )
  }, [assets, importedPositions])

  const [ticker, setTicker] = useState(
    tickerOptions[0]?.ticker || 'PETR4',
  )
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState(null)
  const [historyRange, setHistoryRange] = useState('1y')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [valuesVisible, setValuesVisible] = useState(() => {
    try {
      return (
        localStorage.getItem(
          ASSET_PRIVACY_STORAGE_KEY,
        ) !== 'hidden'
      )
    } catch {
      return true
    }
  })
  const [adjustments, setAdjustments] = useState([])
  const [feedback, setFeedback] = useState({ type: '', message: '' })
  const [assumptions, setAssumptions] = useState({
    requiredReturn: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.requiredReturn),
    perpetualGrowth: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.perpetualGrowth),
    targetPe: String(DEFAULT_ANALYSIS_ASSUMPTIONS.targetPe),
    targetDividendYield: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.targetDividendYield),
    marginOfSafety: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.marginOfSafety),
  })
  const [costForm, setCostForm] = useState({
    reference_date: today(),
    quantity: '',
    average_cost: '',
    institution: 'NuInvest / Nubank',
    adjustment_type: 'CUSTODY_TRANSFER',
    notes: '',
  })

  const selectedImportedPosition = useMemo(
    () => importedPositions.find((position) =>
      normalizeTicker(position.investment_code || position.investment_name) === ticker,
    ) ?? null,
    [importedPositions, ticker],
  )

  const adjustedPosition = useMemo(
    () => calculateAdjustedPosition({
      adjustments,
      importedPosition: selectedImportedPosition,
      currentPrice: analysis?.quote?.price,
    }),
    [adjustments, selectedImportedPosition, analysis],
  )

  const costSummary = useMemo(
    () => aggregateCostBasis(adjustments),
    [adjustments],
  )

  useEffect(() => {
    try {
      localStorage.setItem(
        ASSET_PRIVACY_STORAGE_KEY,
        valuesVisible ? 'visible' : 'hidden',
      )
    } catch {
      // A preferência continua válida na sessão mesmo sem localStorage.
    }
  }, [valuesVisible])

  useEffect(() => {
    setAnalysis(null)
    setHistory(null)
    setShowHistory(false)
    loadLocalSettings(ticker)
  }, [ticker])

  async function loadLocalSettings(selectedTicker) {
    try {
      const [preference, rows] = await Promise.all([
        getAssetAnalysisPreference(selectedTicker),
        listCostBasisAdjustments(selectedTicker),
      ])

      setAdjustments(rows)

      if (preference) {
        setAssumptions({
          requiredReturn: percentToInput(preference.required_return),
          perpetualGrowth: percentToInput(preference.perpetual_growth),
          targetPe: String(preference.target_pe),
          targetDividendYield: percentToInput(preference.target_dividend_yield),
          marginOfSafety: percentToInput(preference.margin_of_safety),
        })
      } else {
        setAssumptions({
          requiredReturn: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.requiredReturn),
          perpetualGrowth: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.perpetualGrowth),
          targetPe: String(DEFAULT_ANALYSIS_ASSUMPTIONS.targetPe),
          targetDividendYield: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.targetDividendYield),
          marginOfSafety: percentToInput(DEFAULT_ANALYSIS_ASSUMPTIONS.marginOfSafety),
        })
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: `Falha ao carregar preferencias locais: ${error.message}`,
      })
    }
  }

  function normalizedAssumptions() {
    return {
      requiredReturn: safePercentInput(assumptions.requiredReturn),
      perpetualGrowth: safePercentInput(assumptions.perpetualGrowth),
      targetPe: Number(assumptions.targetPe),
      targetDividendYield: safePercentInput(assumptions.targetDividendYield),
      marginOfSafety: safePercentInput(assumptions.marginOfSafety),
    }
  }

  async function loadAnalysis(event) {
    event?.preventDefault()
    const selectedTicker = normalizeTicker(ticker)

    if (!selectedTicker) {
      setFeedback({ type: 'error', message: 'Informe um ticker valido.' })
      return
    }

    setLoading(true)
    setFeedback({ type: '', message: '' })

    try {
      const result = await getAssetAnalysis(
        selectedTicker,
        normalizedAssumptions(),
      )
      setAnalysis(result)
      setGlobalFeedback?.({
        type: 'success',
        message: `Analise de ${selectedTicker} atualizada.`,
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  async function saveAssumptions() {
    const values = normalizedAssumptions()

    if (values.perpetualGrowth >= values.requiredReturn) {
      setFeedback({
        type: 'error',
        message: 'O crescimento perpetuo deve ser menor que o retorno exigido.',
      })
      return
    }

    setSaving(true)

    try {
      await saveAssetAnalysisPreference({
        user_id: user.id,
        ticker,
        required_return: values.requiredReturn,
        perpetual_growth: values.perpetualGrowth,
        target_pe: values.targetPe,
        target_dividend_yield: values.targetDividendYield,
        margin_of_safety: values.marginOfSafety,
      })
      setFeedback({
        type: 'success',
        message: 'Premissas salvas. Recalcule a analise para aplicar os novos valores.',
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function loadHistory() {
    if (showHistory && history?.range === historyRange) {
      setShowHistory(false)
      return
    }

    setLoadingHistory(true)
    setFeedback({ type: '', message: '' })

    try {
      const result = await getAssetHistory(ticker, historyRange)
      setHistory(result)
      setShowHistory(true)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLoadingHistory(false)
    }
  }

  async function saveCostBasis(event) {
    event.preventDefault()
    const quantity = Number(String(costForm.quantity).replace(',', '.'))
    const averageCost = Number(String(costForm.average_cost).replace(',', '.'))

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFeedback({ type: 'error', message: 'Informe uma quantidade valida.' })
      return
    }

    if (!Number.isFinite(averageCost) || averageCost < 0) {
      setFeedback({ type: 'error', message: 'Informe um custo medio valido.' })
      return
    }

    setSaving(true)

    try {
      await saveCostBasisAdjustment({
        user_id: user.id,
        ticker,
        reference_date: costForm.reference_date,
        quantity,
        average_cost: averageCost,
        institution: costForm.institution.trim() || null,
        adjustment_type: costForm.adjustment_type,
        notes: costForm.notes.trim() || null,
        active: true,
      })
      setCostForm({
        ...costForm,
        quantity: '',
        average_cost: '',
        notes: '',
      })
      await loadLocalSettings(ticker)
      setFeedback({
        type: 'success',
        message: 'Custo historico registrado sem alterar as operacoes fiscais existentes.',
      })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function removeCostBasis(id) {
    if (!window.confirm('Excluir este ajuste de custo historico?')) return

    try {
      await deleteCostBasisAdjustment(id)
      await loadLocalSettings(ticker)
      setFeedback({ type: 'success', message: 'Ajuste removido.' })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  function toggleValuesVisibility() {
    setValuesVisible((current) => {
      const next = !current

      if (!next) {
        setShowHistory(false)
      }

      return next
    })
  }

  const technicalTone = getTechnicalTone(analysis?.technical?.label)
  const healthTone = getHealthTone(analysis?.health?.score)

  return (
    <div className="page-stack asset-analysis-page">
      <section className="panel asset-search-panel">
        <div className="asset-search-heading-row">
          <div className="panel-header">
            <span className="eyebrow">Central de estudo</span>
            <h2>Analise completa de ativos</h2>
            <p>
              Cotacao, indicadores tecnicos, saude financeira, preco justo e seu custo historico.
            </p>
          </div>

          <button
            type="button"
            className="asset-privacy-toggle"
            aria-pressed={!valuesVisible}
            aria-label={
              valuesVisible
                ? 'Ocultar valores dos ativos'
                : 'Mostrar valores dos ativos'
            }
            title={
              valuesVisible
                ? 'Ocultar valores dos ativos'
                : 'Mostrar valores dos ativos'
            }
            onClick={toggleValuesVisibility}
          >
            <EyeIcon visible={valuesVisible} />
            <span>
              {valuesVisible
                ? 'Ocultar valores'
                : 'Mostrar valores'}
            </span>
          </button>
        </div>

        <form className="asset-search-form" onSubmit={loadAnalysis}>
          <label>
            Ativo
            <input
              list="asset-ticker-options"
              value={ticker}
              onChange={(event) => setTicker(normalizeTicker(event.target.value))}
              placeholder="PETR4"
              required
            />
            <datalist id="asset-ticker-options">
              {tickerOptions.map((item) => (
                <option key={item.ticker} value={item.ticker}>
                  {item.label}
                </option>
              ))}
            </datalist>
          </label>
          <button className="primary-button" disabled={loading}>
            {loading ? 'Calculando...' : 'Analisar ativo'}
          </button>
        </form>
      </section>

      <Feedback feedback={feedback} />

      {!analysis && (
        <section className="panel asset-empty-state">
          <strong>Selecione um ticker e clique em Analisar ativo.</strong>
          <p>
            O grafico historico nao e carregado automaticamente. Ele sera consultado apenas quando voce solicitar.
          </p>
        </section>
      )}

      {analysis && (
        <>
          <section className="panel asset-hero-card">
            <div className="asset-identity">
              {analysis.quote.logoUrl && (
                <img
                  src={analysis.quote.logoUrl}
                  alt=""
                  className="asset-logo"
                />
              )}
              <div>
                <span className="eyebrow">{analysis.profile.sector || 'B3'}</span>
                <h2>{analysis.quote.longName || ticker}</h2>
                <p>{ticker} - {analysis.profile.industry || 'Setor nao informado'}</p>
              </div>
            </div>

            <div className="asset-price-block">
              <strong>{privateCurrency(analysis.quote.price, analysis.quote.currency, valuesVisible)}</strong>
              <span
                className={
                  valuesVisible
                    ? analysis.quote.changePercent >= 0
                      ? 'positive'
                      : 'negative'
                    : 'asset-private-neutral'
                }
              >
                {valuesVisible
                  ? `${currencyValue(analysis.quote.change)} (${formatPercent(analysis.quote.changePercent)})`
                  : '••••••'}
              </span>
              <small>{analysis.quote.marketTime ? new Date(analysis.quote.marketTime).toLocaleString('pt-BR') : '-'}</small>
            </div>
          </section>

          <section className="summary-grid summary-grid-4">
            <article className="summary-card">
              <span>Analise tecnica</span>
              <strong className={technicalTone}>{analysis.technical.label}</strong>
              <small>{scoreLabel(analysis.technical.score)}</small>
            </article>
            <article className="summary-card">
              <span>Saude da empresa</span>
              <strong className={healthTone}>{analysis.health.label}</strong>
              <small>{scoreLabel(analysis.health.score)}</small>
            </article>
            <article className="summary-card">
              <span>Preco justo base</span>
              <strong>{privateCurrency(analysis.valuation.basePrice, analysis.quote.currency, valuesVisible)}</strong>
              <small>Confianca {Number(analysis.valuation.confidence || 0).toFixed(0)}%</small>
            </article>
            <article className="summary-card">
              <span>Comprar abaixo de</span>
              <strong>{privateCurrency(analysis.valuation.buyBelow, analysis.quote.currency, valuesVisible)}</strong>
              <small>Com margem de seguranca configurada</small>
            </article>
          </section>

          <section className="asset-analysis-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Resumo de mercado</h2>
              </div>
              <div className="asset-metric-grid">
                <div><span>Abertura</span><strong>{privateCurrency(analysis.quote.open, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Maxima do dia</span><strong>{privateCurrency(analysis.quote.dayHigh, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Minima do dia</span><strong>{privateCurrency(analysis.quote.dayLow, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Fechamento anterior</span><strong>{privateCurrency(analysis.quote.previousClose, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Maxima 52 semanas</span><strong>{privateCurrency(analysis.quote.fiftyTwoWeekHigh, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Minima 52 semanas</span><strong>{privateCurrency(analysis.quote.fiftyTwoWeekLow, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Volume</span><strong>{formatNumber(analysis.quote.volume)}</strong></div>
                <div><span>Valor de mercado</span><strong>{privateCurrency(analysis.quote.marketCap, analysis.quote.currency, valuesVisible)}</strong></div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Multiplos e rentabilidade</h2>
              </div>
              <div className="asset-metric-grid">
                <div><span>P/L</span><strong>{metricValue(analysis.fundamentals.trailingPe, 'multiple')}</strong></div>
                <div><span>P/VP</span><strong>{metricValue(analysis.fundamentals.priceToBook, 'multiple')}</strong></div>
                <div><span>EV/EBITDA</span><strong>{metricValue(analysis.fundamentals.enterpriseToEbitda, 'multiple')}</strong></div>
                <div><span>Dividend yield</span><strong>{metricValue(analysis.fundamentals.dividendYield, 'percent')}</strong></div>
                <div><span>ROE</span><strong>{metricValue(analysis.fundamentals.roe, 'percent')}</strong></div>
                <div><span>ROA</span><strong>{metricValue(analysis.fundamentals.roa, 'percent')}</strong></div>
                <div><span>Margem liquida</span><strong>{metricValue(analysis.fundamentals.netMargin, 'percent')}</strong></div>
                <div><span>Beta</span><strong>{metricValue(analysis.fundamentals.beta)}</strong></div>
              </div>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header asset-panel-header-actions">
              <div>
                <h2>Grafico historico</h2>
                <p>Carregado apenas sob demanda para reduzir consumo de dados e processamento.</p>
              </div>
              <div className="asset-history-controls">
                <select
                  value={historyRange}
                  onChange={(event) => {
                    setHistoryRange(event.target.value)
                    setHistory(null)
                    setShowHistory(false)
                  }}
                >
                  {RANGE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={loadHistory}
                  disabled={loadingHistory || !valuesVisible}
                  title={
                    valuesVisible
                      ? 'Carregar histórico do ativo'
                      : 'Mostre os valores para carregar o gráfico'
                  }
                >
                  {!valuesVisible
                    ? 'Valores ocultos'
                    : loadingHistory
                      ? 'Carregando grafico...'
                      : showHistory
                        ? 'Ocultar grafico'
                        : 'Carregar grafico'}
                </button>
              </div>
            </div>

            {!valuesVisible && (
              <div className="asset-chart-privacy-state">
                <EyeIcon visible={false} />
                <strong>Grafico protegido</strong>
                <span>Mostre os valores para consultar precos e historico.</span>
              </div>
            )}

            {valuesVisible &&
              showHistory &&
              history?.series?.length > 0 && (
                <Suspense fallback={<div className="asset-chart-loading">Preparando grafico...</div>}>
                  <AssetHistoryChart series={history.series} />
                </Suspense>
              )}
          </section>

          <section className="asset-analysis-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Analise tecnica</h2>
                <p>Sinal quantitativo baseado em tendencia, momentum e volatilidade.</p>
              </div>

              <div className={`asset-score-gauge asset-score-${technicalTone}`}>
                <strong>{scoreLabel(analysis.technical.score)}</strong>
                <span>{analysis.technical.label}</span>
              </div>

              <div className="asset-metric-grid">
                <div><span>RSI 14</span><strong>{metricValue(analysis.technical.indicators.rsi14)}</strong></div>
                <div><span>MACD</span><strong>{metricValue(analysis.technical.indicators.macd)}</strong></div>
                <div><span>Histograma MACD</span><strong>{metricValue(analysis.technical.indicators.macdHistogram)}</strong></div>
                <div><span>Estocastico 14</span><strong>{metricValue(analysis.technical.indicators.stochastic14)}</strong></div>
                <div><span>MM21</span><strong>{privateCurrency(analysis.technical.indicators.sma21, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>MM50</span><strong>{privateCurrency(analysis.technical.indicators.sma50, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>MM200</span><strong>{privateCurrency(analysis.technical.indicators.sma200, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>ATR 14</span><strong>{privateCurrency(analysis.technical.indicators.atr14, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Suporte 20 pregoes</span><strong>{privateCurrency(analysis.technical.indicators.support20, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Resistencia 20 pregoes</span><strong>{privateCurrency(analysis.technical.indicators.resistance20, analysis.quote.currency, valuesVisible)}</strong></div>
              </div>

              <div className="asset-signal-list">
                {analysis.technical.signals.map((signal) => (
                  <div key={signal.label} className={`asset-signal asset-signal-${signal.direction.toLowerCase()}`}>
                    <strong>{signal.label}</strong>
                    <span>{signal.value}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Saude da empresa</h2>
                <p>Nota proporcional apenas aos indicadores disponiveis para o setor.</p>
              </div>

              <div className={`asset-score-gauge asset-score-${healthTone}`}>
                <strong>{scoreLabel(analysis.health.score)}</strong>
                <span>{analysis.health.label}</span>
              </div>

              <div className="asset-health-bars">
                {analysis.health.categories.map((category) => (
                  <div key={category.label} className="asset-health-row">
                    <div>
                      <span>{category.label}</span>
                      <strong>{scoreLabel(category.score)}</strong>
                    </div>
                    <progress max="100" value={category.score || 0} />
                  </div>
                ))}
              </div>

              <div className="asset-metric-grid">
                <div><span>Divida / patrimonio</span><strong>{metricValue(analysis.fundamentals.debtToEquity, 'multiple')}</strong></div>
                <div><span>Liquidez corrente</span><strong>{metricValue(analysis.fundamentals.currentRatio)}</strong></div>
                <div><span>Liquidez seca</span><strong>{metricValue(analysis.fundamentals.quickRatio)}</strong></div>
                <div><span>Crescimento receita</span><strong>{metricValue(analysis.fundamentals.revenueGrowth, 'percent')}</strong></div>
                <div><span>Crescimento lucro</span><strong>{metricValue(analysis.fundamentals.earningsGrowth, 'percent')}</strong></div>
                <div><span>Fluxo de caixa livre</span><strong>{privateCurrency(analysis.fundamentals.freeCashflow, analysis.quote.currency, valuesVisible)}</strong></div>
              </div>
            </article>
          </section>

          <section className="asset-analysis-grid asset-valuation-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Preco justo por modelos</h2>
                <p>O sistema combina apenas modelos com entradas validas.</p>
              </div>

              <div className="asset-valuation-range">
                <div><span>Conservador</span><strong>{privateCurrency(analysis.valuation.conservativePrice, analysis.quote.currency, valuesVisible)}</strong></div>
                <div className="asset-valuation-base"><span>Base ponderada</span><strong>{privateCurrency(analysis.valuation.basePrice, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Otimista</span><strong>{privateCurrency(analysis.valuation.optimisticPrice, analysis.quote.currency, valuesVisible)}</strong></div>
              </div>

              <div className="asset-model-list">
                {analysis.valuation.models.map((model) => (
                  <article key={model.id}>
                    <div>
                      <strong>{model.label}</strong>
                      <span>{model.explanation}</span>
                    </div>
                    <strong>{privateCurrency(model.price, analysis.quote.currency, valuesVisible)}</strong>
                  </article>
                ))}
              </div>

              <div className="asset-valuation-summary">
                <div><span>Preco atual</span><strong>{privateCurrency(analysis.quote.price, analysis.quote.currency, valuesVisible)}</strong></div>
                <div><span>Potencial ate o preco base</span><strong className={valuesVisible ? analysis.valuation.upsidePercent >= 0 ? 'positive' : 'negative' : 'asset-private-neutral'}>{privatePercent(analysis.valuation.upsidePercent, valuesVisible)}</strong></div>
                <div><span>Referencia media de analistas</span><strong>{privateCurrency(analysis.valuation.analystReference.mean, analysis.quote.currency, valuesVisible)}</strong></div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Premissas de valoracao</h2>
                <p>Ajuste por ativo. Valores mais conservadores reduzem o preco justo.</p>
              </div>

              <div className="form asset-assumptions-form">
                <div className="two-columns">
                  <label>Retorno exigido (%)<input type="number" step="0.01" min="6" max="40" value={assumptions.requiredReturn} onChange={(event) => setAssumptions({ ...assumptions, requiredReturn: event.target.value })} /></label>
                  <label>Crescimento perpetuo (%)<input type="number" step="0.01" min="0" max="15" value={assumptions.perpetualGrowth} onChange={(event) => setAssumptions({ ...assumptions, perpetualGrowth: event.target.value })} /></label>
                  <label>P/L alvo<input type="number" step="0.1" min="3" max="40" value={assumptions.targetPe} onChange={(event) => setAssumptions({ ...assumptions, targetPe: event.target.value })} /></label>
                  <label>Dividend yield alvo (%)<input type="number" step="0.01" min="1" max="30" value={assumptions.targetDividendYield} onChange={(event) => setAssumptions({ ...assumptions, targetDividendYield: event.target.value })} /></label>
                  <label>Margem de seguranca (%)<input type="number" step="0.01" min="0" max="60" value={assumptions.marginOfSafety} onChange={(event) => setAssumptions({ ...assumptions, marginOfSafety: event.target.value })} /></label>
                </div>

                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={saveAssumptions} disabled={saving}>Salvar premissas</button>
                  <button type="button" className="primary-button" onClick={loadAnalysis} disabled={loading}>Recalcular</button>
                </div>
              </div>
            </article>
          </section>

          <section className="asset-analysis-grid">
            <article className="panel">
              <div className="panel-header">
                <h2>Seu custo historico</h2>
                <p>Corrige a referencia economica depois de transferencia de custodia sem alterar notas fiscais ou operacoes antigas.</p>
              </div>

              <section className="summary-grid summary-grid-4 asset-position-summary">
                <article className="summary-card"><span>Quantidade considerada</span><strong>{privateNumber(adjustedPosition.quantity, valuesVisible)}</strong></article>
                <article className="summary-card"><span>Custo medio historico</span><strong>{privateCurrency(adjustedPosition.averageCost, analysis.quote.currency, valuesVisible)}</strong></article>
                <article className="summary-card"><span>Custo total historico</span><strong>{privateCurrency(adjustedPosition.totalCost, analysis.quote.currency, valuesVisible)}</strong></article>
                <article className="summary-card"><span>Resultado desde a origem</span><strong
                  className={
                    valuesVisible
                      ? adjustedPosition.result >= 0
                        ? 'positive'
                        : 'negative'
                      : 'asset-private-neutral'
                  }
                >
                  {valuesVisible
                    ? adjustedPosition.result == null
                      ? '-'
                      : formatCurrency(adjustedPosition.result)
                    : '••••••'}
                  <small>
                    {valuesVisible && adjustedPosition.resultPercent != null
                      ? formatPercent(adjustedPosition.resultPercent)
                      : ''}
                  </small>
                </strong></article>
              </section>

              {!adjustedPosition.hasHistoricalCost && (
                <div className="info-callout">
                  O Open Finance pode informar a posicao atual sem o custo medio anterior a transferencia. Cadastre abaixo o custo historico da NuInvest ou da corretora de origem.
                </div>
              )}

              <div className="asset-cost-list">
                {adjustments.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>
                        {valuesVisible
                          ? `${formatNumber(item.quantity)} a ${formatCurrency(item.average_cost)}`
                          : '••••••'}
                      </strong>
                      <span>{formatDate(item.reference_date)} - {item.institution || 'Origem nao informada'}</span>
                    </div>
                    <button type="button" className="danger-link" onClick={() => removeCostBasis(item.id)}>Excluir</button>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Adicionar referencia de custodia</h2>
              </div>

              <form className="form" onSubmit={saveCostBasis}>
                <div className="two-columns">
                  <label>Data-base<input type="date" value={costForm.reference_date} onChange={(event) => setCostForm({ ...costForm, reference_date: event.target.value })} required /></label>
                  <label>Tipo<select value={costForm.adjustment_type} onChange={(event) => setCostForm({ ...costForm, adjustment_type: event.target.value })}><option value="CUSTODY_TRANSFER">Transferencia de custodia</option><option value="INITIAL_POSITION">Posicao inicial</option><option value="MANUAL_CORRECTION">Correcao manual</option></select></label>
                  <label>Quantidade<input type={valuesVisible ? 'text' : 'password'} inputMode="decimal" value={costForm.quantity} onChange={(event) => setCostForm({ ...costForm, quantity: event.target.value })} placeholder="100" required /></label>
                  <label>Custo medio por acao<input type={valuesVisible ? 'text' : 'password'} inputMode="decimal" value={costForm.average_cost} onChange={(event) => setCostForm({ ...costForm, average_cost: event.target.value })} placeholder="32,45" required /></label>
                </div>
                <label>Instituicao de origem<input value={costForm.institution} onChange={(event) => setCostForm({ ...costForm, institution: event.target.value })} /></label>
                <label>Observacao<textarea value={costForm.notes} onChange={(event) => setCostForm({ ...costForm, notes: event.target.value })} placeholder="Ex.: custo medio anterior a transferencia para o Inter" /></label>
                <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar custo historico'}</button>
              </form>
            </article>
          </section>

          {analysis.profile.summary && (
            <section className="panel">
              <div className="panel-header"><h2>Perfil da empresa</h2></div>
              <p className="asset-company-summary">{analysis.profile.summary}</p>
            </section>
          )}

          <DataQuality analysis={analysis} />

          <section className="info-callout asset-risk-warning">
            Os calculos sao ferramentas de estudo e nao garantem retorno. Analise tecnica, preco justo e notas de saude dependem da qualidade dos dados, das premissas e do ciclo da empresa. Nao utilize um unico indicador como ordem automatica de compra.
          </section>
        </>
      )}
    </div>
  )
}
